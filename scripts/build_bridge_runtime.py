#!/usr/bin/env python3
"""Build the installable runtime from Byte's own packages/byte-bridge project."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'packages/byte-bridge'
DEST = ROOT / 'skills/byte-bridge/runtime'
SCHEMA = 'byte-bridge-runtime/v2'
SKIP_DIRS = {'node_modules','dist','coverage','.git','__pycache__','.byte-os',
             '.session-bridge','evidence','acceptance','.local','.superpowers'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def source_files(source):
    """Hash the complete maintained product project, excluding local outputs."""
    for directory, dirs, names in os.walk(source):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and not
                         (Path(directory).name == 'docs' and d in {'distribution','acceptance','research','superpowers','maintenance'}))
        for name in sorted(names):
            if name in {'.DS_Store','.sessionbridge-runtime.json'} or name.endswith(('.pyc','.tgz')):
                continue
            path = Path(directory) / name
            if path.is_symlink() or path.resolve() != path:
                raise ValueError(f'Noncanonical project source: {path.relative_to(source)}')
            yield path.relative_to(source).as_posix(), path


def source_digest(source):
    hashes = {name: digest(path.read_bytes()) for name,path in source_files(source)}
    return digest(json.dumps(hashes,sort_keys=True,separators=(',',':')).encode())


def selected_files(source):
    """The npm product payload only; editable sources/tests stay in packages/."""
    package = json.loads((source / 'package.json').read_text())
    names = {'package.json','package-lock.json','LICENSE',*package['files']}
    for name in sorted(names):
        relative = Path(name)
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError('Package payload escapes the maintained project')
        path = source / relative
        if not path.exists():
            raise ValueError(f'Build the canonical package before export: {name}')
        paths = sorted(path.rglob('*')) if path.is_dir() else [path]
        for item in paths:
            if item.is_symlink() or item.resolve() != item:
                raise ValueError('Package payload contains a noncanonical path')
            if not item.is_file() or item.name.endswith(('.map','.d.ts','.pyc')) or item.name == '.sessionbridge-runtime.json':
                continue
            if any(p in SKIP_DIRS - {'dist'} for p in item.relative_to(source).parts):
                continue
            yield item.relative_to(source).as_posix(), item


def runtime_manifest(source):
    origin = json.loads((source / 'ORIGIN.json').read_text())
    files = {name: digest(path.read_bytes()) for name,path in selected_files(source)}
    return {'schema':SCHEMA,'maintained_in':'packages/byte-bridge',
            'canonical_repository':'https://github.com/elan6666/byte-skills',
            'origin_repository':origin['origin_repository'],'origin_commit':origin['origin_commit'],
            'source_tree_sha256':source_digest(source),'files':files}


def check_runtime(source,destination):
    destination = destination.resolve()
    current = json.loads((destination / 'BYTE_SOURCE.json').read_text())
    if current.get('schema') != SCHEMA or current.get('source_tree_sha256') != source_digest(source):
        raise ValueError('Bridge runtime is stale; build it from packages/byte-bridge')
    for name,expected in current['files'].items():
        path = destination / name
        if Path(name).is_absolute() or '..' in Path(name).parts or path.resolve() != path or digest(path.read_bytes()) != expected:
            raise ValueError(f'Generated runtime changed: {name}')
    if (source / 'dist/src/cli/main.js').is_file() and current != runtime_manifest(source):
        raise ValueError('Compiled Bridge output differs from the committed runtime')
    return current


def export(source,destination):
    if destination.exists():
        raise ValueError('Export destination must be new')
    manifest = runtime_manifest(source)
    try:
        for name,path in selected_files(source):
            data = path.read_bytes()
            if b'/Users/elan/' in data or b'BEGIN PRIVATE KEY' in data:
                raise ValueError(f'Private local content in package payload: {name}')
            out = destination / name
            out.parent.mkdir(parents=True,exist_ok=True)
            out.write_bytes(data)
        (destination / 'BYTE_SOURCE.json').write_text(json.dumps(manifest,indent=2)+'\n')
        return manifest
    except Exception:
        shutil.rmtree(destination,ignore_errors=True)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build',action='store_true',help='Compile and regenerate canonical contracts/plugins')
    parser.add_argument('--check',action='store_true',help='Verify the committed runtime without replacing it')
    args = parser.parse_args()
    if args.build:
        subprocess.run(['npm','run','generate:contracts'],cwd=SOURCE,check=True)
    if args.check:
        manifest = check_runtime(SOURCE,DEST)
    else:
        if not args.build:
            parser.error('Use --build to generate a runtime, or --check to validate it')
        temporary = Path(tempfile.mkdtemp(prefix='.bridge-runtime-',dir=DEST.parent))
        temporary.rmdir()
        try:
            manifest = export(SOURCE,temporary)
            backup = DEST.with_name('.runtime-previous')
            if backup.exists():
                raise ValueError('Previous runtime replacement needs reconciliation')
            if DEST.exists():
                DEST.rename(backup)
            try:
                temporary.rename(DEST)
            except Exception:
                if backup.exists():
                    backup.rename(DEST)
                raise
            shutil.rmtree(backup,ignore_errors=True)
        finally:
            shutil.rmtree(temporary,ignore_errors=True)
    print(json.dumps({'state':'verified' if args.check else 'generated',
                      'maintained_in':manifest['maintained_in'],'source_tree_sha256':manifest['source_tree_sha256'],
                      'files':len(manifest['files'])}))


if __name__ == '__main__':
    main()
