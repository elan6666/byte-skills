# Byte integration

[中文](byte.zh-CN.md) · [CLI](cli.md)

Byte owns work permissions, revisions, run transitions and acceptance. Bridge connects native sessions and journals transport. The Byte series' `byte-bridge` is the unified user entry; `sessionbridge-do` remains a compatible lower-level interface.

## Bind before starting a Byte project's service

Call `session-bridge byte-source --project /absolute/project --stdin --json` with:

```json
{"source_root":"/absolute/byte-skills/skills","source_commit":"actual-source-revision","python_bin":"/absolute/python3"}
```

The root may instead be the Byte repository containing `skills/`. Select it explicitly. All Python files under the relay/workflow scripts directories and the Python executable are pinned in `.session-bridge/byte-source.json`. Nothing is implicitly trusted from HOME. `--dry-run` previews; an upgrade requires the exact prior `expected_pin_sha256`. Concurrent writers use an exclusive project lock. Drift blocks writes, and an existing provider refuses a changed pin until explicitly recreated. Never restart another user's active service to apply an upgrade.

`byte-doctor --project PATH --json` is read-only. For v1 it invokes the pinned engine's `status`/history checks and own session grammar. It reports `structural_status_only` and `native_scheduler_verified=false`. The initial notification must reach an unarmed supervisor so it can submit actual `arm-run` receipts; a transport receipt never arms monitoring.

## Commit first, transport second

1. Connect each original conversation; use authenticated `context` and exact `sessions` identities. No guessed IDs or current-session override fields.
2. Prepare an immutable JSON handoff under `.byte-os/coordination/handoffs/`. Its `sessionbridge` metadata freezes full native source/target/return identities, goal, acceptance, paths, deadline, outcome/instance/run/attempt, future engine event ID and resulting revision. Inspect `describe --query cli.byte-handoff --json` for the canonical schema. The Byte draft helper can prepare this without changing owner.
3. Byte commits `start-run` using the real launch evidence, same event ID, expected revision and handoff. Bridge does not start or relaunch the process.
4. In the authenticated original main, `byte-import --stdin --json` takes `{"handoff_id":".byte-os/coordination/handoffs/actual.json"}`. It checks current committed hash/mirrors, latest transfer event, owner, run, instance, frozen scope and each binding's profile/generation. Stable task/message IDs prevent a second handoff or send. Unknown delivery uses the original `recover` ID.
5. The supervisor independently establishes the actual monitor/return route and commits `arm-run`. Bridge does not write these receipts or change its status.
6. On actual terminal evidence, Byte commits `return-run` with reverse metadata. Preserve the original goal, acceptance/read/write scope; source becomes the original executor, target and return_to the original main. Freeze a new return deadline.
7. Report the original Bridge task's immutable result, then `byte-import` with both `handoff_id` and `task_id`. Reporting before the return is committed saves the result and blocks handback until the same return is reconciled. Reporting after return-run is also supported. Neither order transfers authority again.
8. Main independently checks artifacts and executes the authorized action. Byte's `ack-return` still needs its own actual evidence; Bridge receive is not that acknowledgement.

A handoff's transport epoch is its committed transfer revision. Later `arm-run` revisions can retain that same current handoff. Old run/attempt, changed scope, stale native generation, expired/ambiguous binding, frozen-path overlap and source drift are rejected. A Byte state file or unknown engine never silently becomes standalone.

## Legacy

Legacy relay retains its exact pinned helper API and four-harness restriction. v1 does not call that helper's mutation command. Current v1 grammar supports Codex, Claude, dsh, ZCode, Pi, Hermes, Kimi and OpenCode; an older pinned engine can reject newer names. Transport tests are separate from each app's model, GUI and scheduler acceptance.

## Existing runs and optional Bridge supervision

Finish handoffs already in flight without Bridge metadata through their existing single recorded channel. Do not rewrite/import/resend them mid-run. Switch only subsequent handoffs at an explicitly safe boundary. Existing Byte native heartbeat can remain the monitor; Bridge does not require a second lease.

If using a Bridge lease, the engine-committed run_launch receipt must contain `process.bridge_identity`, the full actual Bridge RunIdentity from an owned local launch. The provider verifies its run/attempt, native identity, launch intent, command/config/source and current state before writing. Missing proof is blocked; do not guess a PID or restart a job for notification recovery. A Bridge-owned run_id cannot be reused for another Byte attempt; keep the existing native monitor when a retry uses the same Byte run_id. Same lease input is idempotent; stop the old lease explicitly before changing interval/deadline/route. Cancellation/terminal state and bindings/deadline are rechecked at commit, so a concurrent cancellation cannot re-arm polling.
