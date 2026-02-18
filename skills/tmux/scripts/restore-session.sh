#!/bin/bash
# Restore tmux session from saved state
# Usage: restore-session.sh <state-file>

set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Usage: $0 <state-file>"
    echo ""
    echo "Restores a tmux session with working directories from saved state."
    echo "Note: Cannot restore running processes, only recreates panes with correct CWDs."
    exit 1
fi

STATE_FILE="$1"

if [ ! -f "$STATE_FILE" ]; then
    echo "Error: State file not found: $STATE_FILE"
    exit 1
fi

SOCKET_DIR="${CLAUDE_TMUX_SOCKET_DIR:-${TMPDIR:-/tmp}/claude-tmux-sockets}"
mkdir -p "$SOCKET_DIR"
SOCKET="$SOCKET_DIR/claude.sock"

# Parse state (requires jq)
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required for parsing state file"
    exit 1
fi

SESSION=$(jq -r '.session' "$STATE_FILE")

echo "Restoring session: $SESSION"
echo "Socket: $SOCKET"
echo ""

# Kill existing session if present
if tmux -S "$SOCKET" has-session -t "$SESSION" 2>/dev/null; then
    echo "Session exists, killing old session..."
    tmux -S "$SOCKET" kill-session -t "$SESSION"
fi

# Create new session
tmux -S "$SOCKET" new -d -s "$SESSION" -n main

# Restore panes
PANE_COUNT=$(jq '.panes | length' "$STATE_FILE")
echo "Restoring $PANE_COUNT pane(s)..."

jq -c '.panes[]' "$STATE_FILE" | while read -r pane; do
    ID=$(echo "$pane" | jq -r '.id')
    CWD=$(echo "$pane" | jq -r '.cwd')
    CMD=$(echo "$pane" | jq -r '.command')
    
    echo "  Pane $ID: cd $CWD"
    
    # Send cd command to pane
    tmux -S "$SOCKET" send-keys -t "$SESSION:0.0" -- "cd '$CWD'" Enter
    
    # If there was a specific command (not bash/zsh), note it
    if [[ "$CMD" != "bash" && "$CMD" != "zsh" && "$CMD" != "sh" ]]; then
        echo "    (was running: $CMD - not restored)"
    fi
done

echo ""
echo "========================================"
echo "Session: $SESSION"
echo "Status: RESTORED (panes only)"
echo ""
echo "To attach:"
echo "  tmux -S \"$SOCKET\" attach -t $SESSION"
echo ""
echo "Note: Running processes are not restored."
echo "      Use session scripts (python-session.sh, etc.) to restart REPLs."
echo "========================================"
