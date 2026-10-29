# Local workflow v1

`workflow.py` is a local state machine, not an autonomous process or scheduler.
Run `uv run <skill>/scripts/workflow.py ...` for YAML support with an isolated
PyYAML dependency. `python3` also works for JSON inputs without dependencies.
Project snapshots are JSON-compatible YAML; runtime state is JSON. No receipt
or prompt is itself proof that a real client scheduler or model ran.

## Library and project snapshot

```bash
uv run <skill>/scripts/workflow.py install-template
uv run <skill>/scripts/workflow.py list-templates
uv run <skill>/scripts/workflow.py validate --file /path/to/custom.yaml
uv run <skill>/scripts/workflow.py install-template --file /path/to/custom.yaml
```

The default library is `~/.byte/workflows/<template-id>/workflow.yaml`.
Use the global `--home /another/library` option BEFORE the command to change it.
Installation refuses to overwrite an existing custom template. Copy/edit a
template under a new ID/version to create another workflow. Do not put project
session IDs, secrets or run paths into a reusable definition.

```bash
uv run <skill>/scripts/workflow.py init \
  --project /path/to/project --template experiment-research \
  --objective "Improve representation and prediction under the frozen protocol" \
  --authority-ref "user-message:authorized-research-loop" \
  --main-session codex:<main-id> --supervisor-session codex:<supervisor-id> \
  --param problem="conditional representation geometry" \
  --param baseline="fixed baseline config and checkpoints" \
  --monitor-id <existing-authorized-monitor> --continuous --interval-minutes 20
```

`init` pins the definition, parameters and bindings into `.byte-os/workflow.yaml`
and creates one `overall_outcome` inside `.byte-os/coordination/state.json`.
It preserves unrelated state fields and refuses an existing outcome or pinned
instance; it does not migrate a live project. Future template edits cannot
change the pinned project. Hot-editing that snapshot fails its hash check.
`--continuous` records user-authorized continuity intent, not timer activation.
Omit it for a noncontinuous assignment. A model preference never proves a
particular runtime model was selected.

Export a definition without bindings or runtime data for another project:

```bash
uv run <skill>/scripts/workflow.py export --project /path/to/project --output /new/path/reusable.yaml
```

The exported JSON text is valid YAML. The target must not already exist.
V1 pins one instance per project; changing an active definition or migrating
another existing outcome is never implicit.

## Explicit adoption of an existing active outcome

When the user explicitly requests migration, coordinate the exact main and
supervisor at a safe boundary for coordination-state writes. Preserve ongoing
jobs and independent main work. The CURRENT baton owner calls `adopt`, not
`init`. First customize the definition's acceptance IDs and descriptions to
exactly match the existing outcome; choose the current real `--step` rather
than replaying prior steps as if newly verified.

```bash
uv run <skill>/scripts/workflow.py adopt --project <project> \
  --template <reviewed-project-template.yaml> --step experiment \
  --main-session codex:<main-id> --supervisor-session codex:<supervisor-id> \
  --session codex:<current-owner-id> --monitor-id <existing-id> --continuous \
  --expect-state-sha256 <fresh-state-sha256> --authority-ref <explicit-user-request> \
  --event-id <migration-id> --evidence <adoption-receipt.json>
```

The adoption receipt has kind `workflow_adoption`, status `verified`, exact
`outcome_id`, `owner_session`, `state_sha256`,
`coordination_writes_quiescent: true`, immutable source references and, while
waiting, exact `run_id` and `attempt`. Do not reference the mutable state itself
as a source. The engine archives its original bytes in an immutable receipt,
pins the definition and uses a second state-hash check before committing.
Owner, stage, goal, scientific status, original acceptance/evidence, run,
attempt, active process, monitor and independent-work flag remain preserved.
No job is submitted, stopped or replayed. State drift or wrong ownership rejects
the migration. Existing active managed instances cannot be overwritten.

Run `status` and `doctor`, then obtain fresh native monitor/ACK observations
and `arm-run` if applicable. A preexisting run is imported, not retrospectively
claimed to have passed engine launch gates. `doctor` can correctly report
`continue_work` if the main still has independent work; do not force that flag
false for a convenient waiting disposition. Preserve the same monitor, update
its reusable prompt with `monitor-prompt`, and verify actual scheduling.

