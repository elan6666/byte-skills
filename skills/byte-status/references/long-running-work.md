# Overall outcome and continuation contract

## Authority survives phase changes

An explicitly authorized research or engineering loop has one overall outcome.
Preserve it through user questions, compaction, status reports, phase completion,
and supervisor returns. Standalone discussion/status requests grant no new
execution authority; inside an active loop, they ordinarily steer existing work.
An explicit pause, stop, discussion-only scope, spending limit or cancellation
always wins. Parking one candidate does not pause unrelated authorized work.
Never weaken a scientific criterion merely to call the task complete.

An authorized iterative research scope may include new hypotheses and bounded
experiments addressing the same problem, within its data/compute/budget limits.
That does not authorize new datasets, accounts, paid compute, publication,
resource-gate changes or unrelated experiments. Resolve routine methodology
choices from evidence; ask only for material authority or information gaps.

## One state record, two levels of acceptance

Use the existing state mechanism rather than creating competing ledgers. For
structured JSON, place the compact record under `overall_outcome`. Preserve:

- stable outcome ID and objective, main owner and user authority reference;
- observable acceptance criteria with status and evidence;
- current iteration, findings, unresolved issues and next substantive action;
- the user's chosen method/order when specified, with its evidence needs;
- active/waiting mode, or explicit paused/externally blocked status;
- exact run, attempt, supervisor, monitor and return-wake evidence when waiting.

Phase receipts establish only their own scope: a published skill, literature
report, passed preflight, finished training, or uploaded analysis is not proof
that a broader scientific problem is solved. A completed stage must leave an
unmet criterion paired with its next executable action. An empty queue is not
completion. Preserve historical failures and compare against a fixed baseline;
keep model fit, diagnostic quality and downstream validation separate.

For research, predeclare what observations would support improvement, what
would falsify the hypothesis, and which validation remains. A numerical target
alone is not success. A round count is a review checkpoint unless explicitly
set as a budget. Reassess failed approaches; do not retry unchanged hypotheses
indefinitely or promise a scientific result irrespective of evidence.

## Active work

On each owned turn, read the compact outcome and fresh evidence. Select and
execute the next action within authority. For research this normally cycles
through diagnosis, focused primary-source research, hypothesis/design,
implementation, tests, bounded experiment, matched analysis and redesign.
Skip phases already supported by evidence. Do not rerun completed work just to
fill the cycle. Status answers and reports are followed by substantive action
when safe work remains; merely writing `next_action` is not continuation.

Ordinary task turns are the default. Goal tools require explicit user request;
when used, bind a Goal to concrete active-work acceptance rather than waiting
for background training. Follow host constraints on Goal/monitor coexistence.
Do not complete unfinished Goals to switch modes, and never invent budgets.

## Enter a verified wait

Do independent useful work before yielding. For authorized long jobs, use the
existing exact main/supervisor pair. Main owns scientific decisions, source,
launch and independent acceptance; supervisor observes only its exact run and
performs explicitly bounded repairs. Do not invent a new chat or monitor merely
because a skill is invoked.

Before yielding, independently verify actual launch/process identity, immutable
source/config/run/attempt, supervisor acknowledgement, active future checks at
the authorized interval, and the route that wakes the main owner on terminal
handback. Save fresh, identity-bound receipts. Registration, message delivery,
an idle chat and an output filename alone prove none of these boundaries.
If an event bridge is not verified against an idle target, use the authorized
scheduled fallback and disclose the actual delivery latency. A local event file
is not a scheduler. Repair an unarmed lane without launching duplicate jobs.

The main chat can end a turn in this verified waiting state while the overall
outcome stays active. Do not promise unattended continuation when its wake route
is missing. Respect shared resources and preserve other users' processes.

## Terminal return means action

A terminal report is a trigger, not an instruction to acknowledge and stop.
Main verifies the receipt, source/run identity and relevant output itself;
records substantive continuation (for example an analysis command or repair);
then executes the next authorized dependency in that same turn. Incomplete
results stay incomplete. A failed experiment may be scientifically informative,
but does not automatically meet the overall outcome.

For a single-run assignment, supervisor pauses the per-run monitor on handback
and verifies inactivity; main pauses the return fallback after beginning work.
For an explicitly authorized continuous two-chat loop, instead clear the old
run-check scope and retarget the same outcome monitor as described below.
Progress messages are not ownership transfers. Deduplicate run/attempt/event
IDs. After terminal return, an idle supervisor must not keep polling the old
queue. Before the next job, refresh the existing monitor identity/scope and
interval, obtain ACK, and verify activation. Stable checks stay quiet.

