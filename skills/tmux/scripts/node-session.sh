#!/bin/bash
# Create a Node.js REPL session
# Usage: node-session.sh [session-name]

set -euo pipefail

SOCKET_DIR="${CLAUDE_TMUX_SOCKET_DIR:-${TMPDIR:-/tmp}/claude-tmux-sockets}"
mkdir -p "$SOCKET_DIR"
SOCKET="$SOCKET_DIR/claude.sock"

SESSION="${1:-claude-node}"

echo "Creating Node.js REPL session: $SESSION"
echo "Socket: $SOCKET"
echo ""

# Create session with Node
tmux -S "$SOCKET" new -d -s "$SESSION" -n repl

# Start Node REPL
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 -- 'node' Enter

# Wait for Node prompt
echo -n "Waiting for Node..."
for i in {1..30}; do
    if tmux -S "$SOCKET" capture-pane -p -J -t "$SESSION":0.0 | grep -qE '^\s*>'; then
        echo " ready"
        break
    fi
    echo -n "."
    sleep 0.5
done
echo ""

echo "========================================"
echo "Session: $SESSION"
echo "Status: ACTIVE"
echo ""
echo "To attach:"
echo "  tmux -S \"$SOCKET\" attach -t $SESSION"
echo ""
echo "To capture output:"
echo "  tmux -S \"$SOCKET\" capture-pane -p -J -t $SESSION:0.0 -S -200"
echo ""
echo "Tips:"
echo "  - Send code: tmux -S \"$SOCKET\" send-keys -t $SESSION:0.0 -l 'console.log(1+1)'"
echo "  - Send Enter: tmux -S \"$SOCKET\" send-keys -t $SESSION:0.0 Enter"
echo "  - Interrupt: tmux -S \"$SOCKET\" send-keys -t $SESSION:0.0 C-c"
echo "  - Exit: tmux -S \"$SOCKET\" send-keys -t $SESSION:0.0 C-c C-d"
echo "========================================"
