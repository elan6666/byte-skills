# byte-skills

A portable skill family for AI coding harnesses (ZCode, Codex, Claude Code,
DSH, …). The `byte-*` skills define a project workflow; `byte-relay` extends it
across harnesses so that several agents can share one repository without
stepping on each other.

## Skills

| Skill | Purpose |
|---|---|
| `byte-do` | Adaptive front door: routes a mixed request to the right capabilities |
| `byte-discuss` | Structured discussion and decision framing |
| `byte-brainstorm` | Idea generation and divergence |
| `byte-research` | Evidence-first research with sources |
| `byte-plan` | Planning from requirements to executable steps |
| `byte-build` | Implementation under the project's rules |
| `byte-review` | Review against evidence and acceptance criteria |
| `byte-status` | Progress, blockers, and next action from live evidence |
| `byte-future` | Park and retrieve future ideas |
| `byte-auto` | Autonomous completion of a bounded outcome |
| **`byte-relay`** | **Cross-harness coordination: shared state machine, handoffs, session digests** |

## Install

```bash
git clone https://github.com/elan6666/byte-skills.git
cd byte-skills
./install.sh                 # installs to ~/.agents/skills
./install.sh --target ~/.claude/skills   # or any other harness skill dir
```

Install into **every harness that will participate** — the skills are plain
files and are read by ZCode, Codex, and Claude Code alike. byte-relay reads
DSH session logs via `zstd`, so make sure `zstd` is on PATH.

## Scenarios

byte-relay is a baton-passing state machine, not a supervision tool. Any work
that flows as "A finishes a part, B continues, the handoff must be explicit"
can run as a relay. Set the `stage`, `roles`, and `next_action` in
`state.json` accordingly.

### Build + supervise (the base case)

Codex writes code as `owner`; a second harness runs a periodic relay turn
(e.g. a 30-minute cron) with `stage: "supervise"`. It reads the state, checks
queue health / test status / whatever `next_action` says, writes a handoff,
and exits — or hands the baton back to Codex when something needs fixing.
The automation prompt is one line: *"execute byte-relay supervise stage"*.
If the harness is not the owner, the turn costs one state read.

### Fix loop (close the loop after supervision)

Supervision alone still requires a human to shout at the builder. Add a
`fix` stage and the loop closes itself:

```
zcode (supervise)  finds the queue backing up
  → handoff, stage: "fix", owner: codex, next_action: "restart workers per runbook, verify"
  → codex fixes, handoff records what changed
  → baton back to zcode, stage: "supervise", next_action: "confirm latency recovered"
```

`frozen_paths` still fences the core code and failures are never auto-retried,
which is what makes it safe to let the loop turn unattended.

### Review loop (two models as each other's red team)

One harness implements, another critiques, and they alternate: `stage:
"review"` hands the diff to a second harness whose `acceptance` is "list all
edge-case problems, graded"; its handoff comes back as `fix` work for the
first. Digests make each side's reasoning visible to the other, so nobody
plays courier between the two models.

### Parallel work with partitioned ownership

`owner` is singular, but two harnesses can work concurrently on disjoint
territories: each names the other's directory in its own `frozen_paths`
(e.g. one works `strategy/`, the other `backtest/`). Both write handoffs as
usual. This requires both sides to confirm the partition in a handoff before
starting — see the schema's "one baton" rule.

### Long-run babysitting

Training, backtests, and batch jobs need hours of "wake up, glance, decide"
rather than intelligence. One harness relays on a cron with `stage: "run"`
(normal → exit, anomaly → hand off to the builder with a diagnosis); when the
run completes, the baton moves to a reviewer harness that reads the artifacts
and writes a summary. This replaces one bespoke cron per harness with a
single relay skill.

### Research and writing relays

No code required: `stage: "research"` — one harness gathers sources and
writes a handoff, the next drafts a plan from the digest, the first lands the
result. Digests matter most here because conversational output is the main
deliverable when there is little git evidence.

### What byte-relay is not for

- **Real-time co-editing** of the same files — the single-baton design
  forbids it on purpose; automated git-conflict resolution is not worth it.
- **Second-level incident response** — cron granularity and the fixed relay
  turn make it minutes-scale at best.
- **A 10-minute one-person task** — coordination setup costs more than doing
  the work.

## How byte-relay works

Several harnesses, one repository, one baton. All coordination state lives in
the repo at `.byte-os/coordination/`:

- `state.json` — a tiny state machine: current `stage`, the single `owner`
  allowed to write, `next_action`, `acceptance`, and `frozen_paths`.
- `sessions.json` — durable conversation lineage: native session ID, harness,
  optional openable locator, provider/model, role/stage, and Git snapshot.
- `tasks/` — one markdown file per task.
- `handoffs/` — append-only handoff documents written at every baton move.
- `handoffs/sessions/` — session-ID-addressed markdown digests produced by
  `skills/byte-relay/scripts/session_digest.py`. The `latest` files are small
  indexes, so starting a new conversation never erases an older digest.

Each harness runs the same skill with a one-line automation prompt, e.g. a
30-minute cron: *"execute byte-relay supervise stage"*. The skill checks
authority in `state.json` (if you are not the owner, it exits in one step),
gathers handoffs and digests, does its stage's work under the frozen-paths
constraints, writes a handoff, and moves the baton atomically.

Supported digest sources: Codex (`~/.codex/sessions`), Claude Code
(`~/.claude/projects`), DSH (`~/.dsh/sessions`, zstd), and ZCode local task
metadata (`~/.zcode/v2/tasks-index.sqlite` or its CLI database). ZCode's full
conversation summary still comes from its session-context tool. Use
`skills/byte-relay/scripts/session_registry.py` to register the exact
conversation and code snapshot. See
`skills/byte-relay/references/coordination-schema.md` for the full schema and
write rules.

## License

MIT
