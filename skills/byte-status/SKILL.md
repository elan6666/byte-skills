---
name: byte-status
description: "Inspect progress, blockers, and remaining work in a Byte project."
---

# Byte Status

For connected cross-chat tasks, use `byte-bridge` status and the existing
project state. A status request does not connect a new chat, delegate work,
create a timer or transfer ownership.

Report status from live evidence, not from narrative claims alone.

Apply the shared [evidence contract](references/evidence-contract.md) when
reconciling completion, runtime, experiment, and handoff claims. A receipt is a
useful index to evidence, but live state remains authoritative when it can drift.

Inspect the relevant files, version control state, tests, processes, outputs, and
Byte OS notes in proportion to the question. Treat stale or conflicting status
documents as evidence to reconcile, not as the source of truth.

Read `.byte-os/LESSONS.md` when present. Report an active lesson only when it is
relevant to current risk, a repeated mistake, or the next action; do not make the
status report a full notebook dump.

Summarize:

- what is demonstrably complete;
- what is in progress or uncertain;
- blockers and their exact cause;
- the highest-value next action.

Use counts or percentages only when the underlying units are meaningful. Mention
parked or future ideas separately from active scope. A standalone status-only
request grants no mutation authority. During an already authorized autonomous
loop, answer the status question briefly and resume the next owned action;
additional "continue" wording is unnecessary. An explicit status-only or pause
instruction overrides that default.

Interpret legacy Byte OS artifacts as ordinary evidence; their recorded stage
does not override explicit intent or live behavior.

## Scheduled Work

For an existing long-running handoff, inspect the job identity, live scheduler
or process state, terminal receipt, expected outputs, and monitor status. Report
phase-goal completion separately from job success and overall completion.
Compare the saved monitor scope with remaining work and report stale targets or
intervals. An ACTIVE monitor with no matching owned run or a terminal run that
has been handed back is a cleanup defect, not healthy supervision; report it
and the exact monitor ID. A standalone status request does not authorize automation changes. Existing
continuation authority may require cleaning up a terminal run's monitor and
performing its next dependency. A missing process or stale log is not proof of
success. Status alone does not create Goal or monitor authority; continuation follows
[the long-running workflow](references/long-running-work.md).

## Source And Updates

Canonical repository: [elan6666/byte-skills](https://github.com/elan6666/byte-skills). Use its current `main` branch when checking for or installing updates.
