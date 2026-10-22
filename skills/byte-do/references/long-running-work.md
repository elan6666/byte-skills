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

Supervisor pauses the per-run monitor on handback and verifies inactivity;
main pauses the return fallback after acknowledging and beginning owned work.
Progress messages are not ownership transfers. Deduplicate run/attempt/event
IDs. After terminal return, an idle supervisor must not keep polling the old
queue. Before the next job, refresh the existing monitor identity/scope and
interval, obtain ACK, and verify activation. Stable checks stay quiet.

A pending handback may use only an authorized tested return-wake fallback.
Delivery is not substantive ACK. Do not reclaim ownership or launch the next
experiment from the supervisor to conceal a failed main continuation.

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
