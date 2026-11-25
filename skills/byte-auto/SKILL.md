---
name: byte-auto
description: "Use the Byte workflow for end-to-end completion of a multi-stage project request."
---

Before each task, check [native harness capabilities](../byte-do/references/native-capabilities.md) for the requested work.
Prefer available, authorized native tools before adding Byte fallbacks.

For actionable work, run [Byte entry activation](../byte-do/SKILL.md#activate-the-project-at-entry)
once per turn. Use the current project and exact native session. If this skill
was selected by Byte Do after activation, reuse its registration.


# Byte Auto

For projects with `.byte-os/workboard.json`, maintain the
[task plan and step progress](../byte-plan/references/workboard.md) as work
advances. Refine the same task ID and keep overall acceptance distinct from
recorded step completion. Only explicitly registered chats enter the office;
collaboration display records never grant Bridge execution authority.

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
turns, questions, short tasks, compaction, phase receipts, and supervisor
handbacks. Apply the [follow-up scope rules](references/long-running-work.md#handle-short-requests-during-a-long-term-outcome)
before changing the outcome or its monitor. Finish or answer the short request,
re-read current ownership and evidence, then start the next ready, authorized
action. If the host interrupts the turn, the existing authorized wake route
resumes from the persisted action and outstanding run or handoff identity.

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

An explicit request to pursue a goal until acceptance selects the
[goal loop](../byte-workflow/references/format.md#goal-loop). Use the native Goal
lifecycle when available, otherwise resume the existing Byte outcome or use the
single-session workflow template for a new outcome. If the host exposes a
native stop hook, attach Byte's goal guard and verify it before relying on
automatic continuation.

If the outcome is managed by `byte-workflow/v1`, load its pinned project
definition and use `$byte-workflow` revision-checked commands for transitions.
Execute the selected action here; do not hand-edit or replace the engine's
step, acceptance, role bindings or event history to end a phase.

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
7. **Self-evolve on friction**: When hitting a stall, permission block, or quota issue, fix the route directly (e.g., native tools, `zero_token_loop.py`, `.byte-os/server-job-requests/`) and record a brief lesson only when it prevents future errors.

**No Early Exit**: You have full autonomy over how to solve the problem; just do not stop to ask *"Should I proceed?"* while overall acceptance is unmet and an authorized action (or 0-token wait) remains.

Do not use a fixed iteration count. A small task may need one pass; a difficult
task may need several. If a pass misses acceptance, inspect the first failure,
identify a testable cause and choose a materially different next step. Run the
validation command and read its exit status and output before claiming success.
A completed stage or plan sends you back to overall acceptance.

Research is optional unless current external facts affect the result. A written
plan is optional unless it reduces coordination or execution risk. Product specs,
OKRs, role analyses, harnesses, and review documents are optional tools, not gates.

## Choose how to wait

Use the [native capability check](../byte-do/references/native-capabilities.md).
Choose by what the job needs and whether the current turn can stay attached.

- Run bounded tests and diagnostics with the native command tool. Use an
  authorized subagent for independent work that benefits from delegation.
  Process waiting alone does not require a second agent.
- For an ongoing job, attach the native handle or Byte's receipt watcher.
  Record the exact run identity and finish independent work while it runs.
  Model work resumes on a meaningful result or an actionable failure.
- If the current turn must end, verify the route that returns results to it.
  Reuse an authorized event route, existing-chat schedule, or exact
  supervisor handoff. For a specific job, keep ownership in the current chat
  when the host supports that watch. Create a schedule only for explicitly
  requested scheduled work. Read back its actual target and stop condition.
- For an explicitly requested continuous two-chat loop, retain one authorized
  outcome monitor and retarget it when ownership returns. Clear stale run
  checks and keep routine unchanged checks quiet. Follow the
  [state contract](references/long-running-work.md).

For cross-session cooperation, preserve the project's required transport and
any active handoff. Prefer authorized native delivery where it satisfies the
task. For a Bridge task follow [$byte-bridge](../byte-bridge/SKILL.md) for
activation, delivery, return and recovery. Preserve native
permissions and the exact scope/lifetime of any already-authorized worker mode.
Byte remains the sole work authority; SessionBridge handles delivery and
supervision. A subagent doing a bounded read or check does not acquire its own relay baton. Never
create a Goal, new task, automation, or paid job solely because this skill was
invoked; the user or environment must authorize that operation.
For a Bridge main-launch / supervisor-check / main-resume workflow, verify
the event or periodic check and the return route. `byte-design-supervise` remains
a compatible training preset, not a separate transport.

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


## Durable agent roles and collaboration

When the project uses agent working documents, follow the shared
[agent collaboration contract](../byte-plan/references/agent-collaboration.md).
On joining, resuming or receiving a task, read your explicitly assigned current
role document and task contract. Main may create/customize these documents;
users can edit them directly. Keep task IDs across dispatch and recovery, return
actual evidence for main review, and continue the next authorized action after
acceptance. Use existing workboard/Bridge/workflow state; do not require agent
files for ordinary work or claim universal app hooks or native permissions.

## Source And Updates

Canonical repository: [elan6666/byte-skills](https://github.com/elan6666/byte-skills). Use its current `main` branch when checking for or installing updates.
