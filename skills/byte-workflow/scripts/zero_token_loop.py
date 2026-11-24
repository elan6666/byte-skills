#!/usr/bin/env python3
"""Universal zero-token watch, anti-stall loop, and self-reflection driver for Byte skills.

Replaces periodic LLM heartbeat polling with pure local Python checks (0 LLM tokens while idle):
- `init`: Creates `.byte-os/loop-config.json` and optionally installs a macOS launchd agent
  combining WatchPaths (instant event wake) + StartInterval (anti-stall fallback).
- `tick`: Runs one zero-token check: stops if goal completed/paused; wakes lead on new sealed
  returns, terminal/error runs, or joint idle stall; injects periodic workflow self-reflection.
- `wait-run`: Blocks with 0 LLM tokens until a local/SSH process exits, a done file appears,
  or an error pattern hits the log (triggers Reactive Wakeup in clients like Antigravity).
- `wait-signal`: Self-loop watcher for clients without an external Bridge wake adapter; blocks
  with 0 LLM tokens until workspace verification/review/wake-signal files update.
"""

import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import shlex
import sqlite3
import subprocess
import sys
import time

BRIDGE_SCRIPT = Path.home() / ".agents/skills/byte-bridge/scripts/bridge.py"
CODEX_STATE_DB = Path.home() / ".codex/state_5.sqlite"
DEFAULT_ERROR_REGEX = "Traceback|CUDA out of memory|RuntimeError|OutOfMemoryError|NaN|nan"


def strip_harness(session_ref):
    if not isinstance(session_ref, str):
        return None, None
    if ":" in session_ref:
        harness, sid = session_ref.split(":", 1)
        return harness.strip(), sid.strip()
    return "codex", session_ref.strip()


