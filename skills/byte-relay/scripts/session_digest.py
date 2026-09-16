#!/usr/bin/env python3
"""session_digest.py — summarize a harness session transcript into a markdown digest.

Part of byte-relay: gives one AI coding harness a readable view of what another
harness has been doing, without opening the raw transcript.

Usage:
    session_digest.py <codex|claude|dsh> [--project PATH] [--query WORDS...]
                      [--session-id ID] [--max-turns N] [--width CHARS] [--out FILE]

Transcript locations:
    codex   ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
    claude  ~/.claude/projects/<munged-cwd>/<session-uuid>.jsonl
    dsh     ~/.dsh/sessions/<munged-cwd>/session-<uuid>/session.v3.jsonl.zstd
    zcode   no local transcript — the calling skill must use its session-context
            tool (e.g. ReadSessionContext) instead; this script prints a hint.

All parsers are best-effort and fail soft: malformed lines and unknown record
types are skipped, so a format drift degrades output rather than crashing.
"""

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
from pathlib import Path

HOME = Path.home()

NOISE_TAG = re.compile(r"^\s*<(system-reminder|user_instructions|environment_context|"
                       r"appshot|image_resize_notice|turn_aborted|permissions?_reminder)")
NOISE_PREFIX = re.compile(r"^\s*(You are repeating|API Error:)")


def epoch_ms_to_iso(ms):
    try:
        return dt.datetime.fromtimestamp(int(ms) / 1000, dt.timezone.utc).astimezone().isoformat(timespec="seconds")
    except (ValueError, OSError, OverflowError):
        return ""


def clean_text(text):
    return not (NOISE_TAG.match(text) or NOISE_PREFIX.match(text))


def block_text(content):
    """Extract text from content that is either a string or a list of blocks."""
    if isinstance(content, str):
        return content
    parts = []
    if isinstance(content, list):
        for b in content:
            if isinstance(b, dict) and b.get("type") in ("text", "input_text", "output_text"):
                parts.append(b.get("text", ""))
    return "\n".join(parts)


def iter_jsonl(path, decompress=False):
    opener = lambda f: subprocess.Popen(["zstd", "-dc", str(f)], stdout=subprocess.PIPE,
                                        stderr=subprocess.DEVNULL,
                                        text=True, errors="replace").stdout
    stream = opener(path) if decompress else open(path, encoding="utf-8", errors="replace")
    with stream:
        for line in stream:
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


# --- Codex: response_item messages inside rollout files -----------------------

def codex_iter_messages(path):
    for e in iter_jsonl(path):
        if e.get("type") == "session_meta":
            yield ("meta", None, e.get("payload", {}).get("cwd", ""), e.get("timestamp", ""))
            continue
        if e.get("type") != "response_item":
            continue
        p = e.get("payload", {})
        if p.get("type") != "message" or p.get("role") not in ("user", "assistant"):
            continue
        text = block_text(p.get("content"))
        if not text or not clean_text(text):
            continue
        yield (p["role"], text, "", e.get("timestamp", ""))


# --- Claude Code: user/assistant records --------------------------------------

def claude_iter_messages(path):
    emitted_meta = False
    for e in iter_jsonl(path):
        if e.get("type") not in ("user", "assistant") or e.get("isSidechain"):
            continue
        if not emitted_meta:
            emitted_meta = True
            yield ("meta", None, e.get("cwd", ""), e.get("timestamp", ""))
        msg = e.get("message", {})
        role = msg.get("role")
        text = block_text(msg.get("content"))
        if not text or not clean_text(text):
            continue
        yield (role, text, "", e.get("timestamp", ""))


# --- DSH: zstd-compressed v3 session logs --------------------------------------

def dsh_iter_messages(path):
    for e in iter_jsonl(path, decompress=True):
        t = e.get("type")
        if t == "session":
            yield ("meta", None, e.get("cwd", ""), epoch_ms_to_iso(e.get("createdAt")))
            continue
        if t not in ("user/message", "assistant/message"):
            continue
        data = e.get("data", {})
        text = block_text(data.get("content"))
        if not text or not clean_text(text):
            continue
        yield (data.get("role", "user" if t == "user/message" else "assistant"),
               text, "", epoch_ms_to_iso(e.get("time")))


ITERATORS = {"codex": codex_iter_messages, "claude": claude_iter_messages, "dsh": dsh_iter_messages}


def discover(harness):
    """Return transcript paths, newest first."""
    if harness == "codex":
        root = HOME / ".codex" / "sessions"
        paths = root.glob("*/*/*/rollout-*.jsonl")
    elif harness == "claude":
        paths = (HOME / ".claude" / "projects").glob("*/*.jsonl")
    elif harness == "dsh":
        paths = (HOME / ".dsh" / "sessions").glob("*/session-*/session.v3.jsonl.zstd")
    else:
        return []
    return sorted(paths, key=lambda p: p.stat().st_mtime, reverse=True)


