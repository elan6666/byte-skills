"""Verify marketplace materialization preserves scope and rejects drift."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('prepare_package', ROOT / 'scripts/prepare_package.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PreparationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.name = 'packages/byte-bridge/plugins/codex/skills/helper/SKILL.md'
        self.target = self.root / self.name
        self.template = self.target.with_name('SKILL.template.md')
        self.template.parent.mkdir(parents=True)
        self.template.write_text('original adapter instruction')
        digest = hashlib.sha256(self.template.read_bytes()).hexdigest()
        self.manifest = {'files': {self.name: digest}, 'embedded_skill_templates': {
            self.name: {'path': str(self.template.relative_to(self.root)), 'sha256': digest}}}
        self.save()

    def save(self):
        (self.root / 'BYTE_PACKAGE.json').write_text(json.dumps(self.manifest))

    def test_restore_once_then_idempotent(self):
        self.assertEqual(module.prepare(self.root), 1)
        self.assertEqual(self.target.read_text(), 'original adapter instruction')
        self.assertFalse(self.template.exists())
        self.assertEqual(module.prepare(self.root), 0)

    def test_changed_instruction_is_rejected_without_mutation(self):
        self.template.write_text('changed')
        with self.assertRaisesRegex(ValueError, 'Changed'):
            module.prepare(self.root)
        self.assertFalse(self.target.exists())
        self.assertTrue(self.template.exists())

    def test_manifest_cannot_redirect_to_an_unrelated_file(self):
        self.manifest['embedded_skill_templates']['../SKILL.md'] = self.manifest['embedded_skill_templates'].pop(self.name)
        self.save()
        with self.assertRaisesRegex(ValueError, 'Invalid'):
            module.prepare(self.root)
        self.assertTrue(self.template.exists())


if __name__ == '__main__':
    unittest.main()
