#!/usr/bin/env bash
# Install byte skills into the current user's skill directories.
# Usage: ./install.sh [--target DIR]... [--all] [--check]
# Default target: ~/.agents/skills (read by ZCode and OpenAI-compatible harnesses).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGETS=()
CHECK_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      [[ $# -ge 2 && -n "$2" ]] || { echo "--target requires a directory" >&2; exit 2; }
      TARGETS+=("$2")
      shift 2
      ;;
    --all)
      TARGETS+=("${HOME}/.agents/skills" "${HOME}/.codex/skills")
      shift
      ;;
    --check)
      CHECK_ONLY=1
      shift
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  TARGETS+=("${HOME}/.agents/skills")
fi

if [[ $CHECK_ONLY -eq 1 ]]; then
  python3 "$REPO_DIR/scripts/sync_shared_references.py" --check
else
  python3 "$REPO_DIR/scripts/sync_shared_references.py"
fi

for target in "${TARGETS[@]}"; do
  if [[ "$target" == "/" || "$target" == "$HOME" ]]; then
    echo "refusing unsafe skill target: $target" >&2
    exit 2
  fi
  if [[ $CHECK_ONLY -eq 1 ]]; then
    for skill_dir in "$REPO_DIR"/skills/*/; do
      name="$(basename "$skill_dir")"
      if ! diff -qr "$skill_dir" "$target/$name" >/dev/null; then
        echo "out of sync: $target/$name" >&2
        exit 1
      fi
    done
    echo "verified installed skills -> $target"
    continue
  fi

  mkdir -p "$target"
  for skill_dir in "$REPO_DIR"/skills/*/; do
    name="$(basename "$skill_dir")"
    rm -rf "$target/$name"
    cp -R "$skill_dir" "$target/$name"
    echo "installed $name -> $target/$name"
  done
  chmod +x "$target"/byte-relay/scripts/*.py 2>/dev/null || true
done

cat <<'EOF'

Next steps:
  - ZCode / Codex-style harnesses: skills are picked up from the target dir.
  - byte-relay needs zstd on PATH to read DSH sessions: `brew install zstd`.
  - Use `./install.sh --all` for both ~/.agents/skills and ~/.codex/skills.
  - Add `--target DIR` for another harness (for example ~/.claude/skills).
  - Use `./install.sh --all --check` to verify installed-copy parity.
  - Initialize coordination state in a project with: $byte-relay init
EOF
