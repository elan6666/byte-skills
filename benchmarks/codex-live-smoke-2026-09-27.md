# Codex-only communication smoke test — 2026-09-27

Scope: user-authorized, read-only test. No ZCode, Herdr, tmux, training job,
automation, or repository relay baton transfer was invoked.

## Same-task subagents

- Spawned one `gpt-6-sol` helper and one `gpt-6-luna` helper with fresh bounded
  context and no write authority. The tool accepted both model selections.
- Sol checked short-versus-long routing and exact baton ownership: **PASS**.
- Luna checked notification/ACK/verified-run separation: **PASS**.
- Both returned their findings to the main task. Their model usage and actual
  token savings were not measured; passing a model parameter alone is not a
  billing receipt.

## Cross-conversation Codex task

- Target task: `01a0defa-2104-7121-bb24-ca64c4e7b5f7` on host `local`,
  titled “回应问候”; it was idle before dispatch.
- Sent one user-authorized, no-side-effect prompt with marker
  `byte-relay-smoke-20260927` via `send_message_to_thread`.
- `wait_threads` reported a completed target turn, and its final response was
  exactly `ACK byte-relay-smoke-20260927`: **PASS** for message acceptance,
  target execution, and an observable reply in the target task.
- This is not a test of target-to-main direct messaging, owner transfer,
  durable notification replay, training event wakeup, or run verification.

## Training failure trigger

- Main-owned fixture: a fake training command emitted
  `simulated CUDA out of memory for run-42` and exited 42. The main task
  observed the failed tool call, then immediately dispatched a Luna-targeted
  message to the exact existing Codex task. Its completed turn replied
  `ALERT byte-relay-error-20260927 run-42 exit=42`. This verifies observed
  failure -> native dispatch -> target reply, **not** an autonomous watcher.
- Supervisor-owned fixture: dispatched the existing target with a bounded
  fake command (`sleep 1`, stderr marker, exit 43). The target command ended
  with exit code 43 and stderr `simulated-training-error-run-43`; its same
  turn replied `ALERT byte-relay-supervisor-owned-20260927 run-43 exit=43`.
  The main task did not query the process while it ran. This verifies prompt
  dispatch -> supervisor-owned command -> immediate failure report on tool
  return. It does not test hours-long job durability, an idle task being
  woken by an external process, or a direct target-to-main message.

No real model training, paid compute, repository handoff, automation, or
background event bridge was used. An actual unattended main-launched training
failure cannot yet be called "instant-triggered" in Codex desktop from this
evidence; it requires a configured event-to-task bridge or a permitted
scheduled monitor and its own live test.

The local fixture scenarios remain in [supervision-simulation.md](supervision-simulation.md).
