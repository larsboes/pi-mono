# pi-mono — Planned Work

*Last updated: 2026-05-06*

---

## Completed (archive)

<details><summary>Click to expand completed items</summary>

| # | Item | Done | Outcome |
|---|------|------|---------|
| 1 | pi_agent_rust Conformance | 2026-04-30 | Hold migration (wasmtime CVEs) |
| 2 | Cortex Phase 8 — Retrieval Quality | 2026-05-06 | 6 sub-phases (reranking, intent, graph, hierarchical, session, feedback) |
| 2b | Cortex Phase 9 — Temporal Intelligence | 2026-05-06 | Query expansion, temporal routing, multi-hop, compaction |
| 2c | Cortex Phase 10 — Intelligence Layer | 2026-05-06 | Sub-sequence mining, token budget, graph maintenance |
| 4 | Unified Stats (PAI Layer) | 2026-05-06 | 61.5k requests, sparklines, source breakdown |
| 6 | Buddy Toggle | 2026-05-06 | `/buddy toggle` subcommand |
| 7 | Custom Provider Auth Path Fix | 2026-05-06 | Fixed OAuth config dir |
| 8 | Extension Documentation | 2026-05-06 | READMEs for all extensions |
| 9 | Ultra Modes Extension | 2026-05-06 | ULTRATHINK/WIDE/FOCUS/CARE keyword modes |

</details>

---

## Active

### 5. Swarm — Interactive Dialogue Testing

**Status:** Partial (automated done, live testing open)
**Priority:** Medium
**Effort:** ~2h

#### Open (requires live session)
1. `/swarm quick <topic>` — parallel debate, ≥3 responses
2. `/swarm begin` — editor → CEO → converse → end_deliberation → revert
3. `/swarm stop` — mid-abort + session restore
4. `/swarm run <yaml>` — DAG pipeline execution

---

## Backlog — Feature Ideas (from OMP + pi_agent_rust analysis, 2026-05-06)

*Sources: `oh-my-pi` (can1357, v14.7.2) and `pi_agent_rust` (Dicklesworthstone, v0.1.15)*

### Tier 1 — Quick Wins (≤3h each)

| # | Feature | Source | Effort | Description |
|---|---------|--------|--------|-------------|
| 10 | **Workspace Tree in System Prompt** | OMP | 2-3h | ✅ Done — Inject `<workspace-tree>` depth-3, 120-line-capped dir listing into system prompt. Agent orients instantly without `ls` calls. |
| 11 | **`/retry` Slash Command** | OMP | 30min | ✅ Done — Manually re-run the last model turn. |
| 12 | ~~**Auto-Retry on Network Errors**~~ | OMP | — | **Already implemented** in agent-session.ts (`_isRetryableError` + `_handleRetryableError` with exponential backoff). |
| 13 | **Editor Draft Persistence** | OMP | 1h | ✅ Done — Save unsent editor text on Ctrl+D/shutdown, restore on resume. |
| 14 | **Error Hints System** | Rust | 2-3h | ✅ Done — 14 pattern matchers → actionable remediation hints. |

### Tier 2 — High-Value Features (4-8h each)

| # | Feature | Source | Effort | Description |
|---|---------|--------|--------|-------------|
| 15 | **Tool Discovery (BM25 Search)** | OMP | 4-6h | ✅ Done — BM25 index over all tools with `search_tools` builtin. Field weights: name:6, desc:3, params:1. |
| 16 | **Auto-Recall on Session Start** | OMP | 3-4h | ✅ Already implemented — cortex `before_agent_start` hook searches memory with prompt, injects top-3 reranked results. |
| 17 | **Tree-Sitter Code Summarization** | OMP | 6-8h | `read` tool supports `summarize` mode — shows function/class/method signatures without bodies. Requires N-API native binding (tree-sitter). Massive context savings for large files. |
| 18 | **Eval Framework (replace python via bash)** | OMP | 4-6h | Fenced `eval.py`/`eval.js` cells in sandboxed VM. Safer than raw bash for computation. |
| 19 | **Read-Only Tool Parallelism** | Rust | 2-4h | Execute read-only tools (read, search, glob) in parallel instead of serializing. Free speedup on multi-tool turns. |
| 20 | **Background Compaction Worker** | Rust | 4-6h | Run LLM compaction off the foreground turn path with quota controls (cooldown, timeout, max_attempts). Smoother UX — no blocking compaction pauses. |

