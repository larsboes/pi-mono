#!/usr/bin/env bash
# Link all extensions from pi-mono/extensions/ into ~/.pi/agent/extensions/
# Run after clone + build, or after adding new extensions.
# Idempotent — safe to run multiple times.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONO_DIR="$(dirname "$SCRIPT_DIR")"
EXT_SOURCE="$MONO_DIR/extensions"
EXT_TARGET="$HOME/.pi/agent/extensions"

mkdir -p "$EXT_TARGET"

linked=0
skipped=0

for ext_dir in "$EXT_SOURCE"/*/; do
  name="$(basename "$ext_dir")"
  [ -f "$ext_dir/index.ts" ] || [ -f "$ext_dir/src/index.ts" ] || continue

  target="$EXT_TARGET/$name"

  if [ -L "$target" ]; then
    existing="$(readlink "$target")"
    if [ "$existing" = "$ext_dir" ] || [ "$existing" = "${ext_dir%/}" ]; then
      skipped=$((skipped + 1))
      continue
    fi
    rm "$target"
  elif [ -d "$target" ]; then
    echo "⚠ $name: directory exists (not a symlink) — skipping"
    skipped=$((skipped + 1))
    continue
  fi

  ln -s "${ext_dir%/}" "$target"
  echo "✓ $name"
  linked=$((linked + 1))
done

echo ""
echo "Linked: $linked | Already linked: $skipped"
echo "Target: $EXT_TARGET"
