<p align="center">
  <img src="assets/byte-skills-banner.svg" alt="Byte Skills: choose the capabilities a task needs" width="100%" />
</p>

<h1 align="center">Byte Skills</h1>

<p align="center"><strong>A workflow that fits the task, from an idea to a verified result.</strong><br />Compose discussion, research, implementation, review, and long-running handoffs.</p>

<p align="center">
  <a href="#choose-a-skill"><img src="https://img.shields.io/badge/skills-12-8b5cf6?style=flat-square" alt="12 composable skills" /></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/scripts-Python_3_%2B_Bash-3776ab?style=flat-square" alt="Python 3 and Bash scripts" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-0f766e?style=flat-square" alt="MIT license" /></a>
  <a href="README.md"><img src="https://img.shields.io/badge/文档-简体中文-2563eb?style=flat-square" alt="简体中文文档" /></a>
</p>

<p align="center">
  <a href="README.md">简体中文</a> · <strong>English</strong><br />
  <a href="#overview">Overview</a> · <a href="#quick-start">Quick start</a> · <a href="#choose-a-skill">Skills</a> · <a href="#short-waits-and-long-jobs">Supervision</a> · <a href="#outcome-continuity">Outcome continuity</a>
</p>

---

**Organize around the outcome. Let evidence guide the next step.** Byte Skills is a composable family of `byte-*` skills read and executed by your coding assistant. Small tasks stay simple; larger tasks combine research, planning, implementation, and verification as needed.

Your client keeps its models and tools. Skills guide the procedure, and local helper scripts record handoffs and evidence. Messaging, subagents, and automation depend on the client's capabilities and user authorization.

| Capability | What it gives you |
| --- | --- |
| **Compose what is useful** | Start mixed requests with `byte-do`, or invoke a focused skill directly. There is no required fixed pipeline. |
| **Preserve the overall outcome** | `byte-auto` distinguishes a completed stage from an accepted overall result and advances authorized next steps. |
| **Evidence before claims** | Assess progress using actual code, tests, runtime receipts, and sources. |
| **Recoverable collaboration** | Relay records exact session identity, ownership, handoffs, and artifact evidence. |
| **Explicit authority boundaries** | Long-running checks, cross-chat actions, paid resources, and destructive operations each retain their authorization requirements. |

## Overview

<img src="assets/overview.svg" alt="byte-do composes understanding, planning, execution and coordination capabilities, with evidence guiding the next action" width="100%" />

## Quick start

You need Git, Bash, Python 3, and a coding assistant that can load local `SKILL.md` files. The installer and Relay scripts use the Python standard library.

```bash
git clone https://github.com/elan6666/byte-skills.git
cd byte-skills
./install.sh --all
```

This installs into `~/.agents/skills` and `~/.codex/skills`. Refresh the skill list or reopen the conversation as required by your client.

```text
$byte-do Turn this idea into a working prototype and verify its key flows
$byte-build Fix the login callback and run the relevant tests
$byte-research Compare these three approaches with sources
$byte-auto Finish this feature until its key acceptance criteria pass
```

`byte-do` is an explicit entry point for mixed requests. Use a focused skill directly when the task is clear. The examples use Codex-style invocation; your client determines the actual trigger syntax.

Other installation options:

```bash
./install.sh                              # Only ~/.agents/skills
./install.sh --target ~/.claude/skills     # Another skill directory
./install.sh --all --check                # Verify installed-copy parity
```

The installer replaces Byte skill directories with matching names. Save any local customizations first. Compatibility depends on the client's skill format and available tools; cross-conversation messaging and automation require runtime support. Install `zstd` separately only if you need to read compressed DSH sessions.

## Choose a skill

| Skill | Use it for |
| --- | --- |
| [byte-do](skills/byte-do/SKILL.md) | Selecting a useful combination of capabilities for a mixed request |
| [byte-discuss](skills/byte-discuss/SKILL.md) | Discussing requirements, direction, and tradeoffs |
| [byte-brainstorm](skills/byte-brainstorm/SKILL.md) | Generating and comparing different approaches |
| [byte-research](skills/byte-research/SKILL.md) | Checking external evidence that affects a decision |
| [byte-plan](skills/byte-plan/SKILL.md) | Planning at a depth appropriate to the task |
| [byte-build](skills/byte-build/SKILL.md) | Implementing a focused change and verifying the result |
| [byte-review](skills/byte-review/SKILL.md) | Finding important issues in code and evidence |
| [byte-status](skills/byte-status/SKILL.md) | Checking progress, blockers, and next actions |
| [byte-future](skills/byte-future/SKILL.md) | Saving ideas for later |
| [byte-auto](skills/byte-auto/SKILL.md) | Advancing an authorized outcome until completion or a real blocker |
| [byte-design-supervise](skills/byte-design-supervise/SKILL.md) | Having a Codex main chat design and launch work, with another chat supervising long jobs |
| [byte-relay](skills/byte-relay/SKILL.md) | Recording identity, ownership, and handoffs across chats or coding clients |

