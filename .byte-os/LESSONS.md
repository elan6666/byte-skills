## 2026-09-27 — Distinguish skill-family branches from hidden workflow references
- Context: The user requested a new Byte-series design-and-supervise branch comparable to `$byte-do`.
- Mistake or misunderstanding: Interpreted “not standalone” as “not independently callable” and removed its `SKILL.md` entry point; then treated the requested skill-family branch as a separate Git branch.
- Correct understanding and evidence: The user explicitly clarified that this is an additional independently callable Byte skill in the existing repository, published on its single `main` branch.
- Prevention rule: Distinguish a skill-family member from a Git branch. Preserve the requested invocation surface and deliver to the repository branch the user actually wants.
- Status: active

## 2026-09-27 — Verify the supervision lease, not just the handoff
- Context: A training handoff was acknowledged and a heartbeat was described as running, but no recurring automation was saved until hours after the run ended. The model ledger also used a generic label despite native runtime evidence for a specific model, and the monitor remained active after handback.
- Mistake or misunderstanding: Treating a sent message as future wake registration, an event file as an idle-chat trigger, a self-declared model as provenance, and a handback message as monitor cleanup.
- Correct understanding and evidence: Job launch, ownership transfer, supervisor acknowledgement, active future wake path, exact model provenance, and terminal cleanup are separate checks. The run's exit artifact cannot by itself wake an idle Codex chat.
- Prevention rule: Before the main chat ends, re-read the authorized monitor's saved ACTIVE configuration for the exact run and target, or verify a tested event-to-chat adapter. Persist activation in a supervisor-owned receipt. On handback, pause/delete the run monitor and verify inactivity before claiming cleanup complete. Mark unverified model identity and unarmed wake paths explicitly.
- Status: active
