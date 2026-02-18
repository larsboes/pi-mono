#!/bin/bash
# Create a Python REPL session with proper configuration
# Usage: python-session.sh [session-name]

set -euo pipefail

SOCKET_DIR="${CLAUDE_TMUX_SOCKET_DIR:-${TMPDIR:-/tmp}/claude-tmux-sockets}"
mkdir -p "$SOCKET_DIR"
SOCKET="$SOCKET_DIR/claude.sock"

SESSION="${1:-claude-python}"

echo "Creating Python REPL session: $SESSION"
echo "Socket: $SOCKET"
echo ""

# Create session with Python
PYTHON_BASIC_REPL=1 tmux -S "$SOCKET" new -d -s "$SESSION" -n repl

# Wait for shell to start
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 -- 'python3 -q' Enter

# Wait for Python prompt
echo -n "Waiting for Python..."
for i in {1..30}; do
    if tmux -S "$SOCKET" capture-pane -p -J -t "$SESSION":0.0 | grep -q '^>>>'; then
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
echo "To kill:"
echo "  tmux -S \"$SOCKET\" kill-session -t $SESSION"
echo ""
echo "Tips:"
echo "  - Send code: tmux -S \"$SOCKET\" send-keys -t $SESSION:0.0 -l 'print(1+1)'"
echo "  - Send Enter: tmux -S \"$SOCKET\" send-keys -t $SESSION:0.0 Enter"
echo "  - Interrupt: tmux -S \"$SOCKET\" send-keys -t $SESSION:0.0 C-c"
echo "========================================"
