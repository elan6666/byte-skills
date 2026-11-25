# Local workflow v1

`workflow.py` is a local state machine, not an autonomous process or scheduler.
Run `uv run <skill>/scripts/workflow.py ...` for YAML support with an isolated
PyYAML dependency. `python3` also works for JSON inputs without dependencies.
Project snapshots are JSON-compatible YAML; runtime state is JSON. No receipt
or prompt is itself proof that a real client scheduler or model ran.

## Goal loop

Use this mode if the user explicitly asks to pursue a goal until it is done.
Keep one owner and one acceptance contract for the outcome. State the
observable completion conditions and preserve the user's scope and limits.
At each entry or return, inspect the current state and evidence, choose and
execute the next authorized action, and verify its result. Keep working while
a useful authorized action remains. A failed attempt triggers diagnosis and a
different testable approach. Record what the new evidence changed and preserve
reusable lessons after verifying the improvement. Measure progress against the
original acceptance criteria. Progress updates and handbacks continue the loop.
**Hard Gate**: Never stop to ask permission for the next authorized step, never burn LLM tokens polling a running job when `Reactive Wakeup` or `zero_token_loop.py` (`0` tokens) is available, and always fix workflow/permission friction on the spot so the loop self-evolves.

### Use a native Goal when available

Inspect the current harness's controls. In Codex with native Goal tools, call
`get_goal` first. Reuse the active Goal if it is the requested outcome. Preserve
an unrelated or explicitly paused Goal. Call `create_goal` for the explicitly
requested new outcome only when allowed by the current Goal state. Give it the
user's objective and concrete acceptance. Use the current project's pinned
workflow or existing Byte state when it already tracks evidence. The native
Goal drives subsequent work. Do not start a concurrent model-driven timer for
the same work.

Once the real outcomes and checks pass, record evidence in the existing
project state where applicable and complete the native Goal. A stage result,
budget limit, or genuine external blocker does not fulfill the objective.
Use the host's own pause, completion and blocking semantics.

### Use a Byte loop in one chat

If a native Goal is unavailable, continue an existing pinned workflow or
outcome under its existing ownership. For a new outcome needing durable
acceptance, initialize the bundled single-session template:

```bash
python3 -B <skill>/scripts/workflow.py init \
  --project <absolute-project-root> --template goal-loop \
  --objective "<user's outcome>" --authority-ref "<user request reference>" \
  --main-session "<verified harness:native-id>" \
  --param "acceptance=<observable acceptance checks>"
```

Read `status` for the owner, pinned acceptance instructions, iteration and
revision. Execute work before recording it. Store each result's source-hashed
`step_result` receipt with `facts.result_checked: true` after checking the
actual output. Include what the result implies for the next action. Apply
`advance` with the current revision. Pending acceptance loops back to the work
step, with the evidence retained and the iteration incremented. Read prior
result evidence on resumption and avoid rerunning completed work.

