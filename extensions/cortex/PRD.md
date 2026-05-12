# Cortex — Self-Extending Agent Extension

## PRD + Build Plan

**Status:** Phases 1-8 complete. All retrieval quality improvements shipped.
**Location:** `~/Developer/pi/pi-mono/extensions/cortex/`
**Type:** Standalone npm package (installable via `pi install` or symlink)
**Author:** Lars Boes + Jarvis

---

## Problem

The agent is powerful but static. It can only do what its pre-built skills and tools already support. When encountering a novel problem domain (robotics, new APIs, unfamiliar hardware), it solves it from scratch every time — no learning, no pattern accumulation, no self-improvement.

## Vision

An agent that doesn't need to know HOW to do something in advance — it needs to know how to LEARN how to do something.

```
Problem → No existing skill → Agent solves it manually →
Cortex detects the pattern → Crystallizes into skill →
Next occurrence: skill-guided, faster, better
```

The "robot pieces" test: hand the agent unfamiliar hardware. It researches, interfaces, solves. Next time similar hardware appears, it already has the pattern crystallized as a skill.

## What Cortex Does

### Core Capabilities

1. **Active Memory** — LLM-callable tools for semantic search and storage (vector DB + keyword fallback)
2. **Intelligent Retrieval** — [Phase 8] Cross-encoder reranking, intent classification, entity graphs for relevant context
3. **Pattern Detection** — Analyzes completed agent loops to detect repeated workflows
4. **Skill Crystallization** — Converts detected patterns into proper pi skills (SKILL.md + references/)
5. **Capability Tracking** — Maintains a self-awareness inventory of what the agent can/can't do

### Lifecycle Hooks

| Hook | Cortex Behavior |
|------|----------------|
| `before_agent_start` | Semantic search for relevant past context, inject into system prompt |
| `agent_end` | Record tool sequences + capability usage + session activities |
| `turn_end` | Reserved for future lightweight tracking |
| `session_start` | Init memory, auto-reindex if missing, refresh skills inventory, init session tracker |
| `session_before_switch` | Flush session summary to daily log before context switch |
| `session_shutdown` | Flush session summary to daily log on shutdown |
| `resources_discover` | Stubbed (skills in ~/.pi/skills/ auto-discovered) |

### LLM-Callable Tools

| Tool | Purpose |
|------|---------|
| `memory_search` | Semantic search across long-term memory |
| `memory_store` | Store information in long-term memory (with optional daily flag) |
| `crystallize_skill` | Create a new pi skill from a workflow pattern, then hot-reload |
| `capabilities_query` | Query the agent's self-awareness inventory |
| `scratchpad` | Manage working memory: add, done, undo, list, clear_done |

### Slash Commands

| Command | Purpose |
|---------|---------|
| `/memory` | Search, add, reindex, or show memory status |
| `/crystallize` | Interactive skill creation with auto-reload |
| `/capabilities` | Show capability inventory + gaps |
| `/scratchpad` | Manage working memory scratchpad (add, done, undo, list, clear) |
| `/patterns` | Show detected workflow patterns + crystallization candidates |
| `/sessionlog` | Show current session stats or flush session summary to daily log |

---

## Architecture

```
~/Developer/pi/pi-mono/extensions/cortex/
├── index.ts              # Extension entry point — hook registration, tool/command setup
├── src/
│   ├── memory.ts         # Vector search (Gemini embeddings) + keyword fallback + storage
│   ├── context.ts        # Hot context injection (pi-mem style: static files + daily logs)
│   ├── scratchpad.ts     # Working memory scratchpad (add/done/undo/list/clear)
│   ├── rerank.ts         # [Phase 8.1] Cross-encoder reranking for retrieval quality
│   ├── intent.ts         # [Phase 8.2] Query intent classification (recall/learn/debug/navigate)
│   ├── graph.ts          # [Phase 8.3] Entity graph extraction and traversal
│   ├── feedback.ts       # [Phase 8.6] Interaction feedback + online learning
│   ├── crystallizer.ts   # Pattern detection → skill file generation → hot-reload
│   ├── capabilities.ts   # Self-awareness inventory (reads/writes CAPABILITIES.md)
│   ├── patterns.ts       # Tool-sequence pattern tracking
│   └── session.ts        # Auto-session activity tracking + daily summary flush
├── package.json          # npm package with pi.extensions field
├── tsconfig.json
└── PRD.md                # This file
```

