# dream — Autonomous Self-Improvement

Reviews past sessions, daily logs, and patterns to identify improvement opportunities.

## Commands

- `/dream` — Run a dream analysis. Gathers data from cortex and asks the model to identify improvements.
- `/dream-report` — View the latest dream report.

## How It Works

1. **GATHER** — Collects ~10KB of context:
   - Top 20 tool-use patterns (from cortex)
   - Last 7 days of daily logs
   - Recent long-term memory entries
   - Entity graph highlights

2. **ANALYZE** — Sends gathered data to the model with a structured prompt asking it to identify:
   - Repeated workflows → propose skills
   - Friction points → propose fixes  
   - Missing capabilities → propose extensions
   - Knowledge gaps → propose memory entries
   - Configuration improvements

3. **PROPOSE** — Model returns JSON proposals with:
   - Type (skill/extension/config/workflow/fix)
   - Title and description
   - Evidence from the data
   - Effort estimate
   - Concrete action to take

4. **PERSIST** — Proposals saved to `~/.pi/dreams/` for review and tracking.

## Output Location

- `~/.pi/dreams/latest.json` — Most recent dream report
- `~/.pi/dreams/YYYY-MM-DD.json` — Historical reports

## Data Sources

| Source | File | Content |
|--------|------|---------|
| Patterns | `~/.pi/memory/cortex/patterns.json` | Tool-use sequences with counts |
| Daily Logs | `~/.pi/memory/daily/*.md` | Session activity summaries |
| Memory | `~/.pi/memory/MEMORY.md` | Long-term stored decisions/learnings |
| Entity Graph | `~/.pi/memory/cortex/graph.json` | Concept co-occurrence network |

## Future Enhancements

- Scheduled dreaming (nightly cron)
- Auto-propose skill crystallization for patterns seen 10+ times
- Track proposal acceptance rate for feedback
- Use cheaper model for analysis (Haiku/Flash)
