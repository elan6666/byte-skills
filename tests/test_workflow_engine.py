"""Exercise custom workflow transitions and recovery with real bounded CPU jobs.

Native scheduler receipts in long-wait tests are offline fixtures; these tests
do not claim that an app scheduler or another model executed a turn.
"""

import copy
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
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

    def legacy_adoption(self):
        state = self.state()
        outcome = state["overall_outcome"]
        outcome.pop("workflow")
        outcome.update(iteration=5, scientific_complete=False, findings=["preserve prior evidence"])
        outcome["execution"].update(mode="waiting", owner_session="codex:main", supervisor_session="codex:supervisor",
                                    run_id="existing-live-run", attempt=2, independent_work_remaining=True)
        action = {"trigger": "run_terminal", "description": "Preserve the precise existing post-fit next action"}
        outcome["next_action"] = action
        outcome["execution"]["next_action"] = copy.deepcopy(action)
        state.update(owner_session="codex:supervisor", stage="supervise", unrelated_history={"keep": True})
        self.state_path.write_text(json.dumps(state))
        (self.project / ".byte-os/workflow.yaml").unlink()
        original = self.state_path.read_bytes()
        before_hash = hashlib.sha256(original).hexdigest()
        source = self.artifact({"run_id": "existing-live-run", "attempt": 2, "observation": "local migration fixture"})
        evidence = self.artifact({"kind": "workflow_adoption", "status": "verified", "outcome_id": outcome["id"],
                                 "owner_session": "codex:supervisor", "state_sha256": before_hash,
                                 "coordination_writes_quiescent": True, "run_id": "existing-live-run", "attempt": 2,
                                 "sources": [hashref(source)]})
        args = ["--template", str(self.template), "--authority-ref", "user:explicit-adoption", "--session", "codex:supervisor",
                "--main-session", "codex:main", "--supervisor-session", "codex:supervisor", "--monitor-id", "test-monitor",
                "--continuous", "--expect-state-sha256", before_hash, "--step", "experiment", "--evidence", str(evidence),
                "--event-id", "adopt-test"]
        return args, original, evidence

    def test_explicit_owner_adoption_preserves_live_run_goal_and_evidence(self):
        args, original, _ = self.legacy_adoption()
        result = self.call("adopt", *args)
        self.assertEqual(result[0], 0, result)
        self.assertFalse(result[1]["run_relaunched"])
        previous = json.loads(original)
        current = self.state()
        for key in ("owner_session", "stage", "unrelated_history"):
            self.assertEqual(current[key], previous[key])
        for key in ("id", "objective", "status", "acceptance", "findings", "scientific_complete"):
            self.assertEqual(current["overall_outcome"][key], previous["overall_outcome"][key])
        self.assertEqual(self.outcome()["execution"]["run_id"], "existing-live-run")
        self.assertTrue(self.outcome()["execution"]["independent_work_remaining"])
        self.assertEqual(self.workflow()["iteration"], 5)
        self.assertEqual(Path(result[1]["previous_state"]).read_bytes(), original)
        self.assertEqual(self.call("route", "--caller-session", "codex:supervisor")[1]["action"], "supervise_run")
        readiness = self.proof("main_readiness", main_session="codex:main", independent_work_remaining=False,
                               run_id="existing-live-run", attempt=2)
        self.assertEqual(self.change("record-readiness", evidence=readiness)[0], 0)
        self.assertFalse(self.outcome()["execution"]["independent_work_remaining"])
        self.assertEqual(self.call("adopt", *args)[0], 1)

    def test_adoption_rejects_wrong_owner_changed_state_or_weakened_acceptance(self):
        for mode in ("owner", "state", "criteria", "run", "quiescent"):
            with self.subTest(mode=mode):
                self.project = self.root / ("legacy-" + mode)
                self.state_path = self.project / ".byte-os/coordination/state.json"
                init = self.call("init", "--template", str(self.template), "--objective", "Test",
                                 "--authority-ref", "user:test", "--main-session", "codex:main", "--supervisor-session", "codex:supervisor",
                                 "--monitor-id", "test-monitor")
                self.assertEqual(init[0], 0, init)
                args, before, proof = self.legacy_adoption()
                if mode == "owner":
                    args[args.index("--session") + 1] = "codex:main"
                elif mode == "state":
                    self.state_path.write_bytes(before + b" ")
                    before = self.state_path.read_bytes()
                elif mode == "criteria":
                    template = definition()
                    template["acceptance"][0]["description"] = "Weaken the original standard"
                    altered = self.artifact(template)
                    args[args.index("--template") + 1] = str(altered)
                else:
                    value = json.loads(proof.read_text())
                    value["run_id" if mode == "run" else "coordination_writes_quiescent"] = "wrong" if mode == "run" else False
                    proof.write_text(json.dumps(value))
                result = self.call("adopt", *args)
                self.assertEqual(result[0], 1, result)
                self.assertEqual(self.state_path.read_bytes(), before)
                self.assertFalse((self.project / ".byte-os/workflow.yaml").exists())


    def expired_monitor_return(self):
        """Retarget a temporary HOME automation after its run has returned."""
        temporary_home = self.root / ("fake-home-" + self.project.name)
        replacement = patch.dict(os.environ, HOME=str(temporary_home))
        replacement.start()
        self.addCleanup(replacement.stop)
        run_id = self.long_wait()
        automation = temporary_home / ".codex/automations/test-monitor/automation.toml"
        automation.parent.mkdir(parents=True)
        automation.write_text("original immutable observation bytes\n")
        other = self.artifact({"independent_source": "must remain strict"})
        state = self.state()
        workflow = state["overall_outcome"]["workflow"]
        refs = []
        for name in ("monitor_registration", "return_wake_receipt"):
            ref = state["overall_outcome"]["execution"][name]
            path = Path(ref["path"])
            value = json.loads(path.read_text())
            value["sources"] = [hashref(automation), hashref(other)]
            path.write_text(json.dumps(value))
            updated = hashref(path)
            workflow["evidence"][workflow["evidence"].index(ref)] = updated
            state["overall_outcome"]["execution"][name] = updated
            refs.append(updated)
        self.state_path.write_text(json.dumps(state))
        terminal = self.proof("run_terminal", run_id=run_id, attempt=1, exit_code=0)
        handoff = self.project / ".byte-os/coordination/handoffs/terminal.md"
        handoff.write_text("# Actually returned test fixture; not scientific evidence\n")
        result = self.change("return-run", evidence=terminal, extra=("--handoff", str(handoff)))
        self.assertEqual(result[0], 0, result)
        # Model the passage of time, keeping the original receipt hash bindings exact.
        state = self.state()
        workflow = state["overall_outcome"]["workflow"]
        expired = datetime.now(timezone.utc) - timedelta(hours=2)
        self.retiring = []
        for name in ("monitor_registration", "return_wake_receipt"):
            ref = state["overall_outcome"]["execution"][name]
            path = Path(ref["path"])
            value = json.loads(path.read_text())
            value.update(checked_at=expired.isoformat(), valid_until=(expired + timedelta(minutes=20)).isoformat())
            path.write_text(json.dumps(value))
            updated = hashref(path)
            workflow["evidence"][workflow["evidence"].index(ref)] = updated
            state["overall_outcome"]["execution"][name] = updated
            self.retiring.append(path)
        # Reproduce only the compatibility-mirror defect in the pre-fix state.
        for mapping in (state["overall_outcome"], state["overall_outcome"]["execution"]):
            mapping.update(current_handoff="historical-launch", current_handoff_sha256="0" * 64,
                           baton_owner_session="codex:supervisor")
        self.state_path.write_text(json.dumps(state))
        automation.write_text("retargeted current bytes; never the old snapshot\n")
        self.automation, self.strict_source = automation, other
        self.assertEqual(self.call("status")[0], 1)
        return self.repair_evidence()

    def repair_evidence(self):
        state = self.state()
        workflow = state["overall_outcome"]["workflow"]
        targets = []
        for ref in workflow["evidence"]:
            try:
                value = json.loads(Path(ref["path"]).read_text())
            except (ValueError, UnicodeError):
                continue
            for source in value.get("sources", []):
                if Path(source["path"]) == self.automation:
                    targets.append(dict(receipt=ref, source=source))
        returned = workflow["returned_run"]
        proof = self.proof("workflow_evidence_repair", owner_session=state["owner_session"],
                           revision=workflow["revision"], state_sha256=hashref(self.state_path)["sha256"],
                           authority_ref="user:bounded-monitor-repair", run_id=returned["run_id"], attempt=returned["attempt"],
                           observed_automation_sha256=hashref(self.automation)["sha256"], targets=targets)
        return proof

    def repair(self, proof, *, check_only=False, event="repair-fixture", actor=None, revision=None, state_hash=None):
        value = json.loads(proof.read_text())
        extra = ("--expect-state-sha256", state_hash or value["state_sha256"],
                 "--authority-ref", value["authority_ref"]) + (("--check-only",) if check_only else ())
        return self.change("repair-expired-monitor-sources", actor=actor, revision=revision,
                           event=event, evidence=proof, extra=extra)

    def test_monitor_source_repair_preview_commit_mirrors_and_exact_replay(self):
        proof = self.expired_monitor_return()
        before = self.state()
        files = {str(p.resolve()): hashref(p)["sha256"] for p in self.root.rglob("*") if p.is_file()}
        preview = self.repair(proof, check_only=True)
        self.assertEqual(preview[0], 0, preview)
        self.assertEqual(preview[1]["retired_source_count"], 2)
        self.assertFalse(preview[1]["changed"])
        self.assertEqual(files, {str(p.resolve()): hashref(p)["sha256"] for p in self.root.rglob("*") if p.is_file()})
        result = self.repair(proof)
        self.assertEqual(result[0], 0, result)
        after = self.state()
        workflow = after["overall_outcome"]["workflow"]
        self.assertEqual(workflow["revision"], before["overall_outcome"]["workflow"]["revision"] + 1)
        self.assertTrue(workflow["return_pending"])
        self.assertEqual(workflow["returned_run"], before["overall_outcome"]["workflow"]["returned_run"])
        self.assertEqual(workflow["facts"], before["overall_outcome"]["workflow"]["facts"])
        self.assertEqual(after["overall_outcome"]["acceptance"], before["overall_outcome"]["acceptance"])
        self.assertEqual(workflow["evidence"][:-1], before["overall_outcome"]["workflow"]["evidence"])
        for mapping in (after["overall_outcome"], after["overall_outcome"]["execution"]):
            self.assertEqual(mapping["current_handoff"], after["current_handoff"])
            self.assertEqual(mapping["current_handoff_sha256"], after["current_handoff_sha256"])
            self.assertEqual(mapping["baton_owner_session"], "codex:main")
        for path in self.retiring:
            self.assertEqual(files[str(path.resolve())], hashref(path)["sha256"])
        for command in ("status", "doctor"):
            observed = self.call(command)
            self.assertEqual(observed[0], 0, observed)
            self.assertFalse(observed[1]["historical_sources_valid"])
        self.assertFalse(self.call("doctor")[1]["native_scheduler_verified"])
        committed = self.state_path.read_bytes()
        self.assertTrue(self.repair(proof)[1]["idempotent"])
        self.assertEqual(self.state_path.read_bytes(), committed)
        value = json.loads(proof.read_text())
        value["authority_ref"] = "changed"
        proof.write_text(json.dumps(value))
        self.assertEqual(self.repair(proof)[0], 1)
        self.assertEqual(self.state_path.read_bytes(), committed)

    def test_monitor_source_repair_rejects_authority_cas_and_incomplete_targets(self):
        proof = self.expired_monitor_return()
        before = self.state_path.read_bytes()
        original = proof.read_bytes()
        for options in ({"actor": "codex:supervisor"}, {"revision": 0}, {"state_hash": "0" * 64}):
            with self.subTest(options=options):
                self.assertEqual(self.repair(proof, **options)[0], 1)
                self.assertEqual(self.state_path.read_bytes(), before)
        for mutation in ("owner_session", "revision", "run_id", "attempt", "observed_automation_sha256", "targets"):
            value = json.loads(original)
            value[mutation] = [] if mutation == "targets" else "incorrect"
            proof.write_text(json.dumps(value))
            self.assertEqual(self.repair(proof)[0], 1, mutation)
            self.assertEqual(self.state_path.read_bytes(), before)
        proof.write_bytes(original)
        lock = self.state_path.with_name("state.json.lock")
        lock.write_text("test-owned-lock")
        self.assertEqual(self.repair(proof)[0], 1)
        self.assertEqual(self.state_path.read_bytes(), before)
        lock.unlink()

    def test_monitor_source_repair_does_not_ignore_nonmonitor_sources_or_science(self):
        proof = self.expired_monitor_return()
        original = self.strict_source.read_bytes()
        self.strict_source.write_text("tampered scientific/other source")
        before = self.state_path.read_bytes()
        self.assertEqual(self.repair(proof)[0], 1)
        self.assertEqual(self.state_path.read_bytes(), before)
        self.strict_source.write_bytes(original)
        state = self.state()
        path = self.retiring[0]
        value = json.loads(path.read_text())
        value["kind"] = "acceptance_verification"
        ref = next(r for r in state["overall_outcome"]["workflow"]["evidence"] if r["path"] == str(path))
        path.write_text(json.dumps(value))
        state["overall_outcome"]["workflow"]["evidence"][state["overall_outcome"]["workflow"]["evidence"].index(ref)] = hashref(path)
        self.state_path.write_text(json.dumps(state))
        proof = self.repair_evidence()
        before = self.state_path.read_bytes()
        self.assertEqual(self.repair(proof)[0], 1)
        self.assertEqual(self.state_path.read_bytes(), before)

    def test_monitor_repair_history_stays_strict_and_ack_is_not_automatic(self):
        proof = self.expired_monitor_return()
        self.assertEqual(self.repair(proof)[0], 0)
        after = self.state_path.read_bytes()
        for path in (self.retiring[0], self.strict_source,
                     Path(self.workflow()["historical_source_invalidations"][0]["audit"]["path"])):
            original = path.read_bytes()
            path.write_bytes(original + b"tamper")
            self.assertEqual(self.call("status")[0], 1)
            self.assertEqual(self.state_path.read_bytes(), after)
            path.write_bytes(original)
        empty = self.proof("main_continuation", run_id=self.workflow()["returned_run"]["run_id"], attempt=1)
        self.assertEqual(self.change("ack-return", evidence=empty)[0], 1)
        self.assertEqual(self.state_path.read_bytes(), after)
        _, output, command = self.real_trial(0)
        ack = self.proof("main_continuation", run_id=self.workflow()["returned_run"]["run_id"], attempt=1,
                         sources=[hashref(output)], executed_action=dict(command=command, exit_code=0, result_ref=hashref(output)))
        self.assertEqual(self.change("ack-return", evidence=ack)[0], 0)
        self.advance({"verified": True})
        self.assertEqual(self.call("doctor")[0], 0)

    def test_monitor_source_repair_rejects_unexpired_and_waiting_lanes(self):
        proof = self.expired_monitor_return()
        state = self.state()
        state["overall_outcome"]["execution"]["mode"] = "waiting"
        self.state_path.write_text(json.dumps(state))
        proof = self.repair_evidence()
        before = self.state_path.read_bytes()
        self.assertEqual(self.repair(proof)[0], 1)
        self.assertEqual(self.state_path.read_bytes(), before)
        state["overall_outcome"]["execution"]["mode"] = "active"
        path = self.retiring[0]
        old_ref = next(r for r in state["overall_outcome"]["workflow"]["evidence"] if r["path"] == str(path))
        value = json.loads(path.read_text())
        value["valid_until"] = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        path.write_text(json.dumps(value))
        state["overall_outcome"]["workflow"]["evidence"][state["overall_outcome"]["workflow"]["evidence"].index(old_ref)] = hashref(path)
        self.state_path.write_text(json.dumps(state))
        proof = self.repair_evidence()
        before = self.state_path.read_bytes()
        self.assertEqual(self.repair(proof)[0], 1)
        self.assertEqual(self.state_path.read_bytes(), before)


    def test_new_arm_rejects_mutable_monitor_sources_and_accepts_snapshot(self):
        self.long_wait()
        state = self.state()
        fields = ("supervisor_ack", "monitor_registration", "return_wake_receipt")
        originals = {field: Path(state["overall_outcome"]["execution"][field]["path"]) for field in fields}
        live = Path.home() / ".codex/automations/test-monitor/automation.toml"
        # Use an isolated HOME before computing the live automation path.
        replacement = patch.dict(os.environ, HOME=str(self.root / "arm-home"))
        replacement.start()
        self.addCleanup(replacement.stop)
        live = Path.home() / ".codex/automations/test-monitor/automation.toml"
        live.parent.mkdir(parents=True)
        live.write_text("native registration readback fixture\n")
        source = self.artifact({"snapshot": "immutable registration observation"})
        for field in ("monitor_registration", "return_wake_receipt"):
            for mutable in (live, self.state_path):
                value = json.loads(originals[field].read_text())
                value["sources"] = [hashref(mutable)]
                changed = self.artifact(value)
                extra = []
                for name in fields:
                    extra += ["--" + name.replace("_", "-"), str(changed if name == field else originals[name])]
                before = self.state_path.read_bytes()
                result = self.change("arm-run", extra=tuple(extra))
                self.assertEqual(result[0], 1, result)
                self.assertIn("immutable snapshots", result[1]["error"])
                self.assertEqual(self.state_path.read_bytes(), before)
        value = json.loads(originals["monitor_registration"].read_text())
        value["sources"] = [hashref(source)]
        immutable = self.artifact(value)
        extra = []
        for field in fields:
            extra += ["--" + field.replace("_", "-"), str(immutable if field == "monitor_registration" else originals[field])]
        self.assertEqual(self.change("arm-run", extra=tuple(extra))[0], 0)

    def test_retired_receipt_cannot_arm_or_verify_scientific_acceptance(self):
        proof = self.expired_monitor_return()
        self.assertEqual(self.repair(proof)[0], 0)
        invalid = self.workflow()["historical_source_invalidations"][0]["receipt"]
        accepted = self.proof("acceptance_verification", {"loss": 0.0}, criterion_id="quality", sources=[invalid])
        self.assertEqual(self.change("accept", evidence=accepted, extra=("--criterion", "quality"))[0], 1)
        _, output, command = self.real_trial(0)
        ack = self.proof("main_continuation", run_id=self.workflow()["returned_run"]["run_id"], attempt=1,
                         sources=[hashref(output)], executed_action=dict(command=command, exit_code=0, result_ref=hashref(output)))
        self.assertEqual(self.change("ack-return", evidence=ack)[0], 0)
        launch = self.proof("run_launch", run_id="new-distinct-run", attempt=1, process={"host": "fixture", "identity": "new"})
        handoff = self.project / ".byte-os/coordination/handoffs/new.md"
        handoff.write_text("# New run identity, not a retry\n")
        self.assertEqual(self.change("start-run", evidence=launch, extra=("--run-id", "new-distinct-run", "--handoff", str(handoff)))[0], 0)
        # References need not match the new run: the explicit retirement check rejects first.
        extra = ("--supervisor-ack", str(self.retiring[1]), "--monitor-registration", invalid["path"],
                 "--return-wake-receipt", str(self.retiring[1]))
        result = self.change("arm-run", extra=extra)
        self.assertEqual(result[0], 1, result)
        self.assertIn("retired historical", result[1]["error"])



    def test_repair_double_cas_preserves_concurrent_state_or_automation_changes(self):
        import contextlib
        import importlib.util
        import io
        for drift in ("state", "automation"):
            with self.subTest(drift=drift):
                # A distinct fixture project keeps failed-attempt audit artifacts intact.
                self.project = self.root / ("cas-" + drift)
                self.project.mkdir()
                self.state_path = self.project / ".byte-os/coordination/state.json"
                result = self.call("init", "--template", str(self.template), "--objective", "CAS test",
                                   "--authority-ref", "user:test", "--main-session", "codex:main",
                                   "--supervisor-session", "codex:supervisor", "--monitor-id", "test-monitor", "--continuous")
                self.assertEqual(result[0], 0, result)
                proof = self.expired_monitor_return()
                original_state = self.state_path.read_bytes()
                sys.path.insert(0, str(CLI.parent))
                try:
                    spec = importlib.util.spec_from_file_location("repair_cas_test_" + drift, CLI)
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)
                finally:
                    sys.path.pop(0)
                write = module.write_immutable
                def concurrent_write(path, data):
                    write(path, data)
                    if path.name == "AUDIT.json":
                        if drift == "state":
                            self.state_path.write_bytes(original_state + b" ")
                        else:
                            self.automation.write_text("another real native retarget\n")
                value = json.loads(proof.read_text())
                argv = ["repair-expired-monitor-sources", "--project", str(self.project),
                        "--session", "codex:main", "--expect-revision", str(self.workflow()["revision"]),
                        "--event-id", "double-cas", "--expect-state-sha256", value["state_sha256"],
                        "--authority-ref", value["authority_ref"], "--evidence", str(proof)]
                with patch.object(module, "write_immutable", concurrent_write), contextlib.redirect_stdout(io.StringIO()) as output:
                    code = module.main(argv)
                self.assertEqual(code, 1, output.getvalue())
                self.assertIn("changed before repair commit", output.getvalue())
                self.assertEqual(self.state_path.read_bytes(), original_state + (b" " if drift == "state" else b""))



if __name__ == "__main__":
    unittest.main()
