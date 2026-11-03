# Codex main → supervisor → main, through Byte Bridge

New cross-chat work uses [$byte-bridge](../../byte-bridge/SKILL.md) and its
single transport journal. Do not directly call cross-chat message tools,
CUA, typing or a second queue. Codex's native queue is used internally by the
Bridge adapter, with its exact source, project and generation checks.

An older handoff already in flight before Bridge integration finishes only on
its recorded original route and authority. Do not switch an uncertain request
mid-flight, import it twice or use that exception for a new handoff.

## Select and connect

Use this route for independent chats or long unattended work. For authorized
short same-task helpers, follow [delegation routing](delegation-routing.md);
a native subagent keeps main ownership and is not a cross-chat replacement.

1. Select the actual project and exact original main/supervisor chats. Creating
   a new chat requires explicit user intent; a managed worker is a different
   mode and must never masquerade as an existing chat.
2. Use Bridge's [preflight/activation procedure](../../byte-bridge/references/bridge-only.md).
   Install only the requested clients; both chats enroll from their native
   sources. Verify `context`, exact `sessions` selection, host, profile, native
   session ID, runtime generation, deadline and the real supported intake mode.
3. Preserve current accounts and permissions. Report a concrete activation or
   native tool-permission block, without another delivery channel. A worker's
   granted permission mode is local to its task and lifetime.

## Main launches and hands off

Main owns core design, implementation, short tests and actual job launch.
Before handing off, verify the real process/scheduler, run ID and attempt,
source/config hashes, logs, acceptance, permitted repairs and terminal evidence
paths. Code readiness alone is not successful startup.

Use the project's existing authority. A pinned `byte-workflow/v1` engine
performs `start-run`; Bridge imports only that committed matching handoff.
Legacy local owner helpers remain for their original projects and never bypass
v1 revision or ownership checks. There is no second work baton in Bridge.

Send the exact handoff through Bridge once. Record its actual task/message IDs.
Delivery acceptance is not supervisor acknowledgement. End main's active turn
only after the exact supervisor acknowledges the owned run, a future authorized
check is verified, and a supported return-wake route is established. Otherwise
label the lane unarmed and repair the missing prerequisite without relaunching.

The supervisor observing shared process/log/state files needs that actual saved
checkout; a new worktree is appropriate only when the workflow explicitly
separates code ownership and provides a shared evidence channel.

## Supervisor observes and returns

Observe only the exact owned run; keep unchanged checks quiet. Deduplicate event
and timer observations by run ID, attempt and event. Repair only within the
recorded authority/budget, preserve the failure first and use a new run identity
for each new attempt. Never promise immediate wakeup from a local event file.

Return real terminal status, logs, artifacts, hashes and limitations through the
same Bridge task. Disable that run's ordinary checks and verify inactivity.
For an explicitly authorized continuous outcome monitor, clear the old run scope
and retarget that same monitor as the workflow specifies; do not add a second
native message/automation delivery route around Bridge.

## Main independently verifies and continues

Read the exact persisted result. Recompute acceptance from real artifacts and
source/run identity. A return message, model text, empty reply or `idle` does not
prove verification or continuation. Main then executes the next authorized
analysis, repair or integration action in its own native turn.

When Codex native action proof is required, register the stable `plan_next`
before verification, execute the actual verification command through Bridge's
`action`, then execute the fixed continuation only after verification is
confirmed. Preserve all action IDs and receipts. Non-Codex native command proof
has its own compatibility limits; never relabel a text reply `main_continued`.

A connection failure stays in Bridge. Reconcile the original IDs and return a
precise native activation/permission requirement if autonomous wake is unavailable.
Do not reclaim ownership, repeat a job or silently substitute another chat to
hide the failure. Follow the shared [continuation contract](long-running-work.md).
