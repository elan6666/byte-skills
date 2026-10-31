#!/usr/bin/env python3
"""Run the pinned SessionBridge bundled with Byte; never select a global CLI."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path


RUNTIME = Path(__file__).resolve().parents[1] / "runtime"


def verify_bundle(root: Path) -> dict:
    manifest = json.loads((root / "BYTE_SOURCE.json").read_text())
    if manifest.get("schema") not in ("byte-sessionbridge-source/v1", "byte-bridge-runtime/v2"):
        raise ValueError("Unsupported bundled runtime manifest")
    for name, expected in manifest["files"].items():
        relative = Path(name)
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("Unsafe runtime manifest path")
        path = root / relative
        if path.is_symlink() or path.resolve() != root.resolve() / relative:
            raise ValueError(f"Runtime file is not local: {name}")
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError(f"Bundled runtime changed: {name}; reinstall the matching Byte package")
    entry = "dist/src/cli/main.js"
    if entry not in manifest["files"] or "package-lock.json" not in manifest["files"]:
        raise ValueError("Bundled runtime is incomplete")
    return manifest


def node_path() -> str:
    node = shutil.which("node")
    if not node:
        raise ValueError("Node.js 24.15–24.x is required for Bridge; other Byte skills do not need it")
    version = subprocess.run([node, "--version"], capture_output=True, text=True, check=True).stdout.strip()
    parts = version.removeprefix("v").split(".")
    if len(parts) < 2 or not parts[0].isdigit() or not parts[1].isdigit() or int(parts[0]) != 24 or int(parts[1]) < 15:
        raise ValueError(f"Unsupported Node version {version}; use Node.js 24.15–24.x")
    return node


def dependency_ready(root: Path) -> bool:
    return all((root / "node_modules" / name / "package.json").is_file()
               for name in ("zod", "@modelcontextprotocol/sdk"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("doctor", "bootstrap", "exec"))
    parser.add_argument("arguments", nargs=argparse.REMAINDER,
                        help="exec: original SessionBridge CLI arguments; stdin passes through unchanged")
    args = parser.parse_args(argv)
    try:
        manifest = verify_bundle(RUNTIME)
        node = node_path()
        if args.command == "doctor":
            if args.arguments:
                parser.error("doctor takes no project argument; use exec doctor --project PATH --json")
            print(json.dumps({"state": "ready" if dependency_ready(RUNTIME) else "needs_bootstrap",
                              "source_commit": manifest.get("source_commit", manifest.get("origin_commit")),
                              "maintained_in": manifest.get("maintained_in"),
                              "source_tree_sha256": manifest.get("source_tree_sha256"), "runtime": str(RUNTIME),
                              "node": node, "files_verified": len(manifest["files"]),
                              "models_started": 0, "project_modified": False}))
            return 0 if dependency_ready(RUNTIME) else 3
        if args.command == "bootstrap":
            if args.arguments:
                parser.error("bootstrap takes no extra arguments")
            npm = shutil.which("npm")
            if not npm:
                raise ValueError("npm is required to install the pinned Bridge runtime dependencies")
            subprocess.run([npm, "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
                           cwd=RUNTIME, check=True)
            verify_bundle(RUNTIME)
            if not dependency_ready(RUNTIME):
                raise ValueError("Runtime dependency installation is incomplete")
            print(json.dumps({"state": "ready", "models_started": 0, "services_started": 0}))
            return 0
        if not args.arguments:
            parser.error("exec needs a SessionBridge command, such as describe --query request --json")
        if not dependency_ready(RUNTIME):
            raise ValueError("Run bridge.py bootstrap first; no global session-bridge fallback is used")
        # Inherit native identity and stdin. No shell, JSON interpolation, model call,
        # impersonated session variable, or alternate global binary is involved.
        result = subprocess.run([node, str(RUNTIME / "dist/src/cli/main.js"), *args.arguments])
        return result.returncode
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        print(json.dumps({"state": "blocked", "error": str(error)}), file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
