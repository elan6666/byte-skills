"""Verify skill entry registration and direct zero-token run return."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
WATCH = ROOT / "skills/byte-workflow/scripts/zero_token_loop.py"
ACTIVATE = ROOT / "skills/byte-do/scripts/activate.mjs"


def git(root, *args):
    subprocess.run(
        ["git", "-C", str(root), "-c", "user.email=test@example.invalid", "-c", "user.name=Fixture", *args],
        check=True, capture_output=True,
    )


class ZeroTokenActivationTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.state = self.root / ".byte-os"
        self.state.mkdir()
        self.receipt = self.root / "result.json"

    def wait(self, *extra):
        p = subprocess.run(
            [sys.executable, "-B", str(WATCH), "wait-run",
             "--project", str(self.root), "--pid", str(os.getpid()), "--run-id", "run",
             "--owner-session", "codex:main-fixture", "--done-file", str(self.receipt),
             "--expect-json", '{"run_id":"run","status":"evaluated"}', "--timeout", "1", *extra],
            text=True, capture_output=True, timeout=10,
        )
        self.assertEqual(p.stderr, "")
        return p.returncode, json.loads(p.stdout)

    def rows(self):
        return json.loads((self.state / "active-runs.json").read_text())["runs"]

    def test_registers_live_job_then_accepts_matching_receipt_in_same_row(self):
        code, observation = self.wait()
        self.assertEqual((code, observation["state"]), (2, "timeout"))
        self.assertEqual(self.rows()[0]["status"], "running")
        self.receipt.write_text('{"run_id":"run","status":"evaluated"}')
        code, observation = self.wait()
        self.assertEqual((code, observation["state"]), (0, "done_file"))
        rows = self.rows()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["status"], "done")
        self.assertEqual(rows[0]["terminal_event"]["receipt_sha256"], observation["receipt_sha256"])
        verification = json.loads((self.root / rows[0]["terminal_verification"]).read_text())
        self.assertEqual(verification["run_id"], "run")
        self.assertEqual(verification["event"], observation)

    def test_a_wrong_receipt_does_not_complete_run(self):
        self.receipt.write_text('{"run_id":"unrelated","status":"evaluated"}')
        code, observation = self.wait()
        self.assertEqual((code, observation["state"]), (1, "invalid_receipt"))
        self.assertEqual(self.rows()[0]["status"], "failed")

    def test_registered_exit_without_receipt_is_failure(self):
        code, observation = self.wait("--pid", "2147483647")
        self.assertEqual((code, observation["state"]), (1, "missing_receipt"))

    def test_paused_project_skips_observation_and_registration(self):
        (self.state / "coordination").mkdir()
        (self.state / "coordination/paused.flag").touch()
        self.assertEqual(self.wait(), (2, {"state": "paused", "reason": "paused_flag"}))
        self.assertFalse((self.state / "active-runs.json").exists())

    @unittest.skipUnless(shutil.which("node"), "Node is required")
    def test_activation_merges_exact_worktree_owner_and_linked_task_participant(self):
        git(self.root, "init", "-q")
        git(self.root, "commit", "--allow-empty", "-m", "fixture")
        worktree = self.root / "checkout"
        git(self.root, "worktree", "add", "--detach", str(worktree), "HEAD")
        board_path = self.state / "workboard.json"
        owner = {"harness": "codex", "nativeId": "main-fixture"}
        worker = {"harness": "claude", "nativeId": "worker-fixture"}
        old = {"harness": "codex", "nativeId": "prior-member"}
        board = {"schema": 1, "revision": 7, "displaySessions": [old], "collaborations": [],
                 "items": [{"id": "task", "title": "Active handoff", "objective": "Run a fixture",
                            "status": "in_progress", "acceptance": ["Exists"],
                            "participants": [owner, worker],
                            "steps": [{"id": "execute", "title": "Execute", "status": "todo",
                                       "evidence": []}]}]}
        board_path.write_text(json.dumps(board))
        env = {**os.environ, "CODEX_THREAD_ID": "main-fixture"}
        command = ["node", str(ACTIVATE), "--task-id", "task"]
        first = json.loads(subprocess.check_output(command, cwd=worktree, env=env))
        self.assertEqual(first["registered"], [owner, worker])
        self.assertEqual(first["project"], str(self.root.resolve()))
        self.assertEqual(json.loads(board_path.read_text())["displaySessions"], [old, owner, worker])
        second = json.loads(subprocess.check_output(command, cwd=worktree, env=env))
        self.assertEqual(second["status"], "already_registered")
        self.assertEqual(second["revision"], 8)
        self.assertFalse((worktree / ".byte-os/workboard.json").exists())
        other = self.root / "unrelated"
        other.mkdir()
        git(other, "init", "-q")
        p = subprocess.run([*command, "--project", str(other)], cwd=worktree, env=env,
                           capture_output=True, text=True)
        self.assertNotEqual(p.returncode, 0)
        self.assertIn("different repository identities", p.stderr)


if __name__ == "__main__":
    unittest.main()
