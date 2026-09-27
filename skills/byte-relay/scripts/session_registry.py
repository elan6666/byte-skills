#!/usr/bin/env python3
"""Register and inspect cross-harness conversation identity for byte-relay."""

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
from pathlib import Path


HARNESS_CHOICES = ("codex", "claude", "dsh", "zcode")
STATUS_CHOICES = ("active", "handed_off", "closed")


def now_iso():
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


def project_root(value):
    return Path(value).expanduser().resolve()


def validate_session_ref(value):
    if value is None:
        return None
    harness, separator, native_id = value.partition(":")
    if separator != ":" or harness not in HARNESS_CHOICES or not native_id:
        raise RuntimeError(
            "session reference must be <codex|claude|dsh|zcode>:<native-session-id>"
        )
    return value


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


def git_value(project, *args):
    try:
        result = subprocess.run(
            ["git", "-C", str(project), *args],
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip() or None
    except (OSError, subprocess.CalledProcessError):
        return None


def git_snapshot(project):
    root = git_value(project, "rev-parse", "--show-toplevel")
    return {
        "project_root": str(Path(root).resolve()) if root else str(project),
        "branch": git_value(project, "branch", "--show-current"),
        "commit": git_value(project, "rev-parse", "HEAD"),
    }


def load_state(project):
    return load_json(coordination_dir(project) / "state.json")


def require_owner(state, harness, session_id=None, requested_stage=None):
    owner = state.get("owner")
    if owner != harness:
        raise RuntimeError(
            f"authority mismatch: state.owner={owner!r}, requested harness={harness!r}"
        )
    owner_session = state.get("owner_session")
    requested_session = f"{harness}:{session_id}" if session_id else None
    if owner_session is not None and owner_session != requested_session:
        raise RuntimeError(
            f"session authority mismatch: state.owner_session={owner_session!r}, "
            f"requested session={requested_session!r}"
        )
    stage = state.get("stage")
    if requested_stage is not None and requested_stage != stage:
        raise RuntimeError(
            f"stage mismatch: state.stage={stage!r}, requested stage={requested_stage!r}"
        )
    return stage


def registry_path(project):
    return coordination_dir(project) / "sessions.json"


def load_registry(project, allow_missing=False):
    path = registry_path(project)
    if not path.exists() and allow_missing:
        return {
            "schema_version": 1,
            "project": {"root": str(project)},
            "sessions": {},
            "active_by_harness": {},
            "updated_at": now_iso(),
        }
    registry = load_json(path)
    if registry.get("schema_version") != 1:
        raise RuntimeError(
            f"unsupported sessions.json schema_version: {registry.get('schema_version')!r}"
        )
    if not isinstance(registry.get("sessions"), dict):
        raise RuntimeError("sessions.json field 'sessions' must be an object")
    if not isinstance(registry.get("active_by_harness"), dict):
        raise RuntimeError("sessions.json field 'active_by_harness' must be an object")
    return registry


def default_locator(harness, session_id):
    if harness == "codex":
        return f"codex://threads/{session_id}"
    return None


def register(args):
    project = project_root(args.project)
    state = load_state(project)
    stage = require_owner(state, args.harness, args.session_id, args.stage)
    registry = load_registry(project, allow_missing=True)
    key = f"{args.harness}:{args.session_id}"
    existing = registry["sessions"].get(key, {})
    if args.model_evidence and not args.model:
        raise RuntimeError("--model-evidence requires --model")
    timestamp = now_iso()
    participant = state.get("participants", {}).get(key, {})
    reports_to = validate_session_ref(args.reports_to or participant.get("reports_to"))
    record = {
        "harness": args.harness,
        "native_session_id": args.session_id,
        "alias": args.alias,
        "locator": args.locator or default_locator(args.harness, args.session_id),
        "host_id": args.host_id or participant.get("host_id"),
        "role": args.role or participant.get("role") or state.get("roles", {}).get(args.harness),
        "reports_to": reports_to,
        "stage": stage,
        "provider": args.provider if args.provider is not None else existing.get("provider"),
        "model": args.model if args.model is not None else existing.get("model"),
        "model_evidence": (
            args.model_evidence if args.model is not None
            else existing.get("model_evidence")
        ),
        **git_snapshot(project),
        "status": args.status,
        "created_at": existing.get("created_at", timestamp),
        "updated_at": timestamp,
    }
    registry["sessions"][key] = record
    if args.status == "active":
        registry["active_by_harness"][args.harness] = key
    elif registry["active_by_harness"].get(args.harness) == key:
        registry["active_by_harness"].pop(args.harness, None)
    registry["project"] = {"root": record["project_root"]}
    registry["updated_at"] = timestamp
    atomic_write(registry_path(project), registry)
    print(json.dumps({"key": key, **record}, ensure_ascii=False, indent=2))


def set_status(args):
    project = project_root(args.project)
    state = load_state(project)
    require_owner(state, args.harness, args.session_id)
    registry = load_registry(project)
    key = f"{args.harness}:{args.session_id}"
    if key not in registry["sessions"]:
        raise RuntimeError(f"session is not registered: {key}")
    timestamp = now_iso()
    registry["sessions"][key]["status"] = args.status
    registry["sessions"][key]["updated_at"] = timestamp
    if args.status == "active":
        registry["active_by_harness"][args.harness] = key
    elif registry["active_by_harness"].get(args.harness) == key:
        registry["active_by_harness"].pop(args.harness, None)
    registry["updated_at"] = timestamp
    atomic_write(registry_path(project), registry)
    print(f"{key}: status={args.status}")


def list_sessions(args):
    project = project_root(args.project)
    registry = load_registry(project)
    if args.json:
        print(json.dumps(registry, ensure_ascii=False, indent=2))
        return
    print("KEY\tSTATUS\tSTAGE\tROLE\tREPORTS_TO\tHOST\tALIAS\tMODEL\tLOCATOR")
    records = sorted(
        registry["sessions"].items(),
        key=lambda item: item[1].get("updated_at", ""),
        reverse=True,
    )
    for key, record in records:
        print(
            "\t".join(
                str(value or "-")
                for value in (
                    key,
                    record.get("status"),
                    record.get("stage"),
                    record.get("role"),
                    record.get("reports_to"),
                    record.get("host_id"),
                    record.get("alias"),
                    record.get("model"),
                    record.get("locator"),
                )
            )
        )


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    register_parser = sub.add_parser("register", help="register or refresh an owned session")
    register_parser.add_argument("--project", required=True)
    register_parser.add_argument("--harness", required=True, choices=HARNESS_CHOICES)
    register_parser.add_argument("--session-id", required=True)
    register_parser.add_argument("--alias", required=True)
    register_parser.add_argument("--role")
    register_parser.add_argument("--reports-to")
    register_parser.add_argument("--stage")
    register_parser.add_argument("--locator")
    register_parser.add_argument("--host-id")
    register_parser.add_argument("--provider")
    register_parser.add_argument("--model")
    register_parser.add_argument(
        "--model-evidence",
        help="native runtime/model-selection evidence for the exact session; omit if unverified",
    )
    register_parser.add_argument("--status", choices=STATUS_CHOICES, default="active")
    register_parser.set_defaults(func=register)

    status_parser = sub.add_parser("set-status", help="change an owned session status")
    status_parser.add_argument("--project", required=True)
    status_parser.add_argument("--harness", required=True, choices=HARNESS_CHOICES)
    status_parser.add_argument("--session-id", required=True)
    status_parser.add_argument("--status", required=True, choices=STATUS_CHOICES)
    status_parser.set_defaults(func=set_status)

    list_parser = sub.add_parser("list", help="list sessions without taking ownership")
    list_parser.add_argument("--project", required=True)
    list_parser.add_argument("--json", action="store_true")
    list_parser.set_defaults(func=list_sessions)
    return parser


def main():
    args = build_parser().parse_args()
    try:
        args.func(args)
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