If main finishes previously independent work while supervisor still owns the
waiting run, `record-readiness` accepts a source-hashed `main_readiness` receipt
with current step/run identity, `main_session` and
`independent_work_remaining: false`. Only the supervisor owner records this
transition, after actually receiving/verifying main's readiness evidence.
Do not infer readiness from silence or manually clear the flag during adoption.

## Definition

Required fields: `schema_version: 1`, a stable lowercase `id`, positive integer
`version`, `start`, nonempty `acceptance` list and a `steps` mapping. Optional
`description` and `parameters` supply reusable context. `${name}` substitution
is text-only in actions, never shell evaluation. Unknown fields are rejected.

Each action step has `owner: main` or `supervisor`, action text, an acceptance condition and
ordered `transitions`. A long-run-capable experiment adds `wait_owner: supervisor`.
Keep scientific design and final acceptance main-owned. Supervisor-owned steps
can perform explicitly authorized observation/reporting or bounded repairs;
their template text grants no new authority. The last transition is an unconditional
fallback. `done` is reserved and always requires verified overall acceptance.
`new_iteration: true` clears iteration facts and iteration-scoped acceptance.
All declared steps must be reachable from `start`.

Conditions support nested `all` / `any`, `{overall_accepted: true}`, or
`{fact: metric_name, op: ge, value: 0.8}`. Operators: `eq`, `ne`, `gt`, `ge`,
`lt`, `le`. Missing facts never pass; booleans are not numbers and ordered
comparisons require finite numbers. No arbitrary expressions, imports or code.
Step acceptance reads its own receipt's facts. Transitions read facts from the
current iteration. `workflow.iteration` and `workflow.runs` are engine-derived
transition facts and cannot be overridden by a receipt.

For a user-defined review budget, branch on those engine facts into a review
step rather than claiming completion. A review may refine the question,
continue independent analysis, or document an actual authority/budget blocker.
There is no default iteration cap or promise of scientific success.

Overall criteria have `id`, `description`, optional `scope` (`iteration` by
default, or `workflow`) and optional machine `checks` using the same condition
format. Start of a new run also invalidates old iteration-scoped acceptance.
Workflow-scoped evidence remains reusable only while its source hashes match.
Optional init flags `--main-model` and `--supervisor-model` store requested
preferences only; native runtime evidence is still needed to verify selection.

## Revision-checked commands and receipts

`status --project <path>` returns revision, step, iteration, visit, owner and
the current action. Every mutation requires `--session <exact-ref>`,
`--expect-revision <observed-number>` and `--event-id <stable-request-id>`.
An exact replay is idempotent; a reused ID with changed payload is rejected.
Stale revisions and concurrent locks reject writes. Events are committed in
the same atomic state write as the transition. For crash-left locks, inspect
the recorded PID and owning process before manually recovering the exact lock.

Evidence commands additionally need `--evidence <receipt.json>`. A step receipt:

```json
{
  "kind": "step_result",
  "outcome_id": "<status.outcome_id>",
  "step_id": "implement",
  "iteration": 1,
  "visit": 4,
  "status": "verified",
  "facts": {"checks_passed": true},
  "sources": [{"path": "/absolute/test-result.json", "sha256": "<sha256>"}]
}
```

Produce receipts only after inspecting actual work. The engine checks identity,
hashes, conditions and ordering, not the scientific truth of an asserted fact
or authorship of a receipt. Source references resolve beside their receipt;
absolute paths are recommended. Keep receipts and sources immutable. Hashes
are rechecked before later commands; do not edit an old output in place.

```bash
uv run <skill>/scripts/workflow.py advance --project <project> \
  --session codex:<main-id> --expect-revision 0 --event-id <unique-id> \
  --evidence <step-receipt.json>
```

This selects the first matching transition and commits it, never launching its
command. A required condition that fails leaves state unchanged.

`accept --criterion <id>` attaches an `acceptance_verification` receipt with
matching `outcome_id`, `criterion_id`, `status: verified` and source hashes.
Iteration-scoped criteria also require the current `iteration`. Optional
criterion checks inspect its `facts`. An `advance` to `done` independently
checks every acceptance reference again. A report or passed preflight alone
cannot complete the workflow.

