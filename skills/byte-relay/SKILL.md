---
name: byte-relay
description: Coordinate work across AI coding harnesses or Codex tasks through durable state, exact session ownership, handoffs, and supervision. Use when the user invokes $byte-relay, asks to run a relay stage, or wants one conversation to hand work to another.
---

# Byte Relay

Act as the coordination relay between harnesses that share one repository. Your
job in a single invocation is one relay turn: read the shared state, do your
stage's work, write the handoff, advance the state, and stop.

All durable state lives in `.byte-os/coordination/` inside the project repo.
When Codex task communication tools are available, use them as a live
notification channel only after the matching repository handoff and state change.
The repo remains the authority after messages, restarts, or context compaction.

## The relay turn

1. **Read `.byte-os/coordination/state.json`.** If it does not exist, and the
   user asked to initialize, create it from the schema in
   `references/coordination-schema.md` and stop. Otherwise report who owns the
   state and exit without doing work.
2. **Check authority.** Proceed only when `state.owner` is this harness, the
   invoked stage matches `state.stage`, and `state.owner_session` matches this
   exact conversation when that field is present. Otherwise report the mismatch and exit.
   This rule exists to prevent two harnesses editing the repo at once; it is
   not advisory.
3. **Gather context.** Read the newest files in `handoffs/`, inspect
   `sessions.json` to identify the exact upstream conversation and code
   snapshot, then run `scripts/session_digest.py --session-id <native-id>` for
   relevant participant sessions other than yourself (see below).
4. **Do the stage's work** following `state.next_action`, under the constraints
   in `state.frozen_paths` and the acceptance criteria in `state.acceptance`.
   For resumable implementation, review, or experiment work, start or update a
   task receipt as described below.
5. **Write the handoff** to `handoffs/<date>-<harness>-<topic>.md` using
   `references/handoff-template.md`: what was done, evidence, what changed,
   what the next harness needs to know.
6. **Advance the state** with `scripts/relay_state.py handoff`, which verifies
   the current harness/session, requires the handoff file, writes atomically,
   appends history, and sets both `owner` and `owner_session` for the next step.

## Session digests

Conversation identity is durable relay state, not something to infer from a
`latest` file. At the start of an owned turn, register the current conversation:

```
python3 scripts/session_registry.py register --project <repo-path> \
  --harness <codex|claude|dsh|zcode> --session-id <native-id> \
  --alias <short-purpose> --role <role> [--locator <openable-uri>] \
  [--provider <provider> --model <exact-model> \
   --model-evidence <native-runtime-reference>] [--host-id <codex-host>] \
  [--reports-to <harness:native-session-id>]
```

The registry captures the harness separately from provider/model and records
the current branch and commit. Supply `--model-evidence` only after checking
the exact session's native model metadata; a requested model or generic family
is not proof. An unverified model claim remains marked by null evidence.
`session_registry.py list --project <repo-path>`
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

## Codex task-to-task supervision

For a main Codex task that finishes core implementation and then delegates long
performance tests, training, or ablations to a supervisor Codex task, follow
[Codex task-to-task relay](references/codex-thread-relay.md). The main task may
create or reuse a supervisor task, transfer the exact session-scoped baton,
message it after the durable handoff, and then stop active polling. The supervisor
may apply only recorded bounded repairs; otherwise it returns evidence and the
baton to the main task before messaging it.

First choose the supervision lane using
[delegation routing](references/delegation-routing.md). A same-task subagent is
bounded help inside one active turn, not a new registered conversation or a
second relay owner. An independent Codex task or other harness needs an exact
session identity and the durable baton before it acts. Neither lane turns a
terminal status or an agent's final message into proof of run success.

For the recurring main-design / independently supervised long-run pattern,
use the independently callable
[$byte-design-supervise](../byte-design-supervise/SKILL.md) skill. It keeps the main chat's launch gate separate from the
supervisor's event and periodic wakeups; relay remains the authority mechanism.
The [event bridge](references/codex-event-bridge.md) and
[run-event helper](scripts/run_event.py) live here with the relay protocol.

## Task receipts and review packages

Apply the shared [evidence contract](references/evidence-contract.md). A session
record identifies the conversation; a task receipt records what that conversation
actually executed and verified. Do not infer execution from registration alone.

For material resumable work, use `scripts/task_receipt.py start` before changing
the task and `scripts/task_receipt.py complete` before handing off. The receipt
binds the native session to Git base/head, fresh verification, artifacts,
acceptance status, rulings, and deviations. Use `scripts/review_package.py` when
a reviewer needs the exact `base..head` range. These files supplement live Git
and runtime checks; they do not override them.

## Hard rules

- Execute only harness-, session-, and stage-matched work; otherwise read and exit.
- Never modify paths in `frozen_paths`.
- A supervisor may perform an explicitly recorded bounded repair. Do not repeat
  an unchanged failed repair or infer authority for broader changes; write the
  evidence and hand ownership back to the main session.
- One owner session at a time. When `owner_session` exists, matching `owner`
  without matching the exact session is read-only.
- Keep handoffs short and evidence-linked; the digest covers conversation
  history, so the handoff only needs decisions and deltas.

## Setup for a new project

Run `$byte-relay init <repo-path>` semantics: create `coordination/`, seed
`state.json` with roles, seed `sessions.json` with the project identity, set
`frozen_paths` from the project's existing `.byte-os/` rules if present, and
write the first handoff describing current work. Rule files for each harness
(AGENTS.md, CLAUDE.md, …) can be generated from a single source with rulesync;
recommend that when a project has more than two participating harnesses.

## Source And Updates

Canonical repository: [elan6666/byte-skills](https://github.com/elan6666/byte-skills). Use its current `main` branch when checking for or installing updates.
