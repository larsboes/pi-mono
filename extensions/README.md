# Extensions

Public pi extensions maintained in this fork. All are symlinked into `~/.pi/agent/extensions/` and loaded automatically at pi startup.

Private extensions (work-specific providers and auth) live in a separate repo and are symlinked alongside these.

---

## Quick Reference

| Extension | LOC | Tools | Commands | Purpose |
|-----------|-----|-------|----------|---------|
| **cortex** | 6.6k | 7 | — | Memory, retrieval, entity graph, self-extension |
| **web-access** | 11.6k | 4 | — | Search, fetch, YouTube, PDF, GitHub |
| **mitsupi** | 11.1k | 5 | /loop, /review, /tools, /files, /answer | Personal utilities |
| **mcp-adapter** | 7.1k | 1+ | — | Token-efficient MCP gateway |
| **markdown-preview** | 3.2k | 0 | /preview | Rendered MD + LaTeX preview |
| **pai** | 2.2k | 0 | /algo, /dream | Skill discovery + Algorithm (E1-E5) |
| **swarm** | 2.1k | 3 | /swarm | Multi-agent deliberation + DAG |
| **stats** | 2.0k | 0 | /stats | Usage analytics dashboard |
| **outline** | 1.1k | 1 | — | Tree-sitter code summarization (27 langs) |
| **buddy** | 742 | 0 | /buddy | Virtual companion widget |
| **ultra** | 354 | 0 | /ultra | Deep thinking keyword modes |
| **dream** | 334 | 0 | /dream | Autonomous self-improvement |
| **image-ai** | 226 | 2 | — | Image gen (CF FLUX) + recognition (Gemini) |

**Total:** 13 extensions, 48.6k LOC, up to 23 tools registered.

---

## Tool Visibility by Profile

Not all tools are visible to the model. The `toolProfile` setting controls which tools the model can use:

| Tool | lean | standard | full |
|------|:----:|:--------:|:----:|
| bash, read, write, edit | ✓ | ✓ | ✓ |
| outline | ✓ | ✓ | ✓ |
| web_search | ✓ | ✓ | ✓ |
| memory_search, memory_store | ✓ | ✓ | ✓ |
| todo | ✓ | ✓ | ✓ |
| fetch_content, code_search, get_search_content | — | ✓ | ✓ |
| generate_image, analyze_image | — | ✓ | ✓ |
| scratchpad, mcp, signal_loop_success | — | ✓ | ✓ |
| crystallize_skill, create_extension, audit_skill | — | — | ✓ |
| capabilities_query | — | — | ✓ |
| converse, end_deliberation, recruit_specialist | — | — | ✓ |
| send_to_session, list_sessions | — | — | ✓ |
| grep, find, ls, search_tools | — | — | ✓ |

---

## Extension Details

### cortex (6.6k LOC)

Self-extending agent memory with a 10-stage retrieval pipeline:

```
Query → Temporal → Expand → Multi-hop? → Retrieve
     → Temporal Boost → Intent → Granularity → Weights
     → Graph → Context → Personal → Rerank
```

**Tools:** memory_search, memory_store, scratchpad, crystallize_skill, create_extension, audit_skill, capabilities_query

Features: local embeddings, intent classification, entity graph, sub-sequence pattern mining, token-budgeted context injection, weekly compaction.

### web-access (11.6k LOC)

Web research with progressive fallback: Exa → Perplexity → Gemini API → Gemini Web.

**Tools:** web_search, code_search, fetch_content, get_search_content

YouTube extraction (yt-dlp + Gemini vision), GitHub-aware URL/repo handling, PDF text extraction, local video analysis.

### mitsupi (11.1k LOC)

Personal utility extensions. Adapted from [mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff).

**Tools:** todo, signal_loop_success, send_to_session, list_sessions, bash (uv)  
**Commands:** /loop, /review, /tools, /files, /answer, /notify, /context, /go-to-bed

