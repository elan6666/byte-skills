# Design and supervise workflow (Codex-only)

This is the detailed workflow for `$byte-design-supervise`, with `$byte-relay`
handling session identity, ownership, and handoffs.

Use ordinary chats, not a Goal, unless the user explicitly chooses Goal mode.
The main chat owns design, core code, short tests, launch, scientific decisions,
and final acceptance. A bounded same-task helper (for example GPT-6 Luna when
available and authorized) may run a short test but never takes the relay baton.
An independent supervisor chat owns long-run observation and only the bounded
repairs recorded in the handoff.

## Main chat: launch gate

1. Define the overall deliverable, remaining stages, per-run acceptance, and
   stop conditions in the project's existing workflow state. Use
   [byte-relay](../../byte-relay/SKILL.md) for exact session registration, owner
   gates, receipts, and append-only handoffs.
2. Build and verify the core code. Run one bounded launch preflight: confirm the
   real command/config can start, its process or scheduler job persists, logs
   advance, and the run has an exact ID. A one-step preflight is not a scientific
   result or proof the long run will finish.
3. Launch the authorized long job in a durable process/scheduler context. Record
   run ID, attempt, config hash/path, Git commit, host, PID/job ID, logs,
   outputs, expected artifacts, repair budget, and supervisor task identity.
   If the launch fails before ownership transfer, the main chat diagnoses it;
   do not assign an unlaunched run to the supervisor. If it settles during the
   handoff window, record that actual terminal state instead of relaunching.
4. Persist handoff and atomically move `state.owner_session` to the supervisor,
   then notify that exact existing Codex chat. Create a new chat only when the
   user explicitly requests one. Obtain one bounded acknowledgement of
   run identity and checkout. The main chat ends its turn and does not poll
   training. A notification accepted by transport is not acknowledgement.
5. If a periodic fallback was authorized, create or reactivate it for this
   handoff only. Verify its saved status is active, its target is the exact
   supervisor chat, and its prompt names the current run, acceptance, and
   stop rule. A heartbeat message alone is not proof a recurring schedule
   exists. Do not claim the monitoring lane is armed until this check passes.

## Supervisor: dual trigger

The same supervisor receives (a) a terminal/failure event from the run wrapper
or scheduler and (b) a periodic check at the authorized interval. Both
inspect the same durable run identity and deduplicate by run ID + attempt +
event type. Keep stable periodic checks quiet. The event path should record
the result without an LLM; the notification adapter wakes the exact supervisor
only on actionable change. The timer catches missed events, dead wrappers,
stale heartbeats, and completion not delivered by the hook.

An external process cannot call Codex's in-chat `send_message_to_thread` tool
merely by writing a file. Before promising immediate wakeup, test the actual
event-to-task adapter against an **idle** target. A separate `codex exec resume`
process may conflict with the desktop task's active writer; do not use it as
the adapter unless a live test proves it works in that environment. If no
adapter is verified, retain the event in an inbox and state clearly that
periodic polling is the only verified wake path. Use
[event bridge details](../../byte-relay/references/codex-event-bridge.md) when wiring or testing
this boundary. The bundled [run-event helper](../../byte-relay/scripts/run_event.py) writes
durable terminal events and calls an explicitly configured notifier once; it
does not itself know how to wake Codex.

On waking, verify state ownership, run identity, process/scheduler exit,
artifacts, and acceptance. For a permitted small repair, preserve evidence,
repair once within budget, and continue supervising the new attempt. For an
uncertain fix, architecture/scientific decision, new cost, or final result,
write the receipt and handoff, return the baton to the main chat, then send
that chat a concise message. Once the state no longer names this supervisor as
owner, pause or delete the matching periodic monitor and verify its inactive
status before ending this turn. If a stale heartbeat fires without an owned
run, do not query the server or relaunch work; stop the stale monitor. Neither
an agent reply nor a missing PID proves run success.

## Finish the workflow

When the main chat receives a handback, it checks the live evidence and either
designs the next authorized stage, returns a bounded follow-up to supervision,
or closes the overall acceptance. Do not stop merely because one training run
ended. Each handed-back run has its monitor paused or deleted; a later run
requires a new exact handoff, updated monitor prompt, and verified reactivation.
Once **all** design/workflow acceptance items pass, remove any remaining
monitor, record final evidence, and leave both chats idle. Do not mark an
unfinished Goal complete to simulate waiting.

This branch grants no new authority for paid compute, publishing, destructive
operations, production changes, or contacting other people.

## Source and updates

Canonical repository: [elan6666/byte-skills](https://github.com/elan6666/byte-skills).
