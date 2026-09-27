# Codex task-to-task relay

Use this mode when two or more Codex tasks share one project: for example, a
main task implements core code and tests, then a supervisor task watches a long
performance or ablation run and returns anomalies or completion evidence.

Codex cross-task messages are the live notification channel. Repository state is
the durable authority. A delivered message may not produce a substantive target
turn; it neither proves wakeup nor grants ownership by itself.

When available, use Codex's native task operations deliberately:

- `create_thread`: create a supervisor only when the user explicitly requests
  a new supervision task; target the same saved project with local checkout.
- `send_message_to_thread`: dispatch or update the new owner only after the
  durable handoff succeeds.
- `read_thread`: inspect concise task context when needed, never as proof that a
  job or code change succeeded.
- `wait_threads`: obtain bounded progress snapshots for a dispatched task; do
  not turn the main task into a permanent polling loop.

For same-task helpers, do **not** use this cross-task baton protocol. Follow
[delegation routing](delegation-routing.md): a subagent keeps the main task's
ownership and is preferred for bounded work expected within about one hour
and its active turn. Cross-task supervision is for longer or unattended runs.

If native task operations are unavailable, keep the repository handoff valid and
tell the user which exact supervisor task must be opened or resumed manually.

## Identity and checkout

- Identify every participant as `codex:<thread-id>` and record its `host_id`
  when available.
- Set both `state.owner: codex` and `state.owner_session: codex:<thread-id>`.
  Once multiple Codex tasks participate, never fall back to harness-only
  ownership.
- Create a supervisor task only when the user explicitly asks for a new task or
  supervision task. Otherwise reuse an exact registered task selected by ID.
- A supervisor watching the same process, scheduler, logs, and coordination
  files must run in the same saved project checkout (`local` environment), not
  an isolated worktree. Use a worktree only when the relay explicitly separates
  code ownership and provides a shared external state channel.

## Main task to supervisor

1. Finish and verify the bounded core implementation. Launch a long job only
   when already authorized. A same-task helper must not own a job whose
   lifetime needs to exceed the helper turn unless process persistence was
   independently verified.
2. Record the exact job/run identity, config, process or scheduler ID, log path,
   outputs, Git snapshot, allowed repairs, stop conditions, and escalation
   conditions in the task receipt and handoff.
3. Create or select the supervisor task and retain its returned `threadId` and
   `hostId`. Do not treat creation as execution or supervision. A Codex target
   without a known host ID must not receive the baton.
   Confirm the target's project checkout, available model/tooling, and report
   route before enabling any recurring check. A requested cheap model is not
   proof of the target's actual model; record native runtime evidence or mark
   model provenance unverified. Preflight how a terminal handback will wake the
   idle main task and how its actual continuation will be verified. If this
   return route is untested, do not promise automatic end-to-end progress.
4. Write the append-only handoff. Then run `scripts/relay_state.py handoff` to
   move `owner_session` to the supervisor and set `stage=supervise`.
5. Only after the state write succeeds, use the Codex task messaging capability
   to send the supervisor a concise prompt containing the project path, state
   path, its exact session ref, handoff path, run identity, and `next_action`.
6. Record whether notification was accepted by the transport, unverified, or
   failed. This is not an acknowledgement from the supervisor. If the call
   times out or fails ambiguously, inspect the exact target and handoff before
   any retry; never send a duplicate launch instruction blindly.
7. End the main task's active work only after the exact supervisor acknowledges
   and at least one future wake path is verified active for this run. Otherwise
   report the lane as unarmed and reconcile or hand back without relaunching.
   Do not keep the main task alive merely to poll the supervisor.

If this handoff uses a recurring monitor, verify its saved active status, exact
supervisor target, current run identity, interval, and stop rule through the
automation tool before calling the periodic lane armed. Record its ID in the
append-only handoff if known before transfer; otherwise have the supervisor
record it in a new owned receipt. A single heartbeat message is not proof of
future registration. Reuse
a paused monitor only after updating it for the new run; never leave a
project-wide heartbeat querying between handoffs.

Example state transfer after the handoff file exists:

```bash
python3 scripts/relay_state.py handoff --project <repo> \
  --from-harness codex --from-session-id <main-thread-id> --from-stage build \
  --to-session codex:<supervisor-thread-id> --to-stage supervise \
  --to-role supervisor --to-host-id <host-id> \
  --reports-to codex:<main-thread-id> \
  --next-action "monitor run-42; apply only the recorded bounded repairs" \
  --handoff .byte-os/coordination/handoffs/<file>.md \
  --note "core implementation and tests complete; long run launched"
```

## Supervisor behavior

1. Register the supervisor conversation only after `owner_session` names it,
   then confirm the stage, handoff, receipt, live job identity, and Git snapshot.
   Record the exact model with a native runtime evidence pointer when available;
   a generic model family or the requested model is not a verified identity.
2. Acknowledge the handoff only after confirming the exact `owner_session`,
   host/checkout, run ID, and live job identity. Monitor with an authorized
   process/scheduler event bridge where available, otherwise use the available
   bounded wait or scheduled heartbeat mechanism. A sparse heartbeat may check
   watcher liveness. Stay quiet while state is unchanged; do not keep the main
   task polling. Never claim event-triggered wakeup without a configured and
   tested event-to-task bridge.
3. If the job succeeds, verify terminal outputs and acceptance, update the
   receipt/handoff, and transfer the baton back to the main or review task.
4. If a known, explicitly allowed, bounded repair is sufficient, preserve the
   run and unrelated work, apply the repair, verify it, and continue supervision.
   Never repeat an unchanged failed repair.
5. For uncertain diagnosis, architecture or scientific changes, new cost,
   destructive action, frozen-path changes, or exhausted retry budget: write
   evidence, transfer ownership back to the main task, then message it. The main
   task decides the repair.
6. After a terminal handback, pause or delete this run's recurring monitor and
   verify it is inactive, then message the main task with result, cleanup
   status, handoff identity, and one concrete next authorized action. A
   progress-only update while this supervisor still owns the run is not a
   handback. Check one bounded `wait_threads` or `read_thread` snapshot for a
   substantive main turn acknowledging that handoff and starting its next
   action; transport success, an empty reply, or target `idle` does not count.
   If absent, mark main continuation unverified and use only an authorized,
   tested return-wake fallback or report that manual resumption is needed.
   A run-scoped, pre-authorized main-target heartbeat may be activated only
   after handback if the app supports and has passed a live target test; the
   main task must disable it on acknowledgement. Do not reclaim ownership,
   write main-owned project state, launch the next experiment, or endlessly poll.
   If cleanup fails, report it and do not claim the whole handback complete.
   A later run may reactivate only with a new exact handoff and current run
   details. If a stale tick arrives when this task no longer owns a run, do
   not query the server; disable that stale monitor.

Before messaging another task, persist the corresponding handoff and state
transition. Use task reads for context and task waits for dispatched progress,
but treat their summaries as narrative evidence, not repository or runtime truth.
An agent becoming idle or finishing a turn is not proof that training succeeded;
check the scheduler/process result and expected artifacts separately.

## Direct-message payload

Keep cross-task prompts cohesive and self-contained:

- project and checkout path;
- `codex:<thread-id>` identity and expected `owner_session`;
- stage, next action, acceptance, allowed repairs, and escalation boundary;
- handoff and receipt paths;
- run/config/log/process identities;
- whether this is a progress update or an actual baton return, plus the one
  next action the main task should begin;
- which exact task should receive completion or failure reports.

Do not paste large transcripts or diffs into messages. Link the durable digest,
receipt, review package, or artifact instead.
