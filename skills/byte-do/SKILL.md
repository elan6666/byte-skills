---
name: byte-do
description: Use as the default entry for projects configured to use Byte, or when asked to choose and execute a Byte workflow.
---

## Check native capabilities at entry

After reading project guidance, check the current conversation's tool inventory
for the requested operations. Prefer available, authorized native features and
use Byte for gaps, evidence, and coordination. See the
[native capability check](references/native-capabilities.md).

## Activate the project at entry

After reading project guidance, use the bundled activation for actionable
work in a project that has opted into the Byte Workbench. Run it from the task's actual checkout or
worktree so the registered project root can be resolved correctly.

```bash
node "$HOME/.agents/skills/byte-do/scripts/activate.mjs"
```

Use the installed path for this client. Add `--project` only for a verified
Workbench root of the same repository. The helper uses the native Codex
thread ID. For another harness, supply its exact observed
`--session harness:native-id`. If an active workboard task already records
the verified participants, pass its `--task-id` to register those sessions
alongside the current one. Repeat activation safely when a real participant
joins. Existing project registration and task roles are the opt-in boundary
for automatic display. For an explicitly read-only task, read evidence
without changing display state.

Apply the useful capability as soon as the task qualifies. Persist actionable
steps in an enabled workboard. On a verified long run, use the
native wait or event route when it covers the job. Use Byte's
[registration and watcher](../byte-workflow/references/zero-token-loop.md#register-and-watch-a-real-run)
for structured run evidence and monitoring gaps. Reuse the current owner on
completion, stall, or failure, independently verify the evidence, then execute
the next authorized step. Keep paused workflows paused.


# Byte Do

## Maintain project guidance

Apply the repository's native guidance and any explicitly assigned role. Read
only the instructions relevant to this task. Put lasting project conventions
in the existing `AGENTS.md` or role document when the user asks for a durable
change or it is necessary for the deliverable. A routine skill invocation
does not install Byte as a project rule.

## Operating Principles

- Follow explicit user intent, scope, and stopping instructions first.
- Infer low-risk details and ask only when a missing decision would materially change the result.
- Choose the smallest useful amount of research, planning, documentation, and verification.
- Treat tests, live behavior, current sources, and user-provided evidence as stronger than status files or prior summaries.
- Preserve user work and make consequential or irreversible actions explicit.
- State assumptions and remaining limits honestly.
- Learn from confirmed mistakes and corrected requirement misunderstandings.
- Prefer authorized native subagents, `swarm`, or `run_workflow` whenever parallel or isolated work helps; reserve `byte-bridge` for cross-app/cross-chat coordination.

## Core Loop Principles (Freedom with Discipline)

You have full freedom to choose the best reasoning path, tools, architecture, and experiments. Only keep these 4 non-negotiables:

1. **Native harness first**: Check your current tool inventory (`references/native-capabilities.md`) and prefer native features (subagents, `swarm`, `run_workflow`, `Reactive Wakeup`, native Goal/schedule) before adding Byte scripts.
2. **Don't stop until the goal is met**: While acceptance is unmet and an authorized next step exists, keep going — never stop mid-goal to ask *"Should I continue?"* or treat a plan/report as completion.
3. **Zero-token waiting**: Never burn LLM tokens polling a running job (`ps`/`tail` crons). Use attached `Reactive Wakeup` or `zero_token_loop.py` (`wait-run` / `wait-signal` / `tick`).
4. **Self-evolve on friction**: If you hit a stall, permission block, or low-quota subagent, fix the workflow or pivot to an authorized route (e.g., `ag_say.py`, `.byte-os/server-job-requests/`) instead of stalling.

## Research assignments

Give an assigned researcher the shared objective, relevant facts and existing authority.
The researcher chooses the question and method, follows evidence within one batch,
and reports when findings change a judgment or resource decision. Coordinate a
dependency when it arises. Reuse the original record for routine progress.

For work across chats, keep details and evidence in shared project documents. Send a short result or request with the task identity and document reference.

## Capability Choice

Honor an explicit `$byte-*` selection. Otherwise use only the capabilities that
materially help the requested result: discussion, ideation, research, planning,
implementation, review, autonomous completion, status inspection, or parking a
future item.

Act directly when ordinary reasoning is enough. Do not load another Byte skill
merely because it exists, announce an internal route by default, or force named
stages. Combine capabilities naturally when the outcome genuinely needs them.

For cross-chat collaboration, first check the project's routing and the current
harness's verified native delivery. Use [$byte-bridge](../byte-bridge/SKILL.md)
when the project or user specifies it, an existing Bridge task owns the handoff,
or compatible native delivery is unavailable. Keep Bridge connection, permission
repair and return on its own verified route. A one-time worker permission grant
stays local to that task.

For a reusable local workflow with custom steps, loops, acceptance and role
bindings, use [$byte-workflow](../byte-workflow/SKILL.md). Its pinned definition
and engine-managed state take precedence over ad hoc phase descriptions.
When the user explicitly requests persistent goal pursuit, enter the
[goal loop](../byte-workflow/references/format.md#goal-loop). Prefer the current
harness's native Goal. The Byte workflow supplies a single-session evidence
loop when native Goals are unavailable. Execute the next eligible action while
acceptance is unmet, including after each progress report or handback.

Use native chat and worktree views for Codex activity. Open the bundled
[Byte Workbench](../../apps/byte-workbench/README.md) when the user needs the
opted-in project board, cross-harness handoffs, or external job evidence.

## State

`.byte-os/` is optional. Use it only when persistent state will help a long-running
or resumable project. Prefer a small `STATE.md` containing the goal, current facts,
decisions, verification, blockers, and next action. Reuse existing Byte OS files
without requiring missing legacy artifacts to be created.

Interpret older Byte OS artifacts as ordinary project evidence. Live repository
and runtime evidence remains authoritative.

For previous Codex tasks, prefer available native history tools. Use
[project recall](../byte-status/references/project-recall.md) for decisions
and evidence saved in Byte state. Read only relevant records and verify
mutable claims against their current source.

## Lessons Notebook

For a project with `.byte-os/workboard.json`, automatically maintain its concise
[task plan and progress](../byte-plan/references/workboard.md) when an actionable
task is discussed, designed or executed. Reuse the task ID, record solution,
steps and acceptance, and update evidence-backed step states after work. Register the current session and verified task participants through entry activation. Tracking is not authorization
to execute a discussion-only proposal or delegate across chats.

Before related work, read active entries in `.byte-os/LESSONS.md` when it exists
and apply relevant prevention rules.

After the user corrects a requirement misunderstanding, or direct evidence
confirms a meaningful mistake, create or update `.byte-os/LESSONS.md`. Record a
lesson only when it is likely to prevent future error. Do not record routine
exploration failures, trivial slips, vague self-criticism, duplicates, secrets,
or sensitive user data.

Use a concise entry:

```markdown
## <date> — <lesson title>
- Context:
- Mistake or misunderstanding:
- Correct understanding and evidence:
- Prevention rule:
- Status: active
```

If the same mistake recurs, update the existing entry with recurrence evidence
instead of creating another. Mark a lesson `superseded` when later evidence
invalidates it. This notebook is the one Byte OS artifact that may be created on
demand even when no other persistent state is needed, unless the user asks for
discussion only or no file changes.

## Response

Lead with the result. Mention routing, artifacts, or next commands only when they
help the user understand or continue the work. Do not emit a fixed status template.
For material implementation, review, runtime, experiment, or handoff claims,
apply the shared [evidence contract](references/evidence-contract.md).

## Adaptive execution

For supervised or scheduled work, follow the [continuation guide](references/long-running-work.md).
Use [Byte Bridge](../byte-bridge/SKILL.md) when selected for cross-chat delivery.
Preserve authorized monitoring scope, accepted handoffs, and the user's stop
condition. Create a Goal or schedule only on request.

## Outcome continuity

When a project has an authorized long-term outcome, recover its current owner,
acceptance criteria and next action from the existing state before classifying
a follow-up. A status request, correction or temporary priority normally applies
to the current step or short task. A pause or change to the overall outcome
requires user intent that applies to that outcome. Handle the follow-up, then
start the next ready, authorized action for the same outcome in the same turn.
Keep an already-authorized wake route active if the chat must yield. Follow the
[shared continuation contract](references/long-running-work.md). Ordinary turns
remain the default. Goals require explicit user request.


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
