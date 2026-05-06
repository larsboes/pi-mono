# Extensions

Public pi extensions maintained in this fork. All are symlinked into `~/.pi/agent/extensions/` and loaded automatically at pi startup.

Private extensions (work-specific providers and auth) live in a separate repo and are symlinked alongside these.

---

## Quick Reference

| Extension | Purpose | Commands |
|-----------|---------|----------|
| **cortex** | Memory, retrieval, self-extension | `memory_search`, `memory_store`, `scratchpad`, `crystallize_skill` |
| **stats** | Unified AI usage dashboard (pi + Claude Code) | `/stats`, `/stats 7d`, `/stats dashboard` |
| **swarm** | Multi-agent deliberation + YAML DAG pipelines | `/swarm begin`, `/swarm quick`, `/swarm run` |
| **web-access** | Web search, fetch, YouTube, PDF, GitHub | `web_search`, `fetch_content`, `code_search` |
| **mcp-adapter** | Token-efficient MCP server gateway | `mcp` tool |
| **markdown-preview** | Rendered markdown + LaTeX preview | `/preview`, `/preview pdf` |
| **mitsupi** | Personal utilities (loop, todos, review) | `/review`, `todo`, `signal_loop_success` |
| **pai** | PAI skill discovery + HUD statusline | (automatic) |
| **buddy** | Virtual companion widget | `/buddy`, `/buddy toggle`, `/buddy reroll` |
| **ultra** | Deep thinking keyword modes | `ULTRATHINK`, `ULTRAWIDE`, `/ultra` |

---

## Extension Details

### cortex (6.5k LOC)

Self-extending agent memory with a 10-stage retrieval pipeline (Phase 8-10):

```
Query → Temporal(9.2) → Expand(9.1) → Multi-hop?(9.3) → Retrieve
     → Temporal Boost → Intent(8.2) → Granularity(8.4) → Weights
     → Graph(8.3) → Context(8.5) → Personal(8.6) → Rerank(8.1)
```

Features: local embeddings, intent classification, entity graph, sub-sequence pattern mining, token-budgeted context injection, weekly compaction, graph maintenance.

### stats (1.8k LOC)

Unified AI usage analytics — parses both pi sessions (`~/.pi/agent/sessions/`) and Claude Code sessions (`~/.claude/projects/`) into a single SQLite database at `~/.pai/stats.db`.

**TUI commands:**
- `/stats` — summary with sparklines, source breakdown, top models
- `/stats 7d` / `30d` / `90d` — windowed summaries
- `/stats models` — per-model breakdown
- `/stats folders` — per-project breakdown
- `/stats dashboard` — launches web UI at `http://localhost:3847`
- `/stats sync` — force re-sync session files

**Web dashboard:** React + Tailwind with source breakdown component, SVG sparklines, cost charts, model performance series, request drill-down.

### swarm (1.7k LOC)

Multi-agent orchestration: interactive CEO & Board deliberation (`/swarm begin`, `/swarm quick`) and unattended YAML DAG pipelines (`/swarm run`). Supports parallel fan-outs, sequential chains, persona files, brief management, and transcript output.

### web-access (11.6k LOC)

Web research with progressive fallback: Exa → Perplexity → Gemini API → Gemini Web. YouTube extraction (yt-dlp + Gemini vision), GitHub-aware URL/repo handling, PDF text extraction, local video analysis.

### mcp-adapter (10.6k LOC)

Token-efficient MCP proxy — replaces verbose per-server tool definitions (~10k tokens) with a single `mcp` gateway tool (~200 tokens). Servers start on-demand. Supports tool search, describe, and call.

### markdown-preview (3.2k LOC)

Rendered markdown + LaTeX preview — inline PNG terminal images (Kitty/iTerm2/Ghostty/WezTerm), browser HTML, or PDF output. Mermaid diagrams, syntax highlighting, theme-aware.

### mitsupi (11k LOC)

Personal utility extensions: loop control signals, file ops, context injection, review workflows, todos, session breakdown, prompt editor. Adapted from [mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff).

### pai (823 LOC)

PAI integration — discovers skills from `~/.pai/sources.conf` and registers them with pi. Renders HUD statusline widget with session stats, memory lane, weather, and system state.

### buddy (742 LOC)

Virtual companion — random species/rarity/stats rolled from a persistent seed. Animates during AI turns. Commands: `/buddy`, `/buddy toggle`, `/buddy rename`, `/buddy reroll`, `/buddy gallery`.

### ultra (~250 LOC)

Keyword-triggered cognitive modes. Type at the start of a message:
- `ULTRATHINK` — extended reasoning (max thinking)
- `ULTRAWIDE` — divergent exploration
- `ULTRAFOCUS` — surgical precision
- `ULTRACARE` — defensive/safety engineering

---

## Setup

Extensions are symlinked from `~/.pi/agent/extensions/` → `pi-mono/extensions/`:

```bash
# Run from pi-mono root:
./scripts/link-extensions.sh
```

Or manually:
```bash
for ext in buddy cortex markdown-preview mcp-adapter mitsupi pai stats swarm ultra web-access; do
  ln -sf "$(pwd)/extensions/$ext" ~/.pi/agent/extensions/
done
```

---

## Attribution

| Extension | Origin |
|-----------|--------|
| cortex, pai, buddy, ultra, swarm (deliberation) | Original work |
| mitsupi | Adapted from [mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff) |
| swarm (DAG engine) | Ported from [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi) |
| stats | Ported from [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi), extended with Claude Code parser |
| mcp-adapter | Forked from [nicobailon/pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) |
| web-access | Forked from [nicobailon/pi-web-access](https://github.com/nicobailon/pi-web-access) |
| markdown-preview | Forked from [omaclaren/pi-markdown-preview](https://github.com/omaclaren/pi-markdown-preview) |
