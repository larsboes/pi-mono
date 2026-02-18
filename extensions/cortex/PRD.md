# Cortex — Self-Extending Agent Extension

## PRD + Build Plan

**Status:** Phases 1-7 implemented, Phase 8.1 (cross-encoder reranking) complete — ready for 8.2 query intent classification
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

### Phase 8: Retrieval Quality Improvements

Current retrieval suffers from: false positives (old logs with similar wording), poor ranking (no nuance between "session activity tracker" as system vs generic sessions), lack of query understanding.

#### Phase 8.1: Cross-Encoder Reranking ✅ COMPLETE
- **Problem:** Bi-encoder embeddings capture coarse similarity but miss fine-grained relevance (e.g., "cortex bugs" should surface session.ts edits even without "bugs" in text)
- **Solution:** Two-stage retrieval:
  1. Fast bi-encoder (Gemini) retrieves candidate set (top-20)
  2. Cross-encoder scores query↔document pairs with cosine similarity, reranks top-10
- **Implementation:**
  - [x] Add `src/rerank.ts` using `@xenova/transformers` with `Xenova/all-MiniLM-L6-v2` model
  - [x] Modify `memory_search` to accept `rerank: boolean` parameter
  - [x] Cache cross-encoder results in `~/.pi/memory/cortex/rerank-cache.json` (TTL: 1 hour)
  - [x] Combined scoring: 30% vector + 70% rerank
- **Performance:** ~50ms for 10 candidates (after ~3s cold start for model download)
- **Results:** Shows both scores: `vector:0.65 rerank:0.68` — today's entries correctly boosted

**Phase 8.1 Potential Refinements** (documented for future, proceeding to 8.2):
| Refinement | Impact | Effort | Notes |
|------------|--------|--------|-------|
| True cross-attention (joint query+doc embedding) | High | Medium | Current uses bi-encoder similarity; true cross-encoder ~3-5x slower but more precise |
| Dynamic weighting (learn 30/70 split from feedback) | Medium | Low | Requires 8.6 feedback loop first |
| Cache warming (pre-load model at session start) | Low | Trivial | Eliminates 3s cold start on first query |
| Query complexity routing (skip rerank for exact paths) | Low | Low | Save 50ms on `/memory search ~/exact/path.md` |
| Progress UI during model download | Low | Trivial | Add `ctx.ui.setStatus()` updates |
| Score calibration (ensure 0.3 vs 0.7 means something) | Low | Medium | Normalize across query types |
| RAM unloading after idle (10min timeout) | Low | Trivial | Free memory if no searches |

**Decision:** Skip refinements, proceed to 8.2. Current quality boost is significant, 50ms latency acceptable.

#### Phase 8.2: Query Intent Classification
- **Problem:** Same query structure means different things in different contexts ("what did we do about X" vs "how does Y work" vs "why did Z fail")
- **Solution:** Classify query intent before retrieval, route to different strategies:
  - **Recall** ("what did we do...") → high recency bias, session summaries, tool outputs
  - **Learn** ("how does...") → prioritize skills, code blocks, SKILL.md files
  - **Debug** ("why did... fail") → prioritize error logs, bash outputs, edit diffs
  - **Navigate** ("find the file...") → prioritize file paths, ls/grep tool outputs
- **Implementation:**
  - Add `src/intent.ts` with lightweight classifier (can be rule-based + few-shot Gemini)
  - Add `intent` field to memory metadata during storage
  - Modify `memory_search` to accept `intent?: 'recall' | 'learn' | 'debug' | 'navigate'`
- **Success metric:** Search results match task type (debug queries surface errors first)

#### Phase 8.3: Entity Graph Traversal
- **Problem:** Memories reference entities (files, skills, concepts) but these relationships are implicit
- **Solution:** Extract entities, build graph, traverse for related memories:
  - Entities: files (`session.ts`), skills (`security-audit`), concepts (`cross-encoder`), people mentioned
  - Edges: co-occurrence in same session, explicit references, tool call chains
  - Traversal: query mentions `cortex` → graph finds `session.ts` → finds edits → surfaces relevant logs
