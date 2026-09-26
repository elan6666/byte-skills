import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "skills" / "byte-relay" / "scripts" / "session_registry.py"
DIGEST = ROOT / "skills" / "byte-relay" / "scripts" / "session_digest.py"
RECEIPT = ROOT / "skills" / "byte-relay" / "scripts" / "task_receipt.py"
REVIEW_PACKAGE = ROOT / "skills" / "byte-relay" / "scripts" / "review_package.py"
RELAY_STATE = ROOT / "skills" / "byte-relay" / "scripts" / "relay_state.py"


def run(command, **kwargs):
    return subprocess.run(command, text=True, capture_output=True, **kwargs)


class SessionRegistryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.project = (Path(self.temp.name) / "project").resolve()
        self.project.mkdir()
        run(["git", "init", "-q", str(self.project)], check=True)
        run(["git", "-C", str(self.project), "config", "user.email", "test@example.com"], check=True)
        run(["git", "-C", str(self.project), "config", "user.name", "Test"], check=True)
        (self.project / "tracked.txt").write_text("x\n", encoding="utf-8")
        run(["git", "-C", str(self.project), "add", "tracked.txt"], check=True)
        run(["git", "-C", str(self.project), "commit", "-qm", "initial"], check=True)
        coordination = self.project / ".byte-os" / "coordination"
        coordination.mkdir(parents=True)
        (coordination / "state.json").write_text(
            json.dumps(
                {
                    "stage": "build",
                    "owner": "codex",
                    "roles": {"codex": "builder", "zcode": "supervisor"},
                }
            ),
            encoding="utf-8",
        )

    def tearDown(self):
        self.temp.cleanup()

    def test_register_captures_identity_and_git_snapshot(self):
        result = run(
            [
                sys.executable,
                str(REGISTRY),
                "register",
                "--project",
                str(self.project),
                "--harness",
                "codex",
                "--session-id",
                "session-1",
                "--alias",
                "design-build",
                "--provider",
                "openai",
                "--model",
                "gpt-test",
            ]
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        registry = json.loads(
            (self.project / ".byte-os" / "coordination" / "sessions.json").read_text()
        )
        record = registry["sessions"]["codex:session-1"]
        self.assertEqual(record["harness"], "codex")
        self.assertEqual(record["locator"], "codex://threads/session-1")
        self.assertEqual(record["model"], "gpt-test")
        self.assertEqual(record["role"], "builder")
        self.assertTrue(record["commit"])
        self.assertEqual(registry["active_by_harness"]["codex"], "codex:session-1")
        self.assertFalse((registry_path := self.project / ".byte-os" / "coordination" / "sessions.json.tmp").exists(), registry_path)

    def test_non_owner_cannot_register(self):
        result = run(
            [
                sys.executable,
                str(REGISTRY),
                "register",
                "--project",
                str(self.project),
                "--harness",
                "zcode",
                "--session-id",
                "task-1",
                "--alias",
                "ablation",
            ]
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("authority mismatch", result.stderr)
        self.assertFalse(
            (self.project / ".byte-os" / "coordination" / "sessions.json").exists()
        )

    def test_exact_codex_session_owns_registration(self):
        state_path = self.project / ".byte-os" / "coordination" / "state.json"
        state = json.loads(state_path.read_text())
        state["owner_session"] = "codex:supervisor-1"
        state["participants"] = {
            "codex:main-1": {"harness": "codex", "role": "builder"},
            "codex:supervisor-1": {
                "harness": "codex",
                "role": "supervisor",
                "host_id": "local",
                "reports_to": "codex:main-1",
            },
        }
        state_path.write_text(json.dumps(state), encoding="utf-8")
        denied = run(
            [
                sys.executable,
                str(REGISTRY),
                "register",
                "--project",
                str(self.project),
                "--harness",
                "codex",
                "--session-id",
                "main-1",
                "--alias",
                "main",
            ]
        )
        self.assertEqual(denied.returncode, 1)
        self.assertIn("session authority mismatch", denied.stderr)
        allowed = run(
            [
                sys.executable,
                str(REGISTRY),
                "register",
                "--project",
                str(self.project),
                "--harness",
                "codex",
                "--session-id",
                "supervisor-1",
                "--alias",
                "training-supervisor",
            ]
        )
        self.assertEqual(allowed.returncode, 0, allowed.stderr)
        registry = json.loads(
            (self.project / ".byte-os" / "coordination" / "sessions.json").read_text()
        )
        record = registry["sessions"]["codex:supervisor-1"]
        self.assertEqual(record["role"], "supervisor")
        self.assertEqual(record["host_id"], "local")
        self.assertEqual(record["reports_to"], "codex:main-1")


class RelayStateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.project = (Path(self.temp.name) / "project").resolve()
        handoffs = self.project / ".byte-os" / "coordination" / "handoffs"
        handoffs.mkdir(parents=True)
        self.handoff = handoffs / "main-to-supervisor.md"
        self.handoff.write_text("# Handoff\n", encoding="utf-8")
        self.state_path = self.project / ".byte-os" / "coordination" / "state.json"
        self.state_path.write_text(
            json.dumps(
                {
                    "stage": "build",
                    "owner": "codex",
                    "owner_session": "codex:main-1",
                    "roles": {"codex": "builder"},
                    "participants": {
                        "codex:main-1": {"harness": "codex", "role": "builder"}
                    },
                    "next_action": "finish core implementation",
                    "acceptance": "training reaches terminal state",
                    "history": [],
                }
            ),
            encoding="utf-8",
        )

    def tearDown(self):
        self.temp.cleanup()

    def test_handoff_moves_baton_to_exact_supervisor_thread(self):
        result = run(
            [
                sys.executable,
                str(RELAY_STATE),
                "handoff",
                "--project",
                str(self.project),
                "--from-harness",
                "codex",
                "--from-session-id",
                "main-1",
                "--from-stage",
                "build",
                "--from-role",
                "builder",
                "--to-session",
                "codex:supervisor-1",
                "--to-stage",
                "supervise",
                "--to-role",
                "supervisor",
                "--to-host-id",
                "local",
                "--reports-to",
                "codex:main-1",
                "--next-action",
                "monitor run-42 and repair only bounded failures",
                "--handoff",
                str(self.handoff),
                "--note",
                "core tests passed; training is waiting",
            ]
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        state = json.loads(self.state_path.read_text())
        self.assertEqual(state["owner"], "codex")
        self.assertEqual(state["owner_session"], "codex:supervisor-1")
        self.assertEqual(state["stage"], "supervise")
        self.assertEqual(
            state["participants"]["codex:supervisor-1"]["reports_to"],
            "codex:main-1",
        )
        self.assertEqual(state["participants"]["codex:supervisor-1"]["host_id"], "local")
        self.assertEqual(state["history"][-1]["from_session"], "codex:main-1")
        self.assertEqual(state["history"][-1]["to_session"], "codex:supervisor-1")

        denied = run(
            [
                sys.executable,
                str(RELAY_STATE),
                "handoff",
                "--project",
                str(self.project),
                "--from-harness",
                "codex",
                "--from-session-id",
                "main-1",
                "--to-session",
                "codex:supervisor-2",
                "--to-stage",
                "supervise",
                "--next-action",
                "monitor",
                "--handoff",
                str(self.handoff),
                "--note",
                "invalid second handoff",
            ]
        )
        self.assertEqual(denied.returncode, 1)
        self.assertIn("session authority mismatch", denied.stderr)

    def test_codex_target_requires_host_id(self):
        result = run(
            [
                sys.executable,
                str(RELAY_STATE),
                "handoff",
                "--project",
                str(self.project),
                "--from-harness",
                "codex",
                "--from-session-id",
                "main-1",
                "--to-session",
                "codex:supervisor-1",
                "--to-stage",
                "supervise",
                "--next-action",
                "monitor",
                "--handoff",
                str(self.handoff),
                "--note",
                "missing host",
            ]
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("Codex target requires", result.stderr)
        state = json.loads(self.state_path.read_text())
        self.assertEqual(state["owner_session"], "codex:main-1")

    def test_legacy_state_uses_registered_active_session(self):
        state = json.loads(self.state_path.read_text())
        state.pop("owner_session")
        self.state_path.write_text(json.dumps(state), encoding="utf-8")
        registry_path = self.project / ".byte-os" / "coordination" / "sessions.json"
        registry_path.write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "sessions": {},
                    "active_by_harness": {"codex": "codex:other-main"},
                }
            ),
            encoding="utf-8",
        )
        result = run(
            [
                sys.executable,
                str(RELAY_STATE),
                "handoff",
                "--project",
                str(self.project),
                "--from-harness",
                "codex",
                "--from-session-id",
                "main-1",
                "--to-session",
                "codex:supervisor-1",
                "--to-stage",
                "supervise",
                "--to-host-id",
                "local",
                "--next-action",
                "monitor",
                "--handoff",
                str(self.handoff),
                "--note",
                "wrong active session",
            ]
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("legacy session authority mismatch", result.stderr)


class SessionDigestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name).resolve()
        self.project = (self.home / "project-a").resolve()
        self.project.mkdir()
        self.output = self.home / "digests"
        self.env = {**os.environ, "BYTE_RELAY_HOME": str(self.home)}

    def tearDown(self):
        self.temp.cleanup()

    def test_codex_digest_uses_native_id_and_preserves_latest_as_index(self):
        session_id = "11111111-2222-3333-4444-555555555555"
        transcript_dir = self.home / ".codex" / "sessions" / "2026" / "09" / "21"
        transcript_dir.mkdir(parents=True)
        transcript = transcript_dir / f"rollout-2026-09-21T00-00-00-{session_id}.jsonl"
        events = [
            {
                "type": "session_meta",
                "timestamp": "2026-09-21T00:00:00Z",
                "payload": {"id": session_id, "cwd": str(self.project)},
            },
            {
                "type": "response_item",
                "timestamp": "2026-09-21T00:00:01Z",
                "payload": {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": "design the ablation"}],
                },
            },
        ]
        transcript.write_text("".join(json.dumps(event) + "\n" for event in events))
        result = run(
            [
                sys.executable,
                str(DIGEST),
                "codex",
                "--project",
                str(self.project),
                "--out-dir",
                str(self.output),
            ],
            env=self.env,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        durable = self.output / f"codex-{session_id}.md"
        self.assertIn(f"Session ID: {session_id}", durable.read_text())
        latest = (self.output / "codex-latest.md").read_text()
        self.assertIn(durable.name, latest)
        self.assertNotIn("design the ablation", latest)

    def test_zcode_digest_reads_local_task_metadata(self):
        zcode_dir = self.home / ".zcode" / "v2"
        zcode_dir.mkdir(parents=True)
        database = sqlite3.connect(zcode_dir / "tasks-index.sqlite")
        database.execute(
            """CREATE TABLE tasks (
                task_id TEXT, workspace_path TEXT, title TEXT, provider TEXT,
                model TEXT, mode TEXT, updated_at INTEGER, deleted INTEGER
            )"""
        )
        database.execute(
            "INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
            ("task-2", str(self.project), "Run ablations", "zcode", "glm-flash", "build", 2),
        )
        database.commit()
        database.close()
        result = run(
            [
                sys.executable,
                str(DIGEST),
                "zcode",
                "--project",
                str(self.project),
                "--out-dir",
                str(self.output),
            ],
            env=self.env,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        digest = (self.output / "zcode-task-2.md").read_text()
        self.assertIn("Session ID: task-2", digest)
        self.assertIn("Model: glm-flash", digest)
        self.assertIn("session-context", digest)


class TaskReceiptTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.project = (Path(self.temp.name) / "project").resolve()
        self.project.mkdir()
        run(["git", "init", "-q", str(self.project)], check=True)
        run(["git", "-C", str(self.project), "config", "user.email", "test@example.com"], check=True)
        run(["git", "-C", str(self.project), "config", "user.name", "Test"], check=True)
        (self.project / "tracked.txt").write_text("base\n", encoding="utf-8")
        run(["git", "-C", str(self.project), "add", "tracked.txt"], check=True)
        run(["git", "-C", str(self.project), "commit", "-qm", "base"], check=True)
        coordination = self.project / ".byte-os" / "coordination"
        coordination.mkdir(parents=True)
        (coordination / "state.json").write_text(
            json.dumps(
                {
                    "stage": "build",
                    "owner": "codex",
                    "roles": {"codex": "builder", "zcode": "supervisor"},
                    "acceptance": "tests pass",
                }
            ),
            encoding="utf-8",
        )
        registered = run(
            [
                sys.executable,
                str(REGISTRY),
                "register",
                "--project",
                str(self.project),
                "--harness",
                "codex",
                "--session-id",
                "session-1",
                "--alias",
                "build",
            ]
        )
        self.assertEqual(registered.returncode, 0, registered.stderr)

    def tearDown(self):
        self.temp.cleanup()

    def start_receipt(self, task_id="task-1"):
        return run(
            [
                sys.executable,
                str(RECEIPT),
                "start",
                "--project",
                str(self.project),
                "--task-id",
                task_id,
                "--harness",
                "codex",
                "--session-id",
                "session-1",
            ]
        )

    def test_receipt_binds_session_git_range_and_verification(self):
        started = self.start_receipt()
        self.assertEqual(started.returncode, 0, started.stderr)
        (self.project / "tracked.txt").write_text("changed\n", encoding="utf-8")
        run(["git", "-C", str(self.project), "add", "tracked.txt"], check=True)
        run(["git", "-C", str(self.project), "commit", "-qm", "change"], check=True)
        completed = run(
            [
                sys.executable,
                str(RECEIPT),
                "complete",
                "--project",
                str(self.project),
                "--task-id",
                "task-1",
                "--harness",
                "codex",
                "--session-id",
                "session-1",
                "--verify-command",
                "test -f tracked.txt",
                "--artifact",
                "tracked.txt",
                "--acceptance-evidence",
                "tests/test_example.py",
                "--ruling",
                "Keep the narrow implementation",
            ]
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        receipt = json.loads(
            (self.project / ".byte-os" / "coordination" / "receipts" / "task-1.json").read_text()
        )
        self.assertEqual(receipt["owner_session"], "codex:session-1")
        self.assertEqual(receipt["status"], "complete")
        self.assertNotEqual(receipt["base_commit"], receipt["head_commit"])
        self.assertEqual(receipt["verification"][0]["command"], "test -f tracked.txt")
        self.assertEqual(receipt["verification"][0]["exit_status"], 0)
        self.assertTrue(Path(receipt["verification"][0]["log_path"]).is_file())
        self.assertEqual(receipt["acceptance"][0]["status"], "verified")

        packaged = run(
            [
                sys.executable,
                str(REVIEW_PACKAGE),
                "--project",
                str(self.project),
                "--task-id",
                "task-1",
            ]
        )
        self.assertEqual(packaged.returncode, 0, packaged.stderr)
        review_dir = self.project / ".byte-os" / "coordination" / "reviews"
        package = (review_dir / "task-1.md").read_text()
        self.assertIn("codex:session-1", package)
        self.assertIn("test -f tracked.txt", package)
        self.assertIn("tracked.txt", (review_dir / "task-1.diff").read_text())

    def test_receipt_rejects_non_owner(self):
        result = run(
            [
                sys.executable,
                str(RECEIPT),
                "start",
                "--project",
                str(self.project),
                "--task-id",
                "task-z",
                "--harness",
                "zcode",
                "--session-id",
                "task-z",
            ]
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("authority mismatch", result.stderr)

    def test_receipt_rejects_other_codex_thread(self):
        state_path = self.project / ".byte-os" / "coordination" / "state.json"
        state = json.loads(state_path.read_text())
        state["owner_session"] = "codex:supervisor-1"
        state_path.write_text(json.dumps(state), encoding="utf-8")
        result = self.start_receipt("wrong-thread")
        self.assertEqual(result.returncode, 1)
        self.assertIn("session authority mismatch", result.stderr)

    def test_failed_verification_cannot_complete_receipt(self):
        started = self.start_receipt("task-failed")
        self.assertEqual(started.returncode, 0, started.stderr)
        completed = run(
            [
                sys.executable,
                str(RECEIPT),
                "complete",
                "--project",
                str(self.project),
                "--task-id",
                "task-failed",
                "--harness",
                "codex",
                "--session-id",
                "session-1",
                "--verify-command",
                "false",
            ]
        )
        self.assertEqual(completed.returncode, 1)
        receipt = json.loads(
            (self.project / ".byte-os" / "coordination" / "receipts" / "task-failed.json").read_text()
        )
        self.assertEqual(receipt["status"], "failed")

    def test_verified_acceptance_requires_evidence(self):
        started = self.start_receipt("task-no-evidence")
        self.assertEqual(started.returncode, 0, started.stderr)
        completed = run(
            [
                sys.executable,
                str(RECEIPT),
                "complete",
                "--project",
                str(self.project),
                "--task-id",
                "task-no-evidence",
                "--harness",
                "codex",
                "--session-id",
                "session-1",
                "--verify-command",
                "true",
            ]
        )
        self.assertEqual(completed.returncode, 1)
        self.assertIn("--acceptance-evidence is required", completed.stderr)


if __name__ == "__main__":
    unittest.main()
