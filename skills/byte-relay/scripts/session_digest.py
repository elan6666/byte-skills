#!/usr/bin/env python3
"""Summarize a harness session and preserve its native conversation identity.

Codex, Claude Code, and DSH provide local transcripts. ZCode exposes local task
metadata; its owner must append the conversational summary from session-context.
"""

import argparse
import datetime as dt
import json
import os
import re
import sqlite3
import subprocess
import sys
from pathlib import Path


HOME = Path(os.environ.get("BYTE_RELAY_HOME", Path.home())).expanduser()
NOISE_TAG = re.compile(
    r"^\s*<(system-reminder|user_instructions|environment_context|"
    r"appshot|image_resize_notice|turn_aborted|permissions?_reminder)"
)
NOISE_PREFIX = re.compile(r"^\s*(You are repeating|API Error:)")
UUID_AT_END = re.compile(
    r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$",
    re.IGNORECASE,
)


def epoch_ms_to_iso(ms):
    try:
        return dt.datetime.fromtimestamp(
            int(ms) / 1000, dt.timezone.utc
        ).astimezone().isoformat(timespec="seconds")
    except (TypeError, ValueError, OSError, OverflowError):
        return ""


def clean_text(text):
    return not (NOISE_TAG.match(text) or NOISE_PREFIX.match(text))


def block_text(content):
    if isinstance(content, str):
        return content
    parts = []
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") in (
                "text",
                "input_text",
                "output_text",
            ):
                parts.append(block.get("text", ""))
    return "\n".join(parts)