def read_json(path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def write_json_atomic(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def is_outcome_active(project):
    if (project / ".byte-os/coordination/paused.flag").exists():
        return False, "paused_flag"
    state = read_json(project / ".byte-os/coordination/state.json")
    if isinstance(state, dict):
        outcome = state.get("overall_outcome") or {}
        status = outcome.get("status")
        if status and status != "active":
            return False, f"outcome_{status}"
    return True, "active"


def get_codex_thread_idle(thread_id):
    if not CODEX_STATE_DB.is_file() or not thread_id:
        return None
    try:
        conn = sqlite3.connect(f"file:{CODEX_STATE_DB}?mode=ro", uri=True, timeout=2.0)
        row = conn.execute(
            "SELECT updated_at, name, title FROM threads WHERE id = ?", (thread_id,)
        ).fetchone()
        conn.close()
        if not row:
            return None
        updated_at = int(row[0])
        idle_min = round(max(0, int(time.time()) - updated_at) / 60.0, 1)
        return {
            "id": thread_id,
            "name": row[1] or row[2] or thread_id,
            "updated_at": updated_at,
            "idle_minutes": idle_min,
        }
    except sqlite3.Error:
        return None


def find_pending_manifests(project, cfg):
    watch_dir = project / cfg.get("watch_dir", ".byte-os/round-04")
    if not watch_dir.is_dir():
        return []
    manifest_glob = cfg.get("manifest_glob", "*-steer-input.json")
    verified_glob = cfg.get("verified_glob", "*-mentor-verified.json")

    reviewed_digests = set()
    for vpath in sorted(watch_dir.glob(verified_glob)):
        rec = read_json(vpath, {})
        if not isinstance(rec, dict):
            continue
        if not str(rec.get("status", "")).startswith(("verified", "accepted")):
            continue
        for d in rec.get("reviewed_return_sha256", []) or []:
            if isinstance(d, str):
                reviewed_digests.add(d)

    pending = []
    for mpath in sorted(watch_dir.glob(manifest_glob)):
        try:
            raw = mpath.read_bytes()
            data = json.loads(raw)
        except (OSError, ValueError):
            continue
        if not isinstance(data, dict):
            continue
        digest = hashlib.sha256(raw).hexdigest()
        if digest in reviewed_digests:
            continue
        pending.append({
            "manifest": str(mpath.relative_to(project)),
            "manifest_sha256": digest,
            "task_id": data.get("task_id", ""),
            "original_delivery": data.get("original_delivery", ""),
            "summary": data.get("summary", "")[:160],
        })
    return pending


def check_registered_runs(project):
    runs_path = project / ".byte-os/active-runs.json"
    cfg = read_json(runs_path, {})
    runs = cfg.get("runs", []) if isinstance(cfg, dict) else []
    active_count = 0
    alerts = []
    for run in runs:
        if not isinstance(run, dict) or run.get("status") in ("done", "failed", "ignored"):
            continue
        active_count += 1
        run_id = run.get("id", "unknown")
        host = run.get("host")
        pid = run.get("pid")
        done_file = run.get("done_file")
        log_file = run.get("log_file")
        err_regex = run.get("error_regex", DEFAULT_ERROR_REGEX)

        if host and pid:
            cmd = f"ps -p {int(pid)} >/dev/null 2>&1 && echo ALIVE || echo EXITED"
            if done_file:
                cmd += f"; test -f {shlex.quote(str(done_file))} && echo DONE_FILE"
            if log_file:
                cmd += f"; tail -n 40 -- {shlex.quote(str(log_file))} 2>/dev/null | grep -E {shlex.quote(err_regex)} | tail -n 3"
            ssh_args = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8"]
            if run.get("ssh_key"):
                ssh_args += ["-i", str(Path(run["ssh_key"]).expanduser()), "-o", "IdentitiesOnly=yes"]
            proc = subprocess.run(ssh_args + ["--", host, cmd], capture_output=True, text=True, timeout=20)
            if proc.returncode == 0:
                out = proc.stdout.strip()
                if "EXITED" in out or "DONE_FILE" in out:
                    alerts.append({"id": run_id, "state": "exited", "detail": out})
                elif out and "ALIVE" not in out.splitlines()[-1]:
                    alerts.append({"id": run_id, "state": "error_in_log", "detail": out})
        elif pid:
            proc = subprocess.run(["ps", "-p", str(int(pid))], capture_output=True, text=True)
            if proc.returncode != 0:
                alerts.append({"id": run_id, "state": "exited", "detail": f"local pid {pid} exited"})
        elif done_file and Path(done_file).is_file():
            alerts.append({"id": run_id, "state": "done_file", "detail": str(done_file)})
    return active_count, alerts


def deliver_bridge_say(project, target_id, message, dry_run=False):
    if dry_run:
        return {"ok": True, "dry_run": True, "target": target_id, "message": message}
    proc = subprocess.run(
        [sys.executable, "-B", str(BRIDGE_SCRIPT), "exec", "say", target_id, message, "--json"],
        cwd=project,
        capture_output=True,
        text=True,
        timeout=25,
    )
    try:
        return json.loads(proc.stdout or proc.stderr)
    except json.JSONDecodeError:
        return {"ok": False, "raw": (proc.stdout or proc.stderr).strip()}


def cmd_init(args):
    project = Path(args.project).resolve()
    workers = [w.strip() for w in (args.workers or "").split(",") if w.strip()]
    cfg = {
        "schema_version": 1,
        "lead_session": args.lead,
        "worker_sessions": workers,
        "watch_dir": args.watch_dir,
        "manifest_glob": args.manifest_glob,
        "verified_glob": args.verified_glob,
        "start_interval_seconds": args.interval,
        "idle_threshold_minutes": args.idle_minutes,
        "idle_cooldown_minutes": args.cooldown_minutes,
        "retrospective_every_n_wakes": args.retro_every,
        "retrospective_file": ".byte-os/coordination/workflow-retrospective.md",
    }
    cfg_path = project / ".byte-os/loop-config.json"
    write_json_atomic(cfg_path, cfg)
    result = {"config_path": str(cfg_path), "config": cfg}

    if args.install_launchd:
        slug = hashlib.sha256(str(project).encode()).hexdigest()[:10]
        label = args.launchd_label or f"local.byte.zero-token-loop.{slug}"
        log_dir = Path.home() / "Library/Logs/ByteResearch"
        log_dir.mkdir(parents=True, exist_ok=True)
        plist_path = Path.home() / "Library/LaunchAgents" / f"{label}.plist"
        plist_data = {
            "Label": label,
            "ProgramArguments": [
                sys.executable,
                "-B",
                str(Path(__file__).resolve()),
                "tick",
                "--project",
                str(project),
            ],
            "WorkingDirectory": str(project),
            "WatchPaths": [str((project / args.watch_dir).resolve())],
            "StartInterval": int(args.interval),
            "RunAtLoad": True,
            "StandardOutPath": str(log_dir / f"{label}.out"),
            "StandardErrorPath": str(log_dir / f"{label}.err"),
            "EnvironmentVariables": {
                "PATH": "/Users/elan/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
            },
        }
        with plist_path.open("wb") as fh:
            plistlib.dump(plist_data, fh)
        subprocess.run(["launchctl", "unload", str(plist_path)], capture_output=True)
        load_res = subprocess.run(["launchctl", "load", str(plist_path)], capture_output=True, text=True)
        result["launchd"] = {
            "label": label,
            "plist": str(plist_path),
            "loaded": load_res.returncode == 0,
            "stderr": load_res.stderr.strip(),
        }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


def cmd_tick(args):
    project = Path(args.project).resolve()
    cfg = read_json(project / ".byte-os/loop-config.json")
    if not isinstance(cfg, dict):
        print(json.dumps({"error": "missing .byte-os/loop-config.json; run init first"}))
        return 2

    active, reason = is_outcome_active(project)
    if not active:
        print(json.dumps({"action": "noop", "reason": reason}, ensure_ascii=False))
        return 0

    lead_harness, lead_id = strip_harness(cfg.get("lead_session"))
    if lead_harness != "codex" or not lead_id:
        print(json.dumps({"action": "noop", "reason": "lead_session_not_codex_bridge"}))
        return 0

    receipts_dir = project / ".byte-os/coordination/receipts"
    receipts_dir.mkdir(parents=True, exist_ok=True)
    counter_path = receipts_dir / "zero-token-loop-state.json"
    loop_state = read_json(counter_path, {"wake_count": 0, "notified_manifests": {}, "last_idle_wake": {}})
    retro_every = max(1, int(cfg.get("retrospective_every_n_wakes", 3)))
    retro_file = cfg.get("retrospective_file", ".byte-os/coordination/workflow-retrospective.md")

    # 1. Pending manifests (with 20m batch-coalescing gate unless marked milestone/urgent)
    pending = find_pending_manifests(project, cfg)
    min_batch_min = float(cfg.get("min_batch_interval_minutes", 20.0))
    last_pending_ts = float(loop_state.get("last_pending_wake_ts", 0))
    now_ts = time.time()
    sent = []
    for item in pending:
        digest = item["manifest_sha256"]
        if digest in loop_state.get("notified_manifests", {}):
            continue
        mdata = read_json(project / item["manifest"], {})
        is_milestone = bool(isinstance(mdata, dict) and (mdata.get("milestone") or mdata.get("urgent")))
        if not is_milestone and last_pending_ts > 0 and (now_ts - last_pending_ts) < min_batch_min * 60:
            continue
        next_count = int(loop_state.get("wake_count", 0)) + 1
        retro_note = ""
        if next_count % retro_every == 0:
            retro_note = (
                f"【周期自我反思】已完成第 {next_count} 次闭环触发，请在本次验收后顺带复盘近几轮是否存在空等、重复或流程摩擦，"
                f"直接优化可逆工作流并记录至 {retro_file}。"
            )
        msg = (
            f"【零Token守望·待验工件】清单 {item['manifest']}（SHA-256 {digest[:16]}...）。"
            f"请独立核验并推进下一轮。{retro_note}"
        )
        transport = deliver_bridge_say(project, lead_id, msg, dry_run=args.dry_run)
        rec = {"event": "pending_manifest", "manifest": item["manifest"], "sha256": digest, "transport": transport}
        sent.append(rec)
        if not args.dry_run and transport.get("ok"):
            loop_state["wake_count"] = next_count
            loop_state["last_pending_wake_ts"] = time.time()
            loop_state.setdefault("notified_manifests", {})[digest] = time.time()

    if sent:
        if not args.dry_run:
            write_json_atomic(counter_path, loop_state)
        print(json.dumps({"action": "notified_pending", "records": sent}, ensure_ascii=False, indent=2))
        return 0

    # 2. Registered run alerts
    active_runs, run_alerts = check_registered_runs(project)
    if run_alerts:
        alert_key = hashlib.sha256(json.dumps(run_alerts, sort_keys=True).encode()).hexdigest()[:16]
        if alert_key != loop_state.get("last_run_alert_key"):
            msg = f"【零Token守望·长任务终态/异常】检测到已登记运行状态变化：{json.dumps(run_alerts, ensure_ascii=False)}。请核验日志并接续下一步。"
            transport = deliver_bridge_say(project, lead_id, msg, dry_run=args.dry_run)
            if not args.dry_run and transport.get("ok"):
                loop_state["last_run_alert_key"] = alert_key
                write_json_atomic(counter_path, loop_state)
            print(json.dumps({"action": "notified_run_alert", "alerts": run_alerts, "transport": transport}, ensure_ascii=False, indent=2))
            return 0

    # 3. Anti-stall: Swarm-style board attribution + joint idle recovery + dormant cap
    if active_runs == 0:
        idle_thresh = float(cfg.get("idle_threshold_minutes", 20.0))
        cooldown = float(cfg.get("idle_cooldown_minutes", 30.0))
        max_alerts = int(cfg.get("max_stall_alerts", 3))
        dormant_after = int(cfg.get("dormant_after_noop_ticks", 5))
        codex_ids = [lead_id] + [
            sid for h, sid in (strip_harness(w) for w in cfg.get("worker_sessions", [])) if h == "codex" and sid
        ]
        statuses = [get_codex_thread_idle(tid) for tid in codex_ids]
        if all(s is not None and s["idle_minutes"] >= idle_thresh for s in statuses):
            board_posts, cursors = load_board_and_cursors(project)
            head_seq = board_posts[-1]["seq"] if board_posts else 0
            stop_sig = f"seq={head_seq}:" + ":".join(f"{s['id']}@{s['updated_at']}" for s in statuses)
            last_idle = loop_state.get("last_idle_wake", {})
            now = time.time()

            # Reset alert counter if board or threads moved
            if last_idle.get("stop_sig") != stop_sig:
                alert_count = 0
            else:
                alert_count = int(last_idle.get("alert_count", 0))

            if alert_count >= max_alerts:
                print(json.dumps({"action": "dormant", "reason": "max_stall_alerts_reached", "stop_sig": stop_sig}, ensure_ascii=False))
                return 0

            if not (last_idle.get("stop_sig") == stop_sig and (now - float(last_idle.get("sent_at", 0))) < cooldown * 60):
                target_role, target_id, reason_msg = diagnose_board_stall(board_posts, cursors, cfg, lead_id)
                summary = "，".join(f"{s['name']} 空闲 {s['idle_minutes']} 分钟" for s in statuses)
                if alert_count == max_alerts - 1 and target_id != lead_id:
                    # Escalate on final retry if a worker stayed unresponsive (e.g. quota/stuck)
                    target_id = lead_id
                    reason_msg = f"成员 {target_role} 多次唤醒未响应（{reason_msg}），请总控介入排查或切换模型/任务。"

                msg = (
                    f"【零Token守望·Swarm精准防停摆 ({alert_count + 1}/{max_alerts})】{reason_msg} "
                    f"当前状态：{summary}。请立即接续并复盘本次空等根因，记录至 {retro_file}。"
                )
                transport = deliver_bridge_say(project, target_id, msg, dry_run=args.dry_run)
                if not args.dry_run and transport.get("ok"):
                    loop_state["last_idle_wake"] = {
                        "stop_sig": stop_sig,
                        "sent_at": now,
                        "alert_count": alert_count + 1,
                        "target_id": target_id,
                    }
                    loop_state["noop_streak"] = 0
                    write_json_atomic(counter_path, loop_state)
                print(json.dumps({
                    "action": "notified_idle_recovery",
                    "target_role": target_role,
                    "target_id": target_id,
                    "alert_count": alert_count + 1,
                    "reason": reason_msg,
                    "transport": transport,
                }, ensure_ascii=False, indent=2))
                return 0

    noop_streak = int(loop_state.get("noop_streak", 0)) + 1
    if not args.dry_run:
        loop_state["noop_streak"] = noop_streak
        write_json_atomic(counter_path, loop_state)
    dormant_after = int(cfg.get("dormant_after_noop_ticks", 5))
    status_label = "dormant" if (active_runs == 0 and noop_streak >= dormant_after) else "healthy_or_cooldown"
    print(json.dumps({"action": "noop", "reason": status_label, "noop_streak": noop_streak, "active_runs": active_runs}, ensure_ascii=False))
    return 0


def board_paths(project):
    coord = project / ".byte-os/coordination"
    return coord / "board.jsonl", coord / "board-cursors.json"


def load_board_and_cursors(project):
    bpath, cpath = board_paths(project)
    posts = []
    if bpath.is_file():
        for raw in bpath.read_text(encoding="utf-8", errors="replace").splitlines():
            if not raw.strip():
                continue
            try:
                posts.append(json.loads(raw))
            except json.JSONDecodeError:
                continue
    cursors = read_json(cpath, {})
    return posts, cursors if isinstance(cursors, dict) else {}


def diagnose_board_stall(posts, cursors, cfg, lead_id):
    """Swarm-monitor attribution: find the exact member who can unstick the loop."""
    if not posts:
        return "lead", lead_id, "共享消息板尚无记录且双方均已空闲，请总控核对进展并分配下一阶段任务。"

    latest = posts[-1]
    latest_seq = latest.get("seq", 0)
    lead_cursor = int((cursors.get("lead") or {}).get("last_read_seq", 0))
    if latest_seq > lead_cursor and latest.get("from") != "lead":
        return "lead", lead_id, f"板上 #{latest_seq}（来自 {latest.get('from')}）尚未被总控读取（last_read_seq={lead_cursor}）。"

    # Check if a Codex worker was @mentioned after its last post
    workers = cfg.get("worker_sessions", [])
    role_map = cfg.get("role_sessions", {})
    for role, session_ref in role_map.items():
        h, sid = strip_harness(session_ref)
        if h != "codex" or not sid or sid == lead_id:
            continue
        last_post_seq = int((cursors.get(role) or {}).get("last_post_seq", 0))
        pending_mentions = [
            p for p in posts
            if p.get("seq", 0) > last_post_seq and role in (p.get("mentions") or [])
        ]
        if pending_mentions:
            mseq = pending_mentions[-1]["seq"]
            return role, sid, f"成员 @{role} 在 #{mseq} 被点名后尚未回复（last_post_seq={last_post_seq}）。"

    return "lead", lead_id, f"全员在 #{latest_seq} 后均已停下，请总控判断是验收推进还是触发阶段复盘。"


def cmd_post(args):
    project = Path(args.project).resolve()
    bpath, cpath = board_paths(project)
    bpath.parent.mkdir(parents=True, exist_ok=True)
    posts, cursors = load_board_and_cursors(project)
    seq = (posts[-1]["seq"] + 1) if posts else 1
    mentions = [m.strip().lstrip("@") for m in (args.to or "").split(",") if m.strip()]
    entry = {
        "seq": seq,
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "from": args.sender,
        "mentions": mentions,
        "kind": args.kind,
        "text": args.text,
    }
    with bpath.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
    cur = cursors.setdefault(args.sender, {})
    cur["last_post_seq"] = seq
    cur["last_read_seq"] = max(int(cur.get("last_read_seq", 0)), seq)
    write_json_atomic(cpath, cursors)
    print(json.dumps({"ok": True, "entry": entry}, ensure_ascii=False, indent=2))
    return 0


def cmd_board(args):
    project = Path(args.project).resolve()
    posts, cursors = load_board_and_cursors(project)
    filtered = [p for p in posts if p.get("seq", 0) > args.since]
    if args.reader and filtered:
        _, cpath = board_paths(project)
        cur = cursors.setdefault(args.reader, {})
        cur["last_read_seq"] = filtered[-1]["seq"]
        write_json_atomic(cpath, cursors)
    print(json.dumps({"posts": filtered[-args.limit:], "cursors": cursors}, ensure_ascii=False, indent=2))
    return 0


def cmd_wait_run(args):
    deadline = time.monotonic() + args.timeout if args.timeout else None
    while True:
        if args.done_file and not args.host and Path(args.done_file).is_file():
            print(json.dumps({"state": "done_file", "path": args.done_file}, ensure_ascii=False))
            return 0
        if args.host and args.pid:
            cmd = f"ps -p {int(args.pid)} >/dev/null 2>&1 && echo ALIVE || echo EXITED"
            if args.done_file:
                cmd += f"; test -f {shlex.quote(args.done_file)} && echo DONE_FILE"
            if args.log_file:
                cmd += f"; tail -n 30 -- {shlex.quote(args.log_file)} 2>/dev/null | grep -E {shlex.quote(args.error_regex)} | tail -n 3"
            ssh_args = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8"]
            if args.ssh_key:
                ssh_args += ["-i", str(Path(args.ssh_key).expanduser()), "-o", "IdentitiesOnly=yes"]
            proc = subprocess.run(ssh_args + ["--", args.host, cmd], capture_output=True, text=True, timeout=20)
            if proc.returncode == 0:
                out = proc.stdout.strip()
                if "EXITED" in out or "DONE_FILE" in out:
                    print(json.dumps({"state": "exited", "detail": out}, ensure_ascii=False))
                    return 0
                if out and "ALIVE" not in out.splitlines()[-1]:
                    print(json.dumps({"state": "error_in_log", "detail": out}, ensure_ascii=False))
                    return 1
        elif args.pid:
            proc = subprocess.run(["ps", "-p", str(int(args.pid))], capture_output=True)
            if proc.returncode != 0:
                print(json.dumps({"state": "exited", "pid": args.pid}, ensure_ascii=False))
                return 0

        if deadline and time.monotonic() >= deadline:
            print(json.dumps({"state": "timeout"}, ensure_ascii=False))
            return 2
        time.sleep(max(5, args.interval))


def cmd_wait_signal(args):
    project = Path(args.project).resolve()
    since_ts = args.since_ts if args.since_ts is not None else time.time()
    patterns = [p.strip() for p in args.patterns.split(",") if p.strip()]
    signal_files = [
        project / ".byte-os/coordination/ag-wake.json",
        project / ".byte-os/coordination/worker-wake.json",
    ]
    watch_dir = project / args.watch_dir

    while True:
        active, reason = is_outcome_active(project)
        if not active:
            print(json.dumps({"type": "stopped", "reason": reason}, ensure_ascii=False))
            return 0
        events = []
        for sfile in signal_files:
            if sfile.is_file() and sfile.stat().st_mtime > since_ts:
                events.append({"type": "signal", "path": str(sfile.relative_to(project)), "payload": read_json(sfile)})
        if watch_dir.is_dir():
            for pat in patterns:
                for p in sorted(watch_dir.glob(pat)):
                    if p.stat().st_mtime > since_ts:
                        events.append({"type": "artifact", "path": str(p.relative_to(project))})
        if events:
            print(json.dumps({"type": "wakeup", "events": events}, ensure_ascii=False, indent=2))
            return 0
        if args.once:
            print(json.dumps({"type": "idle", "events": []}, ensure_ascii=False))
            return 0
        time.sleep(max(5, args.interval))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_init = sub.add_parser("init", help="Initialize .byte-os/loop-config.json and optional launchd agent")
    p_init.add_argument("--project", required=True)
    p_init.add_argument("--lead", required=True, help="Lead session, e.g. codex:<uuid>")
    p_init.add_argument("--workers", default="", help="Comma-separated worker sessions")
    p_init.add_argument("--watch-dir", default=".byte-os/round-04")
    p_init.add_argument("--manifest-glob", default="*-steer-input.json")
    p_init.add_argument("--verified-glob", default="*-mentor-verified.json")
    p_init.add_argument("--interval", type=int, default=180)
    p_init.add_argument("--idle-minutes", type=float, default=20.0)
    p_init.add_argument("--cooldown-minutes", type=float, default=30.0)
    p_init.add_argument("--retro-every", type=int, default=3)
    p_init.add_argument("--install-launchd", action="store_true")
    p_init.add_argument("--launchd-label", default=None)
    p_init.set_defaults(func=cmd_init)

    p_tick = sub.add_parser("tick", help="Run one zero-token check and wake lead only when actionable")
    p_tick.add_argument("--project", required=True)
    p_tick.add_argument("--dry-run", action="store_true")
    p_tick.set_defaults(func=cmd_tick)

    p_run = sub.add_parser("wait-run", help="Zero-token blocker for local/SSH training or long jobs")
    p_run.add_argument("--pid", type=int)
    p_run.add_argument("--host")
    p_run.add_argument("--ssh-key")
    p_run.add_argument("--done-file")
    p_run.add_argument("--log-file")
    p_run.add_argument("--error-regex", default=DEFAULT_ERROR_REGEX)
    p_run.add_argument("--interval", type=int, default=30)
    p_run.add_argument("--timeout", type=int, default=None)
    p_run.set_defaults(func=cmd_wait_run)

    p_sig = sub.add_parser("wait-signal", help="Zero-token self-loop watcher for clients without external wake")
    p_sig.add_argument("--project", required=True)
    p_sig.add_argument("--watch-dir", default=".byte-os/round-04")
    p_sig.add_argument("--patterns", default="antigravity-*-mentor-verified.json,ag-r*-codex-*.md")
    p_sig.add_argument("--since-ts", type=float, default=None)
    p_sig.add_argument("--interval", type=int, default=15)
    p_sig.add_argument("--once", action="store_true")
    p_sig.set_defaults(func=cmd_wait_signal)

    p_post = sub.add_parser("post", help="Post a #seq-indexed message to the shared coordination board")
    p_post.add_argument("--project", required=True)
    p_post.add_argument("--from", dest="sender", required=True, help="Sender role name, e.g. lead, codex-methods")
    p_post.add_argument("--to", default="", help="Comma-separated @mentions, e.g. codex-methods,lead")
    p_post.add_argument("--kind", default="note", choices=["brief", "milestone", "verify", "stall", "done", "note"])
    p_post.add_argument("--text", required=True)
    p_post.set_defaults(func=cmd_post)

    p_board = sub.add_parser("board", help="Read shared board messages and optionally advance reader cursor")
    p_board.add_argument("--project", required=True)
    p_board.add_argument("--since", type=int, default=0)
    p_board.add_argument("--limit", type=int, default=20)
    p_board.add_argument("--reader", default=None, help="Role name to advance last_read_seq cursor")
    p_board.set_defaults(func=cmd_board)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
