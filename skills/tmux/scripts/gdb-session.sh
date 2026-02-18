#!/bin/bash
# Create a GDB debugging session
# Usage: gdb-session.sh <binary-path> [session-name]

set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Usage: $0 <binary-path> [session-name]"
    echo ""
    echo "Example:"
    echo "  $0 ./a.out"
    echo "  $0 ./program claude-gdb"
    exit 1
fi

BINARY="$1"
SESSION="${2:-claude-gdb}"

if [ ! -f "$BINARY" ]; then
    echo "Error: Binary not found: $BINARY"
    exit 1
fi

SOCKET_DIR="${CLAUDE_TMUX_SOCKET_DIR:-${TMPDIR:-/tmp}/claude-tmux-sockets}"
mkdir -p "$SOCKET_DIR"
SOCKET="$SOCKET_DIR/claude.sock"

echo "Creating GDB session: $SESSION"
echo "Binary: $BINARY"
echo "Socket: $SOCKET"
echo ""

# Create session
tmux -S "$SOCKET" new -d -s "$SESSION" -n gdb

# Start GDB
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 -- "gdb --quiet \"$BINARY\"" Enter

# Wait for GDB prompt
echo -n "Waiting for GDB..."
for i in {1..30}; do
    if tmux -S "$SOCKET" capture-pane -p -J -t "$SESSION":0.0 | grep -q '(gdb)'; then
        echo " ready"
        break
    fi
    echo -n "."
    sleep 0.5
done
echo ""

# Disable pagination for cleaner output
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 -- 'set pagination off' Enter

echo "========================================"
echo "Session: $SESSION"
echo "Binary: $BINARY"
echo "Status: ACTIVE"
echo ""
echo "To attach:"
echo "  tmux -S \"$SOCKET\" attach -t $SESSION"
echo ""
echo "To capture output:"
echo "  tmux -S \"$SOCKET\" capture-pane -p -J -t $SESSION:0.0 -S -200"
echo ""
echo "Common commands:"
echo "  - Run: tmux -S \"$SOCKET\" send-keys -t $SESSION:0.0 -l 'run'"
echo "  - Break: tmux -S \"$SOCKET\" send-keys -t $SESSION:0.0 C-c"
echo "  - Backtrace: tmux -S \"$SOCKET\" send-keys -t $SESSION:0.0 -l 'bt'"
echo "  - Continue: tmux -S \"$SOCKET\" send-keys -t $SESSION:0.0 -l 'continue'"
echo "  - Quit: tmux -S \"$SOCKET\" send-keys -t $SESSION:0.0 -l 'quit'"
echo "  - Confirm quit: tmux -S \"$SOCKET\" send-keys -t $SESSION:0.0 -l 'y'"
echo "========================================"
