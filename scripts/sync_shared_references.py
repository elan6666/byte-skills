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


LONG_CONSUMERS = (
    "byte-auto", "byte-build", "byte-do", "byte-plan", "byte-research",
    "byte-status", "byte-relay", "byte-design-supervise",
)


def copies():
    for skill in CONSUMERS:
        yield CANONICAL, ROOT / "skills" / skill / "references" / CANONICAL.name
    source = ROOT / "skills" / "byte-auto"
    for skill in LONG_CONSUMERS:
        if skill != "byte-auto":
            for relative in ("references/long-running-work.md", "scripts/continuation_check.py",
                             "scripts/continuation_route.py"):
                yield source / relative, ROOT / "skills" / skill / relative


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="report drift without modifying bundled copies",
    )
    args = parser.parse_args()
    drift = []
    for source, destination in copies():
        expected = source.read_bytes()
        if destination.exists() and destination.read_bytes() == expected:
            continue
        drift.append(destination)
        if not args.check:
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
            print(f"synced {destination.relative_to(ROOT)}")
    if args.check and drift:
        for destination in drift:
            print(f"out of sync: {destination.relative_to(ROOT)}", file=sys.stderr)
        return 1
    if args.check:
        print("shared references and continuation helpers synchronized")
    return 0


if __name__ == "__main__":
    sys.exit(main())
