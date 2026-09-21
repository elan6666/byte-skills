---
name: byte-relay
description: Coordinate work across AI coding harnesses (Codex, Claude Code, DSH, ZCode) through shared state files in the repo. Use when the user invokes $byte-relay, asks to run a relay stage (e.g. supervise), or wants to hand off work to or pick up work from another harness.
---

# Byte Relay

Act as the coordination relay between harnesses that share one repository. Your
job in a single invocation is one relay turn: read the shared state, do your
stage's work, write the handoff, advance the state, and stop.

All shared state lives in `.byte-os/coordination/` inside the project repo. The
repo is the only channel between harnesses — never try to contact another
harness directly.

## The relay turn

1. **Read `.byte-os/coordination/state.json`.** If it does not exist, and the
   user asked to initialize, create it from the schema in
   `references/coordination-schema.md` and stop. Otherwise report who owns the
   state and exit without doing work.
2. **Check authority.** Proceed only when `state.owner` is this harness and the
   invoked stage matches `state.stage`. Otherwise report the mismatch and exit.
   This rule exists to prevent two harnesses editing the repo at once; it is
   not advisory.
3. **Gather context.** Read the newest files in `handoffs/`, inspect
   `sessions.json` to identify the exact upstream conversation and code
   snapshot, then run `scripts/session_digest.py` for each harness named in
   `state.roles` other than yourself (see below).
4. **Do the stage's work** following `state.next_action`, under the constraints
   in `state.frozen_paths` and the acceptance criteria in `state.acceptance`.
5. **Write the handoff** to `handoffs/<date>-<harness>-<topic>.md` using
   `references/handoff-template.md`: what was done, evidence, what changed,
   what the next harness needs to know.
6. **Advance the state** with one atomic write: write `state.json.tmp`, then
   rename it over `state.json`. Append one entry to `history`; never rewrite
   past entries. Set `owner` to the harness named for the next step.

## Session digests

Conversation identity is durable relay state, not something to infer from a
`latest` file. At the start of an owned turn, register the current conversation:

```
python3 scripts/session_registry.py register --project <repo-path> \
  --harness <codex|claude|dsh|zcode> --session-id <native-id> \
  --alias <short-purpose> --role <role> [--locator <openable-uri>] \
  [--provider <provider> --model <model>]
```

The registry captures the harness separately from provider/model and records
the current branch and commit. `session_registry.py list --project <repo-path>`
is read-only; registration and status changes enforce the same owner gate as
the relay. Read [references/coordination-schema.md](references/coordination-schema.md)
before initializing or changing registry state.

Write digests under their native session ID so one conversation never erases
another:

```
python3 scripts/session_digest.py <codex|claude|dsh|zcode> \
  --project <repo-path> --max-turns 8 \
  --out-dir <repo-path>/.byte-os/coordination/handoffs/sessions
```

Add `--query word1 word2` to select a session by topic. The script writes
`<harness>-<session-id>.md` plus a small `<harness>-latest.md` index. ZCode
exposes local task metadata but not a portable full transcript; its digest
records the task ID, project, provider, and model, then tells the ZCode owner
to append a session-context summary to the session-specific file.

Digests are summaries, not ground truth. When a handoff and a digest disagree,
trust the repo (git log, files, tests) over both.

## Hard rules

- Execute only `owner == self` and stage-matched work; otherwise read and exit.
- Never modify paths in `frozen_paths`.
- On failure: do not retry automatically. Write the failure, evidence, and your
  diagnosis into the handoff, then hand ownership back to the previous owner.
- One owner at a time. `state.json` is the arbiter; if it says you are not the
  owner, you are not.
- Keep handoffs short and evidence-linked; the digest covers conversation
  history, so the handoff only needs decisions and deltas.

## Setup for a new project

Run `$byte-relay init <repo-path>` semantics: create `coordination/`, seed
`state.json` with roles, seed `sessions.json` with the project identity, set
`frozen_paths` from the project's existing `.byte-os/` rules if present, and
write the first handoff describing current work. Rule files for each harness
(AGENTS.md, CLAUDE.md, …) can be generated from a single source with rulesync;
recommend that when a project has more than two participating harnesses.
