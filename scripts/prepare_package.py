#!/usr/bin/env python3
"""Restore embedded adapter instruction templates in a marketplace ZIP.

Only the 14 public Byte entry skills are marketplace entries. Adapter copies
remain readable Markdown templates and are restored before integrity checking.
A normal Git checkout has no BYTE_PACKAGE.json and needs no preparation.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREFIXES = ('packages/byte-bridge/plugins/', 'packages/byte-bridge/skills/',
            'skills/byte-bridge/runtime/plugins/', 'skills/byte-bridge/runtime/skills/')


def prepare(root):
    root = root.resolve()
    manifest_path = root / 'BYTE_PACKAGE.json'
    if not manifest_path.exists():
        return 0
    manifest = json.loads(manifest_path.read_text())
    actions = []
    for name, item in manifest.get('embedded_skill_templates', {}).items():
        relative = Path(name)
        if (relative.is_absolute() or '..' in relative.parts or relative.name != 'SKILL.md'
                or not name.startswith(PREFIXES)):
            raise ValueError(f'Invalid embedded instruction destination: {name}')
        target = root / relative
        template = target.with_name('SKILL.template.md')
        if item['path'] != template.relative_to(root).as_posix():
            raise ValueError('Unexpected instruction template path')
        expected = item['sha256']
        if expected != manifest['files'][name]:
            raise ValueError('Template is inconsistent with the package source manifest')
        for path in (target, template):
            if path.resolve() != path:
                raise ValueError(f'Instruction path contains a symlink: {name}')
            if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                raise ValueError(f'Changed instruction content: {path.relative_to(root)}')
        if not target.is_file() and not template.is_file():
            raise ValueError(f'Missing instruction template: {name}')
        if template.exists():
            actions.append((template, target))
    # Validate every path/hash before modifying any template.
    for template, target in actions:
        if target.exists():
            template.unlink()  # Identical content was verified above.
        else:
            template.rename(target)
    return len(actions)


if __name__ == '__main__':
    print(json.dumps({'embedded_instructions_prepared': prepare(ROOT)}))
