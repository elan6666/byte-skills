# Use the current harness first

At task entry, identify the harness and inspect the tools exposed for the
requested operations. Use host help for a CLI option or a bounded read-only
query for a specific target. A release note, feature flag, installed
executable, or another session's receipt does not establish availability or
permission here. Check only what the next action needs and reuse the same
observations across Byte skills.

## Codex routes

| Need | Native route to check first | Byte's role |
| --- | --- | --- |
| Explicit persistent goal | Native Goal state and controls, or the user-selected `/goal` mode | Preserve project acceptance and continue from evidence. Use the Byte goal loop and a verified native Stop hook when Goal controls are unavailable. |
| Plan in this chat | An available native plan tracker, or Plan mode when the user selects it | Keep the planning depth small. Save a Byte plan only for a reusable deliverable, a handoff, or an opted-in Workbench. |
| Requested code review | Native review for the specified base, commit, or uncommitted diff | Verify findings against the requested scope and actual artifacts. Use Byte evidence rules for research, product, and runtime reviews. |
| Isolated editing or changing a chat's workspace | Reuse a suitable checkout or managed worktree. Use Codex's worktree controls when an isolated worktree is needed. | Keep task scope, checkout identity and evidence. Moving or forking a chat is distinct from assigning ownership of a Byte task. |
| Independent work within this task | Authorized native subagent when it can do substantive work in parallel | Keep the original owner and verify returned evidence. A process wait can stay with the current chat. |
| Inspect an existing Codex chat | Native read or cursor-based wait by exact host and thread ID | Consult Byte for the active handoff and artifacts. Use saved digests for portable history or when native history is unavailable. |
| Send an authorized follow-up to another Codex chat | Native messaging when the exact target and project allow it. In CLI, probe `codex queue --help` for the required options. | Preserve one delivery route. Keep Bridge for an existing Bridge task, cross-harness work, or a requested Bridge handoff. |
| Wait for a process or scheduler job | Native command handle or scheduler completion event. Keep the turn attached when it can wait. | Attach Byte's watcher for detached jobs, structured progress, or receipt checks. Let scripts do routine observation without model turns. |
| Authorized recurring check | Native automation attached to the existing chat when continuity matters, or the user's selected project schedule | Keep the exact scope, stop condition, and evidence. Use one schedule per purpose and read it back. |
| Project guidance, task history, or connected data | Project `AGENTS.md`, native chat history/search, and an authorized connector for the source | Keep shareable research evidence, lessons, ownership, and the opted-in task board in the project. |

Composer commands such as `/goal`, `/plan`, and `/review` describe user-facing
controls. In an agent turn, use the equivalent callable tool when exposed.
Do not simulate a composer command with shell text or UI input. Managed
worktree controls and native messaging can have different host and permission
requirements.

## Preserve the continuation boundary

- Preserve an active handoff's owner, exact run identity, and verified route.
  An existing Bridge task returns through its recorded transport. For a new
  native handoff, verify the exact host and chat, authorized delivery, actual
  intake, and the evidence needed for acceptance.
- Queuing a message and starting an idle chat are separate checks. Some Codex
  CLI versions expose `codex queue --resume` for an unloaded session on a
  supported daemon. Verify local help, the target daemon and the receiving
  turn. A successful command can include a resume warning.
- Native process-exit or filesystem notifications are useful to a client
  consuming those events. They do not by themselves attach a new model turn
  to an idle chat. A native Stop hook acts at turn completion, while a
  scheduled automation starts model work at its configured time.
- Stay with an attached wait for a specific job where the host can sustain it.
  If a job outlives the turn, use an already authorized event-to-turn or
  scheduled route and verify it. Native Goal, a Stop hook, and scheduled
  model checks should not compete to drive the same phase.
- A permission or approval wait requires the authorized native route.
  A generic shell command, UI interaction, or alternate transport must not
  turn an unapproved action into an approved one.

Follow the [goal loop](../../byte-workflow/references/format.md#goal-loop) when
the user explicitly requests persistent pursuit. Ordinary work can still
iterate, verify, and finish in the current turn.

## Antigravity & Multi-Harness Native Routes

Before writing custom scripts or spawning external chats, inspect your current
tool inventory and prefer native capabilities first:

| Need | Native route (Antigravity / Modern Harness) | Byte fallback only when missing |
| --- | --- | --- |
| Waiting on training / long command | Non-daemon background `run_command` + end turn (**0-token Reactive Wakeup** on exit) | `zero_token_loop.py wait-run` or `launchd` watcher |
| Parallel research / sub-tasks | `invoke_subagent`, `run_workflow`, or `swarm` (when `/swarm` active) | `byte-bridge` only for cross-app/external chats |
| Recurring / timed check | Native `schedule` (`CronExpression` / `DurationSeconds`) | `zero_token_loop.py tick` (`launchd` 0-token polling) |
| Live progress checklist | Native `update_steps` & `update_focus` | `.byte-os/workboard.json` for cross-session persistence |
| Cross-harness wake (Antigravity) | Native `ag_say.py` (`agy acp`) + `ag-wake.json` (`wait-signal`) | Shared workspace `.byte-os/coordination/board.jsonl` |
| Sandboxed remote job launch | Native authorized SSH / ControlMaster | `.byte-os/server-job-requests/` local watcher queue |

### Deprecated / Replaced Patterns (Do NOT Use)
- **LLM cron polling for running jobs**: Do NOT wake an LLM every 15m just to run `ps`/`tail`. Use attached Reactive Wakeup or `zero_token_loop.py` (`0` tokens while waiting).
- **Asking "Should I continue?" mid-goal**: When inside an authorized Goal Loop, never stop to ask permission for the next bounded step.
- **Accepting permission blocks as stop points**: If a sub-tool or sandbox blocks an action (e.g., `unsandboxed ssh`), immediately pivot to an authorized native route or the `.byte-os/server-job-requests/` queue and record the fix.

[Codex developer commands](https://learn.chatgpt.com/docs/developer-commands) ·
[Worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees) ·
[Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) ·
[Scheduled tasks](https://learn.chatgpt.com/docs/automations?surface=app) ·
[Hooks](https://learn.chatgpt.com/docs/hooks)
