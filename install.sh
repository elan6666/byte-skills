#!/usr/bin/env bash
# Install byte skills into the current user's skill directories.
# Usage: ./install.sh [--target DIR]
# Default target: ~/.agents/skills (read by ZCode and OpenAI-compatible harnesses).
set -euo pipefail

TARGET="${HOME}/.agents/skills"
if [[ "${1:-}" == "--target" && -n "${2:-}" ]]; then
  TARGET="$2"
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$TARGET"

for skill_dir in "$REPO_DIR"/skills/*/; do
  name="$(basename "$skill_dir")"
  rm -rf "$TARGET/$name"
  cp -R "$skill_dir" "$TARGET/$name"
  echo "installed $name -> $TARGET/$name"
done

chmod +x "$TARGET"/byte-relay/scripts/*.py 2>/dev/null || true

cat <<'EOF'

Next steps:
  - ZCode / Codex-style harnesses: skills are picked up from the target dir.
  - byte-relay needs zstd on PATH to read DSH sessions: `brew install zstd`.
  - Copy the same skills/ directory into your other harnesses' skill dirs
    (Claude Code: ~/.claude/skills, etc.) so every harness speaks byte-relay.
  - Initialize coordination state in a project with: $byte-relay init
EOF
