# One overall outcome, adaptive execution

## Overall outcome and authority

First agree or infer from the request one overall deliverable and observable
acceptance criteria. Keep it in ordinary project state, not an always-active
Goal spanning both work and waiting. Use Goal tools and scheduled monitoring
only when explicitly requested and supported; a request for this combined
workflow authorizes its in-scope transitions without repeated confirmation.
A skill invocation alone does not override environment authorization rules.
Planning-only, discussion-only, and status-only requests do not launch work.

Keep one short existing state document, or `.byte-os/STATE.md`: overall outcome
and acceptance, active work with evidence, current mode/monitor ID, and next
step. Link to logs/configs rather than copying them. Retain concise completion
receipts while removing completed items from active work. Do not create separate
design, phase, monitoring, and handoff documents unless their content is needed.

## Choose the mode from the work

- Core design, difficult implementation, uncertain diagnosis, or repeated
  evaluation and optimization: use a bounded Goal with a concrete acceptance
  condition. Do not put unattended training completion inside that Goal.
- Repeated checks, training supervision, result collection, or a small known
  repair: use scheduled checks when monitoring is authorized. A short one-off
  action should simply be done now; do not schedule every easy task.
- Reassess after meaningful evidence. Difficulty determines the next mode;
  job termination alone does not require another Goal.

For the same workflow, an active Goal and enabled monitor must not overlap.
Preserve unrelated experiments and automations. Inspect existing goals before
creating one; only complete a Goal when its acceptance is truly met. Never use
complete or blocked to simulate pause, and never invent token budgets. An
unfinished broad Goal cannot be silently replaced to enter monitoring mode.

## Prepare and hand off

During core work, design the next monitoring plan: remaining jobs/dependencies,
identity and log/output locations, query method, initial interval, success and
failure evidence, allowed repairs/retries, and escalation/stall conditions.
Save it in state; do not enable an automation while the Goal is active.

After acceptance, complete the Goal and confirm it is inactive. Inspect live
state before submitting an authorized job or retry to prevent duplicates.
Record the job ID, host, configuration identity, logs, outputs, and receipt.
Fill those identities into the planned prompt, then create or update one
matching thread heartbeat, unless the user requested a standalone task.
Verify registration and save the monitor ID before yielding. If registration
fails, preserve the running job and report or repair the handoff without
relaunching it. Never claim future checks exist without tool confirmation.

## Adapt each scheduled run

The saved prompt must identify the overall outcome, state location, remaining
work, authority/compute limits, check/repair rules, and stopping conditions.
Each run first reads state and live goal/monitor status. If a Goal is active,
disable this workflow's monitor and verify that change before returning.
Otherwise inspect only remaining work using scheduler/exit evidence and outputs;
a missing process or old log is not proof of success.

Reconcile the active set after every meaningful change. For example, monitoring
A/B/C becomes B/C once A is verified complete; keep A's receipt in state but
remove it from recurring checks. Activate a dependent job only when its
prerequisites pass and its launch is already authorized. Do not add experiments
or expand the overall outcome. Update the existing automation prompt and, when
needed, its interval through the automation tool; editing a note alone does not
update the scheduled task. Verify the saved update, preserving unrelated fields
and notification preferences. A failed update remains pending for retry; stale
or queued runs must consult current state before acting.

Choose intervals from expected duration, observed progress, and failure risk,
within user constraints. Check more closely after a repair or near a meaningful
milestone, less often during stable waiting. Stay quiet on unchanged state;
notify on meaningful completion, failure, or required input, not every poll.

For a small, understood bug, inspect its cause, apply an authorized reversible
fix, run affected checks, and resume only the failed job when retry authority
and compute budget permit. Preserve checkpoints, prior evidence, and unaffected
runs; do not mutate code in use by other experiments. Record the repair and
refresh job identity/monitor scope. Do not retry an unchanged failing approach
indefinitely: repeated failures, uncertain fixes, architecture/protocol changes,
or substantial optimization require core work, not a growing polling script.

## Return to core work or finish

Before escalation, save the evidence and pending next action, disable the
matching monitor, and verify it is disabled. Only then create the bounded repair
or optimization Goal, within existing authority. If shutdown fails, do not
create a Goal; retry cleanup and disclose the failure. If goal creation fails
after shutdown, recover in the current turn or report the precise resumption
action; do not pretend the disabled monitor will wake again.

Key transitions and repairs by job identity and reconcile live state so repeated
or interrupted runs do not duplicate goals, submissions, or completed actions.
After core acceptance, refresh the monitoring plan and repeat the handoff.
If all work meets overall acceptance, disable and verify the matching monitor,
record final evidence, and finish without manufacturing another Goal. An empty
active set alone is not completion when final validation or analysis remains.
