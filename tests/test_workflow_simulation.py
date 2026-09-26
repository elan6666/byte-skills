"""Local, no-network simulation of Codex delegation and relay boundaries.

The Codex messaging and scheduler/event bridge are deliberately not faked as
working integrations: these tests exercise durable CLI state and failure
invariants, not live delivery to another model or a real training process.
"""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "skills" / "byte-relay" / "scripts"
RELAY = SCRIPTS / "relay_state.py"
REGISTRY = SCRIPTS / "session_registry.py"
RECEIPT = SCRIPTS / "task_receipt.py"


def call(*args):
    return subprocess.run(args, text=True, capture_output=True)


class SupervisionWorkflowSimulation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.project = Path(self.temp.name, "model-project").resolve()
        self.project.mkdir()
        for command in (
            ("git", "init", "-q", str(self.project)),
            ("git", "-C", str(self.project), "config", "user.email", "test@example.com"),
            ("git", "-C", str(self.project), "config", "user.name", "Test"),
        ):
            self.assertEqual(call(*command).returncode, 0)
        (self.project / "model.py").write_text("# simulated core model\n", encoding="utf-8")
        self.assertEqual(call("git", "-C", str(self.project), "add", "model.py").returncode, 0)
        self.assertEqual(call("git", "-C", str(self.project), "commit", "-qm", "core").returncode, 0)
        self.coordination = self.project / ".byte-os" / "coordination"
        (self.coordination / "handoffs").mkdir(parents=True)
        self.state_path = self.coordination / "state.json"
        self.state_path.write_text(
            json.dumps(
                {
                    "stage": "build",
                    "owner": "codex",
                    "owner_session": "codex:main-astra",
                    "roles": {"codex": "builder"},
                    "participants": {
                        "codex:main-astra": {"harness": "codex", "role": "builder", "host_id": "local"}
                    },
                    "next_action": "finish core model and tests",
                    "acceptance": "run completes and outputs are verified",
                    "history": [],
                }
            ),
            encoding="utf-8",
        )
        self.register("codex", "main-astra", "gpt-6-astra")

    def tearDown(self):
        self.temp.cleanup()

    def state(self):
        return json.loads(self.state_path.read_text(encoding="utf-8"))

    def registry(self):
        return json.loads((self.coordination / "sessions.json").read_text(encoding="utf-8"))

    def register(self, harness, session_id, model):
        result = call(
            sys.executable, str(REGISTRY), "register", "--project", str(self.project),
            "--harness", harness, "--session-id", session_id, "--alias", session_id,
            "--provider", "openai", "--model", model,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def handoff(self, name, from_harness, from_id, from_stage, to_session, to_stage, *, host=None):
        handoff = self.coordination / "handoffs" / f"{name}.md"
        handoff.write_text(
            "# Simulated handoff\n\nrun_id: run-42\nconfig: config.json\n"
            "log: logs/run-42.log\nprocess_id: fake-4242\n",
            encoding="utf-8",
        )
        command = [
            sys.executable, str(RELAY), "handoff", "--project", str(self.project),
            "--from-harness", from_harness, "--from-session-id", from_id,
            "--from-stage", from_stage, "--to-session", to_session,
            "--to-stage", to_stage, "--next-action", "inspect run-42 evidence",
            "--handoff", str(handoff), "--note", name,
        ]
        if host:
            command.extend(("--to-host-id", host))
        return call(*command)

    def start_receipt(self, harness, session_id, task_id):
        return call(
            sys.executable, str(RECEIPT), "start", "--project", str(self.project),
            "--task-id", task_id, "--harness", harness, "--session-id", session_id,
            "--acceptance", "run-42 result verified",
        )

    def test_short_luna_helper_does_not_take_the_baton(self):
        # A same-turn helper is not a second registered conversation.
        denied = call(
            sys.executable, str(REGISTRY), "register", "--project", str(self.project),
            "--harness", "codex", "--session-id", "child-luna", "--alias", "short-check",
            "--model", "gpt-6-luna",
        )
        self.assertEqual(denied.returncode, 1)
        self.assertIn("session authority mismatch", denied.stderr)
        self.assertEqual(self.state()["owner_session"], "codex:main-astra")
        self.assertNotIn("codex:child-luna", self.registry()["sessions"])
        self.assertEqual(self.start_receipt("codex", "main-astra", "short-test").returncode, 0)

    def test_long_codex_supervisor_and_ambiguous_notification(self):
        result = self.handoff(
            "main-to-supervisor", "codex", "main-astra", "build",
            "codex:supervisor-luna", "supervise", host="local",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        # Simulate a transport timeout: there is no send retry or job relaunch.
        self.assertEqual(self.state()["owner_session"], "codex:supervisor-luna")
        self.assertEqual(len(self.state()["history"]), 1)
        denied = self.start_receipt("codex", "main-astra", "wrong-owner")
        self.assertEqual(denied.returncode, 1)
        self.assertIn("session authority mismatch", denied.stderr)
        self.register("codex", "supervisor-luna", "gpt-6-luna")
        self.assertEqual(self.registry()["sessions"]["codex:supervisor-luna"]["model"], "gpt-6-luna")
        self.assertEqual(self.start_receipt("codex", "supervisor-luna", "run-42").returncode, 0)
        self.assertEqual(len(self.state()["history"]), 1)

    def test_success_requires_run_artifact_not_agent_idle(self):
        self.assertEqual(
            self.handoff("train", "codex", "main-astra", "build", "codex:supervisor-luna", "supervise", host="local").returncode,
            0,
        )
        self.register("codex", "supervisor-luna", "gpt-6-luna")
        self.assertEqual(self.start_receipt("codex", "supervisor-luna", "train-success").returncode, 0)
        outputs = self.project / "outputs"
        outputs.mkdir()
        (outputs / "best.pt").write_text("simulated checkpoint\n", encoding="utf-8")
        completed = call(
            sys.executable, str(RECEIPT), "complete", "--project", str(self.project),
            "--task-id", "train-success", "--harness", "codex", "--session-id", "supervisor-luna",
            "--verify-command", "test -f outputs/best.pt", "--artifact", "outputs/best.pt",
            "--acceptance-evidence", "outputs/best.pt",
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        receipt = json.loads((self.coordination / "receipts" / "train-success.json").read_text())
        self.assertEqual(receipt["status"], "complete")
        self.assertEqual(receipt["verification"][0]["exit_status"], 0)
        returned = self.handoff(
            "supervisor-to-main", "codex", "supervisor-luna", "supervise",
            "codex:main-astra", "review", host="local",
        )
        self.assertEqual(returned.returncode, 0, returned.stderr)
        self.assertEqual(self.state()["owner_session"], "codex:main-astra")

    def test_failure_cannot_be_reported_as_complete(self):
        self.assertEqual(
            self.handoff("train", "codex", "main-astra", "build", "codex:supervisor-luna", "supervise", host="local").returncode,
            0,
        )
        self.register("codex", "supervisor-luna", "gpt-6-luna")
        self.assertEqual(self.start_receipt("codex", "supervisor-luna", "train-failed").returncode, 0)
        failed = call(
            sys.executable, str(RECEIPT), "complete", "--project", str(self.project),
            "--task-id", "train-failed", "--harness", "codex", "--session-id", "supervisor-luna",
            "--verify-command", "test -f outputs/best.pt", "--acceptance-evidence", "outputs/best.pt",
        )
        self.assertEqual(failed.returncode, 1)
        receipt = json.loads((self.coordination / "receipts" / "train-failed.json").read_text())
        self.assertEqual(receipt["status"], "failed")
        self.assertNotEqual(receipt["verification"][0]["exit_status"], 0)
        self.assertEqual(
            self.handoff("failure-to-main", "codex", "supervisor-luna", "supervise", "codex:main-astra", "fix", host="local").returncode,
            0,
        )
        self.assertEqual(self.state()["stage"], "fix")

    def test_missing_target_identity_does_not_move_baton(self):
        missing_host = self.handoff(
            "bad-host", "codex", "main-astra", "build", "codex:supervisor-luna", "supervise"
        )
        self.assertEqual(missing_host.returncode, 1)
        self.assertIn("Codex target requires", missing_host.stderr)
        self.assertEqual(self.state()["owner_session"], "codex:main-astra")
        self.assertEqual(self.state()["history"], [])


if __name__ == "__main__":
    unittest.main()
