#!/usr/bin/env bash
set -euo pipefail
byte_repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$byte_repo_root/apps/byte-workbench/server.mjs" "$@"