### Tier 3 — Architectural / Lower Priority

| # | Feature | Source | Effort | Description |
|---|---------|--------|--------|-------------|
| 21 | **SQLite Session Index** | Rust | 4-6h | Structured index on sessions (by CWD, timestamp, name) without scanning JSONL. Faster `/sessions` at scale. |
| 22 | **ACP (Agent Client Protocol)** | Rust | Days | JSON-RPC 2.0 protocol for IDE integration (Zed-style). Expose pi as a backend for editors via stdio. |
| 23 | **Tool Output Pruning** | OMP | 3-4h | Before compaction, prune old tool outputs (keep last 40k tokens intact, replace older with `[truncated - N tokens]`). Protected tools: read, skill. |
| 24 | **Flake Classifier for CI** | Rust | 2h | Classify test failures as deterministic vs transient (timeout, FS contention, port conflict). Auto-retry flaky tests. |
| 25 | **Session Metrics (Perf Telemetry)** | Rust | 2-3h | Atomic timing counters for save/load/serialize. Gated behind env var. Useful for debugging slow sessions. |
| 26 | **Content-Based Todo Matching** | OMP | 2h | Match todos by name/content (prefix/substr) instead of IDs. More natural for the model. |
| 27 | **Extension Scoring** | Rust | Days | Multi-signal scoring for MCP tools: recency, popularity, compat, license, risk gates. Histogram reporting. Over-engineered for now. |

### Tier 4 — Vision Features (exploratory)

#### 28. Dreaming — Autonomous Self-Improvement from Memory

**Concept:** An offline/idle-time process where the agent "dreams" — reviewing past sessions, extracting patterns, and crystallizing learnings into extensions, skills, or config changes.

**How it could work:**
1. **Trigger:** Idle detection, scheduled (nightly), or manual `/dream` command
2. **Memory Scan:** Walk recent cortex memories, daily logs, session transcripts
3. **Pattern Recognition:** Identify repeated workflows, friction points, failed attempts, manual corrections
4. **Self-Extension:** Automatically propose or create:
   - New skills (from repeated multi-step patterns)
   - Extension patches (from repeated config tweaks)
   - Prompt refinements (from corrections the user made)
   - Entity graph connections the user implied but never stated
5. **Review Gate:** Present proposals for approval (not blind self-modification)
6. **Feedback Loop:** Track which proposals were accepted/rejected → improve future dreaming

**Inspiration:**
- Cortex already tracks sub-sequence patterns (Phase 10) and entity co-occurrence
- OMP's hindsight `reflect` tool synthesizes over many memories
- The crystallize_skill tool already exists — dreaming could auto-trigger it
- Could use cheaper models for the scan/propose phase, expensive model only for final review

**Open Questions:**
- How aggressive? (conservative: only suggest | moderate: create drafts | aggressive: auto-apply with undo)
- Scope: per-project vs global learnings?
- Storage: where do "dream outputs" live? `~/.pi/dreams/`?

**Effort:** 2-3 days (MVP with manual trigger + skill proposals)

---

#### 29. Mentor-Executor Architecture — Multi-Model Orchestration

**Concept:** An interactive setup where an expensive "mentor" model orchestrates and advises cheaper "executor" models. The executors do the heavy lifting (code generation, file edits, research) and can consult the mentor when stuck or for validation.

