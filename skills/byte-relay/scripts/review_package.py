#!/usr/bin/env python3
"""Build an evidence-linked Git review package from a byte-relay task receipt."""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path


TASK_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


def run_git(project, *args, check=True):
    try:
        return subprocess.run(
            ["git", "-C", str(project), *args],
            check=check,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        raise RuntimeError(f"Git command failed: {' '.join(args)}") from exc


def atomic_text(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    try:
        with open(tmp, "w", encoding="utf-8") as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp, path)
    finally:
        try:
            tmp.unlink()
        except FileNotFoundError:
            pass


def checked_task_id(value):
    if not TASK_ID.fullmatch(value):
        raise RuntimeError("invalid task ID")
    return value


def load_receipt(project, task_id):
    path = project / ".byte-os" / "coordination" / "receipts" / f"{checked_task_id(task_id)}.json"
    try:
        receipt = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError(f"task receipt not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"invalid JSON in {path}: {exc}") from exc
    return path, receipt


def bullet_lines(values, empty="- None"):
    return [f"- {value}" for value in values] or [empty]


def build(args):
    project = Path(args.project).expanduser().resolve()
    receipt_path, receipt = load_receipt(project, args.task_id)
    base = receipt.get("base_commit")
    head = receipt.get("head_commit")
    if not base or not head:
        raise RuntimeError("receipt must contain both base_commit and head_commit")
    run_git(project, "rev-parse", "--verify", f"{base}^{{commit}}")
    run_git(project, "rev-parse", "--verify", f"{head}^{{commit}}")
    ancestry = run_git(project, "merge-base", "--is-ancestor", base, head, check=False)
    if ancestry.returncode != 0:
        raise RuntimeError("recorded base_commit is not an ancestor of head_commit")
    commits = run_git(project, "log", "--oneline", f"{base}..{head}").stdout.strip()
    diff_stat = run_git(project, "diff", "--stat", base, head).stdout.rstrip()
    diff = run_git(project, "diff", "--full-index", "--no-ext-diff", base, head).stdout
    if not diff and not args.allow_empty:
        raise RuntimeError("recorded Git range has no diff; pass --allow-empty for a non-code task")

    output_dir = (
        Path(args.output_dir).expanduser().resolve()
        if args.output_dir
        else project / ".byte-os" / "coordination" / "reviews"
    )
    output_dir.mkdir(parents=True, exist_ok=True)
    diff_path = output_dir / f"{args.task_id}.diff"
    package_path = output_dir / f"{args.task_id}.md"
    atomic_text(diff_path, diff)

    verification = [
        f"`{item.get('command')}` -> exit {item.get('exit_status')}"
        + (f" ([log]({item.get('log_path')}))" if item.get("log_path") else "")
        for item in receipt.get("verification", [])
    ]
    acceptance = [
        f"{item.get('status')}: {item.get('criterion')}"
        + (f" — {item.get('evidence')}" if item.get("evidence") else "")
        for item in receipt.get("acceptance", [])
    ]
    lines = [
        f"# Review package: {args.task_id}",
        "",
        f"- Receipt: `{receipt_path}`",
        f"- Owner session: `{receipt.get('owner_session')}`",
        f"- Stage/status: `{receipt.get('stage')}` / `{receipt.get('status')}`",
        f"- Git range: `{base}..{head}`",
        f"- Full diff: `{diff_path}`",
        "",
        "## Commits",
        "",
        "```text",
        commits or "(no commits)",
        "```",
        "",
        "## Diff stat",
        "",
        "```text",
        diff_stat or "(no diff)",
        "```",
        "",
        "## Verification",
        "",
        *bullet_lines(verification),
        "",
        "## Acceptance",
        "",
        *bullet_lines(acceptance),
        "",
        "## Artifacts",
        "",
        *bullet_lines(receipt.get("artifacts", [])),
        "",
        "## Rulings",
        "",
        *bullet_lines(receipt.get("rulings", [])),
        "",
        "## Deviations and limits",
        "",
        *bullet_lines(receipt.get("deviations", []) + receipt.get("limits", [])),
        "",
    ]
    atomic_text(package_path, "\n".join(lines))
    print(json.dumps({"package": str(package_path), "diff": str(diff_path), "range": f"{base}..{head}"}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--output-dir")
    parser.add_argument("--allow-empty", action="store_true")
    args = parser.parse_args()
    try:
        build(args)
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
