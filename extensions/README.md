# Extensions

Public pi extensions. Each is symlinked from `~/.pi/agent/extensions/` into this directory.

Additional private extensions (work-specific providers and auth helpers) live
in a separate private repo and are not part of this open-source fork.

---

## Extensions

### cortex
PAI memory system for pi — semantic search over session history, skill tracking, entity graph, intent classification, and feedback loop. Original work, inspired by patterns from [mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff).

### mitsupi
Personal utility extensions for pi — loop control, file ops, context injection, review, todos, session breakdown, prompt editor. Adapted from [mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff) by Armin Ronacher. Significant modifications for personal use.

### pai
PAI statusline and skill integration for pi — HUD widget showing active session, skill inventory, and PAI system stats. Original work.

### swarm
Unified multi-agent orchestration — unattended YAML DAG pipelines AND interactive CEO & Board deliberation in one extension. Supports parallel fan-outs, sequential chains, iterative pipelines, dialogue mode with shared transcript, budget/time constraints, persona files, brief management, memo output. DAG engine ported from [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi) `packages/swarm-extension`. Interactive deliberation evolved from the earlier `ceo-board` extension (original work).

### buddy
Companion display extension — sprite-based UI companion and display utilities. Original work.

### mcp-adapter
Token-efficient MCP proxy for pi. Replaces verbose per-server tool definitions (~10k tokens) with a single proxy tool (~200 tokens). Servers start on-demand. Forked from [nicobailon/pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter). Integrated into this repo as a managed copy.

### web-access
Web search and content extraction for pi — Exa → Perplexity → Gemini API → Gemini Web fallback chain, YouTube extraction, GitHub-aware URL handling. Forked from [nicobailon/pi-web-access](https://github.com/nicobailon/pi-web-access). Integrated into this repo as a managed copy.

### markdown-preview
Rendered markdown + LaTeX preview for pi — inline PNG via Kitty/iTerm2, browser HTML, or PDF. Mermaid diagrams, syntax highlighting, theme-aware. Forked from [omaclaren/pi-markdown-preview](https://github.com/omaclaren/pi-markdown-preview). Integrated into this repo as a managed copy.

### stats
Local observability dashboard — parses `~/.pi/agent/sessions/` JSONL logs into SQLite, serves a React + Chart.js dashboard at `localhost:3847`. Tracks tokens/s, cache rate, cost, error rate, TTFT by model and project. Ported from [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi) `packages/stats`. Standalone Bun CLI — not loaded by pi's extension runner.

---

## Adding an Extension

See [`../add-docs/extensions.md`](../add-docs/extensions.md).
