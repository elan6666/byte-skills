# Supervision workflow simulation

Run from the canonical `byte-skills` repository:

```bash
python3 -m unittest tests.test_workflow_simulation -v
```

The test creates a temporary Git project with a simulated Astra main session,
Luna supervisor, `run-42`, handoffs, and receipts. It
invokes the shipped `session_registry.py`, `relay_state.py`, and
`task_receipt.py` CLIs; it does not launch a real model, training job, Codex
task, automation, or Herdr/tmux session.

| Scenario | Exercised invariant | Boundary |
| --- | --- | --- |
| Short Luna helper | Other session cannot register or take the main baton; main can still start a receipt | No model call or token accounting is simulated |
| Codex long supervision | Exact `owner_session` moves only after an existing handoff; main is denied further owned work | Direct message delivery is not available to the test |
| Ambiguous notification | Durable state remains with the supervisor and the run is not relaunched after a simulated timeout | No actual transport ACK or retry is claimed |
| Successful run | Supervisor receipt requires an output artifact and passing verification before returning the baton | The checkpoint is a dummy file, not scientific validation |
| Failed run | Failed verification cannot create a complete receipt; baton returns for a fix decision | The failed process/scheduler is simulated |
| Missing Codex host | Handoff rejects an unaddressable target without changing owner/history | Does not prove host availability |

The separate [Codex live smoke](codex-live-smoke-2026-09-27.md) verifies
native dispatch, an observable target reply, and a bounded supervisor-owned
process failure. Not yet end-to-end tested: a process/scheduler event waking
an **idle** Codex task; heartbeat recovery after a watcher crash; direct
supervisor-to-main task reporting; hours-long job durability; actual model
usage or cost. Those require the relevant live runtime, exact task IDs, a
configured event bridge or scheduled monitor, and a bounded job. The skill
must report these as unverified until such a trial passes; the local
simulation is a state/authority regression test, not a live supervision
receipt.
