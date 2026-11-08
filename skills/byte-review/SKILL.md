---
name: byte-review
description: "Review a Byte project, plan, or deliverable for material issues and readiness."
---

# Byte Review

Review the actual artifact and evidence. Choose review dimensions based on what
could realistically make the result wrong, harmful, confusing, or incomplete.

## Method

- Establish the intended behavior and scope.
- Check relevant active lessons for repeated mistakes.
- Inspect relevant code, files, runtime behavior, tests, or sources.
- Prioritize concrete findings by impact and confidence.
- Distinguish confirmed defects from risks, preferences, and missing evidence.
- Recommend changes that materially improve the outcome.

Use the shared [evidence contract](references/evidence-contract.md). Re-check
reviewer or agent claims against the actual artifact before accepting them.
Classify important feedback as a confirmed defect, risk, preference, or missing
evidence; record a short ruling only when a later owner needs the decision.

Possible lenses include product fit, UX, correctness, architecture,
maintainability, security, privacy, performance, testing, market evidence, and
delivery readiness. Do not simulate a meeting or force every role to comment.

For code review, lead with actionable findings tied to precise locations. For a
product review, lead with the decision or highest-impact gap. If there are no
material findings, say so and note meaningful verification limits.

Write a review artifact only when it will be tracked or used for later iteration.
Do not require a verdict schema, a fixed number of findings, or a Byte OS state
transition.

When review evidence confirms a reusable mistake, false completion claim, or
requirement misunderstanding, update the matching `.byte-os/LESSONS.md` entry
with evidence and a prevention rule, not blame.


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
