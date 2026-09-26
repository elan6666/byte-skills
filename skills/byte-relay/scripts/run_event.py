#!/usr/bin/env python3
"""Record one training attempt and emit a durable, deduplicated terminal event.

This script does not implement a Codex desktop notification adapter. A notifier
must be separately configured and tested; it receives an event JSON path.
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path


SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def atomic_json(path: Path, value: dict) -> None:
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.",
        delete=False,
    ) as handle:
        json.dump(value, handle, sort_keys=True, indent=2)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
        temp_path = Path(handle.name)
    os.replace(temp_path, path)


@contextmanager
def locked(directory: Path):
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / ".lock").open("a+") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        yield


def run_directory(args: argparse.Namespace) -> Path:
    if not SAFE_ID.fullmatch(args.run_id):
        raise ValueError("run ID must use letters, digits, dot, underscore, or hyphen")
    if args.attempt < 1:
        raise ValueError("attempt must be positive")
    return args.root.resolve() / args.run_id / f"attempt-{args.attempt}"


def event_record(args: argparse.Namespace, directory: Path, kind: str, **extra) -> dict:
    return {
        "event_id": f"{args.run_id}:{args.attempt}:{kind}",
        "run_id": args.run_id,
        "attempt": args.attempt,
        "kind": kind,
        "created_at": timestamp(),
        "log_path": str((directory / "train.log").resolve()),
        **extra,
    }


def deliver(event_path: Path, notifier: Path | None) -> str:
    delivery_path = event_path.with_name(event_path.stem + ".delivery.json")
    if delivery_path.exists():
        return json.loads(delivery_path.read_text(encoding="utf-8"))["status"]
    if notifier is None:
        return "pending_no_notifier"
    # Persist ambiguity before calling an external transport. If the wrapper
    # dies mid-call, a later check must reconcile rather than blindly resend.
    atomic_json(delivery_path, {"status": "unverified", "attempted_at": timestamp()})
    try:
        result = subprocess.run(
            [str(notifier), str(event_path.resolve())],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            timeout=15, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return "unverified"
    if result.returncode != 0:
        return "unverified"
    atomic_json(delivery_path, {"status": "accepted", "attempted_at": timestamp()})
    return "accepted"


def run(args: argparse.Namespace) -> int:
    directory = run_directory(args)
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        raise ValueError("run requires a command after --")
    with locked(directory):
        if (directory / "running.json").exists() or (directory / "terminal.json").exists():
            raise ValueError("attempt already exists; refusing duplicate launch")
        log_path = directory / "train.log"
        with log_path.open("x", encoding="utf-8") as log:
            process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT)
            atomic_json(directory / "running.json", {
                "run_id": args.run_id, "attempt": args.attempt,
                "command": command, "pid": process.pid,
                "wrapper_pid": os.getpid(), "started_at": timestamp(),
                "log_path": str(log_path.resolve()),
            })
    exit_code = process.wait()
    with locked(directory):
        event_path = directory / "terminal.json"
        atomic_json(event_path, event_record(
            args, directory, "terminal", exit_code=exit_code,
            outcome="failed" if exit_code else "completed",
        ))
        delivery = deliver(event_path, args.notifier)
    print(json.dumps({"event": str(event_path), "delivery": delivery, "exit_code": exit_code}))
    return exit_code if exit_code >= 0 else 128 - exit_code


def process_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def check(args: argparse.Namespace) -> int:
    directory = run_directory(args)
    if not directory.exists():
        raise ValueError("attempt directory does not exist")
    with locked(directory):
        terminal = directory / "terminal.json"
        if terminal.exists():
            delivery = deliver(terminal, args.notifier)
            print(json.dumps({"event": str(terminal), "delivery": delivery}))
            return 0
        running_path = directory / "running.json"
        if not running_path.exists():
            raise ValueError("attempt has neither running nor terminal evidence")
        running = json.loads(running_path.read_text(encoding="utf-8"))
        stale = directory / "stale.json"
        if not process_alive(int(running["pid"])):
            reason = "process_missing_without_terminal_event"
        elif args.heartbeat_file is not None and (
            not args.heartbeat_file.exists()
            or time.time() - args.heartbeat_file.stat().st_mtime > args.stale_seconds
        ):
            reason = "heartbeat_stale"
        else:
            print(json.dumps({"status": "running", "pid": running["pid"]}))
            return 0
        if not stale.exists():
            atomic_json(stale, event_record(args, directory, "stale", reason=reason))
        delivery = deliver(stale, args.notifier)
        print(json.dumps({"event": str(stale), "delivery": delivery, "reason": reason}))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="action", required=True)
    for action in ("run", "check"):
        sub = subparsers.add_parser(action)
        sub.add_argument("--root", type=Path, required=True)
        sub.add_argument("--run-id", required=True)
        sub.add_argument("--attempt", type=int, default=1)
        sub.add_argument("--notifier", type=Path)
        if action == "run":
            sub.add_argument("command", nargs=argparse.REMAINDER)
        else:
            sub.add_argument("--heartbeat-file", type=Path)
            sub.add_argument("--stale-seconds", type=int, default=1800)
    args = parser.parse_args()
    try:
        return run(args) if args.action == "run" else check(args)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"run_event: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