### Data Storage

```
~/.pi/memory/                    # Existing memory directory (shared with memory-bootstrap)
├── MEMORY.md                    # Static memory (identity, soul, user)
├── IDENTITY.md
├── SOUL.md
├── USER.md
├── daily/                       # Daily logs
├── cortex/                      # Cortex-specific data
│   ├── vectors/                 # Vectra index (Gemini embeddings)
│   ├── rerank-cache.json        # [Phase 8.1] Cross-encoder score cache (TTL 1h)
│   ├── intent-classifier.json   # [Phase 8.2] Few-shot examples + rules
│   ├── graph.json               # [Phase 8.3] Entity nodes + edges
│   ├── feedback.json            # [Phase 8.6] User click/ignore logs
│   ├── patterns.json            # Pattern frequency tracker (tool sequences + counts)
│   ├── capabilities.json        # Raw capability data (tool usage, errors)
│   └── CAPABILITIES.md          # Auto-generated human-readable capability inventory
```

### Reload Strategy

`reload()` is only available in `ExtensionCommandContext` (slash commands), not in tool `execute()`. Cortex captures a reload reference from the first command handler that fires (any `/memory`, `/capabilities`, `/patterns`, `/crystallize` call). Once captured, the `crystallize_skill` tool can auto-reload after creating a skill. If no command has been used yet, the tool tells the LLM to run `/reload` manually.

---

## Relationship to Existing Components

### Consolidation Complete (Phase 7)

**memory-bootstrap.ts** — **REMOVED**. Cortex now handles all static memory injection:
- IDENTITY.md, SOUL.md, USER.md, MEMORY.md (full static identity)
- SCRATCHPAD.md open items (working memory)
- daily/YYYY-MM-DD.md (today + yesterday for continuity)
- Plus semantic search results for deep retrieval

The `~/.pi/agent/extensions/memory-bootstrap.ts` file has been deleted. Cortex's `before_agent_start` hook now provides a strict superset of memory-bootstrap functionality.

### What Cortex Extends vs. Replaces

| Component | Relationship |
|-----------|-------------|
| **memory-bootstrap.ts** | ✅ **Replaced by Cortex** (Phase 7 complete) |
| **memory-manager skill** | Cortex tools are LLM-callable superset; skill remains as manual CLI fallback |
| **skill-forge skill** | Cortex crystallizer auto-detects; skill-forge remains for manual/deliberate skill creation |
| **pi-extender skill** | Reference skill for building extensions — Cortex consults it during crystallization |

---

## Build Plan

### Phase 1: Scaffold + Package Structure
- [x] Directory structure at `~/Developer/pi/pi-mono/extensions/cortex/`
- [x] `package.json` with `pi.extensions` field
- [x] `tsconfig.json`
- [x] `index.ts` — extension with hooks, tools, commands
- [x] Symlink registration for local dev (`~/.pi/agent/extensions/cortex → ~/Developer/pi/pi-mono/extensions/cortex`)
- [x] Verified loads in pi (`[cortex] Extension loaded` on startup)
- [x] Verified `/reload` works (pi v0.53.0)

### Phase 2: Active Memory Tools
- [x] `src/memory.ts` — Gemini embedding search + vectra index + keyword fallback
- [x] `memory_search` tool — LLM-callable semantic search
- [x] `memory_store` tool — LLM-callable storage with daily flag
- [x] `/memory` command — search, add, reindex, status
- [x] Tested: `/memory status` shows key ✓, index status, file counts
- [x] Tested: `memory_search` returns keyword results (vector after reindex)
- [x] Tested: `memory_store` appends to daily log + embeds in index

### Phase 3: Context Injection
- [x] `before_agent_start` hook — semantic search on user prompt, inject relevant memories (score ≥ 0.4, max 3 results, 300 char truncation)
- [x] Chains after memory-bootstrap (pi runs handlers sequentially, each gets previous systemPrompt)
- [x] Auto-reindex on session_start if vector index is missing
- [x] Tested: memory-bootstrap still works alongside Cortex (identity/soul/user injected)
- [x] Tested: agent gets relevant past context automatically (vector search on prompt)