def iter_jsonl(path, decompress=False):
    if decompress:
        process = subprocess.Popen(
            ["zstd", "-dc", str(path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            errors="replace",
        )
        stream = process.stdout
    else:
        stream = open(path, encoding="utf-8", errors="replace")
    if stream is None:
        return
    with stream:
        for line in stream:
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def codex_iter_messages(path):
    for event in iter_jsonl(path):
        if event.get("type") == "session_meta":
            yield (
                "meta",
                None,
                event.get("payload", {}).get("cwd", ""),
                event.get("timestamp", ""),
            )
            continue
        if event.get("type") != "response_item":
            continue
        payload = event.get("payload", {})
        if payload.get("type") != "message" or payload.get("role") not in (
            "user",
            "assistant",
        ):
            continue
        text = block_text(payload.get("content"))
        if text and clean_text(text):
            yield (payload["role"], text, "", event.get("timestamp", ""))


def claude_iter_messages(path):
    emitted_meta = False
    for event in iter_jsonl(path):
        if event.get("type") not in ("user", "assistant") or event.get("isSidechain"):
            continue
        if not emitted_meta:
            emitted_meta = True
            yield ("meta", None, event.get("cwd", ""), event.get("timestamp", ""))
        message = event.get("message", {})
        text = block_text(message.get("content"))
        if text and clean_text(text):
            yield (message.get("role"), text, "", event.get("timestamp", ""))


def dsh_iter_messages(path):
    for event in iter_jsonl(path, decompress=True):
        kind = event.get("type")
        if kind == "session":
            yield ("meta", None, event.get("cwd", ""), epoch_ms_to_iso(event.get("createdAt")))
            continue
        if kind not in ("user/message", "assistant/message"):
            continue
        data = event.get("data", {})
        text = block_text(data.get("content"))
        if text and clean_text(text):
            yield (
                data.get("role", "user" if kind == "user/message" else "assistant"),
                text,
                "",
                epoch_ms_to_iso(event.get("time")),
            )


ITERATORS = {
    "codex": codex_iter_messages,
    "claude": claude_iter_messages,
    "dsh": dsh_iter_messages,
}


def discover(harness):
    if harness == "codex":
        paths = (HOME / ".codex" / "sessions").glob("*/*/*/rollout-*.jsonl")
    elif harness == "claude":
        paths = (HOME / ".claude" / "projects").glob("*/*.jsonl")
    elif harness == "dsh":
        paths = (HOME / ".dsh" / "sessions").glob(
            "*/session-*/session.v3.jsonl.zstd"
        )
    else:
        return []
    return sorted(paths, key=lambda path: path.stat().st_mtime, reverse=True)


def path_project(path, harness):
    try:
        if harness == "codex":
            for event in iter_jsonl(path):
                if event.get("type") == "session_meta":
                    return event.get("payload", {}).get("cwd", "")
        elif harness == "dsh":
            for event in iter_jsonl(path, decompress=True):
                if event.get("type") == "session":
                    return event.get("cwd", "")
                break
        elif harness == "claude":
            session_dir = path.parent.name
            parts = [part for part in session_dir.split("-") if part]
            if len(parts) > 2:
                return "/" + "/".join(parts[1:])
            return session_dir
    except OSError:
        pass
    return ""


def transcript_metadata(path, harness):
    metadata = {
        "session_id": None,
        "project": path_project(path, harness),
        "locator": None,
        "provider": None,
        "model": None,
        "source": str(path),
    }
    try:
        if harness == "codex":
            for event in iter_jsonl(path):
                if event.get("type") == "session_meta":
                    payload = event.get("payload", {})
                    metadata["session_id"] = payload.get("id")
                    metadata["project"] = payload.get("cwd") or metadata["project"]
                    break
        elif harness == "claude":
            metadata["session_id"] = path.stem
        elif harness == "dsh":
            for event in iter_jsonl(path, decompress=True):
                if event.get("type") == "session":
                    metadata["session_id"] = event.get("id") or event.get("sessionId")
                    break
    except OSError:
        pass
    if not metadata["session_id"]:
        match = UUID_AT_END.search(path.stem)
        if match:
            metadata["session_id"] = match.group(1)
        elif harness == "dsh":
            metadata["session_id"] = path.parent.name.removeprefix("session-")
        else:
            metadata["session_id"] = path.stem
    if harness == "codex":
        metadata["locator"] = f"codex://threads/{metadata['session_id']}"
    return metadata


def select_session(harness, args):
    candidates = discover(harness)
    if args.session_id:
        candidates = [path for path in candidates if args.session_id in str(path)]
    if args.project:
        project = str(Path(args.project).expanduser().resolve())
        matched = [path for path in candidates if path_project(path, harness) == project]
        if not matched:
            tail = project.rstrip("/").split("/")[-1]
            matched = [path for path in candidates if tail in str(path)]
        candidates = matched
    if args.query:
        words = [word.lower() for word in args.query]

        def hits(path):
            try:
                if harness == "dsh":
                    text = subprocess.run(
                        ["zstd", "-dc", str(path)],
                        capture_output=True,
                        text=True,
                        errors="replace",
                    ).stdout.lower()
                else:
                    text = path.read_text(encoding="utf-8", errors="replace").lower()
            except OSError:
                return 0
            return sum(text.count(word) for word in words)

        candidates = sorted(candidates, key=hits, reverse=True)
        candidates = [path for path in candidates if hits(path) > 0]
    return candidates[0] if candidates else None


def sqlite_rows(path, query, parameters=()):
    if not path.exists():
        return []
    try:
        connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=1)
        connection.row_factory = sqlite3.Row
        try:
            return [dict(row) for row in connection.execute(query, parameters).fetchall()]
        finally:
            connection.close()
    except sqlite3.Error:
        return []


def discover_zcode(args):
    project = str(Path(args.project).expanduser().resolve()) if args.project else None
    candidates = []
    desktop_db = HOME / ".zcode" / "v2" / "tasks-index.sqlite"
    where = ["deleted = 0"]
    params = []
    if args.session_id:
        where.append("task_id = ?")
        params.append(args.session_id)
    if project:
        where.append("workspace_path = ?")
        params.append(project)
    query = f"""
        SELECT task_id, workspace_path, title, provider, model, mode, updated_at
        FROM tasks WHERE {' AND '.join(where)} ORDER BY updated_at DESC LIMIT 20
    """
    for row in sqlite_rows(desktop_db, query, params):
        candidates.append(
            {
                "session_id": row.get("task_id"),
                "project": row.get("workspace_path"),
                "locator": None,
                "provider": row.get("provider"),
                "model": row.get("model"),
                "mode": row.get("mode"),
                "title": row.get("title"),
                "updated_at": row.get("updated_at") or 0,
                "source": str(desktop_db),
            }
        )

    cli_db = HOME / ".zcode" / "cli" / "db" / "db.sqlite"
    where = []
    params = []
    if args.session_id:
        where.append("id = ?")
        params.append(args.session_id)
    if project:
        where.append("(directory = ? OR path = ?)")
        params.extend([project, project])
    clause = " WHERE " + " AND ".join(where) if where else ""
    query = f"""
        SELECT id, directory, path, title, share_url, time_updated
        FROM session{clause} ORDER BY time_updated DESC LIMIT 20
    """
    for row in sqlite_rows(cli_db, query, params):
        usage = sqlite_rows(
            cli_db,
            """SELECT provider_id, model_id FROM model_usage
               WHERE session_id = ? ORDER BY rowid DESC LIMIT 1""",
            (row.get("id"),),
        )
        latest_usage = usage[0] if usage else {}
        candidates.append(
            {
                "session_id": row.get("id"),
                "project": row.get("directory") or row.get("path"),
                "locator": row.get("share_url"),
                "provider": latest_usage.get("provider_id"),
                "model": latest_usage.get("model_id"),
                "mode": None,
                "title": row.get("title"),
                "updated_at": row.get("time_updated") or 0,
                "source": str(cli_db),
            }
        )
    candidates.sort(key=lambda item: item.get("updated_at", 0), reverse=True)
    return candidates[0] if candidates else None


def metadata_lines(harness, metadata, project=None):
    return [
        f"# Session digest — {harness}",
        "",
        f"- Harness: {harness}",
        f"- Session ID: {metadata.get('session_id') or 'unknown'}",
        f"- Locator: {metadata.get('locator') or 'unavailable'}",
        f"- Project: {project or metadata.get('project') or 'unknown'}",
        f"- Provider: {metadata.get('provider') or 'unknown'}",
        f"- Model: {metadata.get('model') or 'unknown'}",
        f"- Source: `{metadata.get('source') or 'unknown'}`",
        f"- Generated: {dt.datetime.now().astimezone().isoformat(timespec='seconds')}",
    ]


def render_transcript(harness, path, args):
    metadata = transcript_metadata(path, harness)
    turns = []
    meta_project = metadata.get("project") or ""
    for role, text, cwd, timestamp in ITERATORS[harness](path):
        if role == "meta":
            meta_project = cwd or meta_project
            continue
        turns.append((role, text, timestamp))
    shown = turns[-args.max_turns :]
    lines = metadata_lines(harness, metadata, meta_project)
    lines.extend([f"- Turns: {len(turns)} (showing last {len(shown)})", "", "---", ""])
    for role, text, timestamp in shown:
        snippet = text.strip()
        if len(snippet) > args.width:
            snippet = snippet[: args.width] + f"\n… [+{len(text) - args.width} chars truncated]"
        when = f" · {timestamp}" if timestamp else ""
        lines.extend([f"## {role}{when}", "", snippet, ""])
    return "\n".join(lines), metadata


def render_zcode(metadata):
    lines = metadata_lines("zcode", metadata)
    lines.extend(
        [
            f"- Title: {metadata.get('title') or 'unknown'}",
            f"- Mode: {metadata.get('mode') or 'unknown'}",
            "",
            "---",
            "",
            "ZCode local metadata identifies this task but does not provide a portable",
            "full transcript. From the matching ZCode task, use its session-context",
            "tool and append a concise summary to this session-specific digest.",
            "",
        ]
    )
    return "\n".join(lines), metadata


def safe_component(value):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._") or "unknown"


def atomic_text_write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def write_digest(harness, digest, metadata, args):
    if args.out:
        output = Path(args.out).expanduser()
        atomic_text_write(output, digest)
        print(f"Digest ({len(digest)} chars) -> {output}")
        return
    if args.out_dir:
        output_dir = Path(args.out_dir).expanduser()
        session_id = safe_component(metadata.get("session_id") or "unknown")
        output = output_dir / f"{harness}-{session_id}.md"
        atomic_text_write(output, digest)
        latest = output_dir / f"{harness}-latest.md"
        index = "\n".join(
            [
                f"# Latest session digest — {harness}",
                "",
                f"- Session ID: {metadata.get('session_id') or 'unknown'}",
                f"- Digest: [{output.name}]({output.name})",
                f"- Updated: {dt.datetime.now().astimezone().isoformat(timespec='seconds')}",
                "",
            ]
        )
        atomic_text_write(latest, index)
        print(f"Digest ({len(digest)} chars) -> {output}")
        print(f"Latest index -> {latest}")
        return
    print(digest)


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("harness", choices=["codex", "claude", "dsh", "zcode"])
    parser.add_argument("--project", help="project path to match sessions against")
    parser.add_argument("--query", nargs="+", help="topic keywords for transcript selection")
    parser.add_argument("--session-id", help="exact ID or transcript-path substring")
    parser.add_argument("--max-turns", type=int, default=12)
    parser.add_argument("--width", type=int, default=1500)
    output = parser.add_mutually_exclusive_group()
    output.add_argument("--out", help="write one digest to this path")
    output.add_argument(
        "--out-dir",
        help="write a session-ID-addressed digest and a small latest index",
    )
    return parser


def main():
    args = build_parser().parse_args()
    if args.harness == "zcode":
        metadata = discover_zcode(args)
        if not metadata:
            print("No matching zcode session metadata found.", file=sys.stderr)
            return 1
        digest, metadata = render_zcode(metadata)
    else:
        path = select_session(args.harness, args)
        if not path:
            print(f"No matching {args.harness} session found.", file=sys.stderr)
            return 1
        digest, metadata = render_transcript(args.harness, path, args)
    write_digest(args.harness, digest, metadata, args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
