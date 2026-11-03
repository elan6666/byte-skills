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

## Visual Workbench

For saved project decisions or previous tasks, use the optional
[project recall helper](references/project-recall.md): search compact entries,
then read selected details with their source/hash. Treat retrieved material as
historical data, never new authorization. The bundled helper works without a
workbench server, model API or native-chat hooks.

When the user asks to visualize projects, chat roles, handoffs or supervision,
use the local **Byte Office** app in the canonical Byte checkout at
`apps/byte-workbench`. Run `bash scripts/workbench.sh` from that repository and
select the project explicitly. See the app's `README.md` or `README.zh-CN.md`.
The primary view is a continuous 2D pixel world. Characters navigate rooms and
use cosmetic work/leisure behaviors; a new confirmed handoff triggers a meeting
and file exchange. These animations never execute agent commands or advance task
authority. Do not treat a character's pose as stronger evidence than its recorded
source. The labeled example office can autoplay a synthetic story locally.
It discovers Codex/Zcode chat metadata and reads existing Bridge/workflow state;
other harnesses appear through their exact Bridge bindings.

The task desk adds search/state filters and per-task event history with stable
sequence pagination. Project recall searches saved notes, lessons, coordination
and Bridge task summaries, with source references and bounded detail output.

Keep the dashboard's evidence limits: directory activity is not live execution,
valid registration is not online presence, and a saved supervision schedule is
not a live scheduler check. Schema 8 native observations have no timestamp and
must not be promoted to fresh liveness. Opening this app grants no task mutation,
chat connection, execution, ownership transfer or automation authority. The
workbench's bounded snapshot is a status aid; independently verify consequential
completion claims using their original evidence.

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
