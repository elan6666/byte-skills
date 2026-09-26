"""End-to-end tests for the process-event half of design/supervise."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "skills" / "byte-relay" / "scripts" / "run_event.py"
NEURAL = ROOT / "benchmarks" / "tiny-neural-relay"


class RunEventTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def invoke(self, action, *arguments):
        return subprocess.run(
            [sys.executable, str(RUNNER), action, "--root", str(self.root),
             "--run-id", "tiny-neural", *arguments],
            capture_output=True, text=True, check=False,
        )

    def train_args(self, repair=False):
        args = ["--", sys.executable, str(NEURAL / "train.py"),
                "--checkpoint", str(NEURAL / "bad-checkpoint.json"),
                "--epochs", "500"]
        if repair:
            args.append("--repair-checkpoint")
        return args

    def test_failure_event_and_duplicate_launch_guard(self):
        result = self.invoke("run", "--notifier", shutil.which("true"), *self.train_args())
        self.assertEqual(result.returncode, 1, result.stderr)
        directory = self.root / "tiny-neural" / "attempt-1"
        event = json.loads((directory / "terminal.json").read_text())
        delivery = json.loads((directory / "terminal.delivery.json").read_text())
        self.assertEqual(event["exit_code"], 1)
        self.assertEqual(event["outcome"], "failed")
        self.assertEqual(delivery["status"], "accepted")
        self.assertIn("checkpoint output width 1 != hidden width 2",
                      (directory / "train.log").read_text())
        duplicate = self.invoke("run", *self.train_args())
        self.assertEqual(duplicate.returncode, 2)
        self.assertIn("refusing duplicate launch", duplicate.stderr)

    def test_periodic_reconciliation_of_undelivered_success(self):
        result = self.invoke("run", "--attempt", "2", *self.train_args(repair=True))
        self.assertEqual(result.returncode, 0, result.stderr)
        directory = self.root / "tiny-neural" / "attempt-2"
        self.assertFalse((directory / "terminal.delivery.json").exists())
        first = self.invoke("check", "--attempt", "2", "--notifier", shutil.which("true"))
        self.assertEqual(first.returncode, 0, first.stderr)
        delivery_path = directory / "terminal.delivery.json"
        first_delivery = delivery_path.read_text()
        self.assertEqual(json.loads(first_delivery)["status"], "accepted")
        second = self.invoke("check", "--attempt", "2", "--notifier", shutil.which("false"))
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(delivery_path.read_text(), first_delivery)

    def test_stale_heartbeat_emits_one_event(self):
        directory = self.root / "tiny-neural" / "attempt-3"
        directory.mkdir(parents=True)
        (directory / "running.json").write_text(json.dumps({"pid": os.getpid()}))
        heartbeat = directory / "heartbeat"
        heartbeat.touch()
        old = time.time() - 60
        os.utime(heartbeat, (old, old))
        first = self.invoke("check", "--attempt", "3", "--heartbeat-file",
                            str(heartbeat), "--stale-seconds", "10",
                            "--notifier", shutil.which("true"))
        self.assertEqual(first.returncode, 0, first.stderr)
        event = json.loads((directory / "stale.json").read_text())
        self.assertEqual(event["reason"], "heartbeat_stale")
        self.assertEqual(event["event_id"], "tiny-neural:3:stale")
        second = self.invoke("check", "--attempt", "3", "--heartbeat-file",
                             str(heartbeat), "--stale-seconds", "10",
                             "--notifier", shutil.which("false"))
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(json.loads((directory / "stale.delivery.json").read_text())["status"],
                         "accepted")

    def test_ambiguous_delivery_is_not_blindly_retried(self):
        result = self.invoke("run", "--attempt", "4", "--notifier",
                             shutil.which("false"), *self.train_args())
        self.assertEqual(result.returncode, 1, result.stderr)
        second = self.invoke("check", "--attempt", "4", "--notifier", shutil.which("true"))
        self.assertEqual(second.returncode, 0, second.stderr)
        directory = self.root / "tiny-neural" / "attempt-4"
        self.assertEqual(json.loads((directory / "terminal.delivery.json").read_text())["status"],
                         "unverified")


if __name__ == "__main__":
    unittest.main()