## Short waits

Main keeps ownership while a bounded same-task helper observes a short job.
After independent verification, use `record-run` with a `run_terminal` receipt
containing the usual step identity, sources and:

```json
{"run_id": "trial-1", "attempt": 1, "exit_code": 0,
 "wait_mode": "same_task", "owner_session": "codex:<main-id>"}
```

Then `advance` the experiment step with its verified step receipt. Recorded
exit code wins over any exit-code claim in that step receipt. The helper
never takes the relay baton or becomes an independent registered session.

## Long waits and main return

Main verifies actual launch first. `start-run` requires:

- `--run-id`, `--attempt`, and a `run_launch` receipt with those exact values,
  step identity, sources and `process: {host: "...", identity: "..."}` bound
  to the actual persistent process/scheduler job;
- `--handoff` pointing to an immutable file in the project's coordination
  `handoffs/` directory;

On valid launch/handoff evidence, `start-run` transfers the baton with
`monitor_status: unarmed`. Notify the exact supervisor using native tools.
The supervisor can now acknowledge owned work without a circular requirement
to acknowledge ownership before receiving it. It uses `arm-run` with
`--supervisor-ack`, `--monitor-registration`, `--return-wake-receipt`: fresh
identity-bound receipts in the [waiting contract](long-running-work.md).
Use `continuation_check.py --help` for their exact fields and statuses.
Only a successful `arm-run` permits a recorded unattended wait. `doctor`
rejects the unarmed intermediate state. Main must reconcile an unarmed lane
rather than silently ending or relaunching the job. Invalid launch evidence
does not transfer ownership. The engine never launches, kills or retries jobs.

Supervisor uses `return-run` with a verified `run_terminal` receipt containing
the exact run/attempt and an integer `exit_code`, plus a new `--handoff`.
State returns to main with continuation pending. Supervisor cannot advance an
action step or complete scientific acceptance. Direct `relay_state.py handoff`
is rejected for an engine-managed instance.

Main executes independent verification, then uses `ack-return` with a
`main_continuation` receipt. It includes current step/run identity, source
hashes and:

```json
{"executed_action": {
  "command": "the command actually executed", "exit_code": 0,
  "result_ref": {"path": "/absolute/command-result.json", "sha256": "<sha256>"}
}}
```

The attached `command_result` JSON must match that command/exit, have
`status: completed`, and identify the actual main session in `session`.
`result_ref` must also be in `sources`. An empty ACK or delivered message fails.
Only then can main advance the experiment result into evaluation or repair.

## Native scheduler integration and recovery

`monitor-prompt --project <path>` emits a stable prompt and requested monitor
identity/cadence; configure it using native client tools and verify readback.
It does not create an automation. Preserve the prompt when retargeting, obtain
caller identity from the actual chat and do not freeze a historical run into it.

`route --project <path> --caller-session <ref> --main-status active|idle|unknown`
uses the bundled deterministic router. `watch_main` stays quiet in supervisor,
`resume_main` targets main, `continue_main` executes current owned work while
retaining the supervisor watchdog, and `supervise_run` observes the current run.
An explicitly supervisor-owned active step routes to `continue_supervisor` or
`dispatch_supervisor`, without authorizing scientific acceptance.
Stale reminders, reports and initial main ACK never pause an authorized
outcome-level monitor. Stop it on verified completion, explicit pause or a
concrete external block. Follow native approval/input waits without bypassing them.

`doctor --project <path>` checks snapshot/evidence consistency and the existing
continuation disposition. It cannot prove timer activation or an idle-chat
wakeup. Missing/tampered evidence calls for owner reconciliation, not a new run.

`pause --request-ref <explicit-user-message>` records an explicit pause without
killing running jobs. `block` needs an `external_block` receipt, supported
`blocker_kind`, `reason`, `external_dependency`, `resume_trigger` and
`independent_work_remaining: false`. Unknown science or hard reasoning is not
an external blockage. `resume --request-ref <user-message>` resumes a pause;
a blocked workflow also requires `--evidence` for `external_resolution`.
Readback/activation of monitoring is still required before an unattended wait.
