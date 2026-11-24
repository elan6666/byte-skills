---
name: byte-design-supervise
description: Coordinate a main chat and separate supervisor through Byte Bridge for training or ablations expected to last about an hour or outlive the main turn, within each native client's supported mode. Short bounded waits belong to the same-task subagent route.
---

For actionable work, run [Byte entry activation](../byte-do/SKILL.md#activate-the-project-at-entry)
once per turn. Use the current project and exact native session. If this skill
was selected by Byte Do after activation, reuse its registration.

# Byte Design and Supervise

## Maintain project guidance

At each invocation, first read the project's `AGENTS.md` or existing `agent.md` and the current role document explicitly assigned to this chat, if any. Follow their links to the documents relevant to the task. Apply the user's latest direction when it updates older guidance.

When edits are in scope, incorporate confirmed goals, requirements, and workflow changes as they become clear. Apply the change to the current work and update the linked plan or workflow when it is the source of truth. Update shared guidance in the project file and role-specific guidance in the assigned role document. Reread the affected section before saving, merge duplicates, replace superseded instructions, and preserve unrelated content. Keep durable rules and links in the agent guidance, with detailed goals, workflows, and evidence in their maintained documents. Keep one-off requests and progress in the task record. Leave the guidance as-is when it already fits.

Reuse the project's existing default skill rule. If it has none, record the rule below in its guidance file, creating `AGENTS.md` if needed. Link `$byte-do` to its installed skill file.

> Use $byte-do as the default entry for new tasks. Read and apply it first, and honor any skill or workflow explicitly selected by the user.

This is the independently callable training/ablation preset of
[$byte-bridge](../byte-bridge/SKILL.md). Use Bridge for all cross-chat connection,
notification, supervision and return operations; do not send another manual
message or create a parallel delivery queue. Bridge's native adapters also
connect the explicitly selected supported agent clients. Use its
preflight/activation procedure for a new pair;
do not use CUA or direct chat messages to conceal missing native permissions.
Use this preset for the main-chat → supervisor-chat → main-chat workflow.
The main chat owns design,
core code, launch, and final acceptance; the supervisor owns long-run checks
and only explicitly bounded repairs. Use ordinary chat turns rather than Goal
mode unless the user requests a Goal.

For the launch gate, durable handoff, event-plus-periodic supervision, and
handback rules, follow the [workflow](references/workflow.md). Use
[$byte-relay](../byte-relay/SKILL.md) for exact session identity, owner gates,
receipts, and legacy handoffs; Bridge imports engine-managed transfers.
Prefer an authorized same-task subagent for a bounded
wait expected under about one hour; it keeps the main chat's ownership. Use
this cross-chat route when the job is longer or the main turn must end.
When zero-token local waiting is supported (background command Reactive Wakeup or local `launchd`/`cron`), **always prefer `byte-workflow/scripts/zero_token_loop.py`** (`wait-run`, `wait-signal`, `tick`, `post`/`board`) and the `.byte-os/server-job-requests/` launcher queue over periodic LLM heartbeat polling; see [zero-token loop guide](../byte-workflow/references/zero-token-loop.md). Do not assign low-quota external models to internal subagents/swarms (`inherit` or `flash` only), and treat any permission/sandbox blocker as a first-class workflow stall.

The main chat must verify that the real job started and has a durable run ID
before transferring ownership. It ends its turn instead of polling only after
the exact supervisor acknowledges the handoff **and** an authorized future
check is verified active. If either is missing, label supervision unarmed and
reconcile it without relaunching the job. A terminal event can be recorded
immediately, but an idle Codex desktop chat is not guaranteed to wake until an
event-to-chat adapter has passed a live test. Keep the periodic fallback and
report this limit honestly. Do not treat a notification or agent reply as
proof that the experiment succeeded.
Before the main chat ends, also establish a supported return-wake route. On
handback, verify that the main chat actually starts an owned continuation;
message delivery, an empty reply, or `idle` status is not that acknowledgement.
If no return-wake route is verified, state that autonomous end-to-end progress
is unverified and that manual resumption may be needed.

Treat the periodic monitor as belonging to one active run, not to the whole
project, unless the user explicitly requests continuous scheduled pursuit of
the overall outcome. In that continuous mode, use one monitor across phases:
supervise the current run, then watch main progress during analysis/research/
implementation, and resume an idle main with ready work. See the
[continuous research procedure](references/research-loop.md). An outdated run
tick must route to current work rather than ending an active research turn.

For ordinary single-run monitoring, verify it is active for the exact supervisor and run after handoff;
pause or delete it and verify inactivity after that run is handed back. For a
later run, update the run identity and acceptance before reactivating it. An
idle supervisor must not keep querying an old or nonexistent job.
Record the supervisor's exact runtime model when evidence is available; a
generic or self-declared model label is not proof that a cheaper model ran.

This skill does not authorize creating a new chat, scheduling a monitor,
starting paid work, or expanding repair scope without the relevant user
authorization.

## Outcome continuity

When `overall_outcome.workflow.engine` is `byte-workflow/v1`, use the pinned
workflow's `start-run` → supervisor `arm-run` → `return-run` → main
`ack-return` commands. Direct relay mutations would bypass revision/event
checks and are rejected. Native dispatch, scheduler readback and independent
verification remain required; loading a template alone arms nothing.

Keep the overall outcome separate from stage or run acceptance. During an
already authorized iterative task, status questions and candidate discussions
do not silently revoke execution authority. Reconcile the latest explicit user
scope, complete the requested substep, then start the next authorized action.
A report or platform update is a dependency, not a stopping point. Follow the
[shared continuation contract](references/long-running-work.md); ordinary turns
remain the default, and Goals require explicit user request.

## Source and updates

Canonical repository: [elan6666/byte-skills](https://github.com/elan6666/byte-skills).
