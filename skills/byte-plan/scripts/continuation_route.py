#!/usr/bin/env python3
"""Route an authorized outcome heartbeat from current state, never its old run prompt.

Read-only decision helper: no scheduler, messaging, process inspection or writes.
Native chat status must be observed by the caller. An ACTIVE heartbeat must still
be configured and verified through the client's automation tools.
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from continuation_check import Invalid, check, nonempty, read_json, require


def route(document, root, *, outcome_id, main, supervisor, caller, main_status):
    outcome = document.get("overall_outcome")
    require(isinstance(outcome, dict), "overall_outcome must exist in the project state")
    require(outcome.get("id") == outcome_id, "outcome_id mismatch; reconcile the configured target")
    require(main != supervisor, "main and supervisor must be distinct")
    require(caller in (main, supervisor), "caller must be the configured main or supervisor")
    result = {"outcome_id": outcome_id, "monitor_scope": "overall_outcome",
              "query_run": False, "may_launch": False}
    status = outcome.get("status")
    if status in ("complete", "paused", "blocked"):
        disposition, reasons, _ = check(outcome, root, datetime.now(timezone.utc), 3600)
        if disposition in ("complete", "yield_paused", "yield_blocked"):
            result.update(action="stop_monitor", reasons=reasons)
            return result
        require(disposition == "continue_work", "unresolved terminal outcome state")
    else:
        require(status == "active", "unknown outcome status")

    execution = outcome.get("execution")
    require(isinstance(execution, dict), "overall_outcome.execution must be an object")
    action = execution.get("next_action", outcome.get("next_action"))
    require(isinstance(action, dict), "current next_action must be an object")
    description = nonempty(action.get("description"), "next_action.description")
    mode = execution.get("mode")
    require(mode in ("active", "waiting"), "unknown execution mode")
    owner = document.get("owner_session")
    require(owner in (main, supervisor), "baton owner is outside this configured pair")
    result["next_action"] = description

    if owner == supervisor:
        if (mode == "active" and execution.get("role") == "supervisor"
                and outcome.get("workflow", {}).get("engine") == "byte-workflow/v1"):
            require(action.get("trigger") == "ready", "supervisor step needs a ready action")
            result.update(action="continue_supervisor" if caller == supervisor else "dispatch_supervisor",
                          target_session=supervisor)
            return result
        # A watchdog does not grant ownership or infer a run from a saved prompt.
        require(mode == "waiting", "supervisor owns baton but outcome is not waiting")
        require(action.get("trigger") == "run_terminal", "supervisor wait needs a terminal trigger")
        run_id = nonempty(execution.get("run_id"), "execution.run_id")
        attempt = execution.get("attempt")
        require(type(attempt) is int and attempt > 0, "execution.attempt must be positive")
        require(execution.get("supervisor_session") == supervisor,
                "execution supervisor differs from the configured pair")
        result.update(action="supervise_run", target_session=supervisor, query_run=True,
                      run_id=run_id, attempt=attempt)
        return result

    # A completed run may remain in historical fields; it cannot capture this tick.
    require(mode == "active", "main owns baton but execution is waiting; reconcile before work")
    require(action.get("trigger") == "ready", "main active work requires a ready action")
    result["clear_previous_run_scope"] = True
    if caller == main:
        result.update(action="continue_main", target_session=supervisor)
    elif main_status == "active":
        result.update(action="watch_main", target_session=supervisor)
    elif main_status == "idle":
        result.update(action="resume_main", target_session=main)
    else:
        # Approval/user-input/tool waits are inspected, never presumed abandoned.
        result.update(action="inspect_main", target_session=supervisor)
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--outcome-id", required=True)
    parser.add_argument("--main-session", required=True)
    parser.add_argument("--supervisor-session", required=True)
    parser.add_argument("--caller-session", required=True)
    parser.add_argument("--main-status", choices=("active", "idle", "unknown"), default="unknown")
    parser.add_argument("--event-run-id", help="Optional old notification identity; never selects the run")
    args = parser.parse_args(argv)
    try:
        document = read_json(args.state.read_bytes(), "state")
        result = route(document, args.state.resolve().parent, outcome_id=args.outcome_id,
                       main=args.main_session, supervisor=args.supervisor_session,
                       caller=args.caller_session, main_status=args.main_status)
        if args.event_run_id:
            result["event_is_current_run"] = args.event_run_id == result.get("run_id")
        code = 0
    except (Invalid, OSError) as exc:
        result = {"action": "reconcile", "reason": str(exc), "query_run": False,
                  "may_launch": False, "stop_monitor": False}
        code = 1
    result["limitation"] = "Routing only; verify native ownership, chat status, scheduling and run evidence."
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return code


if __name__ == "__main__":
    sys.exit(main())
