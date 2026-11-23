#!/usr/bin/env python3
"""Direct ACP bridge CLI to list or message existing Antigravity desktop sessions.

Uses Antigravity's official ACP stdio server (`agy acp --app-data-dir antigravity`)
so Codex or local watchers can directly wake and message any Antigravity session by ID.
"""

import argparse
import json
from pathlib import Path
import subprocess
import sys
import threading


class ACPClient:
    def __init__(self, app_data_dir="antigravity", dangerously_skip_permissions=False):
        cmd = ["agy", "acp", "--app-data-dir", app_data_dir]
        if dangerously_skip_permissions:
            cmd.append("--dangerously-skip-permissions")
        self.proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        self._id = 0
        self.chunks = []
        self.notifications = []

    def rpc(self, method, params=None, timeout=180):
        self._id += 1
        mid = self._id
        req = {"jsonrpc": "2.0", "id": mid, "method": method, "params": params or {}}
        self.proc.stdin.write(json.dumps(req, ensure_ascii=False) + "\n")
        self.proc.stdin.flush()

        result_box = {}

        def _reader():
            while True:
                line = self.proc.stdout.readline()
                if not line:
                    result_box["eof"] = True
                    return
                try:
                    msg = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if msg.get("id") == mid:
                    result_box["response"] = msg
                    return
                # Auto-respond to server-initiated permission requests when --auto-approve is used
                if "id" in msg and msg.get("method") == "session/request_permission":
                    options = msg.get("params", {}).get("options", [])
                    chosen = next(
                        (o.get("optionId") for o in options if o.get("kind") in ("allow_always", "allow_once")),
                        options[0].get("optionId") if options else "allow",
                    )
                    reply = {"jsonrpc": "2.0", "id": msg["id"], "result": {"outcome": {"outcome": "selected", "optionId": chosen}}}
                    self.proc.stdin.write(json.dumps(reply) + "\n")
                    self.proc.stdin.flush()
                    continue
                # Collect streaming agent text notifications
                if msg.get("method") == "session/update":
                    upd = msg.get("params", {}).get("update", {})
                    if upd.get("sessionUpdate") == "agent_message_chunk":
                        content = upd.get("content", {})
                        if content.get("type") == "text" and content.get("text"):
                            self.chunks.append(content["text"])
                self.notifications.append(msg)

        t = threading.Thread(target=_reader, daemon=True)
        t.start()
        t.join(timeout=timeout)
        if t.is_alive():
            return {"error": {"code": -32000, "message": f"timeout after {timeout}s"}}
        if "response" in result_box:
            return result_box["response"]
        return {"error": {"code": -32001, "message": "ACP server closed before responding"}}

    def close(self):
        try:
            self.proc.terminate()
            self.proc.wait(timeout=3)
        except Exception:
            try:
                self.proc.kill()
            except Exception:
                pass


def read_transcript_tail(session_id, limit=5, app_data_dir="antigravity"):
    tpath = Path.home() / ".gemini" / app_data_dir / "brain" / session_id / ".system_generated/logs/transcript.jsonl"
    if not tpath.is_file():
        return {"ok": False, "error": f"transcript not found: {tpath}"}
    entries = []
    for raw in tpath.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            d = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if d.get("type") in ("USER_INPUT", "PLANNER_RESPONSE") and (d.get("content") or d.get("tool_calls")):
            entries.append({
                "step_index": d.get("step_index"),
                "type": d.get("type"),
                "status": d.get("status"),
                "created_at": d.get("created_at"),
                "content": (d.get("content") or "")[:600],
            })
    return {
        "ok": True,
        "session_id": session_id,
        "mtime": tpath.stat().st_mtime,
        "recent": entries[-limit:],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app-data-dir", default="antigravity")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_ls = sub.add_parser("ls", help="List Antigravity desktop sessions")
    p_ls.add_argument("--project", default=None, help="Filter substring on cwd or title")
    p_ls.add_argument("--json", action="store_true")

    p_tail = sub.add_parser("tail", help="Read recent turns from an Antigravity session transcript (0-lock, read-only)")
    p_tail.add_argument("session_id", help="Antigravity conversation UUID")
    p_tail.add_argument("limit", nargs="?", type=int, default=5)
    p_tail.add_argument("--json", action="store_true")

    p_say = sub.add_parser("say", help="Send a prompt to an existing Antigravity session via ACP")
    p_say.add_argument("session_id", help="Antigravity conversation UUID")
    p_say.add_argument("message", help="Message text to send")
    p_say.add_argument("--cwd", default=str(Path.cwd()), help="Workspace directory")
    p_say.add_argument("--timeout", type=int, default=180, help="Wait timeout in seconds")
    p_say.add_argument("--auto-approve", action="store_true", help="Pass --dangerously-skip-permissions")
    p_say.add_argument("--json", action="store_true")

    args = parser.parse_args()
    if args.cmd == "tail":
        res = read_transcript_tail(args.session_id, args.limit, args.app_data_dir)
        print(json.dumps(res, ensure_ascii=False, indent=2))
        return 0 if res.get("ok") else 1
    client = ACPClient(
        app_data_dir=args.app_data_dir,
        dangerously_skip_permissions=getattr(args, "auto_approve", False),
    )
    try:
        init_res = client.rpc("initialize", {"protocolVersion": 1, "clientCapabilities": {}}, timeout=20)
        if "error" in init_res:
            print(json.dumps({"ok": False, "stage": "initialize", "error": init_res["error"]}, ensure_ascii=False))
            return 1

        if args.cmd == "ls":
            res = client.rpc("session/list", {}, timeout=20)
            sessions = res.get("result", {}).get("sessions", [])
            if args.project:
                sessions = [
                    s for s in sessions
                    if args.project in (s.get("cwd", "") + " " + s.get("title", ""))
                ]
            if args.json:
                print(json.dumps(sessions, ensure_ascii=False, indent=2))
            else:
                for s in sessions:
                    print(f"{s.get('sessionId')} | {s.get('title', '')} | {s.get('updatedAt', '')}")
            return 0

        if args.cmd == "say":
            res_resume = client.rpc(
                "session/resume",
                {"sessionId": args.session_id, "cwd": str(Path(args.cwd).resolve()), "mcpServers": []},
                timeout=30,
            )
            if "error" in res_resume:
                print(json.dumps({"ok": False, "stage": "resume", "error": res_resume["error"]}, ensure_ascii=False))
                return 1

            res_prompt = client.rpc(
                "session/prompt",
                {
                    "sessionId": args.session_id,
                    "prompt": [{"type": "text", "text": args.message}],
                },
                timeout=args.timeout,
            )
            ok = "error" not in res_prompt
            out = {
                "ok": ok,
                "session_id": args.session_id,
                "reply": "".join(client.chunks).strip(),
                "result": res_prompt.get("result"),
                "error": res_prompt.get("error"),
            }
            print(json.dumps(out, ensure_ascii=False, indent=2))
            return 0 if ok else 1
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
