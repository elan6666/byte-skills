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

For short waits, prefer an authorized same-task helper while main retains the
baton. For long waits, follow the bundled [continuation contract](references/long-running-work.md)
and `$byte-design-supervise`. Treat model preferences as bindings, not proof
of the runtime model. Avoid adding Goals or schedules without user authority.

Canonical repository: [elan6666/byte-skills](https://github.com/elan6666/byte-skills).
