"""Exercise custom workflow transitions and recovery with real bounded CPU jobs.

Native scheduler receipts in long-wait tests are offline fixtures; these tests
do not claim that an app scheduler or another model executed a turn.
"""

import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "skills/byte-workflow/scripts/workflow.py"
RELAY = ROOT / "skills/byte-relay/scripts/relay_state.py"


def hashref(path):
    return {"path": str(path), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def definition():
    return {
        "schema_version": 1, "id": "test-research", "version": 1,
        "parameters": {"problem": "the observed prediction error"}, "start": "diagnose",
        "acceptance": [{"id": "quality", "description": "Measured loss passes the fixed threshold",
                        "checks": {"fact": "loss", "op": "le", "value": 0.01}}],
        "steps": {
            "diagnose": {"owner": "main", "action": "Characterize ${problem}",
                         "acceptance": {"fact": "observed", "op": "eq", "value": True},
                         "transitions": [{"to": "literature"}]},
            "literature": {"owner": "main", "action": "Review the relevant source and hypothesis",
                           "acceptance": {"fact": "reviewed", "op": "eq", "value": True},
                           "transitions": [{"to": "experiment"}]},
            "experiment": {"owner": "main", "wait_owner": "supervisor", "action": "Run and verify the bounded trial",
                           "acceptance": {"fact": "verified", "op": "eq", "value": True},
                           "transitions": [{"to": "evaluate"}]},
            "evaluate": {"owner": "main", "action": "Compare measured results to the fixed threshold",
                         "acceptance": {"fact": "compared", "op": "eq", "value": True},
                         "transitions": [{"when": {"overall_accepted": True}, "to": "done"},
                                         {"to": "diagnose", "new_iteration": True}]},
        },
    }


class WorkflowEngineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.project = self.root / "project"
        self.project.mkdir()
        self.library = self.root / "library"
        self.template = self.root / "template.json"
        self.template.write_text(json.dumps(definition()))
        self.state_path = self.project / ".byte-os/coordination/state.json"
        self.counter = 0
        result = self.call("init", "--template", str(self.template), "--objective", "Solve the measured problem",
                           "--authority-ref", "user:test-loop", "--main-session", "codex:main",
                           "--supervisor-session", "codex:supervisor", "--monitor-id", "test-monitor", "--continuous")
        self.assertEqual(result[0], 0, result)

    def call(self, command, *extra):
        args = [sys.executable, str(CLI), "--home", str(self.library), command]
        if command not in ("validate", "install-template", "list-templates"):
            args += ["--project", str(self.project)]
        result = subprocess.run(args + list(extra), capture_output=True, text=True)
        self.assertFalse(result.stderr, result.stderr)
        return result.returncode, json.loads(result.stdout)

    def state(self):
        return json.loads(self.state_path.read_text())

    def outcome(self):
        return self.state()["overall_outcome"]

    def workflow(self):
        return self.outcome()["workflow"]

    def artifact(self, value):
        self.counter += 1
        path = self.root / ("artifact-" + str(self.counter) + ".json")
        path.write_text(json.dumps(value))
        return path

    def proof(self, kind, facts=None, **extra):
        outcome, workflow = self.outcome(), self.workflow()
        source = self.artifact({"observation": "bounded test fixture", "facts": facts or {}})
        value = {"kind": kind, "outcome_id": outcome["id"], "step_id": workflow["step"],
                 "iteration": workflow["iteration"], "visit": workflow["visit"], "status": "verified",
                 "sources": [hashref(source)], "facts": facts or {}}
        value.update(extra)
        return self.artifact(value)

    def change(self, command, *, actor=None, event=None, revision=None, evidence=None, extra=()):
        state = self.state()
        args = ["--session", actor or state["owner_session"], "--expect-revision",
                str(state["overall_outcome"]["workflow"]["revision"] if revision is None else revision),
                "--event-id", event or ("event-" + str(self.counter + 1) + "-" + command)]
        if evidence:
            args += ["--evidence", str(evidence)]
        return self.call(command, *args, *extra)

    def advance(self, facts):
        result = self.change("advance", evidence=self.proof("step_result", facts))
        self.assertEqual(result[0], 0, result)
        return result[1]

    def experiment_step(self):
        self.advance({"observed": True})
        self.advance({"reviewed": True})
        self.assertEqual(self.workflow()["step"], "experiment")

    def init_custom(self, template):
        self.project = self.root / ("custom-" + str(self.counter))
        self.state_path = self.project / ".byte-os/coordination/state.json"
        self.template.write_text(json.dumps(template))
        result = self.call("init", "--template", str(self.template), "--objective", "Custom workflow",
                           "--authority-ref", "user:custom", "--main-session", "codex:main",
                           "--supervisor-session", "codex:supervisor", "--monitor-id", "test-monitor", "--continuous")
        self.assertEqual(result[0], 0, result)

    def real_trial(self, coefficient):
        code = f"import json; a={coefficient}; print(json.dumps({{'loss': sum((a*x-2*x)**2 for x in (1,2,3))/3}}))"
        process = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
        self.assertEqual(process.returncode, 0, process.stderr)
        metrics = json.loads(process.stdout)
        command = "python bounded CPU loss measurement"
        output = self.artifact({"kind": "command_result", "status": "completed", "session": "codex:main",
                                "command": command, "exit_code": process.returncode, **metrics})
        return metrics, output, command

    def record_short(self, output, *, run_id="short-trial", exit_code=0):
        terminal = self.proof("run_terminal", run_id=run_id, attempt=1, exit_code=exit_code,
                              wait_mode="same_task", owner_session="codex:main", sources=[hashref(output)])
        result = self.change("record-run", evidence=terminal)
        self.assertEqual(result[0], 0, result)
        self.advance({"verified": True, "exit_code": 999})

    def test_two_real_cpu_rounds_preserve_loop_until_verified_acceptance(self):
        for number, coefficient in ((1, 0), (2, 2)):
            self.experiment_step()
            metrics, output, _ = self.real_trial(coefficient)
            self.record_short(output, run_id="trial-" + str(number))
            self.assertEqual(self.state()["owner_session"], "codex:main")
            proof = self.proof("acceptance_verification", metrics, criterion_id="quality", sources=[hashref(output)])
            result = self.change("accept", evidence=proof, extra=("--criterion", "quality"))
            if number == 1:
                self.assertEqual(result[0], 1)
                self.advance({"compared": True})
                self.assertEqual(self.workflow()["iteration"], 2)
                self.assertEqual(self.outcome()["status"], "active")
            else:
                self.assertEqual(result[0], 0, result)
                self.advance({"compared": True})
                self.assertEqual(self.outcome()["status"], "complete")
        result = self.call("route", "--caller-session", "codex:supervisor", "--main-status", "idle")
        self.assertEqual(result[1]["action"], "stop_monitor")

    def test_stale_and_duplicate_events_cannot_advance_twice(self):
        proof = self.proof("step_result", {"observed": True})
        first = self.change("advance", evidence=proof, event="same-event", revision=0)
        self.assertEqual(first[0], 0, first)
        duplicate = self.change("advance", evidence=proof, event="same-event", revision=0)
        self.assertEqual(duplicate[0], 0, duplicate)
        self.assertTrue(duplicate[1]["idempotent"])
        self.assertEqual(self.workflow()["revision"], 1)
        current = self.proof("step_result", {"reviewed": True})
        before = self.state_path.read_bytes()
        self.assertEqual(self.change("advance", evidence=current, event="fresh", revision=0)[0], 1)
        self.assertEqual(self.state_path.read_bytes(), before)
        self.assertEqual(self.change("advance", evidence=current, event="same-event")[0], 1)

    def test_wrong_actor_missing_fact_and_old_step_leave_state_unchanged(self):
        before = self.state_path.read_bytes()
        proof = self.proof("step_result", {"observed": True})
        self.assertEqual(self.change("advance", evidence=proof, actor="codex:supervisor")[0], 1)
        missing = self.proof("step_result", {})
        self.assertEqual(self.change("advance", evidence=missing)[0], 1)
        boolean_as_number = self.proof("step_result", {"observed": 1})
        self.assertEqual(self.change("advance", evidence=boolean_as_number)[0], 1)
        self.assertEqual(self.state_path.read_bytes(), before)
        self.advance({"observed": True})
        self.assertEqual(self.change("advance", evidence=proof)[0], 1)

    def test_template_is_pinned_and_existing_instance_cannot_be_overwritten(self):
        self.template.write_text(json.dumps(dict(definition(), start="literature")))
        self.assertEqual(self.call("status")[1]["step"], "diagnose")
        before = self.state_path.read_bytes()
        self.assertEqual(self.call("init", "--template", str(self.template), "--objective", "Overwrite",
                                   "--authority-ref", "user:new", "--main-session", "codex:main",
                                   "--supervisor-session", "codex:supervisor")[0], 1)
        self.assertEqual(self.state_path.read_bytes(), before)
        snapshot = self.project / ".byte-os/workflow.yaml"
        snapshot.write_text(snapshot.read_text() + " ")
        self.assertEqual(self.call("status")[0], 1)

    def test_library_install_export_and_reuse_bindings_are_isolated(self):
        installed = self.call("install-template", "--file", str(self.template))
        self.assertEqual(installed[0], 0, installed)
        self.assertEqual(self.call("list-templates")[1]["templates"], ["test-research"])
        self.assertEqual(self.call("install-template", "--file", str(self.template))[0], 1)
        exported = self.root / "export.yaml"
        self.assertEqual(self.call("export", "--output", str(exported))[0], 0)
        self.assertEqual(json.loads(exported.read_text()), definition())
        self.assertNotIn("codex:main", exported.read_text())
        other = self.root / "other-project"
        result = subprocess.run([sys.executable, str(CLI), "--home", str(self.library), "init", "--project", str(other),
                                 "--template", "test-research", "--objective", "Different project", "--authority-ref", "user:other",
                                 "--main-session", "codex:other-main", "--supervisor-session", "codex:other-supervisor"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotEqual(json.loads(result.stdout)["outcome_id"], self.outcome()["id"])
        self.assertEqual(self.state()["owner_session"], "codex:main")

    def test_invalid_templates_reject_unknown_fields_missing_fallback_and_unreachable_steps(self):
        cases = []
        value = definition(); value["shell_eval"] = "must not run"; cases.append(value)
        value = definition(); value["steps"]["diagnose"]["transitions"] = [{"when": {"fact": "x", "op": "eq", "value": True}, "to": "literature"}]; cases.append(value)
        value = definition(); value["steps"]["orphan"] = copy.deepcopy(value["steps"]["diagnose"]); cases.append(value)
        value = definition(); value["steps"]["diagnose"]["transitions"][0]["to"] = "missing"; cases.append(value)
        for number, value in enumerate(cases):
            path = self.root / ("invalid-" + str(number) + ".json")
            path.write_text(json.dumps(value))
            self.assertEqual(self.call("validate", "--file", str(path))[0], 1)

    def test_tampered_receipt_or_source_blocks_later_work(self):
        proof = self.proof("step_result", {"observed": True})
        self.assertEqual(self.change("advance", evidence=proof)[0], 0)
        source = Path(json.loads(proof.read_text())["sources"][0]["path"])
        source.write_text("{}")
        self.assertEqual(self.call("doctor")[0], 1)
        self.assertEqual(self.call("status")[0], 1)

    def test_quiet_active_main_idle_recovery_and_generated_prompt(self):
        prompt = self.call("monitor-prompt")
        self.assertEqual(prompt[0], 0, prompt)
        self.assertEqual(prompt[1]["status"], "requires_native_registration")
        self.assertIn("<actual current harness:session-id>", prompt[1]["prompt"])
        for status, action in (("active", "watch_main"), ("idle", "resume_main"), ("unknown", "inspect_main")):
            result = self.call("route", "--caller-session", "codex:supervisor", "--main-status", status)
            self.assertEqual(result[1]["action"], action)
        self.assertEqual(self.call("route", "--caller-session", "codex:main", "--main-status", "active")[1]["action"], "continue_main")

    def long_wait(self):
        self.experiment_step()
        outcome, workflow = self.outcome(), self.workflow()
        run_id = "long-test"
        handoff = self.project / ".byte-os/coordination/handoffs/launch.md"
        handoff.parent.mkdir(parents=True)
        handoff.write_text("# Local test fixture handoff; not a native model launch\n")
        launch = self.proof("run_launch", run_id=run_id, attempt=1, process={"host": "fixture", "identity": "test-process"})
        result = self.change("start-run", evidence=launch, extra=("--run-id", run_id, "--handoff", str(handoff)))
        self.assertEqual(result[0], 0, result)
        self.assertEqual(self.outcome()["execution"]["monitor_status"], "unarmed")
        self.assertEqual(self.call("doctor")[0], 1)
        extra = []
        for name, kind, status in (("supervisor-ack", "supervisor_ack", "acknowledged"),
                                   ("monitor-registration", "monitor_registration", "active"),
                                   ("return-wake-receipt", "return_wake", "verified")):
            stamp = datetime.now(timezone.utc)
            value = {"kind": kind, "status": status, "outcome_id": outcome["id"], "run_id": run_id, "attempt": 1,
                     "owner_session": "codex:main", "supervisor_session": "codex:supervisor", "monitor_id": "test-monitor",
                     "checked_at": stamp.isoformat(), "valid_until": (stamp + timedelta(minutes=20)).isoformat(),
                     "verification_ref": "offline-fixture-not-native-scheduling"}
            extra += ["--" + name, str(self.artifact(value))]
        result = self.change("arm-run", extra=tuple(extra))
        self.assertEqual(result[0], 0, result)
        return run_id

    def test_long_return_needs_substantive_main_action_and_rejects_empty_ack(self):
        run_id = self.long_wait()
        self.assertEqual(self.state()["owner_session"], "codex:supervisor")
        self.assertEqual(self.change("advance", evidence=self.proof("step_result", {"verified": True}))[0], 1)
        terminal = self.proof("run_terminal", run_id=run_id, attempt=1, exit_code=1)
        handoff = self.project / ".byte-os/coordination/handoffs/return.md"
        handoff.write_text("# Run failed; main must independently inspect it\n")
        returned = self.change("return-run", evidence=terminal, extra=("--handoff", str(handoff)))
        self.assertEqual(returned[0], 0, returned)
        proof = self.proof("step_result", {"verified": True})
        self.assertEqual(self.change("advance", evidence=proof)[0], 1)
        empty = self.proof("main_continuation", run_id=run_id, attempt=1)
        self.assertEqual(self.change("ack-return", evidence=empty)[0], 1)
        _, output, command = self.real_trial(0)
        ack = self.proof("main_continuation", run_id=run_id, attempt=1, sources=[hashref(output)],
                         executed_action={"command": command, "exit_code": 0, "result_ref": hashref(output)})
        result = self.change("ack-return", evidence=ack)
        self.assertEqual(result[0], 0, result)
        self.advance({"verified": True})
        self.assertEqual(self.workflow()["facts"]["exit_code"], 1)

    def test_legacy_relay_cannot_bypass_engine(self):
        handoff = self.project / ".byte-os/coordination/handoffs/attempt.md"
        handoff.parent.mkdir(parents=True)
        handoff.write_text("# Bypass attempt\n")
        before = self.state_path.read_bytes()
        result = subprocess.run([sys.executable, str(RELAY), "handoff", "--project", str(self.project),
                                 "--from-harness", "codex", "--from-session-id", "main", "--to-session", "codex:supervisor",
                                 "--to-stage", "supervise", "--to-host-id", "local", "--handoff", str(handoff),
                                 "--next-action", "bypass", "--note", "test"], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("byte-workflow", result.stderr)
        self.assertEqual(self.state_path.read_bytes(), before)

    def test_explicit_pause_resume_and_external_block(self):
        paused = self.change("pause", extra=("--request-ref", "user:pause"))
        self.assertEqual(paused[0], 0, paused)
        self.assertEqual(self.call("route", "--caller-session", "codex:supervisor")[1]["action"], "stop_monitor")
        self.assertEqual(self.change("advance", evidence=self.proof("step_result", {"observed": True}))[0], 1)
        self.assertEqual(self.change("resume", extra=("--request-ref", "user:resume"))[0], 0)
        blocked = self.proof("external_block", blocker_kind="authority", reason="explicit compute budget exhausted",
                             external_dependency="additional user compute authority", resume_trigger="budget granted",
                             independent_work_remaining=False)
        self.assertEqual(self.change("block", evidence=blocked)[0], 0)
        self.assertEqual(self.call("route", "--caller-session", "codex:supervisor")[1]["action"], "stop_monitor")
        self.assertEqual(self.change("resume", extra=("--request-ref", "user:resume"))[0], 1)
        resolution = self.proof("external_resolution")
        self.assertEqual(self.change("resume", evidence=resolution, extra=("--request-ref", "user:budget-approved"))[0], 0)

    def test_existing_lock_rejects_without_state_mutation(self):
        lock = self.state_path.with_name("state.json.lock")
        lock.write_text("fixture")
        before = self.state_path.read_bytes()
        self.assertEqual(self.change("advance", evidence=self.proof("step_result", {"observed": True}))[0], 1)
        self.assertEqual(self.state_path.read_bytes(), before)
        self.assertEqual(lock.read_text(), "fixture")

    def test_supervisor_owned_step_has_configurable_assignment_but_not_overall_acceptance(self):
        template = definition()
        template["steps"]["literature"]["owner"] = "supervisor"
        self.init_custom(template)
        self.advance({"observed": True})
        self.assertEqual(self.state()["owner_session"], "codex:supervisor")
        result = self.call("route", "--caller-session", "codex:supervisor", "--main-status", "idle")
        self.assertEqual(result[1]["action"], "continue_supervisor")
        result = self.change("accept", evidence=self.proof("acceptance_verification", {"loss": 0}, criterion_id="quality"), extra=("--criterion", "quality"))
        self.assertEqual(result[0], 1)
        self.advance({"reviewed": True})
        self.assertEqual(self.state()["owner_session"], "codex:main")

    def test_nested_conditions_and_engine_iteration_cannot_be_spoofed(self):
        template = definition()
        template["steps"]["diagnose"]["acceptance"] = {"all": [
            {"fact": "workflow.iteration", "op": "eq", "value": 1},
            {"any": [{"fact": "score", "op": "gt", "value": 0.5},
                     {"fact": "reviewed", "op": "eq", "value": True}]}]}
        self.init_custom(template)
        missing = self.proof("step_result", {"score": "2"})
        self.assertEqual(self.change("advance", evidence=missing)[0], 1)
        self.advance({"reviewed": True, "workflow.iteration": 100})
        self.assertEqual(self.workflow()["facts"]["workflow.iteration"], 1)

    def test_prior_iteration_acceptance_is_invalidated_and_old_receipt_rejected(self):
        template = definition()
        template["acceptance"].append({"id": "independent", "description": "Additional independent verification"})
        self.init_custom(template)
        self.experiment_step()
        metrics, output, _ = self.real_trial(2)
        self.record_short(output)
        accepted = self.proof("acceptance_verification", metrics, criterion_id="quality", sources=[hashref(output)])
        self.assertEqual(self.change("accept", evidence=accepted, extra=("--criterion", "quality"))[0], 0)
        self.advance({"compared": True})
        self.assertEqual(self.workflow()["iteration"], 2)
        self.assertTrue(all(item["status"] == "pending" for item in self.outcome()["acceptance"]))
        self.assertEqual(self.change("accept", evidence=accepted, extra=("--criterion", "quality"))[0], 1)

    def test_actual_exit_code_controls_step_acceptance(self):
        template = definition()
        template["steps"]["experiment"]["acceptance"] = {"fact": "exit_code", "op": "eq", "value": 0}
        self.init_custom(template)
        self.experiment_step()
        _, output, _ = self.real_trial(0)
        terminal = self.proof("run_terminal", run_id="failure", attempt=1, exit_code=7,
                              wait_mode="same_task", owner_session="codex:main", sources=[hashref(output)])
        self.assertEqual(self.change("record-run", evidence=terminal)[0], 0)
        lied = self.proof("step_result", {"exit_code": 0})
        self.assertEqual(self.change("advance", evidence=lied)[0], 1)

    def test_existing_unmanaged_outcome_is_preserved(self):
        self.project = self.root / "legacy"
        self.state_path = self.project / ".byte-os/coordination/state.json"
        self.state_path.parent.mkdir(parents=True)
        self.state_path.write_text(json.dumps({"unrelated": "keep", "overall_outcome": {"status": "active", "id": "legacy"}}))
        before = self.state_path.read_bytes()
        result = self.call("init", "--template", str(self.template), "--objective", "Do not overwrite",
                           "--authority-ref", "user:new", "--main-session", "codex:main", "--supervisor-session", "codex:supervisor")
        self.assertEqual(result[0], 1)
        self.assertEqual(self.state_path.read_bytes(), before)
        self.assertFalse((self.project / ".byte-os/workflow.yaml").exists())

    def test_long_wait_without_monitor_binding_does_not_transfer_baton(self):
        self.project = self.root / "no-monitor"
        self.state_path = self.project / ".byte-os/coordination/state.json"
        result = self.call("init", "--template", str(self.template), "--objective", "Short tasks only",
                           "--authority-ref", "user:short", "--main-session", "codex:main", "--supervisor-session", "codex:supervisor")
        self.assertEqual(result[0], 0, result)
        self.experiment_step()
        handoff = self.project / ".byte-os/coordination/handoffs/unarmed.md"
        handoff.parent.mkdir(parents=True)
        handoff.write_text("# No native monitor binding\n")
        launch = self.proof("run_launch", run_id="unarmed", attempt=1, process={"host": "fixture", "identity": "fixture"})
        before = self.state_path.read_bytes()
        result = self.change("start-run", evidence=launch, extra=("--run-id", "unarmed", "--handoff", str(handoff)))
        self.assertEqual(result[0], 1)
        self.assertEqual(self.state_path.read_bytes(), before)

    def test_user_pause_precedes_repairing_tampered_historical_sources(self):
        proof = self.proof("step_result", {"observed": True})
        self.assertEqual(self.change("advance", evidence=proof)[0], 0)
        source = Path(json.loads(proof.read_text())["sources"][0]["path"])
        original = source.read_bytes()
        source.write_text("{}")
        self.assertEqual(self.change("pause", extra=("--request-ref", "user:stop-now"))[0], 0)
        self.assertEqual(self.call("route", "--caller-session", "codex:supervisor")[1]["action"], "stop_monitor")
        self.assertEqual(self.change("resume", extra=("--request-ref", "user:resume"))[0], 1)
        source.write_bytes(original)
        self.assertEqual(self.change("resume", extra=("--request-ref", "user:resume"))[0], 0)


if __name__ == "__main__":
    unittest.main()
