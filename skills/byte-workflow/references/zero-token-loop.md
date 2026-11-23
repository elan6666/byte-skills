# Zero-Token Loop & Self-Iterative Workflow Guide

Replaces periodic LLM heartbeat polling (which burns context tokens even when nothing changed) with local Python watchers (`scripts/zero_token_loop.py`) that consume **0 LLM tokens while waiting** and wake agent sessions **only on actionable events**.

## Core Architecture

1. **Event + Anti-Stall Local Daemon (`init` + `tick`)**
   - Uses macOS `launchd` with both `WatchPaths` (instant wakeup when a sealed manifest lands) and `StartInterval` (e.g., 180s local check to prevent joint-idle deadlocks when a turn produces analysis without a new manifest).
   - **Stops automatically** when `overall_outcome.status != "active"` or `.byte-os/coordination/paused.flag` exists.
   - **Priority order on each tick**:
     1. New unverified manifests (`*-steer-input.json` not yet in `*-mentor-verified.json`) -> wake `lead` immediately (deduped by SHA-256).
     2. Registered long runs in `.byte-os/active-runs.json` reaching exit, `done_file`, or log error pattern -> wake `lead`.
     3. Joint idle recovery: if no registered run is active and `lead` + Codex `workers` are all idle >= `idle_threshold_minutes` (default 8 min), wake `lead` once per cooldown window (default 15 min).

2. **Zero-Token Long-Run / Training Supervision (`wait-run`)**
   - Instead of dedicating a separate supervisor chat on a 15-minute LLM cron, run `wait-run` as a non-daemon background command inside the initiating session (e.g., Antigravity) and end the turn:
     ```bash
     python3 -B ~/.agents/skills/byte-workflow/scripts/zero_token_loop.py wait-run \
       --host user@server --pid 12345 --log-file /path/to/train.log --done-file /path/to/DONE
     ```
   - Consumes **0 LLM tokens** while waiting; exits on process completion, `done_file`, or error regex match, triggering Reactive Wakeup.

3. **Self-Loop for Clients Without an External Bridge Adapter (`wait-signal`)**
   - When a worker client (e.g., Antigravity) cannot be woken externally by `byte-bridge say`, have it run `wait-signal` as a non-daemon background command before ending its turn:
     ```bash
     python3 -B ~/.agents/skills/byte-workflow/scripts/zero_token_loop.py wait-signal \
       --project /path/to/project --watch-dir .byte-os/round-04
     ```
   - Exits immediately when the lead or another worker updates `.byte-os/coordination/worker-wake.json`, `.byte-os/coordination/ag-wake.json`, or matching verification/review artifacts.

4. **Swarm-Inspired Shared Board & Exact Stall Attribution (`post` + `board`)**
   - Inspired by `swarm_monitor`, agents can post `#seq`-indexed updates to `.byte-os/coordination/board.jsonl` (`post --from lead --to codex-methods --kind brief --text "..."`) and read with cursor tracking (`board --reader lead`).
   - On joint idle, `tick` diagnoses **who** actually stalled the chain:
     - Unread post from a worker -> wakes `lead` citing `#seq`.
     - Unanswered `@mention` to a worker -> wakes that exact worker directly (skipping unnecessary lead roundtrips); escalates to `lead` only if the worker fails to respond across retries.
     - **Anti-spam & Dormancy**: stops alerting after `max_stall_alerts` (default 3) on the same stop signature, and enters `dormant` after `dormant_after_noop_ticks` (default 5) until new board activity arrives.

5. **Sandboxed Worker Remote Job Launcher & Permission-Blocker Rule**
   - A worker blocked by sandbox/interactive permissions (e.g. `permission check failed for unsandboxed ssh`) is a **first-class workflow stall**.
   - Instead of waiting for manual UI approval, have the worker write a declarative job request under `.byte-os/server-job-requests/<job_id>.json` (strictly validated local `upload_files` + remote `/data/...` paths), let the host `launchd` watcher upload/launch via `nohup` and register `.byte-os/active-runs.json`, and wake the worker automatically via `ag-wake.json` / `worker-wake.json` on completion.

6. **Built-in Periodic Self-Reflection & Workflow Iteration**
   - Every `retrospective_every_n_wakes` cycles (default 3) or upon any `idle_recovery` wakeup, `tick` appends a reflection prompt instructing the lead and workers to audit recent friction/stalls, record root causes in `.byte-os/coordination/workflow-retrospective.md`, and directly apply reversible improvements to project workflow scripts and guidance.

## Quick Setup for Any Project

```bash
python3 -B ~/.agents/skills/byte-workflow/scripts/zero_token_loop.py init \
  --project "$PWD" \
  --lead "codex:<LEAD_THREAD_UUID>" \
  --workers "codex:<WORKER_THREAD_UUID>" \
  --interval 180 \
  --idle-minutes 8 \
  --retro-every 3 \
  --install-launchd
```
