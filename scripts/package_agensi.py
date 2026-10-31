#!/usr/bin/env python3
"""Package the public Byte checkout for Agensi's ZIP-based update flow."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--version', default='1.1')
    args = parser.parse_args()
    # Only public, Git-tracked files: no local credentials, caches or node_modules.
    names = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    names = sorted(n for n in names if n and not n.startswith(('tests/', '.github/')))
    skills = sorted(p.parent.name for p in (ROOT / 'skills').glob('*/SKILL.md'))
    if len(skills) != 14 or 'byte-bridge' not in skills:
        raise ValueError('Update the release catalog before packaging a changed skill set')
    subprocess.run(['python3', 'scripts/build_bridge_runtime.py', '--check'], cwd=ROOT, check=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    manifest = {'version': args.version, 'repository': 'https://github.com/elan6666/byte-skills',
                'source_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip(),
                'skills': skills, 'skill_count': len(skills),
                'files': {n: hashlib.sha256((ROOT / n).read_bytes()).hexdigest() for n in names}}
    with zipfile.ZipFile(args.output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name in names:
            path = ROOT / name
            if not path.is_file() or path.is_symlink():
                raise ValueError(f'Noncanonical public package file: {name}')
            archive.write(path, name)
        archive.writestr('BYTE_PACKAGE.json', json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'package': str(args.output.resolve()), 'version': args.version,
                      'skills': len(skills), 'files': len(names) + 1,
                      'sha256': hashlib.sha256(args.output.read_bytes()).hexdigest(),
                      'zip_bytes': args.output.stat().st_size}))


if __name__ == '__main__':
    main()
