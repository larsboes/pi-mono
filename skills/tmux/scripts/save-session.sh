#!/bin/bash
# Save tmux session state (pane content, working directory, running command)
# Usage: save-session.sh <session-name> [output-file]

set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Usage: $0 <session-name> [output-file]"
    echo ""
    echo "Example:"
    echo "  $0 claude-python"
    echo "  $0 claude-python ~/session-backup.json"
    exit 1
fi

SESSION="$1"
OUTPUT="${2:-/dev/stdout}"

SOCKET_DIR="${CLAUDE_TMUX_SOCKET_DIR:-${TMPDIR:-/tmp}/claude-tmux-sockets}"
SOCKET="$SOCKET_DIR/claude.sock"

# Check if session exists
if ! tmux -S "$SOCKET" has-session -t "$SESSION" 2>/dev/null; then
    echo "Error: Session '$SESSION' not found"
    exit 1
fi

# Build JSON state
STATE=$(cat <<EOF
{
  "session": "$SESSION",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "panes": [
EOF
)

# Get all panes
PANES=$(tmux -S "$SOCKET" list-panes -t "$SESSION" -F '#{pane_id}|#{pane_current_path}|#{pane_current_command}|#{pane_pid}' 2>/dev/null || true)

FIRST=true
while IFS='|' read -r id path cmd pid; do
    [ -z "$id" ] && continue
    
    # Capture pane content (last 1000 lines)
    CONTENT=$(tmux -S "$SOCKET" capture-pane -p -J -t "$SESSION:$id" -S -1000 2>/dev/null | sed 's/"/\\"/g' | tr '\n' ' ' | sed 's/  */ /g')
    
    if [ "$FIRST" = true ]; then
        FIRST=false
    else
        STATE+=","
    fi
    
    STATE+=$(cat <<EOF
    {
      "id": "$id",
      "cwd": "$path",
      "command": "$cmd",
      "pid": $pid,
      "content_preview": "${CONTENT:0:500}"
    }
EOF
)
done <<< "$PANES"

STATE+="
  ]
}"

# Output
if [ "$OUTPUT" = "/dev/stdout" ]; then
    echo "$STATE"
else
    echo "$STATE" > "$OUTPUT"
    echo "Session saved to: $OUTPUT"
fi
