---
name: tmux
description: "Remote control tmux sessions for interactive CLIs (python, gdb, node, etc.) by sending keystrokes and scraping pane output. Includes session presets, save/restore, and JSON capture."
license: Vibecoded
---

<!--
🌐 COMMUNITY SKILL

Part of the pi-mono open skills collection.
- Repository: https://github.com/larsboes/pi-mono
- License: MIT
- Author: {{author}}

Contributions welcome via GitHub issues and PRs.
Last synced: 2026-02-18 21:06:31
-->

# tmux Skill

Use tmux as a programmable terminal multiplexer for interactive work.

## Quickstart

```bash
SOCKET_DIR=${TMPDIR:-/tmp}/claude-tmux-sockets
mkdir -p "$SOCKET_DIR"
SOCKET="$SOCKET_DIR/claude.sock"
SESSION=claude-python

# Create and control
tmux -S "$SOCKET" new -d -s "$SESSION" -n shell
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 -- 'python3 -q' Enter
tmux -S "$SOCKET" capture-pane -p -J -t "$SESSION":0.0 -S -200
tmux -S "$SOCKET" kill-session -t "$SESSION"
```

## Session Presets

### Python REPL
```bash
./scripts/python-session.sh [session-name]
```
Creates a Python session with `PYTHON_BASIC_REPL=1` set.

### GDB Debugging
```bash
./scripts/gdb-session.sh ./binary [session-name]
```
Creates GDB session with pagination disabled.

### Node.js REPL
```bash
./scripts/node-session.sh [session-name]
```
Creates a Node.js REPL session.

## Session Management

### Save/Restore
```bash
# Save session state
./scripts/save-session.sh claude-python > session.json

# Restore session (recreates panes with correct CWD)
./scripts/restore-session.sh session.json
```

### Find Sessions
```bash
./scripts/find-sessions.sh -S "$SOCKET"
./scripts/find-sessions.sh --all  # All sockets
```

### Wait for Text
```bash
./scripts/wait-for-text.sh -t session:0.0 -p '^>>>' -T 15
```

## Output Capture

### Basic Capture
```bash
tmux -S "$SOCKET" capture-pane -p -J -t "$SESSION":0.0 -S -200
```

### Extract JSON
```bash
./scripts/capture-json.sh claude-python:0.0
./scripts/capture-json.sh claude-node:0.0 --last  # Last JSON only
```

## Socket Convention

- **Default socket:** `$CLAUDE_TMUX_SOCKET_DIR/claude.sock` (or `${TMPDIR:-/tmp}/claude-tmux-sockets/claude.sock`)
- **Always use `-S "$SOCKET"`** to stay isolated from personal tmux
- **Target format:** `{session}:{window}.{pane}` (defaults to `:0.0`)

## Sending Input

### Literal text (preferred)
```bash
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 -l -- "print('hello world')"
```

### Control keys
```bash
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 C-c   # Interrupt
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 C-d   # EOF
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 C-z   # Suspend
```

### ANSI C quoting
```bash
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 -- $'python3 -m http.server 8000'
```

## Interactive Recipes

### Python REPL
```bash
# Start
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 -- 'python3 -q' Enter

# Wait for >>>
./scripts/wait-for-text.sh -t "$SESSION":0.0 -p '^>>>'

# Send code
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 -l -- "import os"
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 Enter

# Interrupt
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 C-c
```

### GDB
```bash
# Start with binary
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 -- 'gdb --quiet ./a.out' Enter

# Disable paging
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 -- 'set pagination off' Enter

# Debug commands
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 -l -- 'break main'
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 Enter
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 -l -- 'run'

# When breakpoint hits
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 -l -- 'bt full'   # Backtrace
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 -l -- 'info locals'

# Exit
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 -l -- 'quit'
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 -l -- 'y'
```

### Other TTY Apps
Same pattern applies: start program, poll for prompt, send text.
- `ipdb`, `pdb` - Python debuggers
- `psql`, `mysql` - Database clients
- `node` - Node.js REPL

## Cleanup

```bash
# Kill specific session
tmux -S "$SOCKET" kill-session -t "$SESSION"

# Kill all sessions on socket
tmux -S "$SOCKET" list-sessions -F '#{session_name}' | xargs -r -n1 tmux -S "$SOCKET" kill-session -t

# Kill server (all sessions)
tmux -S "$SOCKET" kill-server
```

## Tips

- **Always tell user how to monitor:** Print attach command after starting sessions
- **Use session presets** for common REPLs (handles setup automatically)
- **Capture with `-J`** to join wrapped lines
- **Poll with `wait-for-text.sh`** instead of `tmux wait-for`
- **Save sessions** before long operations for recovery

