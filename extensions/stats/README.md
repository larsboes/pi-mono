# stats

Unified AI usage dashboard — tracks token usage, costs, model distribution, and session metrics across pi sessions.

## Features

- **Token tracking** — Input, output, cache read/write per request
- **Cost aggregation** — Per-model, per-provider, per-day cost rollups
- **Session metrics** — Duration, tool calls, message counts
- **Dashboard** — Terminal-rendered usage summary

## Commands

| Command | Description |
|---------|-------------|
| `/stats` | Show usage dashboard |
| `/stats today` | Today's usage |
| `/stats week` | Last 7 days |
| `/stats month` | Last 30 days |

## Storage

- `~/.pi/stats.db` — SQLite database with all usage data

## Planned

- Claude Code session parsing (unify all AI agent stats into `~/.pai/stats.db`)
- Source column to distinguish pi vs claude-code data
