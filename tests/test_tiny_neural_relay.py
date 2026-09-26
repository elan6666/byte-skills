"""Keep the real CPU neural smoke fixture's failure and repair deterministic."""

import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "benchmarks" / "tiny-neural-relay"


class TinyNeuralRelayTests(unittest.TestCase):
    def command(self, *extra):
        return subprocess.run(
            [
                sys.executable,
                str(FIXTURE / "train.py"),
                "--checkpoint",
                str(FIXTURE / "bad-checkpoint.json"),
                "--epochs",
                "500",
                *extra,
            ],
            capture_output=True,
            text=True,
            check=False,
        )

    def test_bad_checkpoint_fails_visibly(self):
        result = self.command()
        self.assertEqual(result.returncode, 1)
        self.assertIn("checkpoint output width 1 != hidden width 2", result.stderr)
        self.assertNotIn("FINAL_LOSS=", result.stdout)

    def test_bounded_repair_meets_loss_acceptance(self):
        result = self.command("--repair-checkpoint")
        self.assertEqual(result.returncode, 0, result.stderr)
        final = next(
            line for line in result.stdout.splitlines()
            if line.startswith("FINAL_LOSS=")
        )
        self.assertLess(float(final.split("=", 1)[1]), 0.02)


if __name__ == "__main__":
    unittest.main()
