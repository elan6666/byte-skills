# Evidence contract

Use evidence in proportion to the claim and the cost of being wrong. Do not
create a receipt for a trivial conversational answer. Use one when work is
implemented, reviewed, resumed, handed across harnesses, or run unattended.

## Match claims to proof

- Artifact exists: inspect the file, diff, or generated output.
- Tests pass: record the fresh command, exit status, and relevant output or log.
- Runtime behavior works: exercise the behavior in the real runtime or disclose
  why that check is unavailable.
- Requirements are satisfied: map each material acceptance criterion to evidence;
  tests alone do not prove product or scope completeness.
- External facts are current: cite the authoritative source and observation date.
- A job or experiment completed: record run identity, configuration identity,
  process or scheduler identity, logs, outputs, and terminal status.
- A handoff is ready: identify the upstream session, Git base and head, verified
  results, unresolved limits, and the single next action.

Prefer fresh evidence from the current checkout and runtime. Treat summaries,
agent reports, plans, and status files as leads to reconcile, not proof by
themselves. Never upgrade unknown, missing, stale, or partial evidence to success.

## Compact receipts

Use the project's existing state mechanism when possible. For a resumable or
cross-harness task, keep one compact receipt containing only:

- task and native session identity;
- base and head Git commits when code changed;
- commands, exit status, and linked logs;
- produced artifacts or run identities;
- acceptance status with evidence;
- material rulings, deviations, and remaining limits.

Receipts supplement live verification; they do not replace it. Keep detailed
logs in their native location and link them instead of copying them into state.
