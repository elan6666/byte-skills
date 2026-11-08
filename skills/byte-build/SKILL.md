---
name: byte-build
description: "Implement a requested deliverable within an existing Byte workflow or execution plan."
---

# Byte Build

When `.byte-os/workboard.json` is enabled, keep the existing
[task plan](../byte-plan/references/workboard.md) current: mark owned work in
progress, attach real evidence to finished steps, and preserve blocked/review
states. Do not claim completion from an edited checklist alone.

Implement the user's requested outcome with the smallest sound change set.

## Execution

Work from the relevant files, instructions, current behavior, and active lessons.
Identify the intended result and useful verification, make focused changes while
preserving unrelated work, and repair important in-scope failures. Choose the
sequence and depth that fit the task rather than treating these as fixed stages.

Use an existing plan when helpful, but do not require Byte OS plans, OKRs,
harness files, waves, or role assignments before working. Adjust a stale plan
when live evidence shows a better route.

Prefer simple implementations and narrow diffs. Broaden the change only when the
goal or discovered architecture genuinely requires it. Avoid opportunistic
refactors that do not improve the requested result.

Use persistent logs only for long-running, risky, or resumable work. When state is
useful, record concise facts and verification rather than maintaining several
parallel ledgers.

Stage completion means the requested change is present and relevant verification
has passed. Disclose outstanding verification as incomplete. Within an authorized
iterative task, implementation acceptance is not overall acceptance: proceed to
the next test, launch, analysis, or repair when its prerequisites pass.
Use the shared [evidence contract](references/evidence-contract.md) for material
completion claims. When a task is resumable or handed across harnesses, record
the Git range, commands, results, artifacts, and acceptance evidence in one
compact receipt.

When user correction or direct evidence confirms a reusable mistake, create or
update one deduplicated `.byte-os/LESSONS.md` entry with the correction, evidence,
and prevention rule. Exclude routine debugging, trivial slips, and sensitive data.

## Adaptive execution

For an authorized Goal-plus-monitor workflow, use
[adaptive execution](references/long-running-work.md). Core implementation and hard diagnosis use ordinary turns unless the user
explicitly requests a bounded Goal. Routine checks and small understood repairs
can run during authorized monitoring. Escalate repeated or uncertain failures after disabling
the monitor. Preserve unaffected runs and existing compute limits.


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
