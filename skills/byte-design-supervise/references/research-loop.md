# Continuous research with an existing main/supervisor pair

Use only when the user explicitly requests scheduled pursuit of an overall
research outcome. Ordinary one-run supervision still ends its monitor on return.
Use ordinary turns unless Goal mode was requested. Reuse the existing pair,
state, monitor ID, interval and resource authority.

## Preserve the method

Keep the user's ordered method in the existing overall outcome. For example:
experiment results → characterize the representation problem → inspect relevant
primary literature → choose a falsifiable solution → implement/test → bounded
experiment → matched analysis → characterize the next unresolved problem.
Carry forward observations, hypothesis, sources, changed factor and the result.
Reports/platform uploads are useful evidence, not exit points. Reuse relevant
literature where sufficient; do not add irrelevant searches merely to tick a box.

## One timer, changing responsibility

The monitor identifies the stable outcome, state path and exact pair. It reads
fresh state on every tick; run IDs/hashes/allowed repairs come from the current
immutable handoff, not from a long-lived prompt. Native readback proves its
ACTIVE status, current target and cadence after every transition.
On retarget, preserve that reusable prompt rather than rewriting it into a
phase summary. Determine `--caller-session` from the actual executing chat;
never hardcode supervisor as caller in a prompt that will later target main.
Otherwise a main wake can be misclassified as a quiet supervisor tick.

| Current state | Timer target and action |
| --- | --- |
| Supervisor owns a waiting run | Supervisor checks the exact run/attempt and authorized repairs |
| Terminal run returned, main not yet continuing | Same timer targets main as the return fallback; main independently verifies and acts |
| Main is doing analysis, literature review or implementation | Same timer targets supervisor as a read-only progress watchdog |
| Main idle, overall outcome active, action ready | Supervisor retargets the same timer to main; one authorized nudge may accelerate resumption |
| Main in approval/input wait or status unknown | Inspect once and respect the user/runtime wait; do not bypass it |
| Verified overall completion, explicit pause or evidenced external block | Pause/delete the outcome timer, preserving the specific resumption condition |

When main is active, supervisor reads compact outcome state and a native main
status snapshot, stays quiet, never polls an old GPU run and never writes
main-owned state. Silence or agent idle alone cannot establish experiment success.
When main owns work and receives a stale heartbeat, it reconciles the stale
scope and continues the current authorized action in the same turn. It must
not finish its reply solely with “old reminder ignored.” Retarget the timer
to supervisor before continuing so an accidental later final answer is recoverable.

On run return, stop the old run queries while retaining this explicitly
authorized outcome monitor. A substantive initial main ACK does not justify
pausing all future recovery checks. Per-run monitors from unrelated assignments
still stop normally. Repeated ticks use the same monitor; no duplicate timers.

## Deterministic tick routing

```bash
python3 scripts/continuation_route.py \
  --state /path/to/project/.byte-os/coordination/state.json \
  --outcome-id <stable-outcome-id> \
  --main-session codex:<main-id> \
  --supervisor-session codex:<supervisor-id> \
  --caller-session codex:<actual-caller-id> \
  --main-status <active|idle|unknown>
```

The paths above are relative to the installed skill. A supervisor obtains main
status from a native thread read/wait, not a guessed state entry. A tick already
running in the main chat returns `continue_main` when main owns ready work;
its own active status does not make it a no-op. `watch_main` means quiet progress
checking; `resume_main` means retarget/wake main; `supervise_run` means current
identity-bound observation. `reconcile` forbids run queries/launch and preserves
the recovery lane while the owner resolves the mismatch. The router is a local
decision helper, not a scheduler or evidence of successful delivery.

Keep `overall_outcome.execution` current and root `owner_session` accurate.
If `overall_outcome.execution.next_action` exists, it is the current scoped
step; otherwise use `overall_outcome.next_action`. Reconcile stale summaries
in the owner's turn rather than repeating a completed diagnostic.
Historical execution fields and old reminders must not replace either source.
Only the owner updates project state. Retargeting a timer grants no project
write authority. Do not launch another experiment from supervisor to work
around main inactivity.

## Runtime acceptance

Before calling this continuous loop armed, observe native status and saved
timer readback, then check at least one real scheduled tick/owned continuation.
Local tests cover the routing decisions, not app scheduling. If a native
message produces an empty main turn, keep the main-target timer active until
an owned substantive action is observed. Then move the same timer to supervisor
progress checking, not PAUSED. Immediate terminal-event wake still needs a
tested adapter; a timer alone provides only periodic recovery.

Do not claim the scientific outcome is attainable or met from timer health.
Stop on the user's explicit pause, actual overall acceptance, or a concrete
external barrier after safe independent work is exhausted. Maintain the user’s
data, validation, compute and spending limits throughout the cycle.
