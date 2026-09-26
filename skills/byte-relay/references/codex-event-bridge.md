# Codex desktop event bridge: required proof

This reference applies when a main Codex chat launches a job, ends its turn,
and an idle supervisor chat must wake on job failure/completion. It is not the
same as a supervisor chat running a short blocking command and receiving its
tool result in the active turn.

## Durable event before model wakeup

- Wrap the authorized training command or subscribe to the scheduler's exact
  run ID. Record process exit, attempt, timestamp, log/artifact pointers, and
  event ID durably. Preserve the training command's true exit code. A shell
  `EXIT` trap cannot run after `SIGKILL`, so the periodic checker must inspect
  the run independently.
- Use a notifier adapter that has been tested against the **same idle Codex
  desktop task**. A return code from an adapter means only transport
  acceptance; the supervisor must acknowledge the run ID in a new turn.
- Write delivery status before sending. An ambiguous timeout must stay
  `unverified`, not be blindly retried; the 30-minute check reconciles the
  exact target, event, and state. Never relaunch training from a delivery
  retry. Coalesce duplicate event and timer findings.
- The supervisor must verify `state.owner_session`, host/checkout, run ID,
  attempt, process/scheduler state, and expected artifacts before repair or
  handback. The event is a reason to inspect, not proof of success.

`scripts/run_event.py` provides a local, deterministic producer and delivery
receipt. Its `--notifier` is an executable that receives the absolute event
JSON path as one argument and exits zero only when the transport accepted the
notification. It cannot infer which desktop task to wake. Configure and test
that adapter separately before enabling immediate-wakeup claims.

Run it under a process manager or scheduler that outlives the main chat, for
example with an already-authorized job runner:

```bash
python3 scripts/run_event.py run --root <run-state-dir> \
  --run-id <run-id> --attempt 1 --notifier <tested-adapter> \
  -- python3 train.py --config <config>
```

The periodic mechanism calls `check` for that same run and attempt; it does
not relaunch training:

```bash
python3 scripts/run_event.py check --root <run-state-dir> \
  --run-id <run-id> --attempt 1 --heartbeat-file <heartbeat-path> \
  --stale-seconds 1800 --notifier <tested-adapter>
```

`check` is a single deterministic pass, **not** a timer. Register the actual
30-minute schedule separately and verify its target, saved prompt/command,
and shutdown rule. If no notifier is configured, the terminal event remains
`pending_no_notifier`; the periodic check can inspect it later. If delivery
was attempted but ambiguous, it stays `unverified` and requires target/state
reconciliation before any explicit retry.

## Desktop-specific finding from the 2026-09-27 smoke

Native `send_message_to_thread` between two Codex app tasks worked,
including supervisor-to-main handback. A separate `codex exec resume --all`
process against the idle desktop supervisor task failed with
`thread-store conflict: ... already has an active writer`. Therefore that CLI
command is **not** a verified shell-level bridge to an app-owned task. OpenAI's
Agents API session input endpoint refers to API-managed sessions and must not
be assumed to accept Codex desktop thread IDs.

Until an adapter passes a stopped-main, idle-supervisor live test, the honest
fallback is durable event recording plus a supervisor heartbeat (typically
30 minutes). That fallback has up to one interval of detection latency and
does not satisfy an "immediately" requirement.