def path_project(path, harness):
    """Best-effort project cwd for a transcript, from file metadata records."""
    try:
        if harness == "codex":
            with open(path, encoding="utf-8", errors="replace") as f:
                for _ in range(3):
                    line = f.readline()
                    if not line:
                        break
                    try:
                        e = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if e.get("type") == "session_meta":
                        return e.get("payload", {}).get("cwd", "")
        elif harness == "dsh":
            for e in iter_jsonl(path, decompress=True):
                if e.get("type") == "session":
                    return e.get("cwd", "")
                break
        elif harness == "claude":
            session_dir = path.parent.name  # munged cwd: -Users-elan-...
            parts = [p for p in session_dir.split("-") if p]
            if len(parts) > 2:
                return "/" + "/".join(parts[1:])
            return session_dir
    except OSError:
        pass
    return ""


def select_session(harness, args):
    candidates = discover(harness)
    if args.session_id:
        candidates = [p for p in candidates if args.session_id in str(p)]
    if args.project:
        proj = str(Path(args.project).expanduser().resolve())
        matched = [p for p in candidates if path_project(p, harness) == proj]
        if not matched:  # fall back to path-contains match (munged names mangle non-ASCII)
            tail = proj.rstrip("/").split("/")[-1]
            matched = [p for p in candidates if tail in str(p)]
        candidates = matched
    if args.query:
        words = [w.lower() for w in args.query]

        def hits(p):
            try:
                text = Path(p).read_text(encoding="utf-8", errors="replace").lower() \
                    if harness != "dsh" else \
                    subprocess.run(["zstd", "-dc", str(p)], capture_output=True,
                                   text=True, errors="replace").stdout.lower()
            except OSError:
                return 0
            return sum(text.count(w) for w in words)

        candidates = sorted(candidates, key=hits, reverse=True)
        candidates = [p for p in candidates if hits(p) > 0]
    return candidates[0] if candidates else None


def render(harness, path, args):
    it = ITERATORS[harness](path)
    turns, meta_cwd, meta_ts = [], "", ""
    for role, text, cwd, ts in it:
        if role == "meta":
            meta_cwd, meta_ts = cwd, ts or meta_ts
            continue
        turns.append((role, text, ts))
    total = len(turns)
    shown = turns[-args.max_turns:]
    lines = [
        f"# Session digest — {harness}",
        "",
        f"- Transcript: `{path}`",
        f"- Project: {meta_cwd or 'unknown'}",
        f"- Turns: {total} (showing last {len(shown)})",
        f"- Generated: {dt.datetime.now().astimezone().isoformat(timespec='seconds')}",
        "",
        "---",
        "",
    ]
    for role, text, ts in shown:
        snippet = text.strip()
        if len(snippet) > args.width:
            snippet = snippet[:args.width] + f"\n… [+{len(text) - args.width} chars truncated]"
        when = f" · {ts}" if ts else ""
        lines.append(f"## {role}{when}")
        lines.append("")
        lines.append(snippet)
        lines.append("")
    return "\n".join(lines), total


def main():
    ap = argparse.ArgumentParser(description="Digest a harness session transcript to markdown.")
    ap.add_argument("harness", choices=["codex", "claude", "dsh", "zcode"])
    ap.add_argument("--project", help="project path to match sessions against")
    ap.add_argument("--query", nargs="+", help="keywords; picks the session with the most hits")
    ap.add_argument("--session-id", help="substring of the transcript path/session id")
    ap.add_argument("--max-turns", type=int, default=12, help="tail turns to include (default 12)")
    ap.add_argument("--width", type=int, default=1500, help="per-turn char budget (default 1500)")
    ap.add_argument("--out", help="write digest to this file instead of stdout")
    args = ap.parse_args()

    if args.harness == "zcode":
        print("ZCode keeps no local transcript file. Inside a ZCode skill, call the "
              "session-context tool (ReadSessionContext) with the target session id "
              "and write its summary to handoffs/sessions/zcode-latest.md yourself.")
        return 0

    path = select_session(args.harness, args)
    if not path:
        print(f"No matching {args.harness} session found.", file=sys.stderr)
        return 1

    digest, _ = render(args.harness, path, args)
    if args.out:
        out = Path(args.out).expanduser()
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(digest, encoding="utf-8")
        print(f"Digest ({len(digest)} chars) -> {out}")
    else:
        print(digest)
    return 0


if __name__ == "__main__":
    sys.exit(main())
