# Handoff template

File name: `handoffs/YYYY-MM-DD-<harness>-<topic>.md` (UTC or local date, be
consistent within the project). Never edit a handoff after writing it; write a
new one instead.

```markdown
# Handoff: <one-line what happened>

- Date: <ISO-8601>
- From: <harness> (<stage> stage)
- To: <harness>
- State at handoff: stage=<stage>, owner=<harness>

## What was done

<2-5 bullets, each tied to evidence: commit hash, file path, test name,
command output. No claims without evidence.>

## What changed

<files touched, with paths. Explicitly confirm frozen_paths untouched.>

## Result vs acceptance

<state.acceptance met / partially met / not met, and why.>

## For the next owner

<the single next_action you wrote into state.json, plus any context the
digest and state cannot carry: gotchas, reverted attempts, open questions.>
```

Keep it under ~40 lines. Long analysis belongs in a linked file, not here.
