# Byte authority and Bridge transport

Use one work authority. Existing `.byte-os/coordination/state.json` remains
authoritative. `.session-bridge/` stores native connections, transport journals,
roles and monitor leases; it must not grant a second owner over Byte work.

## Explicit source binding

From this skill directory, use `bridge.py exec byte-source --project PATH
--stdin --json` with JSON containing the absolute `source_root`, exact
`source_commit`, and absolute `python_bin`. `source_root` is the Byte repository
or installed skills root containing `byte-relay` and `byte-workflow`.
Check the actual command schema with `exec describe` when needed.
The state/source probe is read-only structural validation, not proof of an
armed monitor. It must allow the initial unarmed start handoff to reach the
supervisor, which then records the real acknowledgement and `arm-run`.

The pin covers the helper source closure and Python executable. Read-only
`exec byte-doctor --project PATH --json` checks it. Upgrade is explicit and
requires the previous pin's `expected_pin_sha256`; never silently re-pin because
an imported task found drift. No source pin migrates project state or starts a job.

## Managed workflow v1

Bridge consumes already committed engine handoffs. It never substitutes its
own state transition for `start-run`, `arm-run`, `return-run` or `ack-return`.
This v1 adapter covers the main-launched long-run cycle. It does not invent a
generic write-owner transfer for arbitrary build/review steps. A request that
does not match a valid engine transition must remain blocked or be handled
inside the current owner's authorized native-helper lane.

1. Main verifies real startup. Resolve the full exact source, target and return
   identities using authenticated native context and sessions. Freeze the goal,
   acceptance, allowed read/write paths and deadline, including permitted main
   verification/continuation outputs. Do not widen that scope on return.
2. Prepare an immutable JSON handoff under `.byte-os/coordination/handoffs/`.
   Use `scripts/handoff.py --project PATH --output .byte-os/coordination/handoffs/NAME.json`
   with stdin `{direction, event_id, run_id, attempt, stage_scope, scope}`.
   `scope` is a complete Bridge TaskInput without authority: `source`, `target`,
   `return_to` are full native identities, plus `goal`, `acceptance`,
   `read_paths`, `write_paths`, `deadline_at`. Copy identities from actual tools.
   The helper binds current outcome, pinned definition hash and next revision.
   It drafts a document only: no ownership transfer, launch, timer or delivery.
3. Execute the existing engine `start-run` with its real launch receipt, that
   handoff file, the same event ID and observed revision. A stale revision must
   be reconciled; do not rewrite a committed handoff to make it match.
4. From the authenticated original main, call `exec byte-import --project PATH
   --stdin --json` with `{handoff_id: "<project-relative committed file>"}`.
   Bridge validates the committed hash/event, exact native source/target,
   current owner, run, outcome, scope and source pin before transport. Repeated
   import reuses the same task/message; uncertain delivery uses `recover`.
5. Supervisor checks the exact run, acknowledges and calls the engine's
   `arm-run` with actual monitoring/return-wake evidence. A Bridge delivery
   receipt alone is not evidence that monitoring is armed.
6. On terminal evidence, prepare a return handoff with `direction: return`,
   the exact `return-run` event/result revision and original scope. Target and
   `return_to` are the original main; source is the supervisor. Preserve the
   original goal, acceptance and paths. Commit `return-run` with the real
   terminal receipt before importing the return handoff.
7. Use the original task's immutable `report` input to report artifacts, then
   `byte-import` the committed return with both `handoff_id` and `task_id`.
   If a report waits for the committed return, reconcile and retry that same
   report; never create a second task or launch another run.
8. Main receives the result, independently verifies it, executes the authorized
   next action and supplies the engine's required `ack-return` evidence.
   Bridge's report/verification/continuation receipts and engine acceptance
   serve different checks; neither replaces the other's required evidence.

The exact handoff metadata schema is documented by the bundled runtime's
Byte CLI contracts. The engine is still responsible for workflow acceptance.
Bridge must reject uncommitted, tampered, old-run, wrong-owner or widened-scope
handoffs; notification recovery never transfers ownership again.

The workflow's pinned monitor ID can identify an already authorized native
monitor. Reuse it instead of starting a duplicate Bridge lease. When using a
Bridge lease, keep a stable workflow monitor label and record its binding to
the actual lease ID, run, service lifetime and native identities in immutable
registration evidence. A label or copied API response alone cannot establish
that an idle target will wake. Existing outcome-level recovery may remain a
native client automation; it must not separately poll the same run alongside
an active Bridge run monitor.

For a new Bridge-owned local run lease, the Byte launch receipt records
`process.bridge_identity` as the full actual Bridge RunIdentity. Bridge matches
it against the committed run/attempt and its owned run receipt/process proof.
Do not construct this field from guessed PIDs, or relaunch an existing job to
obtain it. Remote scheduler jobs and pre-existing jobs without that owned proof
keep their verified native monitor; Bridge still handles the handoff transport.

## Legacy and new projects

Legacy Relay projects use the explicitly pinned helper under their existing
owner gates. Never hand-edit them into workflow v1 or run the legacy helper
against an engine-managed project. New projects without Byte state may use
Bridge's standalone authority, but an existing Byte project never falls back
to it. Installing this skill is not authorization to migrate a running project.

The current Byte workflow engine recognizes Codex, Claude, dsh, ZCode, Pi,
Hermes, Kimi and OpenCode owner refs. This validates workflow identity and
transitions; actual native connectivity remains version/mode-specific. The
legacy Relay helper still recognizes its original four apps. Do not alias an
unsupported native identity to bypass a pinned older engine or legacy helper.
