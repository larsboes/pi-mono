# stats

Unified AI usage dashboard — tracks token usage, costs, model distribution, and session metrics across **both pi and Claude Code** sessions in a single database.

## Data Sources

| Source | Path | Format |
|--------|------|--------|
| pi | `~/.pi/agent/sessions/*.jsonl` | pi session JSONL |
| Claude Code | `~/.claude/projects/**/*.jsonl` | Claude Code JSONL |

Both are parsed incrementally (offset-tracked) and stored in `~/.pai/stats.db` (SQLite).

## Commands (inside pi)

```
/stats                       → overall summary with sparklines + source breakdown
/stats 7d | 30d | 90d | 24h → summary for a time window
/stats sessions [<since>]    → list recent sessions with topics + resume IDs
/stats models [<since>]      → per-model breakdown
/stats folders [<since>]     → per-project breakdown
/stats dashboard [port]      → launch web dashboard (default :3847)
/stats dashboard-stop        → stop web dashboard
/stats sync                  → re-sync session files
/stats help                  → show usage
```

## TUI Output Example

```
AI Usage (all time):
  Range:     2026-01-31 → 2026-05-06
  Requests:  61,544 (40 errors, 0.1% err rate)
  Tokens:    72.9M (98.9% cache hit)
  Cost:      $3,996.49

  Sources:
    pi:          1,970 reqs │ 2.8M tok │ $159.72
    claude-code:  59,574 reqs │ 70.1M tok │ $3,836.77

  Cost:  ▁▂▃▄▅▆▇█▆▅▄▃▂▃▅▆▇▆▅ ↓12%
  Reqs:  ▃▄▅▆▇▆▅▄▃▂▃▅▆▇█▇▆▅▄▃ →

  Top Models:
    [CC] claude-opus-4-6: 31,050 reqs, $2,565.42
    [CC] claude-haiku-4-5: 13,637 reqs, $121.43
    [CC] claude-sonnet-4-6: 4,726 reqs, $344.93
    [pi] eu.anthropic.claude-opus-4-6-v1: 1,074 reqs, $155.07
```

## Web Dashboard

Launch with `/stats dashboard` — opens at `http://localhost:3847`.

Features:
- **Overview tab** — stats grid, source breakdown with sparklines, recent requests/errors
- **Models tab** — model time series chart, performance table (TTFT, tok/s)
- **Costs tab** — daily cost chart, 30d summary cards, trend comparison
- **Requests tab** — full request list with drill-down to raw messages
- **Errors tab** — failed requests with error messages
- **Time range filter** — all / 90d / 30d / 7d / 24h

## CLI Usage (standalone, outside pi)

```bash
cd ~/Developer/pi-mono/extensions/stats
bun src/cli.ts                  # overall summary
bun src/cli.ts 7d               # last 7 days
bun src/cli.ts models           # model breakdown
bun src/cli.ts dashboard        # launch web UI
```

## Database

- **Path:** `~/.pai/stats.db`
- **Engine:** SQLite (WAL mode)
- **Migration:** Auto-migrates from legacy `~/.pi/stats.db` on first run
- **Schema:** `messages` table with per-request token counts, costs, timing, source

## Architecture

```
src/
├── index.ts          — Library exports
├── aggregator.ts     — Sync orchestrator (calls both parsers)
├── db.ts             — SQLite schema, queries, legacy migration
├── server.ts         — HTTP server for web dashboard
├── cli.ts            — Standalone CLI entry point
├── types.ts          — Shared types
├── parsers/
│   ├── pi.ts         — Pi session JSONL parser
│   └── claude-code.ts — Claude Code JSONL parser
└── client/           — React web dashboard (built → embedded-client.generated.txt)
    ├── App.tsx
    └── components/
        ├── StatsGrid.tsx
        ├── SourceBreakdown.tsx    ← NEW: pi vs CC split + sparklines
        ├── CostChart.tsx
        ├── CostSummary.tsx
        ├── ChartsContainer.tsx
        ├── ModelsTable.tsx
        ├── RequestList.tsx
        └── RequestDetail.tsx
```
