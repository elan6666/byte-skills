# Codex neural-network relay live smoke — 2026-09-27

Isolated project: `/Users/elan/Documents/byte/codex-neural-relay.4GVWTq`.
CPU-only two-hidden-unit neural network; no PyTorch, GPU, paid job, or real
dataset. The source fixture is `tiny-neural-relay/train.py` and deliberately
bad one-weight checkpoint is `tiny-neural-relay/bad-checkpoint.json`.

## Observed sequence

1. A `gpt-6-luna` same-task subagent ran the faulty command read-only and
   returned exit 1 plus `ValueError: checkpoint output width 1 != hidden width 2`.
   It did not take the Byte Relay baton.
2. The main task registered its exact Codex session, wrote a handoff, and used
   `relay_state.py` to assign `stage=supervise` to the existing independent
   Luna Codex task. Native task messaging dispatched that target.
3. The supervisor registered its session and ran `tiny-neural-1` exactly once.
   Its log records the traceback and exit 1. It wrote a failure handoff. Its
   first return-baton command mistyped its own session ID; the authority gate
   rejected it, leaving the supervisor owner intact. After a targeted
   correction, without rerunning training, the return handoff succeeded.
4. The supervisor initially withheld a message because it could not establish
   user authorization from the delegated prompt alone. After reading the
   main task's actual user requests, it sent a native cross-task failure
   message. The main task received it while active.
5. The main task approved one bounded in-memory checkpoint repair and handed
   `tiny-neural-2` to the supervisor. It ran once; the log records exit 0 and
   `FINAL_LOSS=0.000525`, below the 0.02 threshold. The bad checkpoint and
   first-run log were preserved. The supervisor handed the baton back with
   `stage=review` and sent a completion message to the main task.
6. The main task independently parsed both logs and `state.json`: four handoff
   history entries, exact main owner in review, first exit 1, retry exit 0,
   final loss 0.000525. This establishes the short live baton/error/repair/
   completion cycle, including reverse task messaging.

## What this did not prove

The main task remained active to coordinate this smoke test, so this is **not**
proof that a stopped main task is automatically resumed. The supervisor-owned
CPU commands were short; there was no detached training process, persistent
error-event bridge, 30-minute automation, watcher-crash recovery, or real
hours-long training. The initial handoff typo and authorization check are
real failure modes, not hidden by the final success. A full unattended dual-
trigger workflow still needs those components and an end-to-end live test.

## Main-launched event-hook extension

On the `codex/byte-supervision-preset` branch, the new
`skills/byte-relay/scripts/run_event.py` wrapped the same faulty
network. Attempt 1 produced a durable terminal event with exit 1 and a mock
notifier acceptance. Attempt 2 trained with the bounded repair (exit 0) while
no notifier was configured; a later explicit `check` found that existing
terminal event and marked a mock delivery accepted. Unit tests also covered a
stale heartbeat, duplicate-launch rejection, and an ambiguous delivery that
must not be blindly retried.

A detached wrapper process was launched by a parent command that exited
immediately. Two seconds later it had written `tiny-neural-live:3:terminal`
with exit 1 under `/Users/elan/Documents/byte/codex-hook-smoke.KAiBs4`.
This verifies process/event persistence for this bounded local test, not
survival under every desktop, scheduler, logout, or machine-restart condition.

The only tested notifier was `/usr/bin/true` (a mock transport). A separate
`codex exec resume --all -m gpt-6-luna` attempt against the idle desktop
supervisor task failed with `thread-store conflict: ... already has an active
writer`. No prompt was delivered by that CLI route. The immediate external
event-to-Codex-desktop wakeup and an actual 30-minute automation remain
unverified; do not interpret the mock acceptance as Codex delivery.
