---
name: byte-auto
description: "Use the Byte workflow for end-to-end completion of a multi-stage project request."
---

# Byte Auto

Own the requested outcome end to end. Adapt the method to the task instead of
running every Byte skill or producing every Byte OS artifact.

## Outcome Contract

At the start, identify:

- the deliverable or observable result;
- important constraints and evidence already available;
- what completion can be verified now;
- actions that require new authority or user input.

Infer ordinary implementation details. Ask only when a missing choice is both
material and unsafe to infer.

## Preserve the overall outcome

For an explicitly authorized iterative task, retain the overall outcome across
turns, questions, compaction, phase receipts, and supervisor handbacks. A status
question or request to investigate another candidate normally steers that work;
it does not revoke execution authority. Honor explicit pause, cancellation, or
"discussion only" limits for their stated scope. Never infer a global pause from
a request to park one candidate. Resolve scope from the user's instructions,
not a stale state entry written by an earlier agent.

Persist one `overall_outcome` record in existing state: stable ID/objective,
authority and limits, acceptance criteria and evidence, current iteration,
execution mode, next action, and exact active handoff when present. Keep phase
acceptance separate. Do not lower acceptance, redefine the objective to
"produce a report", or mark a scientific problem solved to end the turn.
For open research, formulate observable evidence of improvement and remaining
uncertainty; a desired result is not guaranteed to be attainable. Failed
hypotheses call for diagnosis/redesign within scope, not fabricated success or
unbounded retries of the same approach.

## Adaptive Loop

Repeat as useful:

1. Inspect the current files, runtime, evidence, prior work, and relevant active lessons.
2. Decide the highest-value next action.
3. Research, plan, implement, or review only as needed.
4. Verify in proportion to risk.
5. Repair important failures and reassess completion.
6. If overall acceptance is unmet, start the next authorized substantive action
   in this turn. A proposal, report, upload, or recorded `next_action` alone is
   not execution. Within an authorized research loop, choose the next bounded
   experiment from evidence; do not require fresh permission merely because
   the hypothesis changed. Preserve data, budget, resource, and version limits.
7. Record a reusable lesson when evidence confirms a meaningful mistake or the
   user corrects a requirement misunderstanding.

Do not use a fixed iteration count. A small task may need one pass; a difficult
task may need several. Do not stop merely because a stage or plan finished.

Research is optional unless current external facts affect the result. A written
plan is optional unless it reduces coordination or execution risk. Product specs,
OKRs, role analyses, harnesses, and review documents are optional tools, not gates.

## Delegate waiting deliberately

Choose the lightest authorized supervision path by expected duration, whether
the main turn must end, and independence—not just by model price:

- For a bounded check expected to finish within about one hour and this active
  turn (for example, a test or short diagnostic), prefer a cheaper subagent
  when delegation is authorized. It may inspect the run while the main agent
  does independent work or waits for its result. Use subagents only when the
  user or environment permits delegation and the requested model is available.
  Do not repeatedly poll it from the expensive main model. A trivial quick
  check can still be done directly without creating an agent.
- For unattended training, ablations, or other jobs expected to take at least
  about one hour or outlive this turn,
  use an explicitly authorized independent supervisor task or scheduled
  monitor only after verifying a return wake path to the main task as well as
  the supervisor wake path. Record the run identity and evidence first, then
  let the main task end its turn. A subagent waiting inside the main turn is
  not a durable replacement for a later wakeup. If a short check unexpectedly
  becomes long, persist the run and reassess the route; do not silently turn
  the helper into a supervisor.
- Prefer a process or scheduler completion/failure event when a supported
  watcher can deliver it. Use a low-frequency heartbeat to detect a stale or
  missing watcher; terminal text and agent-idle status alone never prove a
  scientific run succeeded.