A pending handback may use only an authorized tested return-wake fallback.
Delivery is not substantive ACK. Do not reclaim ownership or launch the next
experiment from the supervisor to conceal a failed main continuation.

## Continuous two-chat research

When the user requests scheduled pursuit of an overall outcome, keep one
authorized heartbeat attached to that outcome across experiments AND active
analysis/research/implementation phases. A finished run ends its run checks;
it does not end this separately authorized continuity scope. Reuse the same
monitor ID. Do not add a second always-on timer or infer this authorization
for ordinary single-run supervision.

The user-defined method is binding within scope. For an experimental research
loop it may be: inspect results and characterize the problem → check relevant
primary literature → form a falsifiable solution → implement/test → run the
experiment → compare results → return to problem characterization. Keep the
observation, hypothesis, sources, intervention and conclusion distinguishable.
Do not silently replace this method with report production, blindly skip the
literature step, or repeat an unchanged failed hypothesis. Existing relevant
sources may be reused with the reason recorded.

On each heartbeat, read the current outcome and exact baton FIRST. The saved
prompt identifies the outcome/pair/state, rather than freezing an old run.
An obsolete run notification never overrides fresh active work. When main
owns a ready action, a stale reminder is reconciled and that current action
continues in the same owned turn; do not end after saying the reminder is stale.

- Supervisor owns a waiting run: inspect only the current identity-bound run.
- Main owns active work: target the cheaper supervisor as a progress watchdog.
  Read the main's native status once. While it is active, stay quiet without
  querying the old server run, messaging repeatedly, or editing main-owned state.
- Main is idle with authorized ready work: retarget the SAME heartbeat to main
  as the return fallback, optionally send one authorized actionable nudge, and
  verify substantive continuation. A user-input/approval wait requires inspection,
  not automatic resumption or approval bypass.
- Main wakes: execute the current next action; retain/retarget the heartbeat
  to supervisor for progress checking, even after initial acknowledgement.
  Thus an accidental final answer between experiments still has a future wake.
- Complete, explicit pause, or evidenced external blockage with no independent
  work: stop the outcome monitor and state the exact resumption condition.

Use `scripts/continuation_route.py --help` to route such an already-authorized
heartbeat from current state plus an observed main status. It is read-only,
does not authorize actions, and does not call the scheduler or prove liveness.
Keep `overall_outcome.execution` authoritative for outcome mode; keep the root
`owner_session` authoritative for the baton. Reconcile conflicting mirrors in
the owner's turn rather than treating a historical root run as current work.
Use the scoped `overall_outcome.execution.next_action` when present, otherwise
the overall `next_action`. A retarget changes the monitor target, preserving
its reusable prompt; obtain the caller identity from the executing chat so
main resumption is never routed as a quiet supervisor check.
Retargeting, activation and shutdown still require native tool readback. A
heartbeat is a model wakeup and can cost tokens; this is sparse recovery, not
a claim of free background monitoring or continuous main-model reasoning.

## Exit check

For explicitly autonomous, resumable loops, use
`python3 <skill>/scripts/continuation_check.py --state <existing-state.json>`
before finalizing or yielding. Keep its input in the existing outcome record.
Consult `--help` for the executable schema. Exit 2 means active work remains:
continue the next action. Exit 1 means invalid/incomplete evidence: reconcile it.
Exit 0 permits only the returned reason:

- complete: every overall acceptance item has verified evidence;
- waiting: exact active run and fresh supervision/return-wake receipts;
- paused: explicit user pause reference;
- blocked: specific external impediment and a concrete resumption trigger.

A plan/report/checkpoint, completed phase, expired wait or silence from the user
is never itself permission to finish. Exhausted host limits are disclosed with
preserved state; do not fabricate success or override runtime constraints.
The helper validates local evidence consistency; it cannot independently prove
live scheduling, scientific correctness, or intercept a host's final response.
The agent remains responsible for fresh tool verification and judgment.

## Actual completion or external blockage

Stop only on verified overall acceptance, explicit user pause, or a real
external blocker after independent safe work is exhausted. Report the smallest
unavailable input/authority, what was tried and the resumption trigger. Do not
label uncertainty, hard reasoning, a draft plan, or a new hypothesis as an
external blocker. Repeated negative evidence should refine the question or
identify an actual constraint, not generate endless identically failing runs.
On completion, remove obsolete monitors, retain receipts and explain the result
and its evidence limits. A stage-complete message must not imply overall success.