## Short waits and long jobs

![Supervision routing: short waits use a same-task helper; long jobs use a verified supervisor handoff](assets/supervision.svg)

| Situation | Preferred approach |
| --- | --- |
| A quick command | Run it directly in the main task |
| A bounded test expected within about an hour and the current turn | Use an authorized same-task subagent; the main chat retains ownership and verifies the result |
| Training, ablations, or batch work expected to take about an hour or more, or to outlive the main turn | Use an identified supervisor chat with authorized event notifications or scheduled checks |

Duration is a routing estimate. Delegation and model choice depend on runtime support and user authorization. Reassess the route when a short job takes longer than expected.

For a long job, the main chat first verifies that it started, records the run identity, logs, acceptance criteria, and repair scope, then hands it over through `byte-relay`. The supervisor handles only the agreed scope, returns the terminal evidence, and disables that run's monitor. The main chat verifies the result and advances the next authorized stage.

**A delivered cross-chat message does not prove that the main chat resumed.** Automatic continuation requires working wake paths in both directions and an observable acknowledgement. `run_event.py` records process exits and calls a configured notifier; waking an idle Codex chat still needs verification in the target environment. Without a tested event adapter, scheduled checks can take up to one check interval to detect a change. See the [supervision workflow](skills/byte-design-supervise/references/workflow.md) and [event bridge notes](skills/byte-relay/references/codex-event-bridge.md).

## Recoverable handoffs

Ordinary work does not require `.byte-os/`. When a project needs resumable cross-chat work or explicit handoffs, Relay keeps its records inside the project:

```text
.byte-os/coordination/
├── state.json       # Current owner, stage, next action, and acceptance
├── sessions.json    # Session ID, client, model provenance, and Git snapshot
├── handoffs/        # Handoff notes and session digests
├── receipts/        # Execution, verification, and artifact evidence
└── reviews/         # Review packages when needed
```

Each coordination state has one write owner. Messages notify participants; project files, code, and runtime evidence establish the facts. Model identity is verified only when supported by native runtime evidence. The skills do not select or switch models themselves.

```text
$byte-relay Initialize handoff state for this project
```

Relay includes local session-digest readers for Codex, Claude Code, DSH, and ZCode. Digest access does not imply live messaging support. A full ZCode conversation summary still needs its native tools. See the [coordination schema](skills/byte-relay/references/coordination-schema.md) for details.

## Outcome continuity

An authorized long-running or iterative task keeps one overall outcome and acceptance checklist. Research, preflight, training, and reports are stages. The main conversation verifies each handback, then executes the next authorized action. A supervisor checks only its exact active run and disables that run's monitor after handback.

Explicit user pauses, scope boundaries, and resource limits always take precedence. Ordinary tasks use ordinary conversation state; Goal mode requires an explicit request. Standalone status questions or discussions do not grant new execution authority.

A local exit check uses the existing state to distinguish completion, verified supervised waiting, an explicit pause, and a concrete external blocker:

```bash
python3 skills/byte-auto/scripts/continuation_check.py --state /path/to/state.json
```

Use `--help` for the record schema. Exit `0` permits the disposition returned by the check, `2` requires continued substantive work, and `1` requires state/evidence reconciliation. See the [long-running work contract](skills/byte-auto/references/long-running-work.md).

The helper checks consistency of local records. It cannot intercept a client's final response or independently prove live scheduling, wakeups, or scientific correctness. It does not guarantee a solution to an open research problem.

## Maintenance and verification

For an explicitly requested continuous two-chat research loop, keep one
outcome-level heartbeat across experiments and active analysis, literature
review, and implementation. The supervisor watches the current run or quietly
checks main-chat progress. If the main chat is idle with authorized ready work,
retarget the same heartbeat to main for recovery. End checks of a completed run
without disabling the overall recovery path. Stale reminders route from current
state. Preserve the user's chosen research order; see the
[continuous research procedure](skills/byte-design-supervise/references/research-loop.md).

`skills/byte-auto/scripts/continuation_route.py --help` documents the read-only
routing helper. Native configuration, readback and observed scheduled execution
are still required. Heartbeats can consume model quota. Stop this authorized
outcome monitor on verified completion, an explicit pause, or an evidenced
external blocker with no independent work remaining.

```bash
python3 scripts/sync_shared_references.py --check
python3 -m unittest discover -s tests -v
```

The retained regression tests cover session registration and authority, handoffs, task receipts, process events, duplicate-launch prevention, and failure-delivery states. They run in temporary directories without a model API, GPU, or external account. They do not verify a client's scheduling or automatic wakeup behavior.

To change the shared evidence contract, edit `shared/evidence-contract.md` and run `python3 scripts/sync_shared_references.py`. Each consuming skill bundles a copy so it can be installed independently.

## License

[MIT](LICENSE). Inspired by team-based workflows; not affiliated with ByteDance. Product and company names belong to their respective owners.