### mcp-adapter (7.1k LOC)

Token-efficient MCP proxy — replaces verbose per-server tool definitions (~10k tokens) with a single `mcp` gateway tool (~200 tokens). Servers start on-demand.

**Tools:** mcp (+ dynamic per-server tools in full profile)

### markdown-preview (3.2k LOC)

Rendered markdown + LaTeX preview — inline PNG terminal images (Kitty/iTerm2/Ghostty/WezTerm), browser HTML, or PDF output. Mermaid diagrams, syntax highlighting, theme-aware.

**Commands:** /preview, /preview pdf, /preview browser

### pai (2.2k LOC)

PAI integration — discovers 59 skills from custom directories and registers them with pi. Includes:

- **Algorithm:** Phased execution (Observe → Think → Execute → Verify → Learn) with auto-detected tiers (E1-E5)
- **HUD:** Statusline widget showing session stats and system state
- **Dream:** `/dream` gathers patterns + logs, sends to model for improvement proposals

**Commands:** /algo, /dream, /dream-report

### swarm (2.1k LOC)

Multi-agent orchestration:
- **Interactive:** CEO & Board deliberation with specialists
- **YAML DAG:** Unattended parallel fan-outs and sequential chains

**Tools:** converse, end_deliberation, recruit_specialist  
**Commands:** /swarm begin, /swarm quick, /swarm run, /swarm stop

*Note: Swarm tools only appear in `full` profile — they don't work as true subagents.*

### stats (2.0k LOC)

Unified AI usage analytics — parses pi sessions + Claude Code sessions into SQLite.

**Commands:** /stats, /stats 7d, /stats models, /stats folders, /stats dashboard

Web dashboard at `http://localhost:3847` with sparklines, cost charts, model breakdown.

### outline (1.1k LOC)

Tree-sitter-based code summarization. Extracts function/class/type signatures without bodies.

**Tools:** outline

27 languages supported. 5-20x token compression. 9-14ms warm latency.

### buddy (742 LOC)

Virtual companion — random species/rarity/stats rolled from a persistent seed. Animates during AI turns.

**Commands:** /buddy, /buddy toggle, /buddy rename, /buddy reroll, /buddy gallery

### ultra (354 LOC)

Keyword-triggered cognitive modes. Type at the start of a message:
- `ULTRATHINK` — extended reasoning (max thinking budget)
- `ULTRAWIDE` — divergent exploration
- `ULTRAFOCUS` — surgical precision
- `ULTRACARE` — defensive/safety engineering

### dream (334 LOC)

Autonomous self-improvement from memory. `/dream` gathers ~10KB of context (patterns, daily logs, entity graph), sends to model for structured analysis, saves proposals to `~/.pi/dreams/`.

### image-ai (226 LOC)

Image generation and recognition:
- `generate_image` — Text-to-image via Cloudflare FLUX.1 Schnell (fast, ~free)
- `analyze_image` — Image understanding via Gemini Flash (vision)

Requires: `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` and/or `GEMINI_API_KEY`.

---

## Setup

```bash
# From pi-mono root:
./scripts/link-extensions.sh

# Or manually:
for ext in buddy cortex dream image-ai markdown-preview mcp-adapter mitsupi outline pai stats swarm ultra web-access; do
  ln -sf "$(pwd)/extensions/$ext" ~/.pi/agent/extensions/
done
```

---

## Attribution

| Extension | Origin |
|-----------|--------|
| cortex, pai, buddy, ultra, image-ai, dream, outline | Original work |
| mitsupi | Adapted from [mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff) |
| swarm (DAG engine) | Ported from [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi) |
| stats | Ported from [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi), extended |
| mcp-adapter | Forked from [nicobailon/pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) |
| web-access | Forked from [nicobailon/pi-web-access](https://github.com/nicobailon/pi-web-access) |
| markdown-preview | Forked from [omaclaren/pi-markdown-preview](https://github.com/omaclaren/pi-markdown-preview) |
