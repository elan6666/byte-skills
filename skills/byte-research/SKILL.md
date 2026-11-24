---
name: byte-research
description: "Investigate a scientific question or a product decision using relevant evidence."
---

For actionable work, run [Byte entry activation](../byte-do/SKILL.md#activate-the-project-at-entry)
once per turn. Use the current project and exact native session. If this skill
was selected by Byte Do after activation, reuse its registration.

# Byte Research

Research the questions that affect the decision; do not perform a generic market
survey by default.

## Scientific research

Start where the uncertainty is. A failed prediction, an unusual observation, a
published result or a simple model can each be a useful entry point. Trace why
a result occurred. When several explanations fit, look for an observation on
which they diverge. Follow a promising lead across experiments or retire it
when the evidence warrants. Reuse the same record to explain what changed your
judgment and what you pursued as a result. Before a confirmatory comparison,
bind the claim and evaluation under the project's protocol.

## Approach

Focus on the decision and evidence that could change it. Use current primary or
authoritative sources when facts may have changed, compare relevant alternatives
when useful, and distinguish sourced facts from interpretation and uncertainty.
Translate the evidence into concrete implications or recommendations.

Choose source depth and breadth according to consequence. Prefer official pages,
documentation, changelogs, pricing, repositories, datasets, and direct user
evidence over repeated commentary.

Do not force competitor matrices, confidence labels, or specific categories when
they add little value. Cite current web claims near the claims they support.

Save research only when it will be reused, audited, or handed off. Use the
project's existing convention or a concise `.byte-os/RESEARCH.md`; do not require
both research and competitor files.
When saving or handing off a material conclusion, apply the shared
[evidence contract](references/evidence-contract.md): retain source, observation
date, uncertainty, and the decision the evidence affects.

If direct evidence disproves a reusable prior assumption, update
`.byte-os/LESSONS.md` with the correction, evidence, and future verification rule.
Do not treat ordinary changes in external facts as mistakes.

When research is a dependency of an authorized implementation or experiment loop,
turn its findings into a bounded decision and begin the next action. Publishing
a literature memo does not complete that overall task. Avoid both indefinite
research without a decision and premature experiments without sufficient evidence.

## Long-running work

For requested scheduled evidence collection or compute, follow
[adaptive execution](references/long-running-work.md). Update the active research
questions/jobs as evidence arrives; use a Goal only for authorized substantive
reasoning or implementation, not routine searches and polling.


For assigned roles and handoffs, follow the [shared collaboration contract](../byte-plan/references/agent-collaboration.md).

## Source And Updates

Canonical repository: [elan6666/byte-skills](https://github.com/elan6666/byte-skills). Use its current `main` branch when checking for or installing updates.
