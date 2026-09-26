---
name: byte-build
description: "Implement a requested deliverable within an existing Byte workflow or execution plan."
---

# Byte Build

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

Completion means the requested change is present and relevant verification has
passed, or any remaining verification limit is clearly disclosed.
Use the shared [evidence contract](references/evidence-contract.md) for material
completion claims. When a task is resumable or handed across harnesses, record
the Git range, commands, results, artifacts, and acceptance evidence in one
compact receipt.

When user correction or direct evidence confirms a reusable mistake, create or
update one deduplicated `.byte-os/LESSONS.md` entry with the correction, evidence,
and prevention rule. Exclude routine debugging, trivial slips, and sensitive data.

## Adaptive execution

For an authorized Goal-plus-monitor workflow, use
[adaptive execution](references/long-running-work.md). Core implementation and
hard diagnosis use bounded Goals; routine checks and small understood repairs
can run during monitoring. Escalate repeated or uncertain failures after disabling
the monitor. Preserve unaffected runs and existing compute limits.

## Source And Updates

Canonical repository: [elan6666/byte-skills](https://github.com/elan6666/byte-skills). Use its current `main` branch when checking for or installing updates.
