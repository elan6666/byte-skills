## 2026-09-27 — Distinguish skill-family branches from hidden workflow references
- Context: The user requested a new Byte-series design-and-supervise branch comparable to `$byte-do`.
- Mistake or misunderstanding: Interpreted “not standalone” as “not independently callable” and removed its `SKILL.md` entry point; then treated the requested skill-family branch as a separate Git branch.
- Correct understanding and evidence: The user explicitly clarified that this is an additional independently callable Byte skill in the existing repository, published on its single `main` branch.
- Prevention rule: Distinguish a skill-family member from a Git branch. Preserve the requested invocation surface and deliver to the repository branch the user actually wants.
- Status: active
