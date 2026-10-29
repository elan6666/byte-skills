"""Regression tests for stale reminders and a stalled main between experiments."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROUTER = Path(__file__).resolve().parents[1] / "skills/byte-auto/scripts/continuation_route.py"


class ContinuationRouteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.state = Path(self.temp.name) / "state.json"
        self.document = {
            "owner_session": "codex:main",
            "overall_outcome": {
                "schema_version": 1, "id": "research", "objective": "Resolve representation issues",
                "status": "active", "acceptance": [{"id": "quality", "status": "pending"}],
                "next_action": {"description": "Read focused papers and implement the next hypothesis",
                                "trigger": "ready"},
                "execution": {"mode": "active", "run_id": "finished-run"},
            },
        }

    def invoke(self, caller="supervisor", main_status="idle", event=None):
        self.state.write_text(json.dumps(self.document))
        before = self.state.read_bytes()
        args = [sys.executable, str(ROUTER), "--state", str(self.state), "--outcome-id", "research",
                "--main-session", "codex:main", "--supervisor-session", "codex:supervisor",
                "--caller-session", "codex:" + caller, "--main-status", main_status]
        if event:
            args += ["--event-run-id", event]
        result = subprocess.run(args, capture_output=True, text=True)
        self.assertEqual(self.state.read_bytes(), before)
        self.assertEqual(result.stderr, "")
        return result.returncode, json.loads(result.stdout)

    def waiting(self):
        self.document["owner_session"] = "codex:supervisor"
        outcome = self.document["overall_outcome"]
        outcome["next_action"]["trigger"] = "run_terminal"
        outcome["execution"] = {"mode": "waiting", "run_id": "new-run", "attempt": 2,
                                "supervisor_session": "codex:supervisor"}

    def test_stale_reminder_routes_idle_main_to_current_work(self):
        code, result = self.invoke(event="finished-run")
        self.assertEqual(code, 0, result)
        self.assertEqual(result["action"], "resume_main")
        self.assertFalse(result["query_run"])
        self.assertFalse(result["event_is_current_run"])
        self.assertEqual(result["target_session"], "codex:main")

    def test_heartbeat_in_main_turn_continues_even_though_main_is_active(self):
        code, result = self.invoke(caller="main", main_status="active", event="finished-run")
        self.assertEqual(code, 0, result)
        self.assertEqual(result["action"], "continue_main")
        self.assertEqual(result["target_session"], "codex:supervisor")

    def test_active_main_gets_quiet_read_only_watchdog(self):
        code, result = self.invoke(main_status="active")
        self.assertEqual(code, 0, result)
        self.assertEqual(result["action"], "watch_main")
        self.assertFalse(result["query_run"])
        self.assertFalse(result["may_launch"])

    def test_unknown_main_status_needs_inspection_not_duplicate_work(self):
        code, result = self.invoke(main_status="unknown")
        self.assertEqual(code, 0, result)
        self.assertEqual(result["action"], "inspect_main")

    def test_specific_execution_action_wins_over_historical_parent_summary(self):
        self.document["overall_outcome"]["execution"]["next_action"] = {
            "trigger": "ready", "description": "Implement current R15 direction hypothesis"}
        code, result = self.invoke(caller="main", main_status="active")
        self.assertEqual(code, 0, result)
        self.assertEqual(result["action"], "continue_main")
        self.assertEqual(result["next_action"], "Implement current R15 direction hypothesis")

    def test_new_run_wins_over_old_event_and_paused_historical_monitor(self):
        self.waiting()
        self.document["execution"] = {"run_id": "old-run", "monitor_status": "PAUSED"}
        code, result = self.invoke(event="old-run")
        self.assertEqual(code, 0, result)
        self.assertEqual(result["action"], "supervise_run")
        self.assertEqual(result["run_id"], "new-run")
        self.assertEqual(result["attempt"], 2)
        self.assertFalse(result["event_is_current_run"])

    def test_main_never_gets_write_authority_while_supervisor_owns_run(self):
        self.waiting()
        code, result = self.invoke(caller="main", main_status="active")
        self.assertEqual(code, 0, result)
        self.assertEqual(result["action"], "supervise_run")
        self.assertEqual(result["target_session"], "codex:supervisor")

    def test_inconsistent_baton_or_scope_requires_reconciliation_not_stop(self):
        for change in ("owner", "outcome", "mode"):
            with self.subTest(change=change):
                original = json.loads(json.dumps(self.document))
                if change == "owner":
                    self.document["owner_session"] = "codex:other"
                elif change == "outcome":
                    self.document["overall_outcome"]["id"] = "other-outcome"
                else:
                    self.document["overall_outcome"]["execution"]["mode"] = "waiting"
                code, result = self.invoke()
                self.assertEqual(code, 1, result)
                self.assertEqual(result["action"], "reconcile")
                self.assertFalse(result["stop_monitor"])
                self.document = original

    def test_explicit_verified_pause_stops_outcome_monitor(self):
        import hashlib
        receipt = {"kind": "user_pause_request", "requested_by": "user",
                   "outcome_id": "research", "request_ref": "user:pause"}
        data = json.dumps(receipt).encode()
        path = self.state.parent / "pause.json"
        path.write_bytes(data)
        self.document["overall_outcome"].update(
            status="paused", pause_request={"path": path.name, "sha256": hashlib.sha256(data).hexdigest()})
        code, result = self.invoke()
        self.assertEqual(code, 0, result)
        self.assertEqual(result["action"], "stop_monitor")

    def test_unverified_completion_cannot_stop_monitor(self):
        self.document["overall_outcome"]["status"] = "complete"
        code, result = self.invoke()
        self.assertEqual(code, 1, result)
        self.assertEqual(result["action"], "reconcile")

    def test_analysis_literature_experiment_and_return_remain_one_loop(self):
        outcome = self.document["overall_outcome"]
        for stage in ("characterize results", "inspect literature", "implement solution"):
            outcome["next_action"]["description"] = stage
            code, result = self.invoke(caller="main", main_status="active", event="finished-run")
            self.assertEqual(code, 0, result)
            self.assertEqual(result["action"], "continue_main")
            self.assertEqual(result["next_action"], stage)
        self.waiting()
        code, result = self.invoke()
        self.assertEqual((code, result["action"]), (0, "supervise_run"))
        self.document["owner_session"] = "codex:main"
        outcome["execution"]["mode"] = "active"
        outcome["next_action"] = {"trigger": "ready", "description": "Analyze result and diagnose again"}
        code, result = self.invoke(event="new-run")
        self.assertEqual((code, result["action"]), (0, "resume_main"))
        code, result = self.invoke(caller="main", main_status="active")
        self.assertEqual((code, result["action"]), (0, "continue_main"))
        # Initial ACK does not disable recovery if main later ends after a report.
        code, result = self.invoke(main_status="idle")
        self.assertEqual((code, result["action"]), (0, "resume_main"))


if __name__ == "__main__":
    unittest.main()
