#!/bin/bash
# Capture pane output and try to extract valid JSON
# Usage: capture-json.sh <session:target> [--last]

set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Usage: $0 <session:target> [--last]"
    echo ""
    echo "Examples:"
    echo "  $0 claude-python:0.0"
    echo "  $0 claude-node:0.0 --last"
    exit 1
fi

TARGET="$1"
LAST_ONLY=false

if [ $# -ge 2 ] && [ "$2" = "--last" ]; then
    LAST_ONLY=true
fi

SOCKET_DIR="${CLAUDE_TMUX_SOCKET_DIR:-${TMPDIR:-/tmp}/claude-tmux-sockets}"
SOCKET="$SOCKET_DIR/claude.sock"

# Capture output
OUTPUT=$(tmux -S "$SOCKET" capture-pane -p -J -t "$TARGET" -S -1000 2>/dev/null || echo "")

if [ -z "$OUTPUT" ]; then
    echo '{"error": "Failed to capture output"}'
    exit 1
fi

if [ "$LAST_ONLY" = true ]; then
    # Try to find the last JSON object in output
    # Look for lines that start with { or [
    JSON=$(echo "$OUTPUT" | grep -E '^\s*[\{\[]' | tail -1)
else
    # Try entire output as JSON
    JSON="$OUTPUT"
fi

# Validate and pretty-print
if echo "$JSON" | jq . 2>/dev/null; then
    exit 0
else
    echo '{"error": "No valid JSON found in output", "preview": "'"${OUTPUT: -200}"'"}'
    exit 1
fi