- When the user explicitly requests a continuous scheduled two-chat loop,
  retain one outcome-level heartbeat across analysis, literature review,
  implementation and experiments. The cheaper supervisor checks main progress
  while main owns active work; an idle main with ready work receives the same
  heartbeat as its return fallback. Clear old run checks on handback, but do
  not pause this authorized continuity monitor after the first ACK. Follow
  the continuous-loop section of the [state contract](references/long-running-work.md).
- Before scheduling a long check, validate the exact project directory, run
  identity, target conversation, model/tool availability, and notification
  route. Verify recurring registration and supervisor acknowledgement before
  ending the main turn; if either is missing, report supervision as unarmed.
  End per-run checks on handback. Pause a run-only monitor; retarget an explicitly
  authorized outcome monitor to current progress instead of leaving it on the
  completed run or disabling the whole research loop.
  Verify that the main task actually begins the returned work; message delivery
  or an empty task reply is not a continuation acknowledgement.
  If a script can determine "still running" without model judgment,
  let that script do the cheap check and wake an agent only for a meaningful
  failure, completion, or required decision. Coalesce repeated unchanged
  events instead of starting a fresh model turn for every tick.

For cross-session or cross-harness ownership, follow `$byte-relay`; a subagent
doing a bounded read or check does not acquire its own relay baton. Never
create a Goal, new task, automation, or paid job solely because this skill was
invoked; the user or environment must authorize that operation.
For the Codex-only pattern where the main chat launches and an independent chat
supervises with event plus periodic checks, use the independently callable
[$byte-design-supervise](../byte-design-supervise/SKILL.md) skill.

## Completion

Before yielding an unfinished iterative task, run the
[continuation check](scripts/continuation_check.py) against the existing state.
Its exit code 2 means continue substantive work; exit 1 means reconcile invalid
or insufficient evidence. Exit 0 permits only the stated disposition: verified
completion, authorized waiting, explicit user pause, or a concrete external
blocker. Follow the [state contract](references/long-running-work.md).
The check enforces evidence consistency when called; it cannot intercept the
host's final-response action or prove a real scheduler works by itself. Do not
claim a universal runtime interlock. Missing tooling is a verification limit,
not a reason to abandon otherwise safe work.


Finish only when the overall deliverable and its acceptance are verified.
A disclosed verification limit is still outstanding work, not evidence of success.
End a turn for supervised waiting or a genuine blocker without ending the overall
task, and report that distinction. Do not ask the user to say "continue" when
existing authority and the next safe action are sufficient.

Match completion claims to fresh proof using the shared
[evidence contract](references/evidence-contract.md). For resumable or
cross-harness work, link one compact task receipt instead of repeating logs in
the state document.

Pause on an explicit user pause, or when progress requires user input, credentials, payment, unavailable
external state, a consequential product decision, or authority for a destructive
or irreversible action. Report the exact blocker and the smallest next action.

## Persistent State

For long or resumable work, keep a concise `.byte-os/STATE.md` or update the
project's existing state mechanism. Record only what a future session needs:
overall outcome and acceptance, remaining work and evidence, current execution
mode, monitor identity when present, and next step. Link detailed logs; update
this record instead of creating a design document per phase.
Do not create a full Byte OS document set by default.

Use `.byte-os/LESSONS.md` as the automatic error notebook. Keep only confirmed,
reusable lessons with the mistake, corrected understanding or evidence, and a
specific prevention rule. Deduplicate recurring mistakes and never store secrets
or routine trial-and-error noise.

## Handoff

Lead with the delivered result. Summarize meaningful changes, verification, and
remaining limits. Do not end with a workflow command when safe in-scope work is
still unfinished.

## Adaptive execution

Define one overall outcome and acceptance criteria first. For the requested
adaptive long-running workflow, follow
[adaptive execution](references/long-running-work.md): ordinary task turns are
the default; use Goals only when explicitly requested. Scheduled checks can
supervise authorized long jobs. Keep remaining work and monitor identity in
one concise state document.

## Source And Updates

Canonical repository: [elan6666/byte-skills](https://github.com/elan6666/byte-skills). Use its current `main` branch when checking for or installing updates.