**How it could work:**
1. **Model Selection (interactive):** User picks roles at session start or via `/mentor setup`:
   - Mentor: Claude Opus / o3 / expensive model (advises, reviews, unblocks)
   - Executors: Claude Sonnet / Haiku / Flash / local models (do the work)
2. **Execution Flow:**
   - User prompt → Mentor creates plan/brief → Executor(s) carry out tasks
   - Executor hits uncertainty/error → escalates to Mentor for guidance
   - Mentor reviews final output before presenting to user
3. **Escalation Triggers:**
   - Executor confidence below threshold
   - Architecture/design decisions (not just code)
   - Repeated failures (>2 retries)
   - User-defined escalation rules
4. **Cost Awareness:**
   - Track cost per model in real-time
   - Show "mentor consultations: 3 ($0.12)" vs "executor work: 47 calls ($0.08)"
   - Budget caps: "max $X on mentor per session"
5. **Integration Options:**
   - **Swarm extension enhancement:** Add `mentored: true` + `mentor_model:` to YAML DAGs
   - **Standalone extension:** `/mentor` command that wraps any task
   - **Session-level setting:** `model.mentor` + `model.executor` in config

**Architecture sketch:**
```
User Prompt
    ↓
[Mentor] → Plan + decomposition
    ↓
[Executor 1] → Subtask A    [Executor 2] → Subtask B
    ↓ (stuck?)                     ↓ (done)
[Mentor] → Guidance               ↓
    ↓                              ↓
[Executor 1] → Complete            ↓
    ↓──────────────────────────────↓
[Mentor] → Final review + synthesis
    ↓
User Response
```

**Relationship to Swarm:**
- Swarm is horizontal (peers debate/collaborate)
- Mentor-Executor is vertical (hierarchy with escalation)
- Could coexist: swarm for ideation, mentor-executor for implementation
- Possible merge: add `role: mentor | executor` to swarm agent definitions

**Open Questions:**
- How to handle context passing? (full transcript vs summary to mentor?)
- Mentor model selection: always the most expensive, or configurable?
- Interactive model picker UI: TUI selector with cost/speed indicators?
- Should executors run in parallel or sequential?

**Effort:** 3-5 days (MVP with 1 mentor + 1 executor, manual trigger)

---

#### 30. Image Intelligence Extension — Recognition + Generation

**Concept:** A pi extension providing two tools (`analyze_image` + `generate_image`) backed by Cloudflare Workers AI (free tier) and Gemini (higher quality fallback).

**Use Case 1: Image Recognition (`analyze_image`)**
- Agent receives an image (pasted, file path, URL) and understands it
- Applications: describe UI screenshots, read architecture diagrams, OCR text, analyze error screenshots, understand mockups
- Backends (priority order):
  1. Gemini 2.5 Flash (best quality vision, already have API key)
  2. Cloudflare Llama 4 Scout 17B ($0.27/M input, multimodal, 131k context)
  3. Cloudflare Llama 3.2 11B Vision (free tier fallback)

**Use Case 2: Image Generation (`generate_image`)**
- Agent generates images from text descriptions
- Applications: placeholder images, concept visualization, diagrams, mockup generation, social media assets
- Backends (priority order):
  1. Cloudflare FLUX.1 Schnell ($0.000053/tile — essentially free, fast)
  2. Cloudflare FLUX 2 Klein ($0.015/image — higher quality)
  3. Gemini 2.5 Flash Image / gemini-3-pro-image-preview (best quality, conversational editing)

**Architecture:**
```
pi extension (analyze_image / generate_image tools)
    ├── Direct Gemini API calls (GEMINI_API_KEY)
    └── Cloudflare Workers AI REST API (CF_ACCOUNT_ID + CF_API_TOKEN)
        └── Optional: CF Worker proxy for caching + rate limiting
```

**Implementation Plan:**
1. Create `extensions/image-ai/` extension
2. Register `analyze_image` tool:
   - Accept image (base64 from paste, file path, or URL)
   - Send to Gemini with user's question about the image
   - Fallback to CF Llama 4 Scout if no Gemini key
