#!/usr/bin/env python3
"""Bundle canonical shared references into independently installed Byte skills."""

import argparse
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CANONICAL = ROOT / "shared" / "evidence-contract.md"
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


def destinations():
    for skill in CONSUMERS:
        yield ROOT / "skills" / skill / "references" / CANONICAL.name


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="report drift without modifying bundled copies",
    )
    args = parser.parse_args()
    expected = CANONICAL.read_bytes()
    drift = []
    for destination in destinations():
        if destination.exists() and destination.read_bytes() == expected:
            continue
        drift.append(destination)
        if not args.check:
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(CANONICAL, destination)
            print(f"synced {destination.relative_to(ROOT)}")
    if args.check and drift:
        for destination in drift:
            print(f"out of sync: {destination.relative_to(ROOT)}", file=sys.stderr)
        return 1
    if args.check:
        print(f"shared references synchronized: {len(CONSUMERS)} consumers")
    return 0


if __name__ == "__main__":
    sys.exit(main())
