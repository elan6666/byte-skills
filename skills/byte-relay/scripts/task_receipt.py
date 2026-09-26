#!/usr/bin/env python3
"""Create and inspect evidence-backed task receipts for byte-relay."""

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
from pathlib import Path


HARNESS_CHOICES = ("codex", "claude", "dsh", "zcode")
ACCEPTANCE_CHOICES = ("verified", "partial", "failed")
TASK_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


def now_iso():
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


def project_root(value):
    return Path(value).expanduser().resolve()


def coordination_dir(project):
    return project / ".byte-os" / "coordination"


def load_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError(f"required relay file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"invalid JSON in {path}: {exc}") from exc


def atomic_write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    payload = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    try:
        with open(tmp, "w", encoding="utf-8") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp, path)
    finally:
        try:
            tmp.unlink()
        except FileNotFoundError:
            pass


def atomic_text(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    try:
        with open(tmp, "w", encoding="utf-8") as stream:
            stream.write(value)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp, path)
    finally:
        try:
            tmp.unlink()
        except FileNotFoundError:
            pass


def git_value(project, *args):
    try:
        result = subprocess.run(
            ["git", "-C", str(project), *args],
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        raise RuntimeError(f"Git command failed: {' '.join(args)}") from exc
    value = result.stdout.strip()
    if not value:
        raise RuntimeError(f"Git command returned no value: {' '.join(args)}")
    return value


def checked_task_id(value):
    if not TASK_ID.fullmatch(value):
        raise RuntimeError(
            "task ID must start with an alphanumeric character and contain only "
            "letters, numbers, dot, underscore, or hyphen"
        )
    return value


def receipt_path(project, task_id):
    return coordination_dir(project) / "receipts" / f"{checked_task_id(task_id)}.json"


def require_owned_session(project, harness, session_id, requested_stage=None):
    state = load_json(coordination_dir(project) / "state.json")
    if state.get("owner") != harness:
        raise RuntimeError(
            f"authority mismatch: state.owner={state.get('owner')!r}, "
            f"requested harness={harness!r}"
        )
    stage = state.get("stage")
    if requested_stage is not None and requested_stage != stage:
        raise RuntimeError(
            f"stage mismatch: state.stage={stage!r}, requested stage={requested_stage!r}"
        )
    registry = load_json(coordination_dir(project) / "sessions.json")
    key = f"{harness}:{session_id}"
    record = registry.get("sessions", {}).get(key)
    if record is None:
        raise RuntimeError(f"session is not registered: {key}")
    if record.get("status") != "active":
        raise RuntimeError(f"session is not active: {key}")
    if record.get("stage") != stage:
        raise RuntimeError(
            f"session stage mismatch: session.stage={record.get('stage')!r}, "
            f"state.stage={stage!r}"
        )
    return state, key


def acceptance_items(values, state):
    criteria = list(values or [])
    if not criteria:
        saved = state.get("acceptance")
        if isinstance(saved, str) and saved.strip():
            criteria = [saved.strip()]
        elif isinstance(saved, list):
            criteria = [str(item).strip() for item in saved if str(item).strip()]
    return [{"criterion": item, "status": "pending", "evidence": None} for item in criteria]


def start(args):
    project = project_root(args.project)
    state, session_key = require_owned_session(
        project, args.harness, args.session_id, args.stage
    )
    path = receipt_path(project, args.task_id)
    if path.exists():
        raise RuntimeError(f"task receipt already exists: {path}")
    timestamp = now_iso()
    receipt = {
        "schema_version": 1,
        "task_id": args.task_id,
        "owner_session": session_key,
        "stage": state.get("stage"),
        "base_commit": git_value(project, "rev-parse", "HEAD"),
        "head_commit": None,
        "verification": [],
        "artifacts": [],
        "acceptance": acceptance_items(args.acceptance, state),
        "rulings": [],
        "deviations": [],
        "limits": [],
        "status": "in_progress",
        "started_at": timestamp,
        "updated_at": timestamp,
    }
    atomic_write(path, receipt)
    print(json.dumps({"path": str(path), **receipt}, ensure_ascii=False, indent=2))


def complete(args):
    project = project_root(args.project)
    path = receipt_path(project, args.task_id)
    receipt = load_json(path)
    if receipt.get("schema_version") != 1:
        raise RuntimeError(
            f"unsupported receipt schema_version: {receipt.get('schema_version')!r}"
        )
    _, session_key = require_owned_session(
        project, args.harness, args.session_id, receipt.get("stage")
    )
    if receipt.get("owner_session") != session_key:
        raise RuntimeError(
            f"receipt owner mismatch: receipt.owner_session={receipt.get('owner_session')!r}, "
            f"requested session={session_key!r}"
        )
    if receipt.get("status") != "in_progress":
        raise RuntimeError(f"receipt is not in progress: status={receipt.get('status')!r}")
    timestamp = now_iso()
    result = subprocess.run(
        ["/bin/sh", "-lc", args.verify_command],
        cwd=project,
        capture_output=True,
        text=True,
    )
    output = (result.stdout or "") + (result.stderr or "")
    if args.log_path:
        log_path = Path(args.log_path).expanduser()
        if not log_path.is_absolute():
            log_path = project / log_path
    else:
        stamp = dt.datetime.now().astimezone().strftime("%Y%m%dT%H%M%S%z")
        log_path = coordination_dir(project) / "receipts" / "logs" / f"{args.task_id}-{stamp}.log"
    atomic_text(log_path, output)
    if (
        result.returncode == 0
        and receipt.get("acceptance")
        and args.acceptance_status == "verified"
        and not args.acceptance_evidence
    ):
        raise RuntimeError(
            "--acceptance-evidence is required when acceptance is marked verified"
        )
    receipt["head_commit"] = git_value(project, "rev-parse", "HEAD")
    receipt["verification"].append(
        {
            "command": args.verify_command,
            "exit_status": result.returncode,
            "log_path": str(log_path),
            "observed_at": timestamp,
        }
    )
    receipt["artifacts"] = list(dict.fromkeys(receipt["artifacts"] + args.artifact))
    receipt["rulings"].extend(args.ruling)
    receipt["deviations"].extend(args.deviation)
    receipt["limits"].extend(args.limit)
    effective_acceptance = args.acceptance_status if result.returncode == 0 else "failed"
    for item in receipt["acceptance"]:
        item["status"] = effective_acceptance
        item["evidence"] = args.acceptance_evidence if result.returncode == 0 else str(log_path)
    if result.returncode != 0 or args.acceptance_status == "failed":
        receipt["status"] = "failed"
    elif args.acceptance_status == "partial":
        receipt["status"] = "partial"
    else:
        receipt["status"] = "complete"
    receipt["updated_at"] = timestamp
    receipt["completed_at"] = timestamp
    atomic_write(path, receipt)
    print(json.dumps({"path": str(path), **receipt}, ensure_ascii=False, indent=2))
    return result.returncode


def show(args):
    project = project_root(args.project)
    print(json.dumps(load_json(receipt_path(project, args.task_id)), ensure_ascii=False, indent=2))


def list_receipts(args):
    project = project_root(args.project)
    directory = coordination_dir(project) / "receipts"
    records = []
    if directory.exists():
        for path in sorted(directory.glob("*.json")):
            receipt = load_json(path)
            records.append(
                {
                    "task_id": receipt.get("task_id"),
                    "status": receipt.get("status"),
                    "stage": receipt.get("stage"),
                    "owner_session": receipt.get("owner_session"),
                    "updated_at": receipt.get("updated_at"),
                    "path": str(path),
                }
            )
    print(json.dumps(records, ensure_ascii=False, indent=2))


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command_name", required=True)

    start_parser = sub.add_parser("start", help="start an owned task receipt")
    start_parser.add_argument("--project", required=True)
    start_parser.add_argument("--task-id", required=True)
    start_parser.add_argument("--harness", required=True, choices=HARNESS_CHOICES)
    start_parser.add_argument("--session-id", required=True)
    start_parser.add_argument("--stage")
    start_parser.add_argument("--acceptance", action="append", default=[])
    start_parser.set_defaults(func=start)

    complete_parser = sub.add_parser("complete", help="finish an owned task receipt")
    complete_parser.add_argument("--project", required=True)
    complete_parser.add_argument("--task-id", required=True)
    complete_parser.add_argument("--harness", required=True, choices=HARNESS_CHOICES)
    complete_parser.add_argument("--session-id", required=True)
    complete_parser.add_argument("--verify-command", required=True)
    complete_parser.add_argument("--log-path")
    complete_parser.add_argument("--artifact", action="append", default=[])
    complete_parser.add_argument("--acceptance-status", choices=ACCEPTANCE_CHOICES, default="verified")
    complete_parser.add_argument("--acceptance-evidence")
    complete_parser.add_argument("--ruling", action="append", default=[])
    complete_parser.add_argument("--deviation", action="append", default=[])
    complete_parser.add_argument("--limit", action="append", default=[])
    complete_parser.set_defaults(func=complete)

    show_parser = sub.add_parser("show", help="show one receipt without taking ownership")
    show_parser.add_argument("--project", required=True)
    show_parser.add_argument("--task-id", required=True)
    show_parser.set_defaults(func=show)

    list_parser = sub.add_parser("list", help="list receipts without taking ownership")
    list_parser.add_argument("--project", required=True)
    list_parser.set_defaults(func=list_receipts)
    return parser


def main():
    args = build_parser().parse_args()
    try:
        result = args.func(args)
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return result or 0


if __name__ == "__main__":
    sys.exit(main())
