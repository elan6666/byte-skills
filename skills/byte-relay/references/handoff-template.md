# Handoff template

File name: `handoffs/YYYY-MM-DD-<harness>-<topic>.md` (UTC or local date, be
consistent within the project). Never edit a handoff after writing it; write a
new one instead.

```markdown
# Handoff: <one-line what happened>

- Date: <ISO-8601>
- From: <harness> (<stage> stage)
- To: <harness>
- From session: <harness:native-session-id>
- To session: <harness:native-session-id>
- State at handoff: stage=<stage>, owner=<harness>
- Upstream session: <harness:native-session-id and locator if available>
- Code snapshot: <branch@commit>
- Task receipt: <receipt path, or not needed for this turn>
- Review package: <package path when review is requested>
- Direct notification: <not sent, or confirmed destination thread ID>
- Supervision lease, if any: <monitor ID, exact target, run ID/attempt, interval,
  saved ACTIVE/PAUSED verification, and stop rule; or unarmed>
- Event wake path, if any: <tested idle-target adapter evidence, or event-file
  only with polling latency>
- Model provenance: <exact runtime model and native evidence pointer, or
  unverified; requested model is not proof>

## What was done

<2-5 bullets, each tied to evidence: commit hash, file path, test name,
command output. No claims without evidence.>

## What changed

<files touched, with paths. Explicitly confirm frozen_paths untouched.>

## Result vs acceptance

<state.acceptance met / partially met / not met, and why.>

## For the next owner

<the single next_action you wrote into state.json, plus any context the
digest and state cannot carry: gotchas, reverted attempts, open questions.
For experiments, include run ID, config, log path, and scheduler/process ID.>
```

Keep it under ~40 lines. Long analysis belongs in a linked file, not here.
