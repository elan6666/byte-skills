#!/usr/bin/env python3
"""Export a product-only SessionBridge snapshot into the independently installed Byte skill."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "skills/byte-bridge/runtime"
DIRECTORIES = ("src", "plugins", "skills", "assets", "dist/src", "tests/unit", "tests/integration",
               "tests/helpers", "tests/fixtures", "tests/python")
FILES = ("package.json", "package-lock.json", "tsconfig.json", "eslint.config.mjs", "README.md", "README.zh-CN.md",
         ".agents/plugins/marketplace.json")
DOCS = ("support.md", "support.en.md", "cli.md", "cli.zh-CN.md", "zcode.md", "zcode.zh-CN.md",
        "acp.md", "acp.zh-CN.md", "byte.md", "byte.zh-CN.md")


def selected_files(source: Path):
    for name in (*FILES, *("docs/" + name for name in DOCS)):
        yield name, source / name
    for directory in DIRECTORIES:
        for path in sorted((source / directory).rglob("*")):
            relative = path.relative_to(source).as_posix()
            if any(part in ("node_modules", "__pycache__", ".byte-os", "evidence", ".git") for part in path.relative_to(source).parts):
                continue
            if path.is_symlink():
                raise ValueError(f"Unexpected product symlink: {relative}")
            if path.is_file() and not path.name.endswith((".pyc", ".map", ".d.ts")) and path.name != ".sessionbridge-runtime.json":
                yield relative, path
    for directory in ("scripts",):
        # Only the product build/contract helpers, never live tests or exports of
        # local acceptance records. No packaging script is invoked by bootstrap.
        for name in ("check-command-contracts.mjs", "pack-plugins.mjs", "lib/skill-files.mjs"):
            yield directory + "/" + name, source / directory / name
    if (source / "LICENSE").is_file():
        yield "LICENSE", source / "LICENSE"


def export(source: Path, destination: Path) -> dict:
    source = source.resolve()
    if destination.exists():
        raise ValueError("Destination must be new; preserve the old bundle until the new export validates")
    commit = subprocess.run(["git", "-C", str(source), "rev-parse", "HEAD"],
                            check=True, capture_output=True, text=True).stdout.strip()
    dirty = subprocess.run(["git", "-C", str(source), "status", "--porcelain", "--untracked-files=no"],
                           check=True, capture_output=True, text=True).stdout.strip()
    if dirty:
        raise ValueError("Commit the source snapshot before exporting; source must be reproducible")
    files = {}
    try:
        for relative, path in selected_files(source):
            if path.is_symlink() or path.resolve() != path or not path.is_file():
                raise ValueError(f"Required product file is missing or linked: {relative}")
            data = path.read_bytes()
            if b"/Users/elan/" in data or b"BEGIN PRIVATE KEY" in data:
                raise ValueError(f"Private local content in product export: {relative}")
            out = destination / relative
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(data)
            files[relative] = hashlib.sha256(data).hexdigest()
        manifest = {"schema": "byte-sessionbridge-source/v1",
                    "upstream": "https://github.com/elan6666/Session-bridge",
                    "source_commit": commit, "files": files}
        notice = ("# SessionBridge in Byte Skills\n\n"
                  "Origin: https://github.com/elan6666/Session-bridge\n\n"
                  "This product snapshot is integrated by the same repository owner into Byte Skills. "
                  "The integration is distributed under Byte Skills' root MIT license. "
                  "This does not assert a license for older upstream snapshots. "
                  "Third-party npm dependencies retain their own licenses and notices; "
                  "node_modules is not part of this source snapshot.\n\n"
                  "The source commit and exact file hashes are recorded in BYTE_SOURCE.json. "
                  "Local development history, credentials, runtime state and acceptance records "
                  "are excluded.\n")
        (destination / "BYTE_NOTICE.md").write_text(notice)
        files["BYTE_NOTICE.md"] = hashlib.sha256(notice.encode()).hexdigest()
        (destination / "BYTE_SOURCE.json").write_text(json.dumps(manifest, indent=2) + "\n")
        return manifest
    except Exception:
        if destination.exists():
            shutil.rmtree(destination)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--destination", type=Path, default=DEST)
    args = parser.parse_args()
    manifest = export(args.source, args.destination)
    print(json.dumps({"source_commit": manifest["source_commit"], "files": len(manifest["files"])}))


if __name__ == "__main__":
    main()