3. Register `generate_image` tool:
   - Accept text prompt + optional size/style params
   - Call CF FLUX.1 Schnell REST API
   - Save generated PNG to temp file, display in terminal (iTerm2/Kitty protocol)
   - Optional: Gemini Flash Image for conversational editing
4. Optional: Deploy CF Worker proxy for:
   - API key management (don't expose in extension)
   - Response caching (same prompt → cached image)
   - Usage tracking / budget caps

**Cloudflare Workers AI REST API:**
```bash
# Image generation
curl https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/black-forest-labs/flux-1-schnell \
  -H "Authorization: Bearer {token}" \
  -d '{"prompt": "a cat astronaut"}'
# Returns: binary PNG

# Vision (Llama 4 Scout)
curl https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct \
  -H "Authorization: Bearer {token}" \
  -d '{"messages": [{"role": "user", "content": [{"type": "text", "text": "Describe this image"}, {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}]}]}'
```

**Gemini Image Generation:**
```python
# responseModalities: ["TEXT", "IMAGE"]
# model: gemini-2.5-flash-image
# Returns inline base64 image in response parts
```

**Pricing (monthly estimate for moderate use):**
- CF free tier: 10,000 neurons/day (~100 FLUX images or ~50 Llama 4 vision calls)
- Gemini Flash vision: ~$0.01 per image analysis
- Gemini Flash image gen: ~$0.003 per generated image (1290 tokens)
- Total for 500 uses/month: ~$2-5

**Open Questions:**
- Display strategy: iTerm2 inline images? Or save to file + open?
- Should generated images auto-attach to the conversation context?
- Image editing: Gemini supports conversational editing ("make it bluer") — worth exposing?
- Should this be a standalone extension or part of the existing web-access extension?

**Effort:** 4-6h (MVP with CF FLUX generation + Gemini vision)

---

### Monitoring (check monthly)

| Source | What to Watch |
|--------|---------------|
| OMP | hashline v3 improvements, hindsight API maturity, plan-mode UX |
| Rust | ACP protocol stabilization, wasmtime CVE resolution, extension lifecycle |

```bash
cd ~/Developer/pi-ideas/oh-my-pi && git fetch origin && git log --oneline HEAD..origin/main | head -20
cd ~/Developer/pi-ideas/pi_agent_rust && git fetch origin && git log --oneline HEAD..origin/main | head -20
```

---

## Extension Inventory

### Public (pi-mono/extensions/)

| Extension | Version | LOC | Purpose |
|-----------|---------|-----|---------|
| cortex | 0.1.0 | 6,557 | Memory, retrieval, entity graph, temporal intelligence, token budget |
| web-access | 0.10.6 | 11,591 | Search, fetch, YouTube, PDF, GitHub |
| mcp-adapter | 2.2.2 | 10,641 | MCP server gateway |
| mitsupi | 1.0.0 | 10,970 | Personal extensions (statusline, etc.) |
| markdown-preview | 0.9.6 | 3,195 | Rendered MD + LaTeX preview |
| stats | 1.1.0 | 1,773 | AI usage dashboard |
| swarm | 1.0.0 | 1,736 | Multi-agent YAML DAG orchestration |
| pai | 1.0.0 | 823 | Skill discovery + HUD |
| buddy | — | 742 | Virtual companion widget |
| ultra | 1.0.0 | ~250 | ULTRA keyword-triggered deep thinking modes |

### Private (separate repo, symlinked)

| Extension | LOC | Purpose |
|-----------|-----|---------|
| LLM gateway | 557 | Internal LLM providers + memory fence |
| vertex-anthropic | 329 | Claude on GCP Vertex via rawPredict |
| internal-auth | 278 | OAuth PKCE for internal MCP server |
| internal-models | 115 | Corporate LLM portal models |
| secrets-guard | 52 | Block access to ~/.secrets |
