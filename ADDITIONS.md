# Fork Additions — Lars Boes

Personal fork of [`earendil-works/pi-mono`](https://github.com/earendil-works/pi-mono) (v0.74.0+).  
2 commits ahead of upstream. Last synced: 2026-05-13.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ pi-mono (upstream core)                                      │
│  packages/ai        — Multi-provider LLM API                 │
│  packages/agent     — Agent runtime (tool calling, state)    │
│  packages/coding-agent — Interactive coding agent CLI        │
│  packages/tui       — Terminal UI library                    │
│  packages/web-ui    — Web components for chat UIs            │
├─────────────────────────────────────────────────────────────┤
│ Fork additions (extensions/ + core patches)                  │
│                                                              │
│  13 Extensions (48.6k LOC total):                            │
│    cortex       — Memory + 10-stage retrieval                │
│    web-access   — Search, fetch, YouTube, PDF                │
│    mitsupi      — Personal utilities + commands              │
│    mcp-adapter  — MCP server gateway                         │
│    markdown-prev— Rendered MD + LaTeX preview                │
│    pai          — Skill discovery + Algorithm + HUD          │
│    swarm        — Multi-agent deliberation + DAG             │
│    stats        — Usage analytics dashboard                  │
│    outline      — Tree-sitter code summarization             │
│    buddy        — Virtual companion widget                   │
│    ultra        — Deep thinking keyword modes                │
│    dream        — Autonomous self-improvement                │
│    image-ai     — Image gen (CF FLUX) + recognition (Gemini) │
│                                                              │
│  6 New core files:                                           │
│    workspace-tree.ts  — Project tree in system prompt        │
│    tool-discovery.ts  — BM25 tool search engine              │
│    search-tools.ts    — search_tools builtin tool            │
│    error-hints.ts     — Error→remediation pattern matcher    │
│    session-index.ts   — Fast JSON session index (16x faster) │
│    pruning.ts         — Tool output token pruning            │
│                                                              │
│  59 PAI Skills (2 packs):                                    │
│    ~/Developer/PAI/Packs      — 51 skills                    │
│    ~/Developer/pai-work/Packs — 8 work-specific skills       │
│                                                              │
│  2 MCP Servers: docker                                       │
├─────────────────────────────────────────────────────────────┤
│ Config (~/.pi/agent/config.yml)                              │
│  Model: Sonnet 4.6 (Bedrock EU) | Smol: Haiku 4.5           │
│  Thinking: high | Tool Profile: standard (17 tools)          │
└─────────────────────────────────────────────────────────────┘
```

---

## Tool Profiles (new, 2026-05-11)

Models see different tool sets based on capability:

| Profile | Tools | Target |
|---------|-------|--------|
| **lean** | 9 | Haiku, Flash, small local models |
| **standard** | 17 | Sonnet, Gemini Pro, mid-tier |
| **full** | 30+ | Opus, o3, frontier (default) |

```yaml
# ~/.pi/agent/config.yml
toolProfile: standard
```

**Lean (9):** bash, read, write, edit, outline, web_search, memory_search, memory_store, todo

**Standard (17):** + fetch_content, code_search, get_search_content, generate_image, analyze_image, scratchpad, mcp, signal_loop_success

**Full (30+):** + crystallize_skill, create_extension, audit_skill, capabilities_query, converse, end_deliberation, recruit_specialist, send_to_session, list_sessions, grep, find, ls, search_tools

---

## Core Patches (modified upstream files)

### 1. `packages/ai/src/providers/amazon-bedrock.ts` — Adaptive thinking maxTokens

Pass `model.maxTokens` instead of 32k cap. Needed for 128k-output models on EU Bedrock.

### 2. `packages/ai/src/providers/anthropic.ts` — Same maxTokens fix

Same for direct Anthropic provider path.

### 3. `packages/ai/scripts/generate-models.ts` — `PI_SKIP_MODEL_FETCH` escape hatch

Skip model catalog fetch behind corporate proxies. Prevents truncated catalog writes.

### 4. `packages/coding-agent/src/core/skills.ts` — TitleCase normalization

PAI skills use TitleCase names (`RedTeam`, `USMetrics`). Added `toKebabCase()` normalization.

### 5. `packages/coding-agent/src/core/agent-session.ts` — Tool profiles

Added `_getToolProfileAllowedNames()` + reload integration. Reads `toolProfile` from settings, applies `_allowedToolNames` whitelist.

### 6. `packages/coding-agent/src/core/settings-manager.ts` — Tool profile setting

Added `ToolProfile` type, `TOOL_PROFILES` constant (lean/standard/full sets), getter/setter.

### 7. `packages/coding-agent/src/core/system-prompt.ts` — Workspace tree + guidelines

Injects `<workspace-tree>` (depth-3, 80-line cap). Adaptive guidelines based on available tools.

### 8. `packages/coding-agent/src/core/session-manager.ts` — Draft persistence + index

`saveDraft()`/`loadDraft()` for editor text persistence. Session index write-through.

### 9. `packages/coding-agent/src/modes/interactive/interactive-mode.ts` — /retry + error hints

`/retry` command, error hint display, draft restore on startup.

### 10. `packages/coding-agent/src/modes/interactive/components/model-selector.ts` — Model cycling

Extended model selector with provider grouping and cycling support.

---

## New Core Files (no upstream conflict)

| File | LOC | Purpose |
|------|-----|---------|
| `workspace-tree.ts` | 140 | Depth-3, 80-line project tree → `<workspace-tree>` |
| `tool-discovery.ts` | 160 | BM25 search engine (name:6, desc:3, params:1 field weights) |
| `tools/search-tools.ts` | 107 | `search_tools` builtin tool for agent tool discovery |
| `error-hints.ts` | ~150 | 14 regex patterns → actionable remediation suggestions |
| `session-index.ts` | ~200 | JSON index at `sessions/index.json` — 16x speedup |
| `compaction/pruning.ts` | ~100 | Token pruning: protects last 40k + read/skill, truncates rest |

---

## Extensions (13 total, 48.6k LOC)

| Extension | LOC | Tools | Commands | Purpose |
|-----------|-----|-------|----------|---------|
| **cortex** | 6,557 | 7 | — | Memory, retrieval, entity graph, pattern mining, self-extension |
| **web-access** | 11,591 | 4 | — | Search (Exa/Perplexity/Gemini), fetch, YouTube, PDF, GitHub |
| **mitsupi** | 11,086 | 5 | /loop, /review, /tools, /files, /answer | Personal utilities |
| **mcp-adapter** | 7,051 | 1+ | — | Token-efficient MCP server gateway |
| **markdown-preview** | 3,195 | 0 | /preview | Rendered MD + LaTeX (Kitty/iTerm2/browser/PDF) |
| **pai** | 2,206 | 0 | /algo, /dream | Skill discovery, Algorithm (E1-E5), HUD |
| **swarm** | 2,133 | 3 | /swarm | Multi-agent deliberation + YAML DAG |
| **stats** | 2,023 | 0 | /stats | Usage analytics (pi + Claude Code → SQLite → web UI) |
| **outline** | 1,137 | 1 | — | Tree-sitter code summarization (27 langs, 5-20x compression) |
| **buddy** | 742 | 0 | /buddy | Virtual companion widget (species/rarity/stats) |
| **ultra** | 354 | 0 | /ultra | ULTRATHINK/WIDE/FOCUS/CARE keyword modes |
| **dream** | 334 | 0 | /dream | Autonomous self-improvement from memory |
| **image-ai** | 226 | 2 | — | CF FLUX generation + Gemini Flash recognition |

### Tool Registration by Extension

| Extension | Tools Registered |
|-----------|-----------------|
| cortex | memory_search, memory_store, scratchpad, crystallize_skill, create_extension, audit_skill, capabilities_query |
| web-access | web_search, code_search, fetch_content, get_search_content |
| mcp-adapter | mcp (+ dynamic per-server tools) |
| mitsupi | todo, signal_loop_success, send_to_session, list_sessions, bash (uv) |
| swarm | converse, end_deliberation, recruit_specialist |
| outline | outline |
| image-ai | generate_image, analyze_image |

---

## PAI Skills (59 total)

External skill packs loaded via `skills.customDirectories`:

| Pack | Path | Skills |
|------|------|--------|
| PAI Main | `~/Developer/PAI/Packs/` | 51 |
| PAI Work | `~/Developer/pai-work/Packs/` | 8 (work-specific) |

**Categories:**
- **Thinking:** DeepAnalysis, DeepDebug, Brainstorm, FirstPrinciples, SystemsThinking, RootCauseAnalysis, Science, BeCreative
- **Research:** Research, ExtractWisdom, OSINT, PrivateInvestigator, USMetrics, WorldThreatModelHarness
- **Tooling:** ApiPatterns, GitWorkflow, Docker, LlmApi, SystemAdmin, Bazel, FluentBit, Logstash, Cloudflare
- **Media:** WriteStory, Art, AudioEditor, Remotion, Aphorisms
- **Security:** RedTeam, PromptInjection, WebAssessment, Recon
- **Documents:** Documents (Docx, Pdf, Pptx, Xlsx), revealjs
- **Agents:** Delegation, Council, Agents, Prompting, Evals
- **Web:** Browser, BrightData, Apify, Parser
- **Meta:** CreateSkill, CreateCLI, PAIUpgrade, Telos
- **Work-specific:** azure, pptx, and internal tools (separate repo, not in pi-mono)

---

## Memory System (Cortex)

10-stage retrieval pipeline:

```
Query → Temporal → Expand → Multi-hop? → Retrieve
     → Temporal Boost → Intent → Granularity → Weights
     → Graph → Context → Personal → Rerank
```

Storage:
- `~/.pi/memory/MEMORY.md` — long-term facts
- `~/.pi/memory/daily/YYYY-MM-DD.md` — daily logs
- `~/.pi/memory/weekly/` — compacted weekly summaries
- `~/.pi/memory/entities.json` — entity graph
- `~/.pi/memory/vectors/` — embedding index (local)

---

## Branch Strategy

```
main = upstream + patches (always deployable)
dev  = integration branch (current work)
```

Upgrade: `git fetch upstream && git merge upstream/main` on main.
Never full-merge on dev. Cherry-pick features into main.

---

## Configuration

```yaml
# ~/.pi/agent/config.yml
toolProfile: standard
skills:
  customDirectories:
    - ~/Developer/PAI/Packs
    - ~/Developer/pai-work/Packs
modelRoles:
  default: amazon-bedrock/eu.anthropic.claude-sonnet-4-6
  smol: amazon-bedrock/eu.anthropic.claude-haiku-4-5-20251001-v1:0
defaultThinkingLevel: high
```

MCP servers: `~/.pi/agent/mcp.json` (docker)

---

## Setup

```bash
# Clone and build
cd ~/Developer/pi-mono
npm install && npm run build

# Link extensions
./scripts/link-extensions.sh

# Verify
pi --version
```

Private extensions (DT work) are in a separate repo, symlinked alongside.
