---
name: byte-design-supervise
description: Coordinate a Codex main chat that designs, builds, and launches a long-running job with a separate supervisor chat. Use for training, ablations, or benchmarks that must continue after the main chat stops; not for a short in-turn test.
---

# Byte Design and Supervise

This is an independently callable Byte skill. Use it for the Codex-only
main-chat → supervisor-chat → main-chat workflow. The main chat owns design,
core code, launch, and final acceptance; the supervisor owns long-run checks
and only explicitly bounded repairs. Use ordinary chat turns rather than Goal
mode unless the user requests a Goal.

For the launch gate, durable handoff, event-plus-periodic supervision, and
handback rules, follow the [workflow](references/workflow.md). Use
[$byte-relay](../byte-relay/SKILL.md) for exact session identity, owner gates,
receipts, and handoffs. A short bounded test may use an authorized same-task
subagent, but that subagent does not become the long-run supervisor.

The main chat must verify that the real job started and has a durable run ID
before transferring ownership. It ends its turn instead of polling only after
the exact supervisor acknowledges the handoff **and** an authorized future
check is verified active. If either is missing, label supervision unarmed and
reconcile it without relaunching the job. A terminal event can be recorded
immediately, but an idle Codex desktop chat is not guaranteed to wake until an
event-to-chat adapter has passed a live test. Keep the periodic fallback and
report this limit honestly. Do not treat a notification or agent reply as
proof that the experiment succeeded.

Treat the periodic monitor as belonging to one active run, not to the whole
project. Verify it is active for the exact supervisor and run after handoff;
pause or delete it and verify inactivity after that run is handed back. For a
later run, update the run identity and acceptance before reactivating it. An
idle supervisor must not keep querying an old or nonexistent job.
Record the supervisor's exact runtime model when evidence is available; a
generic or self-declared model label is not proof that a cheaper model ran.

This skill does not authorize creating a new chat, scheduling a monitor,
starting paid work, or expanding repair scope without the relevant user
authorization.

## Source and updates

Canonical repository: [elan6666/byte-skills](https://github.com/elan6666/byte-skills).
