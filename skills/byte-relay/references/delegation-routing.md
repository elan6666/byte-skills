# Delegation routing for expensive core work and cheap supervision

Use this decision before creating a helper or transferring relay ownership.
The job and the agent supervising it have separate lifecycles.

| Situation | Route | Authority and completion |
| --- | --- | --- |
| Bounded check expected within about one hour and this turn | Authorized same-task subagent, optionally using a cheaper available model | Main session keeps the relay baton. Use a bounded wait or continue independent work; verify its result against files/runtime before accepting it. A trivial check may be done directly. |
| Job expected to take at least about one hour or outlive this turn | Exact independent supervisor session, or an authorized scheduled monitor when no separate session is needed | Persist run identity and handoff, transfer the baton for cross-session work, verify both wake routes, then let the main turn end. If return wake is unverified, disclose possible manual resumption. |
| No reliable live transport or target acknowledgement | Durable handoff plus explicit unverified-notification status | Do not infer that a created task, sent prompt, or open terminal is active supervision. Reconcile before retrying delivery or launching a job. |

## Same-task subagent

- Check that delegation is authorized by the user and current environment.
  Model overrides are capability-dependent; record the actual model used rather
  than treating a requested cheap model as proof it was selected.
- Give the helper a narrow question, run ID, paths to bounded evidence, and a
  clear return condition. Keep scientific or architectural changes with the
  main owner unless separately authorized.
- The helper shares this task's lifecycle. Do not register it in `sessions.json`
  as an independent conversation or move `state.owner_session` to it. Its work
  can be cited in the main task receipt after the main agent verifies it.
- Do not launch an hours-long training process from a short-lived helper and
  assume the process survives helper teardown. Confirm the process owner and
  persistence boundary before launch; the durable main/supervisor runtime
  should own any job that must continue after the helper finishes.
- Waiting on a helper is not continuous main-agent reasoning, but repeated
  wakeups, tool calls, and synthesis still consume model work. Do not use a
  same-turn helper as an hours-long unattended monitor.
- If a short job overruns the estimate, preserve its run ID and process owner,
  then choose whether to finish in-turn or make an authorized durable handoff.
  Do not silently convert a helper into an independent supervisor.

## Independent supervisor

Borrow the *mail plus doorbell* split: the handoff, receipt, and live run
evidence are durable; Codex messages, Herdr prompts, or terminal input only
notify the intended agent. A successful transport call proves acceptance by
that transport, not that the agent read the task or that the run succeeded.

Before dispatch, bind the handoff to exact `owner_session`, host/checkout,
`run_id`, config, scheduler/process ID, log and output paths, Git snapshot,
acceptance, allowed repair budget, and escalation target. On receipt, the
supervisor confirms those identities against live state before acting. The
sender must not keep polling an unchanged long job.

Preflight the exact target and project directory, available model and tools,
permitted repair/compute scope, and notification route before enabling a
monitor. A broken route or missing credential should block dispatch without
spending a model turn or launching a duplicate run. For many independent
completion events, group/coalesce reports when one synthesis is sufficient;
each separate wakeup can incur another turn.
Verify the target's actual model from native runtime metadata when cost routing
matters; if unavailable, mark it unverified. Verify a recurring monitor's saved
ACTIVE status, exact target, run identity, and stop rule before the main task
ends. On handback, verify PAUSED or deleted; an active timer with no owned run
is a defect, even if its ticks are currently quiet.
Preflight a return route to the main task before promising autonomous completion.
After handback, check one bounded target snapshot for an owned, substantive
main continuation. A delivered message, empty reply, or `idle` state does not
prove it. If no tested return wake is available, report that manual resumption
may be needed; do not keep the expensive main task polling for the entire run.

Distinguish these states when reporting:

1. **Handoff persisted**: authority changed in repository state.
2. **Notification accepted**: the transport returned success for the exact
   target. Delivery/read status may still be unknown.
3. **Supervisor acknowledged**: the exact target began an owned turn and
   confirmed the run/handoff identity. An unrelated pane occupant cannot count.
4. **Run settled**: process or scheduler exit plus artifact checks establish
   success or failure. Agent `idle`/`done` is not this state.
5. **Main resumed**: after a terminal handback and baton return, the exact main
   task acknowledged the run identity and began the next authorized action.
   Supervisor notification is not this state.

If notification times out or errors, inspect the exact target and current
handoff before retrying. Never blindly resend a prompt that could launch or
restart a job. Keep large logs in artifacts and send short pointers. If a
transport lacks acknowledgement, report it as unverified and retain the
durable handoff.

Use a process/scheduler event to wake the supervisor when available; otherwise
use a permitted heartbeat. Even with an event source, a sparse heartbeat can
detect stalled watchers. An event is a reason to inspect the run receipt, not
proof of outcome. Never claim instantaneous error-triggered wakeup without a
configured and tested event-to-task bridge from the event source to the exact
task.

For a bounded Codex-only job, the simplest tested route is to dispatch the
independent supervisor *before* launch and have it own the command. Its active
turn can see a nonzero tool exit immediately and report the failure without the
main task polling. Check the command/tool duration limit and process survival
before using this for long training; an idle Codex task is not automatically
woken by a process it does not own. A long or detached job needs a separately
tested event-to-task bridge or a scheduled monitor. A supervisor's final reply
is visible to the main task through an explicit task wait/read; it is not proof
that an idle main task was itself resumed.

Transport selection is environmental: Codex desktop tasks use native task
messaging when available; terminal-native agents may use Herdr or tmux-based
tools if already installed and authorized. Do not require either terminal
runtime for Codex desktop tasks, and do not scrape pane output as the sole
acceptance signal.

Design influences: [Gas Town's durable mail and nudge](https://github.com/gastownhall/gastown/blob/main/AGENTS.md), [MCP Agent Mail's ACK and threads](https://github.com/Dicklesworthstone/mcp_agent_mail), [agentmux's queued delivery receipts](https://github.com/adelost/agentmux), and [Herdr's pinned agent wait](https://herdr.dev/docs/socket-api/). These are patterns to adapt, not required dependencies.

Hermes adds two useful cautions: [background completion admission is not a
completed model turn](https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation),
and [script-only scheduled checks plus pre-dispatch validation](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron)
can avoid paying an LLM for unchanged state. These are design precedents, not
claims that Codex's task or automation APIs have identical semantics.
