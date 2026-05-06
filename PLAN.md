# pi-mono — Planned Work

---

## ~~1. pi_agent_rust — Conformance Validation~~ ✅ Done

**Status:** Done (2026-04-30)
**Outcome:** Hold migration. Blockers: wasmtime CVEs. Re-check monthly.

---

## ~~2. Cortex Phase 8 — Retrieval Quality Pipeline~~ ✅ Done

**Status:** Done (2026-05-06)
**Outcome:** All 6 sub-phases implemented and runtime-verified.

Full 8-stage search pipeline:
```
Query → Retrieval → Intent (8.2) → Granularity (8.4) → Weights (8.2)
      → Graph (8.3) → Context (8.5) → Personal (8.6) → Rerank (8.1)
```

Runtime test results:
- 6/6 intent classifications correct
- Entity graph: extraction, persistence, traversal all working
- Feedback: logging, weight computation, negative signals all working
- Session context: recency-ordered entities, density tracking
- Full search: intents route correctly, granularity filters apply

---

## 3. oh-my-pi Feature Mining — Remaining Candidates

**Status:** Planned (low priority)
**Priority:** Low
**Effort:** Standard per feature
**Reference:** `~/Developer/pi-ideas/oh-my-pi/`

### Already Ported
- `packages/stats` → `extensions/stats` ✓
- `packages/swarm-extension` → `extensions/swarm` ✓ (merged with ceo-board)

### Candidates to Evaluate

| Feature | Source | Effort | Value | Decision |
|---------|--------|--------|-------|----------|
| **ChunkState / hash-anchored edits** | `crates/pi-natives/` + `STAGES.md` | Weeks | High ceiling | **Defer** — wait for upstream or pi_agent_rust (which has its own chunk system) |
| **utils/procmgr** — cross-platform shell config | `packages/utils/src/procmgr.ts` | 2h | Medium | **Port if** pi has shell detection issues on WSL |
| **utils/postmortem** — cleanup handlers | `packages/utils/src/postmortem.ts` | 1h | Low | **Skip** — only needed if extensions leak resources |
| **utils/mermaid-ascii** — terminal mermaid | `packages/utils/src/mermaid-ascii.ts` | 30min | Low | **Skip** — niche |

### Monitoring Strategy

Check oh-my-pi monthly for new features worth porting:
```bash
cd ~/Developer/pi-ideas/oh-my-pi && git fetch origin && git log --oneline HEAD..origin/main | head -20
```

No active fork relationship — just periodic reference pulls.

---

## 4. Unified Stats (PAI Layer)

**Status:** Planned
**Priority:** Medium
**Effort:** Extended (~4h)

Add Claude Code session parsing to stats so `~/.pai/stats.db` covers all AI agent usage. See `~/Developer/PAI/PLAN.md` for full design.

### Steps (pi-mono side)

1. Add `src/parsers/claude-code.ts` to `extensions/stats/`
2. Update `src/aggregator.ts` to call both parsers
3. Change DB path from `~/.pi/stats.db` to `~/.pai/stats.db`
4. Update `link-extensions.sh` if needed
5. Dashboard: add source column to distinguish pi vs claude-code data

---

## 5. Swarm — Interactive Dialogue Testing

**Status:** Partial — static validated, manual checklist ready (2026-04-30)
**Priority:** Medium
**Effort:** Standard (~2h)

### Done (automated)

- Extension loads cleanly with mock `ExtensionAPI`: registers 1 slash command
  (`/swarm`), 2 tools (`converse`, `end_deliberation`), 2 message renderers,
  6 lifecycle listeners.
- Non-interactive subcommands (`/swarm`, `/swarm list`, `/swarm status`,
  `/swarm stop`, `/swarm view`) verified to dispatch without crashing via
  mocked context. Each returns a sensible message.

### Open (requires live pi session)

`/swarm begin`, `/swarm quick`, and `/swarm run` invoke the real
`modelRegistry` + API keys and cannot be validated headlessly without
becoming theater. See `add-docs/swarm-testing.md` for a full manual
checklist covering:

1. `/swarm quick <topic>` — lightest path, parallel debate, ≥3 responses
2. `/swarm begin` — brief editor → CEO session → `converse()` →
   `end_deliberation()` → auto-revert
3. `/swarm stop` — mid-deliberation abort + session restore
4. `/swarm run <yaml>` — unattended pipeline with DAG execution

Mark item 4 complete in PLAN when the manual checklist passes end-to-end.
