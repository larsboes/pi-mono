# pi-mono — Planned Work

---

## 1. pi_agent_rust — Conformance Validation

**Status:** Done (2026-04-30)
**Outcome:** Hold migration. Blockers: (1) wasmtime 41.0.4 has 11 CVEs incl. 1 CVSS 9 critical sandbox escape (upstream fix needs wasmtime ≥42.0.2); (2) custom provider registration path unverified end-to-end. mitsupi's `node:net` usage turned out to be a false positive — it's Unix domain IPC for inter-session control, not TCP. No refactor needed. Re-check upstream monthly via `cargo audit`.
**Priority:** High (evaluate before next upstream merge cycle)
**Effort:** Standard (~2h)
**Reference:** `~/Developer/pi-ideas/pi_agent_rust/`

### Problem

pi_agent_rust is a Rust rewrite of the pi agent claiming 5x faster startup, 12x less memory, 83.9% extension compatibility. We need to know if OUR extensions work before considering a switch.

### Goal

Run our 9 public extensions against pi_agent_rust's conformance harness and identify what breaks.

### Steps

1. Build pi_agent_rust from source (`cargo build --release`)
2. Run built-in conformance test suite to verify baseline passes
3. Test each extension individually:
   - `cortex` — most complex, uses ONNX embeddings + filesystem writes
   - `pai` — reads PAI skill sources, renders statusline
   - `swarm` — uses `complete()` from pi-ai, registers tools dynamically
   - `mitsupi` — multi-file, uses pi-tui components
   - `stats` — standalone Bun CLI, NOT loaded by extension runner (skip)
   - `mcp-adapter` — complex, MCP server lifecycle management
   - `web-access` — external API calls (Exa, Perplexity, Gemini)
   - `markdown-preview` — terminal rendering, image protocols
   - `buddy` — sprite rendering, display utils
4. For each failure: identify if it's a missing npm stub, API gap, or fundamental incompatibility
5. Document results in `add-docs/pi-agent-rust-conformance.md`

### Decision Point

If ≥8/9 extensions pass (stats excluded): plan migration timeline.
If <8 pass: file issues upstream, re-evaluate in 1 month.

### Migration Path (if conformance passes)

1. Update `dotfiles/shell/02-aliases.sh` — `alias pi=` points to rust binary
2. Update `add-docs/architecture.md` — document rust runtime
3. Keep Node/Bun build for extension development (TypeScript tooling)
4. Keep `pi-rebuild` alias for extension development builds

---

## 2. oh-my-pi Feature Mining — Remaining Candidates

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

## 3. Unified Stats (PAI Layer)

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

## 4. Swarm — Interactive Dialogue Testing

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