- **Implementation:**
  - Add `src/graph.ts` with entity extraction (regex + Gemini for concept extraction)
  - Store graph in `~/.pi/memory/cortex/graph.json` (nodes + edges)
  - Modify `memory_search` to do graph expansion: query → extract entities → traverse 2 hops → merge with vector results
- **Success metric:** Finding related work without explicit keyword overlap

#### Phase 8.4: Hierarchical Multi-Granularity Index
- **Problem:** Current chunking is flat (paragraphs). Some queries need document-level context ("what did I do Tuesday"), others need specific facts.
- **Solution:** Index at 3 levels:
  - **Document**: Full daily log → for date-range queries, session summaries
  - **Section**: ## headers within logs → for topic clusters ("cortex architecture")
  - **Chunk**: Paragraph/sentence → for specific facts
- **Implementation:**
  - Modify `memory.ts` index building to create 3 indices with parent-child links
  - Add `granularity: 'document' | 'section' | 'chunk'` parameter to `memory_search`
  - Retrieve coarse→fine: find relevant section, then best chunks within it
- **Success metric:** Date queries return full-day summaries; specific queries return precise facts

#### Phase 8.5: Session Context Injection
- **Problem:** Current retrieval ignores current session state (files open, recent tools, crystallized skills)
- **Solution:** Use current session as implicit query expansion:
  - Extract entities from current session (files touched, tools used, active project)
  - Boost memories sharing those entities (not just time-based)
  - Hybrid score: `semantic_similarity * contextual_overlap_boost`
- **Implementation:**
  - Add `getSessionContext()` in `session.ts` returning current entities
  - Modify `before_agent_start` hook to inject session context into search
  - Modify scoring in `memory.ts` to apply boost for entity overlap
- **Success metric:** Context injection surfaces memories related to current work without explicit query

#### Phase 8.6: Feedback Loop (Online Learning)
- **Problem:** Relevance is personal — what you click vs ignore reveals preferences
- **Solution:** Track interactions, adapt retrieval:
  - Log: query → results → which result user clicked/expanded vs ignored
  - Adjust: move clicked results closer to query in embedding space (vector offset)
  - Personalize: per-user "relevance vector" that adjusts all searches
- **Implementation:**
  - Add `src/feedback.ts` with interaction logging
  - Store feedback in `~/.pi/memory/cortex/feedback.json`
  - Periodically (nightly) compute personal relevance adjustments, apply to search
- **Success metric:** Over time, top-3 results are clicked more often

#### Phase 8 Execution Order
1. **Start with 8.1** (cross-encoder) — 80/20 impact, validates two-stage architecture
2. **Then 8.2** (intent classification) — builds on 8.1's routing infrastructure
3. **8.3 + 8.5** can be parallel (graph + context injection are independent)
4. **8.4** after graph (uses similar entity extraction)
5. **8.6** last (requires mature usage data)

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
- [x] Embedding model: stick with Gemini for now (free tier sufficient, good quality)
- [x] Pattern threshold: 3 occurrences for crystallization candidate flag

### Active (Phase 8)
- [ ] Cross-encoder: use Gemini Flash vs local distilled model (latency vs privacy)?
- [ ] Intent classification: rule-based + few-shot vs fine-tuned classifier?
- [ ] Graph storage: JSON file (simple) vs embedded DB (performance at scale)?
- [ ] Feedback loop: immediate vector adjustment vs batch nightly updates?

### Future
- [ ] Capability inventory format: structured YAML vs prose Markdown?
- [ ] Should Cortex have its own settings in `~/.pi/agent/pi-cortex-settings.json`?
- [ ] Cross-session pattern tracking: per-project or global?
