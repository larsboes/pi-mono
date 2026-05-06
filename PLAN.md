# pi-mono — Planned Work

*Last updated: 2026-05-06*

---

## Completed

### ~~1. pi_agent_rust — Conformance Validation~~ ✅

**Done:** 2026-04-30
**Outcome:** Hold migration. Blockers: wasmtime CVEs. Re-check monthly.

### ~~2. Cortex Phase 8 — Retrieval Quality Pipeline~~ ✅

**Done:** 2026-05-06
**Outcome:** All 6 sub-phases implemented and runtime-verified.

### ~~2b. Cortex Phase 9 — Temporal Intelligence~~ ✅

**Done:** 2026-05-06
**Outcome:** Query expansion, temporal routing, multi-hop retrieval, weekly compaction.

### ~~2c. Cortex Phase 10 — Intelligence Layer~~ ✅

**Done:** 2026-05-06
**Outcome:** Sub-sequence pattern mining, token-budgeted context injection, graph maintenance (decay + pruning).

### ~~6. Buddy Toggle~~ ✅

**Done:** 2026-05-06
**Outcome:** Added `/buddy toggle` subcommand for quick show/hide.

### ~~7. Custom Provider Auth Path Fix~~ ✅

**Done:** 2026-05-06
**Outcome:** Private extension was writing OAuth tokens to wrong config dir. Fixed `CONFIG_DIR` default to `.pi`.

### ~~9. Ultra Modes Extension~~ ✅

**Done:** 2026-05-06
**Outcome:** Keyword-triggered cognitive modes (ULTRATHINK, ULTRAWIDE, ULTRAFOCUS, ULTRACARE) that boost thinking level + inject specialized reasoning prompts. Per-turn keywords + sticky `/ultra` command + `Ctrl+Shift+U` cycling.

---

## Active

### 3. oh-my-pi Feature Mining — Remaining Candidates

**Status:** Low priority — check monthly
**Reference:** `~/Developer/pi-ideas/oh-my-pi/`

#### Already Ported
- `packages/stats` → `extensions/stats` ✓
- `packages/swarm-extension` → `extensions/swarm` ✓ (merged with ceo-board)

#### Candidates to Evaluate

| Feature | Effort | Value | Decision |
|---------|--------|-------|----------|
| **ChunkState / hash-anchored edits** | Weeks | High ceiling | **Defer** — wait for upstream |
| **utils/procmgr** — shell config | 2h | Medium | **Port if** WSL shell detection breaks |
| **utils/postmortem** — cleanup handlers | 1h | Low | **Skip** |
| **utils/mermaid-ascii** — terminal mermaid | 30min | Low | **Skip** |

#### Monitoring
```bash
cd ~/Developer/pi-ideas/oh-my-pi && git fetch origin && git log --oneline HEAD..origin/main | head -20
```

---

### ~~4. Unified Stats (PAI Layer)~~ ✅

**Done:** 2026-05-06 (was already implemented)
**Outcome:** Both pi + Claude Code parsers working. 61.5k requests tracked in `~/.pai/stats.db`. Source breakdown, sparklines, and trend indicators added to `/stats` TUI + web dashboard SourceBreakdown component.

---

### 5. Swarm — Interactive Dialogue Testing

**Status:** Partial (automated done, live testing open)
**Priority:** Medium
**Effort:** ~2h

#### Done (automated)
- Extension loads: 1 command, 2 tools, 2 renderers, 6 listeners
- Non-interactive subcommands verified via mocked context

#### Open (requires live session)
1. `/swarm quick <topic>` — parallel debate, ≥3 responses
2. `/swarm begin` — editor → CEO → converse → end_deliberation → revert
3. `/swarm stop` — mid-abort + session restore
4. `/swarm run <yaml>` — DAG pipeline execution

---

### ~~8. Extension Documentation~~ ✅

**Done:** 2026-05-06
**Outcome:** READMEs added for cortex, pai, stats, swarm, buddy. Private repo README rewritten.

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
