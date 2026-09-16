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

## How byte-relay works

Several harnesses, one repository, one baton. All coordination state lives in
the repo at `.byte-os/coordination/`:

- `state.json` — a tiny state machine: current `stage`, the single `owner`
  allowed to write, `next_action`, `acceptance`, and `frozen_paths`.
- `tasks/` — one markdown file per task.
- `handoffs/` — append-only handoff documents written at every baton move.
- `handoffs/sessions/` — markdown digests of each harness's own conversation,
  produced by `skills/byte-relay/scripts/session_digest.py`. This is how one
  harness "sees" what another has been doing: not by sharing the session, but
  by sharing a digest of it.

Each harness runs the same skill with a one-line automation prompt, e.g. a
30-minute cron: *"execute byte-relay supervise stage"*. The skill checks
authority in `state.json` (if you are not the owner, it exits in one step),
gathers handoffs and digests, does its stage's work under the frozen-paths
constraints, writes a handoff, and moves the baton atomically.

Supported digest sources: Codex (`~/.codex/sessions`), Claude Code
(`~/.claude/projects`), DSH (`~/.dsh/sessions`, zstd). ZCode has no local
transcript; its skill instance writes its digest via the session-context tool
instead. See `skills/byte-relay/references/coordination-schema.md` for the
full schema and the write rules that keep concurrent harnesses safe.

## License

MIT
