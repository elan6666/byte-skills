#!/usr/bin/env python3
"""Draft immutable Bridge metadata for a later Byte engine transition; never change ownership."""
from __future__ import annotations

import argparse
import fnmatch
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys


IDENTITY_KEYS = {"harness", "host_id", "profile_id", "native_session_id", "project_id", "runtime_generation"}


def identity(value):
    if not isinstance(value, dict) or set(value) != IDENTITY_KEYS or not all(isinstance(v, str) and v for v in value.values()):
        raise ValueError("Use the full exact native SessionIdentity from Bridge context/sessions")
    return value["harness"] + ":" + value["native_session_id"]


def draft(root: Path, value: dict) -> dict:
    root = root.resolve(strict=True)
    def read(relative):
        path = root / relative
        if path.resolve() != path or not path.is_file():
            raise ValueError("Workflow state and snapshot must be canonical project files")
        return path.read_bytes()
    state = json.loads(read(".byte-os/coordination/state.json"))
    outcome = state["overall_outcome"]
    workflow = outcome["workflow"]
    if workflow["engine"] != "byte-workflow/v1":
        raise ValueError("This draft helper is only for Byte workflow v1")
    direction = value["direction"]
    if direction not in ("delegate", "return"):
        raise ValueError("direction must be delegate or return")
    scope = value["scope"]
    if set(scope) != {"source", "target", "return_to", "goal", "acceptance", "read_paths", "write_paths", "deadline_at"}:
        raise ValueError("Use exactly the complete frozen Bridge scope fields")
    source, target, main = (identity(scope[key]) for key in ("source", "target", "return_to"))
    if source != state["owner_session"]:
        raise ValueError("Only the current exact owner can prepare its handoff")
    if len({scope[k]["project_id"] for k in ("source", "target", "return_to")}) != 1:
        raise ValueError("Bridge project identities differ")
    snapshot = read(".byte-os/workflow.yaml")
    if hashlib.sha256(snapshot).hexdigest() != workflow["instance_sha256"]:
        raise ValueError("Pinned workflow changed")
    # The engine writes JSON-compatible YAML snapshots, so no optional YAML
    # library is needed here. Bindings are still rechecked by the bridge provider.
    manifest = json.loads(snapshot)
    roles = manifest["roles"]
    expected = (roles["main"], roles["supervisor"], roles["main"]) if direction == "delegate" else (roles["supervisor"], roles["main"], roles["main"])
    if (source, target, main) != expected:
        raise ValueError("Handoff roles do not match the pinned main/supervisor")
    run_id, attempt = value["run_id"], value["attempt"]
    if not isinstance(run_id, str) or not run_id or type(attempt) is not int or attempt < 1:
        raise ValueError("A real run_id and positive attempt are required")
    if direction == "return":
        execution = outcome["execution"]
        if (run_id, attempt) != (execution.get("run_id"), execution.get("attempt")):
            raise ValueError("Return identity differs from the current exact run")
    if not isinstance(value.get("event_id"), str) or not value["event_id"]:
        raise ValueError("The exact future engine event_id is required")
    if not isinstance(value.get("stage_scope"), str) or not value["stage_scope"]:
        raise ValueError("An explicit stage_scope is required")
    if not isinstance(scope.get("goal"), str) or not scope["goal"] or not isinstance(scope.get("acceptance"), list) or not scope["acceptance"] or not all(isinstance(v, str) and v for v in scope["acceptance"]):
        raise ValueError("A goal and acceptance criteria are required")
    for key in ("read_paths", "write_paths"):
        if not isinstance(scope.get(key), list) or not all(isinstance(p, str) and p and not Path(p).is_absolute() and ".." not in Path(p).parts for p in scope[key]):
            raise ValueError("Read/write scope must use project-relative paths")
    for write in scope["write_paths"]:
        for frozen in state.get("frozen_paths", []):
            prefix = frozen
            for symbol in "?*[{":
                prefix = prefix.split(symbol, 1)[0]
            prefix = prefix.rstrip("/")
            if write == "." or fnmatch.fnmatch(write, frozen) or (prefix and (write == prefix or write.startswith(prefix + "/") or prefix.startswith(write + "/"))):
                raise ValueError("Write scope overlaps a frozen Byte path")
    deadline = datetime.fromisoformat(scope["deadline_at"].replace("Z", "+00:00"))
    if deadline.tzinfo is None or deadline <= datetime.now(timezone.utc):
        raise ValueError("A future deadline with timezone is required")
    return {"stage_scope": value["stage_scope"], "sessionbridge": {
        "schema_version": 1, "direction": direction, "event_id": value["event_id"],
        "revision": workflow["revision"] + 1, "outcome_id": outcome["id"],
        "instance_sha256": workflow["instance_sha256"], "run_id": run_id,
        "attempt": attempt, "scope": scope}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="Project-relative path under coordination/handoffs")
    args = parser.parse_args()
    try:
        root = args.project.resolve(strict=True)
        base = root / ".byte-os/coordination/handoffs"
        out = root / args.output
        if base.resolve() != base or args.output.is_absolute() or args.output.suffix != ".json" or ".." in args.output.parts or not out.resolve().is_relative_to(base):
            raise ValueError("Output must stay under .byte-os/coordination/handoffs")
        value = json.load(sys.stdin)
        document = draft(root, value)
        content = json.dumps(document, ensure_ascii=False, indent=2) + "\n"
        out.parent.mkdir(parents=True, exist_ok=True)
        try:
            with out.open("x") as handle:
                handle.write(content)
        except FileExistsError:
            if out.is_symlink() or out.read_text() != content:
                raise ValueError("Immutable handoff already exists with different content")
        print(json.dumps({"handoff_id": args.output.as_posix(),
                          "expect_revision": document["sessionbridge"]["revision"] - 1,
                          "event_id": document["sessionbridge"]["event_id"],
                          "ownership_changed": False, "delivered": False}))
        return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({"state": "blocked", "error": str(error)}), file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
