"""Behavior tests for outcome retention across interrupted and staged work."""

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHECKER = ROOT / "skills" / "byte-auto" / "scripts" / "continuation_check.py"
NOW = "2026-10-23T10:00:00Z"


class ContinuationCheckTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.state = self.root / "state.json"
        self.outcome = {
            "schema_version": 1,
            "id": "representation-research",
            "objective": "Resolve representation quality without losing prediction value",
            "status": "active",
            "acceptance": [
                {"id": "representation", "status": "pending"},
                {"id": "prediction", "status": "pending"},
            ],
            "next_action": {"description": "Implement and verify the next candidate",
                            "trigger": "ready"},
            "execution": {"mode": "active"},
        }

    def evidence(self, name, value):
        data = json.dumps(value, sort_keys=True).encode()
        path = self.root / name
        path.write_bytes(data)
        return {"path": name, "sha256": hashlib.sha256(data).hexdigest()}

    def invoke(self, wrapped=True, save=True, *extra):
        if save:
            value = {"overall_outcome": self.outcome, "unrelated_project_state": "preserve"}
            self.state.write_text(json.dumps(value if wrapped else self.outcome))
        before = self.state.read_bytes()
        result = subprocess.run([sys.executable, str(CHECKER), str(self.state), "--now", NOW,
                                 *extra], capture_output=True, text=True, check=False)
        self.assertEqual(self.state.read_bytes(), before, "guard must be read-only")
        self.assertFalse(result.stderr, result.stderr)
        return result.returncode, json.loads(result.stdout)

    def assert_disposition(self, disposition, code, **kwargs):
        actual_code, result = self.invoke(**kwargs)
        self.assertEqual(actual_code, code, result)
        self.assertEqual(result["disposition"], disposition, result)
        self.assertIn("does not authenticate", result["limitation"])
        return result

    def make_waiting(self):
        execution = {
            "mode": "waiting", "independent_work_remaining": False,
            "run_id": "research-round-3", "attempt": 1,
            "owner_session": "main-session", "supervisor_session": "supervisor-session",
            "monitor_id": "research-monitor",
        }
        self.outcome["execution"] = execution
        self.outcome["next_action"] = {"description": "Review terminal evidence and redesign",
                                       "trigger": "run_terminal"}
        for name, kind, status in (
            ("supervisor_ack", "supervisor_ack", "acknowledged"),
            ("monitor_registration", "monitor_registration", "active"),
            ("return_wake_receipt", "return_wake", "verified"),
        ):
            receipt = {key: execution[key] for key in (
                "run_id", "attempt", "owner_session", "supervisor_session", "monitor_id")}
            receipt.update(outcome_id=self.outcome["id"], kind=kind, status=status,
                           checked_at="2026-10-23T09:55:00Z", valid_until="2026-10-23T10:25:00Z")
            if name == "return_wake_receipt":
                receipt["verification_ref"] = "native-confirmed-route-receipt:123"
            execution[name] = self.evidence(f"{name}.json", receipt)

    def amend_receipt(self, name, **updates):
        reference = self.outcome["execution"][name]
        receipt = json.loads((self.root / reference["path"]).read_text())
        receipt.update(updates)
        self.outcome["execution"][name] = self.evidence(reference["path"], receipt)

    def mark_all_met(self):
        for item in self.outcome["acceptance"]:
            item["status"] = "met"
            source = self.evidence(item["id"] + ".source.json", {"result": "observed"})
            item["evidence"] = [self.evidence(item["id"] + ".json", {
                "kind": "acceptance_verification", "outcome_id": self.outcome["id"],
                "criterion_id": item["id"], "status": "verified", "sources": [source],
            })]

    def amend_acceptance(self, **updates):
        item = self.outcome["acceptance"][0]
        reference = item["evidence"][0]
        receipt = json.loads((self.root / reference["path"]).read_text())
        receipt.update(updates)
        item["evidence"] = [self.evidence(reference["path"], receipt)]

    def test_active_outcome_survives_interrupt_and_reread(self):
        first = self.assert_disposition("continue_work", 2)
        second = self.assert_disposition("continue_work", 2, save=False)
        self.assertEqual(first, second)

    def test_direct_outcome_document_supported(self):
        self.assert_disposition("continue_work", 2, wrapped=False)

    def test_state_option_and_schema_help(self):
        self.invoke()
        result = subprocess.run([sys.executable, str(CHECKER), "--state", str(self.state),
                                 "--now", NOW], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertEqual(json.loads(result.stdout)["disposition"], "continue_work")
        help_result = subprocess.run([sys.executable, str(CHECKER), "--help"],
                                    capture_output=True, text=True, check=False)
        self.assertEqual(help_result.returncode, 0)
        self.assertIn('"overall_outcome"', help_result.stdout)
        self.assertIn("return_wake_receipt", help_result.stdout)

    def test_missing_or_ambiguous_state_path_rejected_as_json(self):
        for arguments in ([], [str(self.state), "--state", str(self.state)]):
            result = subprocess.run([sys.executable, str(CHECKER), *arguments],
                                    capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(json.loads(result.stdout)["disposition"], "invalid")

    def test_argparse_errors_are_json_exit_one_not_continue(self):
        for arguments in (["--unknown"], ["--state"], ["--max-receipt-age-seconds", "oops"],
                          ["--state", str(self.state), "--no-such-flag", "value"]):
            with self.subTest(arguments=arguments):
                result = subprocess.run([sys.executable, str(CHECKER), *arguments],
                                        capture_output=True, text=True, check=False)
                self.assertEqual(result.returncode, 1)
                self.assertEqual(result.stderr, "")
                self.assertEqual(json.loads(result.stdout)["disposition"], "invalid")

    def test_completed_stage_or_published_report_is_not_whole_outcome(self):
        for stage in ("literature_complete", "report_published", "preflight_complete"):
            with self.subTest(stage=stage):
                self.outcome["stage"] = stage
                self.outcome["stage_complete"] = True
                self.assert_disposition("continue_work", 2)

    def test_empty_active_queue_does_not_complete_outcome(self):
        self.outcome["active_runs"] = []
        self.assert_disposition("continue_work", 2)

    def test_active_status_with_all_met_does_not_silently_complete(self):
        self.mark_all_met()
        self.assert_disposition("continue_work", 2)

    def test_missing_next_action_is_invalid_not_yield(self):
        del self.outcome["next_action"]
        self.assert_disposition("invalid", 1)

    def test_waiting_with_ready_work_still_continues(self):
        self.make_waiting()
        self.outcome["next_action"]["trigger"] = "ready"
        del self.outcome["execution"]["return_wake_receipt"]
        self.assert_disposition("continue_work", 2)

    def test_waiting_with_independent_work_still_continues(self):
        self.make_waiting()
        self.outcome["execution"]["independent_work_remaining"] = True
        self.assert_disposition("continue_work", 2)

    def test_same_run_confirmed_waiting_can_yield_without_completing(self):
        self.make_waiting()
        self.assert_disposition("yield_waiting", 0)
        self.assertEqual(self.outcome["status"], "active")

    def test_each_missing_supervision_record_rejects_yield(self):
        for name in ("supervisor_ack", "monitor_registration", "return_wake_receipt"):
            with self.subTest(name=name):
                self.make_waiting()
                del self.outcome["execution"][name]
                self.assert_disposition("invalid", 1)

    def test_wrong_run_attempt_owner_and_target_rejected(self):
        for field, value in (("run_id", "old-run"), ("attempt", 2), ("attempt", True),
                             ("owner_session", "other-main"),
                             ("supervisor_session", "other-supervisor"),
                             ("monitor_id", "old-monitor"), ("outcome_id", "other-project")):
            with self.subTest(field=field):
                self.make_waiting()
                self.amend_receipt("return_wake_receipt", **{field: value})
                self.assert_disposition("invalid", 1)

    def test_delivery_only_is_not_a_verified_return_route(self):
        self.make_waiting()
        self.amend_receipt("return_wake_receipt", status="delivered")
        self.assert_disposition("invalid", 1)

    def test_return_route_requires_verification_reference(self):
        self.make_waiting()
        self.amend_receipt("return_wake_receipt", verification_ref="")
        self.assert_disposition("invalid", 1)

    def test_inactive_monitor_rejects_yield(self):
        self.make_waiting()
        self.amend_receipt("monitor_registration", status="paused")
        self.assert_disposition("invalid", 1)

    def test_expired_stale_future_and_naive_receipts_rejected(self):
        cases = (
            {"valid_until": NOW},
            {"checked_at": "2026-10-23T08:00:00Z"},
            {"checked_at": "2026-10-23T10:01:00Z"},
            {"checked_at": "2026-10-23T09:55:00"},
        )
        for changes in cases:
            with self.subTest(changes=changes):
                self.make_waiting()
                self.amend_receipt("supervisor_ack", **changes)
                self.assert_disposition("invalid", 1)

    def test_waiting_evidence_tampering_rejected(self):
        self.make_waiting()
        (self.root / "supervisor_ack.json").write_text("{}")
        self.assert_disposition("invalid", 1)

    def test_incomplete_acceptance_cannot_be_marked_complete(self):
        self.outcome["status"] = "complete"
        self.assert_disposition("invalid", 1)

    def test_all_completed_acceptance_with_verified_evidence(self):
        self.mark_all_met()
        self.outcome["status"] = "complete"
        self.assert_disposition("complete", 0)

    def test_other_outcome_or_old_criterion_cannot_support_completion(self):
        for changes in ({"outcome_id": "other-outcome"}, {"criterion_id": "old-criterion"},
                        {"kind": "report_published"}, {"status": "pending"}):
            with self.subTest(changes=changes):
                self.mark_all_met()
                self.outcome["status"] = "complete"
                self.amend_acceptance(**changes)
                self.assert_disposition("invalid", 1)

    def test_arbitrary_hash_matching_file_is_not_acceptance_verification(self):
        self.mark_all_met()
        self.outcome["status"] = "complete"
        self.outcome["acceptance"][0]["evidence"] = [self.evidence("unrelated.json", {"ok": True})]
        self.assert_disposition("invalid", 1)

    def test_acceptance_sources_must_exist_and_match_hash(self):
        for missing in (True, False):
            with self.subTest(missing=missing):
                self.mark_all_met()
                self.outcome["status"] = "complete"
                path = self.root / "representation.source.json"
                path.unlink() if missing else path.write_text('{"result": "changed"}')
                self.assert_disposition("invalid", 1)

    def test_acceptance_without_source_attachments_is_invalid(self):
        self.mark_all_met()
        self.outcome["status"] = "complete"
        self.amend_acceptance(sources=[])
        self.assert_disposition("invalid", 1)

    def test_complete_needs_nonempty_acceptance(self):
        self.outcome.update(status="complete", acceptance=[])
        self.assert_disposition("invalid", 1)

    def test_met_acceptance_cannot_have_no_evidence(self):
        self.mark_all_met()
        self.outcome.update(status="complete")
        self.outcome["acceptance"][0]["evidence"] = []
        self.assert_disposition("invalid", 1)

    def test_missing_and_tampered_acceptance_evidence_rejected(self):
        for missing in (True, False):
            with self.subTest(missing=missing):
                self.mark_all_met()
                self.outcome["status"] = "complete"
                path = self.root / "representation.json"
                path.unlink() if missing else path.write_text('{"verified": false}')
                self.assert_disposition("invalid", 1)

    def test_duplicate_acceptance_ids_rejected(self):
        self.outcome["acceptance"][1]["id"] = "representation"
        self.assert_disposition("invalid", 1)

    def test_user_pause_is_respected(self):
        self.outcome["status"] = "paused"
        self.outcome["pause_request"] = self.evidence("pause.json", {
            "kind": "user_pause_request", "outcome_id": self.outcome["id"],
            "requested_by": "user", "request_ref": "user-message:stop-after-this-run",
        })
        self.assert_disposition("yield_paused", 0)

    def test_user_pause_precedes_repairing_old_acceptance_evidence(self):
        self.mark_all_met()
        (self.root / "representation.json").unlink()
        self.test_user_pause_is_respected()

    def test_timeout_or_agent_pause_is_not_user_pause(self):
        self.outcome["status"] = "paused"
        for kind, who in (("elapsed_time", "user"), ("user_pause_request", "agent")):
            with self.subTest(kind=kind, who=who):
                self.outcome["pause_request"] = self.evidence("pause.json", {
                    "kind": kind, "outcome_id": self.outcome["id"],
                    "requested_by": who, "request_ref": "some-reference",
                })
                self.assert_disposition("invalid", 1)

    def test_concrete_external_blocker_can_yield(self):
        self.outcome["status"] = "blocked"
        self.outcome["blocker"] = {
            "kind": "unavailable_external_state", "reason": "Research server unreachable",
            "independent_work_remaining": False,
            "external_dependency": "Research SSH endpoint",
            "resume_trigger": "SSH succeeds and saved run identity is reconciled",
            "evidence": [self.evidence("connection.json", {"tcp": "timeout"})],
        }
        self.assert_disposition("yield_blocked", 0)

    def test_blocker_does_not_hide_independent_work(self):
        self.test_concrete_external_blocker_can_yield()
        self.outcome["blocker"]["independent_work_remaining"] = True
        self.assert_disposition("continue_work", 2)

    def test_blocker_needs_explicit_independent_work_assessment(self):
        self.test_concrete_external_blocker_can_yield()
        del self.outcome["blocker"]["independent_work_remaining"]
        self.assert_disposition("invalid", 1)

    def test_difficulty_is_not_external_blocker(self):
        self.outcome.update(status="blocked", blocker={"kind": "hard_problem"})
        self.assert_disposition("invalid", 1)

    def test_bad_state_is_reported_as_json(self):
        for value in ("broken", "[]", '{"overall_outcome": null}'):
            with self.subTest(value=value):
                self.state.write_text(value)
                self.assert_disposition("invalid", 1, save=False)


if __name__ == "__main__":
    unittest.main()
