"""Exercise immutable bridge drafts, source integrity and safe CLI forwarding.

No model, live chat, native scheduler or research process is used here.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bridge = load("byte_bridge_launcher", ROOT / "skills/byte-bridge/scripts/bridge.py")
handoff = load("byte_bridge_handoff", ROOT / "skills/byte-bridge/scripts/handoff.py")
exporter = load("byte_bridge_export", ROOT / "scripts/build_bridge_runtime.py")


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()

    def bundle(self):
        files = {"dist/src/cli/main.js": b"console.log('safe')", "package-lock.json": b"{}"}
        for name, data in files.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        manifest = {"schema": "byte-sessionbridge-source/v1", "source_commit": "test",
                    "files": {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}}
        (self.root / "BYTE_SOURCE.json").write_text(json.dumps(manifest))
        return manifest

    def test_bundle_refuses_modified_entry_and_path_escape(self):
        manifest = self.bundle()
        bridge.verify_bundle(self.root)
        entry = self.root / "dist/src/cli/main.js"
        entry.write_text("changed")
        with self.assertRaisesRegex(ValueError, "changed"):
            bridge.verify_bundle(self.root)
        manifest["files"] = {"../escape": "x"}
        (self.root / "BYTE_SOURCE.json").write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, "Unsafe"):
            bridge.verify_bundle(self.root)

    def test_bundle_rejects_symlink_entry(self):
        self.bundle()
        entry = self.root / "dist/src/cli/main.js"
        outside = self.root / "other.js"
        entry.rename(outside)
        entry.symlink_to(outside)
        with self.assertRaisesRegex(ValueError, "not local"):
            bridge.verify_bundle(self.root)

    def test_cli_user_text_remains_argv_and_stdin_not_shell(self):
        self.bundle()
        argument = "alias with spaces $(touch nope) `false`"
        with patch.object(bridge, "RUNTIME", self.root), patch.object(bridge, "node_path", return_value="/node"), \
             patch.object(bridge, "dependency_ready", return_value=True), patch.object(bridge.subprocess, "run") as run:
            run.return_value.returncode = 5
            self.assertEqual(bridge.main(["exec", "request", "--stdin", "--query", argument]), 5)
            run.assert_called_once_with(["/node", str(self.root / "dist/src/cli/main.js"), "request", "--stdin", "--query", argument])

    def test_missing_dependencies_never_select_global_cli(self):
        self.bundle()
        with patch.object(bridge, "RUNTIME", self.root), patch.object(bridge, "node_path", return_value="/node"), \
             patch.object(bridge.subprocess, "run") as run:
            self.assertEqual(bridge.main(["exec", "request", "--stdin"]), 3)
            run.assert_not_called()

    def workflow(self):
        coord = self.root / ".byte-os/coordination"
        coord.mkdir(parents=True)
        manifest = {"roles": {"main": "pi:native-main", "supervisor": "kimi:native-worker"}}
        snapshot = self.root / ".byte-os/workflow.yaml"
        snapshot.write_text(json.dumps(manifest))
        wf = {"engine": "byte-workflow/v1", "instance_sha256": hashlib.sha256(snapshot.read_bytes()).hexdigest(), "revision": 7}
        state = {"owner_session": "pi:native-main", "overall_outcome": {"id": "outcome", "workflow": wf}}
        (coord / "state.json").write_text(json.dumps(state))
        def native(app, sid):
            return {"harness": app, "host_id": "test", "profile_id": "test", "native_session_id": sid,
                    "project_id": "same-project", "runtime_generation": "generation"}
        main = native("pi", "native-main")
        value = {"direction": "delegate", "event_id": "start-once", "run_id": "run-once", "attempt": 1,
                 "stage_scope": "supervision-only", "scope": {"source": main, "target": native("kimi", "native-worker"),
                 "return_to": main, "goal": "Watch existing run", "acceptance": ["Return exact evidence"],
                 "read_paths": ["output"], "write_paths": [], "deadline_at": "2099-01-01T00:00:00Z"}}
        return coord / "state.json", value

    def test_handoff_draft_binds_revision_and_preserves_owner(self):
        state, value = self.workflow()
        before = state.read_bytes()
        result = handoff.draft(self.root, value)
        self.assertEqual(result["sessionbridge"]["revision"], 8)
        self.assertEqual(result["sessionbridge"]["scope"], value["scope"])
        self.assertEqual(state.read_bytes(), before)
        value["scope"]["source"]["native_session_id"] = "wrong-owner"
        with self.assertRaisesRegex(ValueError, "exact owner"):
            handoff.draft(self.root, value)
        self.assertEqual(state.read_bytes(), before)

    def test_handoff_rejects_project_substitution_and_scope_escape(self):
        _, value = self.workflow()
        value["scope"]["target"]["project_id"] = "other-project"
        with self.assertRaisesRegex(ValueError, "project identities"):
            handoff.draft(self.root, value)
        value["scope"]["target"]["project_id"] = "same-project"
        value["scope"]["write_paths"] = ["../other-project"]
        with self.assertRaisesRegex(ValueError, "project-relative"):
            handoff.draft(self.root, value)

    def test_handoff_file_cannot_be_overwritten(self):
        state, value = self.workflow()
        command = [sys.executable, str(ROOT / "skills/byte-bridge/scripts/handoff.py"),
                   "--project", str(self.root), "--output", ".byte-os/coordination/handoffs/one.json"]
        before = state.read_bytes()
        first = subprocess.run(command, input=json.dumps(value), capture_output=True, text=True)
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertFalse(json.loads(first.stdout)["ownership_changed"])
        again = subprocess.run(command, input=json.dumps(value), capture_output=True, text=True)
        self.assertEqual(again.returncode, 0, again.stderr)
        value["scope"]["goal"] = "Changed immutable intent"
        changed = subprocess.run(command, input=json.dumps(value), capture_output=True, text=True)
        self.assertEqual(changed.returncode, 3)
        self.assertEqual(state.read_bytes(), before)

    def test_frozen_scope_and_parent_symlinks_cannot_redirect_draft(self):
        state, value = self.workflow()
        stored = json.loads(state.read_text())
        stored["frozen_paths"] = ["data/**"]
        state.write_text(json.dumps(stored))
        value["scope"]["write_paths"] = ["data/train.json"]
        with self.assertRaisesRegex(ValueError, "frozen"):
            handoff.draft(self.root, value)
        value["scope"]["write_paths"] = []
        outside = self.root / "outside"
        outside.mkdir()
        (state.parent / "handoffs").symlink_to(outside, target_is_directory=True)
        command = [sys.executable, str(ROOT / "skills/byte-bridge/scripts/handoff.py"), "--project", str(self.root),
                   "--output", ".byte-os/coordination/handoffs/out.json"]
        result = subprocess.run(command, input=json.dumps(value), capture_output=True, text=True)
        self.assertEqual(result.returncode, 3)
        self.assertFalse((outside / "out.json").exists())

    def product(self):
        files = {
            "package.json": json.dumps({"files": ["dist/src", "plugins", "README.md"]}),
            "package-lock.json": "{}", "LICENSE": "MIT", "README.md": "Byte Bridge",
            "ORIGIN.json": json.dumps({"origin_repository": "historical", "origin_commit": "baseline"}),
            "src/core.ts": "source", "tests/live/run.ts": "live test source",
            "dist/src/cli/main.js": "compiled", "plugins/codex/main.js": "plugin",
            "plugins/codex/.sessionbridge-runtime.json": "private locator",
            "evidence/private.json": "private", "node_modules/local/index.js": "dependency",
        }
        for name, data in files.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(data)

    def test_runtime_contains_payload_while_full_project_retains_tests(self):
        self.product()
        selected = {name for name, _ in exporter.selected_files(self.root)}
        self.assertIn("dist/src/cli/main.js", selected)
        self.assertIn("plugins/codex/main.js", selected)
        self.assertNotIn("src/core.ts", selected)
        self.assertNotIn("tests/live/run.ts", selected)
        self.assertNotIn("plugins/codex/.sessionbridge-runtime.json", selected)
        maintained = {name for name, _ in exporter.source_files(self.root)}
        self.assertIn("tests/live/run.ts", maintained)
        self.assertNotIn("evidence/private.json", maintained)

    def test_source_change_invalidates_generated_runtime(self):
        self.product()
        with tempfile.TemporaryDirectory() as output:
            destination = Path(output) / "runtime"
            exporter.export(self.root, destination)
            exporter.check_runtime(self.root, destination)
            before = exporter.source_digest(self.root)
            (self.root / "node_modules/local/index.js").write_text("different dependency")
            self.assertEqual(exporter.source_digest(self.root), before)
            (self.root / "src/core.ts").write_text("new implementation")
            with self.assertRaisesRegex(ValueError, "stale"):
                exporter.check_runtime(self.root, destination)

    def test_runtime_tampering_is_rejected(self):
        self.product()
        with tempfile.TemporaryDirectory() as output:
            destination = Path(output) / "runtime"
            exporter.export(self.root, destination)
            (destination / "dist/src/cli/main.js").write_text("tampered")
            with self.assertRaisesRegex(ValueError, "changed"):
                exporter.check_runtime(self.root, destination)


if __name__ == "__main__":
    unittest.main()
