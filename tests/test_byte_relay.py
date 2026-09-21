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


if __name__ == "__main__":
    unittest.main()
