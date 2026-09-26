import json
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SYNC = ROOT / "scripts" / "sync_shared_references.py"
CANONICAL_URL = "https://github.com/elan6666/byte-skills"
CONSUMERS = (
    "byte-auto",
    "byte-build",
    "byte-do",
    "byte-plan",
    "byte-relay",
    "byte-research",
    "byte-review",
    "byte-status",
)


class SkillContractTests(unittest.TestCase):
    def test_shared_evidence_contract_is_bundled_without_drift(self):
        result = subprocess.run(
            [sys.executable, str(SYNC), "--check"],
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_every_skill_points_to_the_real_canonical_repository(self):
        for path in sorted((ROOT / "skills").glob("byte-*/SKILL.md")):
            text = path.read_text(encoding="utf-8")
            self.assertIn(CANONICAL_URL, text, path)
            self.assertNotIn("your-bytedance-skills", text, path)

    def test_evidence_consumers_link_the_bundled_contract(self):
        for name in CONSUMERS:
            skill = ROOT / "skills" / name
            self.assertIn(
                "references/evidence-contract.md",
                (skill / "SKILL.md").read_text(encoding="utf-8"),
            )
            self.assertTrue((skill / "references" / "evidence-contract.md").is_file())

    def test_behavior_benchmark_pack_has_required_invariants(self):
        cases = json.loads((ROOT / "benchmarks" / "byte-behavior-cases.json").read_text())
        ids = {case["id"] for case in cases}
        self.assertEqual(len(ids), len(cases))
        self.assertTrue(
            {
                "small-edit-no-ceremony",
                "discussion-no-mutation",
                "status-read-only",
                "relay-owner-gate",
                "registration-is-not-execution",
                "completion-needs-evidence",
            }.issubset(ids)
        )
        for case in cases:
            self.assertTrue(case["prompt"])
            self.assertTrue(case["required_invariants"])
            self.assertTrue(case["forbidden_behaviors"])


if __name__ == "__main__":
    unittest.main()
