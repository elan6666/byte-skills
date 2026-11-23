---
name: byte-workflow
description: Use when defining or running a saved workflow with roles and acceptance.
---

# Byte Workflow

At each invocation, read the project and assigned role guidance first. Follow [Byte Do](../byte-do/SKILL.md#maintain-project-guidance) to keep the guidance and related documents aligned with the user's decisions.

## When to use

Use when work needs a reusable process or a durable outcome that can continue across turns or chats.

## How work proceeds

Use the project's pinned workflow, or define the objective, roles, acceptance, and transitions needed for a new one. At each turn, read current status and guidance, then carry out the next action using a method suited to the task. In a team, the step owner frames and accepts the work; assigned specialists produce their deliverables. Keep original assignment identities through return and recovery.

Keep one current objective per project. Record local directions as guidance; use an objective revision for a formal change to the objective or final acceptance. Treat milestones as intermediate evidence and attach each native Goal to its original delegated task. Record completed actions with evidence and the current revision. Use the [format and commands](references/format.md) for the corresponding operations.

Use the [continuation guide](references/long-running-work.md) for supervised runs, waiting, and resumption. A valid return can resume the owner, who checks the evidence and executes the next action.

Prefer the [zero-token loop engine](references/zero-token-loop.md) (`scripts/zero_token_loop.py`) over periodic LLM polling heartbeats: combine local file events (`WatchPaths`) with anti-stall idle checks (`StartInterval`), use `wait-run` for 0-token training/job supervision, use `wait-signal` for self-looping clients without an external Bridge wake adapter, and run periodic self-reflection (`.byte-os/coordination/workflow-retrospective.md`) to iteratively refine the workflow.

For open-ended research, make one batch the unit of ownership and handoff.
Let the researcher choose and revisit activities inside it. Record evidence
at a decision or a real dependency. Keep formal evaluation and permissions
in the project protocol. Existing pinned projects retain their own definition.

## Acceptance

Advance when the current step's required evidence is verified. Mark the outcome complete when its current overall criteria are met and the configured workflow reaches completion. Verify delivery, real execution, and actual continuation when a handoff is part of the result.