Once all checks pass, attach the source-hashed `acceptance_verification`
receipt with criterion `goal` and `facts.goal_verified: true` using `accept`.
Then `advance` with checked step evidence and the new revision. Verify
`status` is complete and `doctor` reports completion. Use the
[receipt commands below](#revision-checked-commands-and-receipts). A new
project outcome uses one pinned instance with an actual owner. This command
preserves an already pinned instance.

### Enforce stopping with a native hook

If the current Codex surface lacks native Goal controls but supports command
`Stop` hooks, have the agent configure Byte's project guard for the explicitly
requested Byte goal loop. Read the current project hook configuration first;
the installer merges one handler and is safe to repeat.

```bash
python3 -B <skill>/scripts/goal_stop.py --install --project <absolute-project-root>
```

Complete Codex's native trust review when required. Check that the host has
loaded the hook and observe actual continuation in a controlled check before
relying on it. The guard applies to the project and exact owning Codex
conversation of a pinned `goal-loop`. Ready work or invalid completion evidence
requests another native continuation. Verified completion, explicit pause,
or a verified external dependency with no independent work lets the turn
end. The hook has no authority to suppress user interrupts, bypass approvals,
begin another experiment, or change the acceptance criteria.

If the host lacks both native Goal and a compatible stop hook, call
`workflow.py doctor` before answering. A `continue_work` result means execute
the next action in this turn. For an unverified or failing stop hook, preserve
the goal and use the attached command/runtime route while repairing it.

Keep the active turn attached to a native long-job wait when possible.
If work must outlive the turn, use an already authorized, verified same-chat
wake route. Without one, leave the outcome active and state the resumption
condition. The Byte template provides persistence and revision-checked
iteration. The harness or an authorized delivery route starts future turns.


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

## Reuse a team and its workflow

A template can include a `team` mapping with `roles` and an optional `monitor`
preference. `roles` includes `main` and `supervisor` and can name specialist
chats. Each role declares `title`, `harness`, `creation`, `responsibilities`,
and `handoff`. `model`, `reasoning`, and `steps` are optional. `steps` names
workflow steps the specialist contributes to. The existing `owner` field still
controls who can advance a step. Use `reuse-only` or `reuse-or-create` for
`creation`. A monitor preference has `kind: heartbeat` and `interval_minutes`.
The template contains no native session IDs, account details or automation IDs.

```bash
uv run <skill>/scripts/workflow.py team-plan --template <template-id>
uv run <skill>/scripts/workflow.py team-plan --project <project>
```

The template plan returns role titles, settings and onboarding prompts. When
the user requests a team, check the target project's existing bindings, reuse
matching chats, and create missing allowed roles with the native client. Confirm
the actual session identities and accepted model settings before dispatch. A
model preference alone does not verify which model ran. Once the roles are
ready, pass the primary IDs to `init` with `--main-session` and
`--supervisor-session`. Repeat `--role-session <role>=<harness>:<native-id>` for
each specialist. The pinned project plan shows these bindings. Unbound roles
remain pending. Specialists collaborate through the project's handoff path and
the primary owner records verified progress. Export keeps the role definitions
and requested settings. The next project supplies its own IDs and authority.

The monitor interval is a default when initializing a team template. Set
`--continuous` only for user-authorized scheduled work. Register and verify the
heartbeat in the native client before relying on unattended continuation.

### Delegate deliverables within a step

Use `delegations` when a step owner should coordinate or approve work that
belongs to bound specialists. For example, a design step can require two
separate deliverables:

```yaml
delegations:
  design-draft: {role: methods, deliverable: Candidate protocol and falsification criteria}
  design-audit: {role: evaluation, deliverable: Independent review of the protocol and evidence boundaries}
```

`status` and scheduled wake summaries show the current assignments and bound
sessions. Split additional pieces when inputs, outputs, access, or acceptance
can be checked independently. Dispatch parallel pieces only when their inputs
are ready. For the example, the audit follows the draft. Use the existing
Bridge task or workboard identity through interruption and recovery.

An `advance` receipt for this step includes `delegated_results`, a mapping from
each declared delegation ID to a `{path, sha256}` reference. Each referenced
receipt has `kind: delegated_result`, `status: verified`, the same `outcome_id`,
`step_id`, `iteration`, and `visit`, and these fields:

- `delegation_id`, `role`, and the bound `session`.
- `task_id` from the actual native assignment. Each delegation uses a distinct ID.
- `native_return` referencing the native return evidence observed by the owner.
- `sources` containing that same reference and at least one separate output or
  failure artifact. Hashes are checked for both. The owner verifies the actual
  sender and task status through the project's authorized transport before recording.

The engine associates these receipts with the step event. A queued assignment,
lead-authored substitute, or a receipt from another step or visit cannot serve as
the specialist's return. For a failed run, include the specialist's observed
failure evidence and use the declared repair branch. Steps without explicit
delegations keep the existing receipt format. Apply the project collaboration
rules to previously pinned workflows when coordinating a specialist team.

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

## Upgrade a pinned workflow

Use `upgrade` for a user-authorized version change at a coordinated, ready
main-owned checkpoint. The target definition preserves the current step,
overall acceptance contract, and parameter keys. Bind any added specialists
with `--role-session` and retain existing bindings. When the native cadence
has changed, pass the observed interval with `--interval-minutes`.

```bash
uv run <skill>/scripts/workflow.py upgrade --project <project> \
  --template <target-template> --session <current-main-session> \
  --authority-ref <user-request> --expect-revision <current-revision> \
  --expect-state-sha256 <fresh-state-sha256> --event-id <migration-event> \
  --role-session <specialist>=<native-session> --check-only
```

Coordinate with the existing owner and scheduler before committing. Repeat the
checked command without `--check-only`. The upgrade archives the previous
definition and state, adds a revision, and retains the outcome, evidence,
iteration, current visit, and run history. A running workflow handback must
finish before this operation. Verify `status` and `doctor`, then refresh the
existing native monitor from the new state and verify its configuration.

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

`start-run` also synchronizes `run_id`, `attempt` and a minimal
`active_background_job` across root/outcome/execution. The job contains only the
recorded launch process and receipt references, without inferred paths or PIDs.
An optional launch `stage_scope` must equal the explicit scope in the same hashed
handoff. Without that launch field, stale scope mirrors are removed. Previous
mirror values remain in `workflow.run_mirror_history`; old opaque process
identities remain supported.

### Repairing stale run mirrors during a wait

The current baton owner can repair an already recorded waiting run, including
an armed run, without returning or relaunching it:

```bash
python3 <skill>/scripts/workflow.py repair-run-mirrors \
  --project <authority-project> --session <exact-current-owner-ref> \
  --expect-revision <fresh-revision> --expect-state-sha256 <fresh-state-hash> \
  --event-id <stable-id> --evidence <immutable-owner-repair-receipt.json> \
  --check-only
```

The normal verified receipt identity (`outcome_id`, `step_id`, `iteration`,
`visit`, `sources`) is required, with `kind: run_identity_mirror_repair` and:

```json
{
  "owner_session": "codex:<current-owner-id>",
  "revision": 94,
  "state_sha256": "<fresh-authority-state-sha256>",
  "run_id": "<current-execution-run>",
  "attempt": 2,
  "stage_scope": "<explicit-authorized-current-handoff-scope>",
  "handoff": {"path": "<current-handoff>", "sha256": "<current-hash>"},
  "launch_receipts": [{"path": "<original-run-launch>", "sha256": "<original-hash>"}],
  "process": {"host": "<original-host>", "identity": "<exact-original-value>"}
}
```

`process.identity` may be the original structured object; copy it exactly.
`launch_receipts` lists every matching recorded current-run launch in history
order. `sources` must include each launch and the current hashed handoff; their
original source hashes must still verify. The scope must be explicitly declared
in that handoff as JSON `stage_scope`, a standalone `stage_scope: identifier`
line, or `; scope identifier.`. Conflicting or absent declarations fail.

First inspect `--check-only`, then omit it with the same fresh state guards.
The repair preserves mode, baton/owners, handoff, protocol, acceptance criteria,
monitor receipts and prior evidence/history. Only the run/attempt/scope/job
mirrors change, plus the normal revision/event/evidence records. An immutable
`run-mirror-repair-<request-hash>/` receipt directory archives the exact previous
state and before/after mirrors. State bytes are checked again before committing;
a concurrent change aborts without replacing that state. The command never
creates, retargets or validates native scheduling.

Supervisor uses `return-run` with a verified `run_terminal` receipt containing
the exact run/attempt and an integer `exit_code`, plus a new `--handoff`.
State returns to main with continuation pending. Supervisor cannot advance an
action step or complete scientific acceptance. Direct `relay_state.py handoff`
is rejected for an engine-managed instance.

Use the return format for the original transport. For a quick Bridge assignment
without SessionBridge metadata, save a new immutable JSON handoff under
`.byte-os/coordination/handoffs/` with the direction, original task and delivery,
run/attempt, sender, receiver and verified terminal receipt. Call `return-run`
with that file and the terminal receipt, then send the result once on the
original quick route. The advanced draft helper lives in
`byte-bridge/scripts/handoff.py`. Use it for the managed import path described
by Byte Bridge. A terminal observation or an `arm-run` receipt still leaves
the run with the supervisor until the return is committed.

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

### Retired monitor sources after return

Monitor and return-wake `sources` must use immutable readback snapshots, never
the pinned monitor's live `~/.codex/automations/<id>/automation.toml` or the
authority `state.json`. `arm-run` rejects those two mutable paths for these two
receipt kinds only. The live path may remain descriptive metadata. A snapshot
records the bytes actually observed then; it does not prove current scheduling,
an immediate event bridge, or future wakeup delivery.

If an older receipt already referenced that mutable TOML, preserve its original
bytes and hashes. Do not reconstruct a missing old TOML from prompt fields or
rewrite historical receipts. Normal history and scientific acceptance checks
remain strict. After the exact run has returned, active main may explicitly
retire only the failed source bindings in expired `monitor_registration` and
`return_wake` receipts:

```bash
python3 <skill>/scripts/workflow.py repair-expired-monitor-sources \
  --project <authority-project> --session <exact-main-ref> \
  --expect-revision <fresh-revision> --expect-state-sha256 <fresh-state-hash> \
  --event-id <stable-id> --authority-ref <explicit-repair-authority> \
  --evidence <immutable-owner-repair-receipt.json> --check-only
```

The repair receipt has the normal current outcome/step/iteration/visit identity,
`kind: workflow_evidence_repair`, `status: verified`, immutable nonempty `sources`,
and these extra fields:

```json
{
  "owner_session": "codex:<main-id>",
  "revision": 10,
  "state_sha256": "<actual-authority-state-SHA256>",
  "authority_ref": "<same-explicit-authority-as-CLI>",
  "run_id": "<returned-run>",
  "attempt": 1,
  "observed_automation_sha256": "<current-live-TOML-SHA256>",
  "targets": [{
    "receipt": {"path": "/absolute/old-receipt.json", "sha256": "<original-hash>"},
    "source": {"path": "/absolute/live/automation.toml", "sha256": "<old-hash>"}
  }]
}
```

`targets` is the exact complete ordered list of failing sources in current
workflow history. Each original receipt's own hash must still match, its kind,
outcome/run/attempt and expiry must match the returned run, and only the pinned
monitor TOML source may fail. All other receipts/sources still validate normally.
Current state/automation cannot themselves be repair `sources`; use immutable
inspection output/readback files. Inspection output is evidence of observation,
not a claim that the old SHA has been recovered.

`--check-only` writes no state or repair artifacts. After reviewing that preview,
remove only this flag with the same event/evidence. The engine double-checks the
state bytes and live TOML, saves exact current bytes and pre-repair state plus a
hash-pinned audit in a fresh `workflow-source-repair-<request-hash>/` receipt
directory, and commits one revision. Drift rejects the write and preserves any
already-created forensic artifacts; inspect those before a new repair attempt.
Exact successful event replay is idempotent; changed evidence is rejected.

Original history refs remain unchanged. The additional
`historical_source_invalidations` ledger labels each exact source
`invalid_retired`, never revalidated. `status`/`doctor` expose
`historical_sources_valid: false` and the markers. Receipt bytes, other sources,
repair evidence/snapshot/audit and scientific acceptance remain hash checked.
Retired monitor receipts cannot arm a run or serve as scientific acceptance.
New waits still need fresh ACK/monitor/return-wake evidence.

Start/return commands synchronize root, outcome and execution handoff mirrors;
existing baton-owner mirrors track the actual baton. This repair also aligns a
pre-fix state's mirrors to its already hash-verified root return handoff. It does
not acknowledge continuation, change acceptance/facts, or execute/stop/retry jobs.
Main must still run and prove the independent action required by `ack-return`.


### Identical state-source location rebind after return

A terminal receipt can accidentally attach the authority's live `state.json`.
`return-run` then changes those bytes. When an existing immutable snapshot has
**exactly the originally declared SHA256**, active main can rebind that exact
source location without rewriting the receipt or restoring old authority state:

```bash
python3 <skill>/scripts/workflow.py repair-source-locations \
  --project <authority-project> --session <exact-main-ref> \
  --expect-revision <fresh-revision> --expect-state-sha256 <fresh-state-hash> \
  --event-id <stable-id> --authority-ref <explicit-repair-authority> \
  --evidence <immutable-owner-rebind-receipt.json> --check-only
```

The evidence uses the normal current outcome/step/iteration/visit identity,
`kind: workflow_source_rebind`, `status: verified`, and these fields:

```json
{
  "owner_session": "codex:<main-id>",
  "revision": 10,
  "state_sha256": "<fresh-authority-state-SHA256>",
  "authority_ref": "<same-authority-as-CLI>",
  "run_id": "<exact-current-returned-run>",
  "attempt": 1,
  "sources": [{"path": "/authority/.byte-os/coordination/receipts/old-state-snapshot.json", "sha256": "<original-state-hash>"}],
  "targets": [{
    "receipt": {"path": "/absolute/original-terminal.json", "sha256": "<unchanged-receipt-hash>"},
    "source": {"path": "/authority/.byte-os/coordination/state.json", "sha256": "<original-state-hash>"},
    "replacement": {"path": "/authority/.byte-os/coordination/receipts/old-state-snapshot.json", "sha256": "<original-state-hash>"}
  }]
}
```

`targets` must list every failing state-source edge in depth-first source order,
starting from the current returned terminal, including nested terminal receipts.
Each target parent must be an unchanged `run_terminal` with that exact outcome,
run and integer attempt. A nested original terminal need not have the normalized
current terminal's `verified` status. Only the authority `state.json` source can
be rebound; all other source hashes, including nested sources, must pass. The
replacement must be a nonsymlink file within the authority's receipts directory,
carry the identical expected SHA256, and be attached to the repair evidence.
Never reconstruct bytes from receipt fields, substitute a new hash, or restore
the old snapshot over active state.

Preview writes no repair artifacts or state. After reviewing it, remove only
`--check-only`. The engine rechecks the revision/state identity, saves exact
pre-repair state and a hash-pinned audit in a new
`workflow-source-rebind-<request-hash>/` directory, and records one revision.
`source_location_rebindings` retains the original receipt/source refs alongside
the replacement and audit; subsequent history reads verify the audit, original
receipts, all replacement bytes and the nested terminal source tree. A changed
source or audit fails closed. Exact successful event replay is idempotent.
Concurrent state changes reject the write and preserve forensic artifacts.

This operation changes evidence location only. It preserves run identity,
ownership, `return_pending`, workflow facts and scientific acceptance. Main must
independently verify the result and execute the action required by `ack-return`.

## Connect user instructions to execution

Update the affected project plan or role instructions when a user request
changes how future work should proceed. The main owner also records the
effective guidance in the workflow with a reference to the human instruction:

```bash
uv run <skill>/scripts/workflow.py record-guidance --project <project> \
  --session codex:<main-id> --expect-revision <current-revision> \
  --event-id <stable-id> --request-ref <user-message-reference> \
  --scope outcome --summary "Use the updated project protocol for future rounds."
```

Use `iteration` for changes confined to the current round. Each record replaces
the effective summary of its scope. Carry forward earlier instructions that
still apply. Progress questions and one-off actions need no guidance record.
The audit retains earlier changes. Read active guidance from `status` before
acting. A fresh wake summary includes it. `advance` links the verified step
receipt with the active guidance event IDs. The IDs document which guidance
was in force. The receipt must supply the evidence of what actually happened.
The main owner can also record guidance while the workflow is blocked on
external evidence. The block, resume prerequisites and monitor registration
stay in effect. When acting on an explicit user request on behalf of the
bound owner, use `--recorded-by <actual-recorder-session>` to record provenance.
This operation keeps the pinned workflow, acceptance and any in-flight run
identity intact. A change to the actual steps or acceptance requires an
explicitly authorized version change.

## One current objective, milestones and task Goals

`status` shows the single active objective, its version, final `acceptance`,
intermediate `milestones` and registered `task_goals`. Existing projects start
at objective version 1. `record-guidance` records local direction without
rewriting the objective or its acceptance. Templates can define `milestones`
using the same criterion schema as `acceptance`. Only final criteria count
toward the `done` transition. A milestone's verified evidence survives loops.

After the user explicitly changes the overall objective or final criteria,
main uses `revise-objective --request-ref <user-message> --evidence <receipt>`
with the current revision, main session, and a stable event ID. A verified
`objective_revision` receipt contains the outcome ID, `previous_version`,
new `objective`, new final `acceptance`, `milestone_ids` selecting previous
criteria to retain as milestones, and hashed `sources` for the user's change.
The verified receipt and old definition remain in history. The outcome ID,
current step, iteration, pinned process, and monitor identity carry through.
New final criteria start pending. A final `acceptance_verification` for a
revised objective includes the current `objective_version`. Accept a milestone
via the same `accept --criterion` command with its existing receipt checks.
Exports use the effective final criteria and milestone definitions.

When a bounded assignment needs a native Goal, the assigned worker manages it
in its own chat. Main records the verified binding using `record-task-goal
--evidence <receipt>` with the current revision and a stable event ID. A
verified `task_goal` receipt contains the outcome ID, `objective_version`, the
original `task_id`, `session`, native `goal_id`, `goal_status`, and two hashed
references in `sources`:

- `assignment` is the verified assignment record with matching `task_id`,
  `session`, `outcome_id` and `objective_version`.
- `native_goal` is the native observation with matching `goal_id`, `session`
  and `status`.

Record verified completion against the same assignment after accepting its
return. A revision supersedes the prior version's open task Goal bindings.
Reconcile native Goal status in the owning chat before reusing it. Status
records are evidence-backed bookkeeping; the CLI does not control native
Goals. A task's Goal cannot complete the overall outcome.

Update the maintained project document before notifying another chat. Carry the
task identity, one line on the result or action needed, and a readable reference
to the relevant section. Keep detailed findings, evidence and decisions there.

## Workflow continuation on Bridge returns

Use this pattern when the project opts in. The Workflow outcome holds the
overall objective, owner, current action, and acceptance. The coordinator uses
ordinary turns for dispatch, evidence review, decisions and execution. After
confirmed dispatch it saves the original task identity and prerequisite, does
any other ready work, and ends its turn. Use the established Bridge return as
the wake. An existing authorized supervisor checks the exact run and attempt
and returns actionable terminal evidence. Normal waiting generates no new
messages or coordinator turns.

For a difficult assignment that needs several turns, include user
authorization for a specialist Goal, a bounded objective, allowed scope,
deliverables and completion criteria. The assigned specialist checks its
existing Goal, creates its own Goal when available and authorized, and completes
it only after satisfying that assignment. It saves artifacts and returns on
the original channel; a Goal status alone is insufficient evidence. Simpler
assignments and routine monitoring can use ordinary turns.

On a return, main checks Workflow status and the original assignment before
executing. Use the original task and attempt for `delegate`, or the original
task name and dispatch `delivery` for a quick Bridge handoff. Match the
bound sender and receiver, project, relevant iteration and visit, and artifact
SHA-256. A new message ID for the same original result is a replay. If the
same task identity reports conflicting evidence, reconcile it before acting.

Before a side effect, use the same task-derived continuation identity to find
an existing acceptance, plan, dispatch, run or action receipt. Save the
concrete next action against the original receipt before starting it. On
reentry, resume from the first missing artifact or receipt. An uncertain
dispatch or launch is reconciled through its original identity before any
retry. Use the Bridge continuation record for advanced tasks, or the existing
project receipt directory for quick handoffs. Reuse the same event ID and
immutable step evidence for `advance` retries. Advance once only when the
step's actual acceptance requirements are met. A handoff, a plan or a repeat
delivery is insufficient to advance.

If the workflow is blocked, verify the matching external resolution and
existing authorization before restoring runnable work. An explicit user pause
is honored independently of task results. Save incoming evidence while paused
without advancing. Leave timers as configured unless the user authorizes a
change. Audit a pilot from the original dispatch through one actual wake,
one applied action and a new artifact. Keep the pilot scoped until that
evidence is available.

## Scheduled goal mode

Use this mode when the user authorizes periodic continuation of an overall
outcome. Use the existing `init --continuous --monitor-id <id>` options shown
above and bind the actual main and supervisor conversations. For an existing
continuous workflow, reuse its pinned instance and monitor ID. Use the client's
native tools to configure the heartbeat and observe actual scheduled turns.

```bash
# Base prompt for the designated supervisor
uv run <skill>/scripts/workflow.py monitor-prompt --project <project>

# Route and get the wake checkpoint after confirming that main is idle
uv run <skill>/scripts/workflow.py route --project <project> \
  --caller-session codex:<supervisor-id> --main-status idle --wake-only
```

On `resume_main`, the second command emits the main target and a compact
`wake` checkpoint with the current outcome, revision, iteration, step and
owner. Append it to the base prompt and update the same heartbeat with the
returned target, retaining cadence and notification settings. Main reads the
live next action and evidence from `status` before executing, restores
the supervisor target and base prompt, and records actual work. Each handback
replaces the prior summary. Both commands are read-only. When storing native
readback as workflow evidence, save an immutable snapshot instead of hashing
the mutable scheduler settings file.

`route --project <path> --caller-session <ref> --main-status active|idle|unknown`
uses the bundled deterministic router. `watch_main` stays quiet in supervisor,
`resume_main` targets main, `continue_main` executes current owned work while
retaining the supervisor watchdog, and `supervise_run` observes the current run.
Check a run only when the current route returns `query_run: true`. A preserved
run ID, a previous assignment or a historical handoff does not reopen it.
An explicitly supervisor-owned active step routes to `continue_supervisor` or
`dispatch_supervisor`, without authorizing scientific acceptance.
On a long run, supervisor checks the current identity once per tick and reports
only terminal results, actionable failures or required decisions. Once the
handoff is verified, main can yield when no independent work is ready. Keep
the outcome active across short requests and continue its next authorized step
after handling them. Stop the heartbeat on verified completion or explicit
user pause. `watch_blocked` keeps the existing heartbeat on supervisor with a
quiet tick and no main wake. Follow native approval and input waits.

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

### Wait for an assigned evidence return

Keep the current step runnable while independent work remains. Once the main
owner has no independent work and the acquisition task has been sent to a bound
session, use `wait-evidence --evidence <declaration>` with the usual session,
expected revision and stable event ID. The verified `external_evidence_wait`
receipt uses the standard outcome, step, iteration, visit and hashed sources
fields. Include `dependency`, `task_id`, `source_session`,
`receipt_path` (a project-relative JSON path reserved for this task), and
`independent_work_remaining: false`. Include the original dispatch evidence
in the declaration's sources and give the acquisition session the wait ID and
receipt path. The wait ID is the declaration command's event ID.

The acquisition session publishes the `external_evidence_return` receipt
atomically at the registered path and returns it along the original Bridge
task. The receipt includes the same outcome, step, iteration, visit, task ID,
source session, and `wait_id`, with `status: verified` and hashed sources
for the returned evidence. `watch_evidence` leaves the heartbeat on supervisor
until the receipt is present. Identity or hash mismatches require reconciliation
and do not authorize a wake. On an exact match, an idle main can receive the
existing heartbeat as fallback if Bridge did not already wake it. If the
heartbeat was on main while waiting, return it to the supervisor immediately.

Main independently verifies the original return, then calls
`receive-evidence --evidence <registered-receipt>` under the current revision.
This consumes that wait once, preserves the overall outcome and returns the
current step to ready. The actual action and resulting step receipt are
recorded separately. If a new independent branch opens before the receipt
arrives, main can use `cancel-evidence-wait --evidence <receipt>` with a verified
`external_evidence_wait_cancelled` receipt containing the `wait_id`, `reason`
and evidence of the change. A user pause takes precedence over a waiting return.
