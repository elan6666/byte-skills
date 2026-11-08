---
name: byte-workflow
description: Define, save, reuse and execute a local Byte workflow with custom steps, conditional loops, acceptance evidence, and main/supervisor roles. Use when the user asks for a reusable workflow or to run a saved workflow.
---

# Byte Workflow

Use the user's chosen method as a versioned local workflow. Templates live in
`~/.byte/workflows/`; each project pins its own definition and role bindings in
`.byte-os/workflow.yaml`. Runtime state stays in the existing
`.byte-os/coordination/state.json`. Do not create a competing outcome ledger.

Read [the workflow format and commands](references/format.md) when defining or
running a workflow. Use `uv run scripts/workflow.py --help` for the CLI. JSON
inputs work with Python's standard library; YAML uses the script's isolated
PyYAML dependency through `uv run`. The script records decisions and validates
transitions; it does not run arbitrary commands or control the app scheduler.

1. Choose a local template, or help the user express steps, outputs, acceptance,
   conditional transitions, failure routes and loop boundaries. Preserve the
   requested order. Review unknown conditions and unreachable steps before use.
2. Bind project-specific objective, parameters and exact existing sessions.
   Initialize only a new/inactive outcome. For an explicitly requested live
   migration, the exact current owner uses `adopt` with a fresh state hash,
   immutable observation evidence and a coordinated state-write boundary;
   preserve run identity, outcome and all acceptance criteria. Never silently
   adopt or replay a live experiment. Pin a snapshot so library edits
   cannot change a running project. Template parameters grant no new authority.
3. On each owned turn inspect `status`; execute the current step using the
   appropriate Byte capability. Record real output/source hashes in a step
   receipt, then `advance` using the observed revision and a stable event ID.
   A status message, empty reply or saved plan cannot advance a required step.
4. Use [$byte-bridge](../byte-bridge/SKILL.md) for cross-chat transport, with its
   committed-handoff metadata and explicitly pinned source. The engine alone
   changes workflow ownership; Bridge imports the exact transfer without a
   second owner ledger. Main launches jobs within authority. `start-run` persists
   launch and exact handoff, then transfers an explicitly unarmed waiting baton. Notify the
   target through Bridge; supervisor acknowledges and uses `arm-run` with monitor/return-wake
   evidence. Only then is an unattended wait justified. Use these commands
   and `return-run` instead of bypassing the engine with direct relay writes.
   Supervisor observes only its owned run and explicitly allowed repairs.
   For a new client pair, follow Bridge's preflight/native activation procedure;
   installation does not prove connection or tool permission. Connection repair
   and return stay in Bridge, without CUA or a second chat-message route.
5. After return, main independently verifies results and records an actual
   executed action with `ack-return` before advancing. Failed science loops to
   diagnosis; execution faults follow the configured repair branch. Use new
   run identities for new attempts. Do not repeat an unchanged failed hypothesis.
6. Use `accept` to attach criterion-specific verification evidence. Only a
   configured `done` transition with every criterion verified completes the
   overall outcome. Respect explicit user pauses and actual resource limits.

For a user-authorized continuous two-chat loop, generate the stable prompt with
`monitor-prompt` and configure the native automation separately. Keep one
outcome monitor active across steps; main-active ticks watch quietly from the
supervisor, idle-main ticks restore main, waiting-run ticks observe the current
run. Read back native configuration and observe actual scheduling. `route` and
`doctor` never prove the app woke a chat. Existing native tools remain necessary.

For background experiment waits, use the supervisor-and-timer workflow below.
For other short waits, prefer an authorized same-task helper while main retains
the baton. For long waits, follow the bundled
[continuation contract](references/long-running-work.md) and `$byte-design-supervise`.
Treat model preferences as bindings, not proof of the runtime model. Avoid adding
Goals or schedules without user authority.

## Experiment waits: supervisor timer and main acceptance

Use this as the default waiting pattern for the user's authorized experiments,
including training and checkpoint evaluation. Reuse the existing main and
designated supervisor chats; a new chat is unnecessary. This standing workflow
preference does not authorize new experiments or a continuous research loop.

1. Main prepares and launches the authorized job, verifies its exact live
   run/attempt/process and source/config/checkpoint identity, and hands that
   evidence plus acceptance criteria and return conditions to the supervisor.
2. Bind native scheduled checks directly to the supervisor chat. Reuse the
   existing appropriate timer; inspect its current target, scope and status
   before changing it. Choose the interval from the user's instruction and
   actual stage, then read back the native timer ID, target chat, interval,
   enabled state and reporting policy. Configuration is not proof of a real
   scheduled wake; verify an actual tick when claiming scheduling was exercised.
3. Each tick performs one bounded, read-only check of the current exact job,
   checking terminal receipts before live-process requirements. Healthy progress
   and normal phase transitions stay quiet: no repeated ACKs, progress reports
   or messages to main. Reconcile stale run IDs rather than restarting jobs.
4. Completion, failure, an actionable anomaly or required user intervention
   triggers a deduplicated evidence-backed return to main through the authorized
   transport. Main independently verifies outputs, metric support/NA and the
   applicable source/config/checkpoint bindings, then performs the next already
   authorized action. A supervisor report never substitutes for main acceptance.
5. End the completed run's checks and verify timer inactivity on handback.
   Refresh the same timer for a later explicitly assigned job; keep it active
   between jobs only under separately authorized continuous-outcome supervision.

A background script, open waiting turn or same-task helper is not an app timer.
Do not silently substitute one or claim that scheduled supervision is enabled
without native readback. Host restrictions and tool permissions still apply;
when they prevent this scheduling pattern, explain the specific limitation and
record scheduling as unconfigured rather than inventing activation or bypassing
the restriction. Saving this procedure does not arm a live run or alter a pinned
active workflow snapshot.

Canonical repository: [elan6666/byte-skills](https://github.com/elan6666/byte-skills).

## Durable agent roles and collaboration

When the project uses agent working documents, follow the shared
[agent collaboration contract](../byte-plan/references/agent-collaboration.md).
On joining, resuming or receiving a task, read your explicitly assigned current
role document and task contract. Main may create/customize these documents;
users can edit them directly. Keep task IDs across dispatch and recovery, return
actual evidence for main review, and continue the next authorized action after
acceptance. Use existing workboard/Bridge/workflow state; do not require agent
files for ordinary work or claim universal app hooks or native permissions.
