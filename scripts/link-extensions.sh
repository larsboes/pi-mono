#!/usr/bin/env bash
# Set up pi-mono: link extensions + unified memory + Claude Code memory symlink.
# Run after clone + build, or after adding new extensions.
# Idempotent — safe to run multiple times.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONO_DIR="$(dirname "$SCRIPT_DIR")"
EXT_SOURCE="$MONO_DIR/extensions"
EXT_TARGET="$HOME/.pi/agent/extensions"
PAI_MEMORY="$HOME/.pai/MEMORY"

# ── Extensions ────────────────────────────────────────────────

echo "Extensions:"
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
    echo "  ⚠ $name: directory exists (not a symlink) — skipping"
    skipped=$((skipped + 1))
    continue
  fi

  ln -s "${ext_dir%/}" "$target"
  echo "  ✓ $name"
  linked=$((linked + 1))
done

echo "  Linked: $linked | Already linked: $skipped"

# ── Unified Memory ────────────────────────────────────────────

echo ""
echo "Memory:"
mkdir -p "$PAI_MEMORY"

# ~/.pi/memory → ~/.pai/MEMORY (pi agent reads/writes shared store)
if [ -L "$HOME/.pi/memory" ]; then
  echo "  ✓ ~/.pi/memory already symlinked"
elif [ -d "$HOME/.pi/memory" ]; then
  echo "  ⚠ ~/.pi/memory is a directory — merge manually then replace with symlink"
else
  ln -s "$PAI_MEMORY" "$HOME/.pi/memory"
  echo "  ✓ ~/.pi/memory → ~/.pai/MEMORY"
fi

# ~/.claude/MEMORY → ~/.pai/MEMORY (Claude Code reads/writes shared store)
if [ -L "$HOME/.claude/MEMORY" ]; then
  echo "  ✓ ~/.claude/MEMORY already symlinked"
elif [ -d "$HOME/.claude/MEMORY" ]; then
  echo "  ⚠ ~/.claude/MEMORY is a directory — merge manually then replace with symlink"
else
  mkdir -p "$HOME/.claude"
  ln -s "$PAI_MEMORY" "$HOME/.claude/MEMORY"
  echo "  ✓ ~/.claude/MEMORY → ~/.pai/MEMORY"
fi

echo ""
echo "Done. All agents share ~/.pai/MEMORY/"