### Phase 4: Pattern Detection
- [x] `src/patterns.ts` — tool sequence extraction, signature normalization (collapses consecutive dupes), persistence to `patterns.json`
- [x] `agent_end` hook — records tool sequences after each agent loop, logs new patterns and crystallization candidates (≥3 occurrences)
- [x] `/patterns` command — show stats, top patterns, crystallization candidates
- [ ] Test: after 3+ similar sessions, pattern is flagged in console

### Phase 5: Skill Crystallization
- [x] `src/crystallizer.ts` — generates SKILL.md with frontmatter, workflow, references, footer
- [x] `crystallize_skill` tool — LLM-callable, creates skill in `~/.pi/skills/`, validates kebab-case name and "Use when..." description, auto-reloads if reload ref captured
- [x] `/crystallize` command — interactive version with `ctx.ui.input()`, calls `ctx.reload()` after creation
- [x] Reload capture pattern: all command handlers capture `reloadFn` from `ExtensionCommandContext`
- [ ] Test: agent creates a skill, auto-reloads, and skill appears in available skills

### Phase 6: Capability Tracking
- [x] `src/capabilities.ts` — tracks tool usage counts, skill inventory, error log, generates CAPABILITIES.md
- [x] `agent_end` hook — records tool usage + errors after each loop
- [x] `session_start` hook — refreshes skill inventory on boot
- [x] `capabilities_query` tool — LLM-callable, aspects: tools, skills, errors/gaps, overview
- [x] `/capabilities` command — quick overview
- [ ] Test: agent can answer "what can you do?" with accurate real data

### Phase 6.5: Auto Session Logging (Hotfix)
- [x] `src/session.ts` — persistent session activity tracker (`session-state.json`)
- [x] `agent_end` integration — extract tool activity from new messages only
- [x] `session_before_switch` + `session_shutdown` integration — flush summaries to `~/.pi/memory/daily/YYYY-MM-DD.md`
- [x] Added `/sessionlog` command (`status`, `flush`) for observability + manual recovery
- [x] Resilience fixes: state validation + dedupe via `processedMessages`

### Phase 7: Consolidation (memory-bootstrap replacement) ✅ COMPLETE
- [x] Document exactly what memory-bootstrap.ts does (line by line)
- [x] Replicate all functionality in Cortex's `before_agent_start` (see `src/context.ts`)
- [x] Added enhancements: MEMORY.md injection, SCRATCHPAD.md open items, yesterday's log
- [x] Deleted `~/.pi/agent/extensions/memory-bootstrap.ts`
- [x] Cortex now provides strict superset: hot context (pi-mem style) + semantic search

### Phase 8: Retrieval Quality Improvements ✅ COMPLETE

All 6 sub-phases implemented as an integrated pipeline in `memory.ts`:

```
Query → Vector/Keyword Retrieval → Intent Classification (8.2)
      → Granularity Filter (8.4) → Intent-Weighted Scoring (8.2)
      → Entity Graph Expansion (8.3) → Session Context Boost (8.5)
      → Personal Weight Adjustment (8.6) → Cross-Encoder Reranking (8.1)
      → Final Results
```

#### Phase 8.1: Cross-Encoder Reranking ✅ COMPLETE
- [x] `src/rerank.ts` using `@xenova/transformers` with `Xenova/all-MiniLM-L6-v2` model
- [x] Rerank enabled by default for before_agent_start injection
- [x] Combined scoring: 30% vector + 70% rerank
- [x] Cache with 1h TTL, ~50ms warm latency

#### Phase 8.2: Query Intent Classification ✅ COMPLETE
- [x] `src/intent.ts` — multi-pattern regex classifier with confidence scores
- [x] 6 intent categories: recall, learn, debug, navigate, create, general
- [x] Auto-granularity routing based on intent + confidence
- [x] Per-intent weight vectors (recencyBias, skillBoost, errorBoost, pathBoost, codeBoost)
- [x] Source categorization: daily, skill, error, code, path, other
- [x] Intent + confidence shown in tool output for transparency

#### Phase 8.3: Entity Graph Traversal ✅ COMPLETE
- [x] `src/graph.ts` — co-occurrence graph with recency-weighted edges
- [x] Entity types: file, skill, concept, package, tool, error
- [x] Graph updated on: memory.store(), session.flushSession(), agent_end
- [x] BFS traversal with recency-weighted scoring (7d half-life)
- [x] Automatic pruning: stale nodes (60d) and edge cap (2000)
- [x] Graduated boost in search: more entity matches = bigger boost (cap 0.2)

