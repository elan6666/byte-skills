"""Tiny CPU-only neural-network smoke fixture for Codex relay supervision.

The initial checkpoint intentionally has the wrong output-layer width.
The first run must fail rather than quietly treat an invalid checkpoint as a
completed training run. ``--repair-checkpoint`` provides the bounded recovery
path for the smoke test; no real dataset or GPU is used.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path


DATA = [(-1.0, -1.0), (-0.5, -0.5), (0.0, 0.0), (0.5, 0.5), (1.0, 1.0)]


def train(checkpoint: Path, repair_checkpoint: bool, epochs: int) -> float:
    # One input, two tanh hidden units, one linear output.
    hidden_weights = [0.4, -0.7]
    output_weights = [0.6, -0.2]
    if checkpoint.exists():
        loaded = json.loads(checkpoint.read_text())
        output_weights = loaded["output_weights"]
        if len(output_weights) != len(hidden_weights):
            if not repair_checkpoint:
                raise ValueError(
                    f"checkpoint output width {len(output_weights)} != "
                    f"hidden width {len(hidden_weights)}"
                )
            output_weights = [0.6, -0.2]

    learning_rate = 0.08
    loss = float("inf")
    for epoch in range(epochs):
        loss = 0.0
        for x, target in DATA:
            hidden = [math.tanh(weight * x) for weight in hidden_weights]
            prediction = sum(w * h for w, h in zip(output_weights, hidden))
            error = prediction - target
            loss += error * error / len(DATA)
            old_output = output_weights[:]
            for i in range(len(output_weights)):
                output_weights[i] -= learning_rate * 2 * error * hidden[i]
            for i in range(len(hidden_weights)):
                hidden_weights[i] -= (
                    learning_rate * 2 * error * old_output[i]
                    * (1 - hidden[i] ** 2) * x
                )
        if epoch % 100 == 0 or epoch == epochs - 1:
            print(f"epoch={epoch} loss={loss:.6f}", flush=True)
    return loss


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--repair-checkpoint", action="store_true")
    parser.add_argument("--epochs", type=int, default=500)
    args = parser.parse_args()
    loss = train(args.checkpoint, args.repair_checkpoint, args.epochs)
    print(f"FINAL_LOSS={loss:.6f}", flush=True)
    if loss >= 0.02:
        raise SystemExit("training did not meet loss < 0.02")


if __name__ == "__main__":
    main()