#### Phase 8.4: Hierarchical Multi-Granularity Index ✅ COMPLETE
- [x] Three-level indexing during reindex: document (2000 chars), section (## headers, 1000 chars), chunk (paragraphs, 512 chars)
- [x] `granularity` metadata stored with each vector entry
- [x] Auto-routing: intent drives preferred granularity (recall→document, debug→chunk, learn→section)
- [x] Filter applied only when confident (>0.5) and doesn't eliminate too many results
- [x] `memory_search` tool exposes explicit granularity parameter

#### Phase 8.5: Session Context Injection ✅ COMPLETE
- [x] `session.ts` provides `getContextEntities()` — recency-ordered files + skills + tools
- [x] Tool usage tracked alongside files and skills
- [x] Activity density metric (activities/min) for future dynamic boost tuning
- [x] Context entities passed to search pipeline, boost matching results (cap 0.2)
- [x] `before_agent_start` uses session context for implicit query expansion

#### Phase 8.6: Feedback Loop ✅ COMPLETE
- [x] `src/feedback.ts` — interaction logging with time-decay (14d half-life)
- [x] Exponential decay: recent interactions matter more than old ones
- [x] Sigmoid-based weight curve [0.7, 1.3] instead of hard thresholds
- [x] Staleness pruning: interactions >30d removed on compaction
- [x] Negative signals from correction-learning (2x weight for negatives)
- [x] `src/correction.ts` + `src/rules.ts` — aborted turn detection + `/learn` command
- [x] Per-project and global correction rules injected into system prompt

---

## Design Decisions

### Why standalone npm package?
- Can be developed, tested, versioned independently
- Installable via `pi install npm:@larsboes/pi-cortex` (future)
- Local dev via symlink — no pi-mono modifications
- Follows established pattern (sub-bar, sub-core)

### Why Gemini embeddings?
- Already proven in memory-manager skill
- Free tier sufficient for personal use
- Good quality for semantic search

### Why not modify pi-mono?
- Cortex is a user-space extension, not a core feature
- Keeps the fork clean — can pull upstream changes without conflicts
- Extension API already provides everything needed

### Why keep memory-bootstrap initially?
- It works. Don't break what works.
- Cortex needs to prove it can do everything memory-bootstrap does before replacing it.
- Gradual migration > big bang replacement.

---

## Success Criteria

### Core (Phases 1-7)
1. **Memory works:** Agent can store and retrieve context across sessions via tools
2. **Context is relevant:** `before_agent_start` injects useful past context (not noise)
3. **Patterns emerge:** After repeated similar tasks, Cortex flags the pattern
4. **Skills crystallize:** Agent can create a functional skill mid-session and use it immediately
5. **Self-awareness:** Agent can accurately report what it can and can't do
6. **No regression:** memory-bootstrap continues working until explicitly replaced

### Retrieval Quality (Phase 8)
7. **Precision:** Top-3 search results are actually what the user wanted (measured via click-through or subjective validation)
8. **Intent-aware:** Debug queries surface errors, learn queries surface skills, recall queries surface chronology
9. **Contextual:** Current session state improves retrieval without explicit query expansion
10. **Connected:** Related work surfaces via entity graph even without keyword overlap
11. **Personalized:** Over time, results align with user's information preferences

---

## Open Questions

### Decided
- [x] Embedding model: local only (`Xenova/all-MiniLM-L6-v2`) — no external API calls, privacy-first
- [x] Pattern threshold: 3 occurrences for crystallization candidate flag
- [x] Cross-encoder: local model (same MiniLM-L6-v2) — 50ms latency, no API calls
- [x] Intent classification: rule-based regex with confidence scoring — deterministic, zero latency
- [x] Graph storage: JSON file — simple, sufficient for personal use (<500 nodes)
- [x] Feedback loop: immediate weight computation with 1min cache — responsive, no batch jobs

### Future
- [ ] Capability inventory format: structured YAML vs prose Markdown?
- [ ] Should Cortex have its own settings in `~/.pi/agent/pi-cortex-settings.json`?
- [ ] Cross-session pattern tracking: per-project or global?
- [ ] True cross-encoder (joint embedding) vs current bi-encoder reranking?
- [ ] Dynamic rerank weight learning from feedback data?
