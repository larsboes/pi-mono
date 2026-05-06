# Agent Ecosystem Analysis — Inspiration Worth Porting

Deep-dive comparison of this pi-mono fork against `oh-my-pi` (another community
fork) and other agent tools, focused on what's genuinely worth adopting vs
duplicating. Evaluated 2026-04-30 against `oh-my-pi` at commit
`bba00cb98` (version 14.5.11).

---

## Summary

`oh-my-pi` has diverged far enough from upstream pi-mono that it's effectively
its own agent, not an upstream source to mine. 81 unique files/directories in
`packages/coding-agent/` alone, different package namespace (`@oh-my-pi/*` vs
`@mariozechner/*`), different agent-core API shapes.

Most "features" are whole subsystems glued to its runtime. The pickable wins
are narrow. The more productive direction is stealing ideas from other agents
(Claude Code, aider, Cursor, Cline) and implementing them at our scale.

---

## What `oh-my-pi` has that pi-mono doesn't

### `autoresearch/` — autonomous experiment loop

**What it is.** ~2,726 LOC across 4 files + 3 prompt templates. An agent mode
that runs a self-directed experiment loop: reads `autoresearch.md` (goal +
benchmark contract), runs experiments, logs results to
`autoresearch.program.md`, iterates until interrupted or until max iterations.
Meant for "find the best prompt config" / "tune hyperparameters" / "improve
benchmark score over N runs" workflows.

**Why it won't port drop-in.** Tied to omp's `ExtensionContext`,
`ExtensionFactory`, `session/agent-session` types, `{{base_system_prompt}}`
interpolation machinery, and runtime dashboard infrastructure. It's not a
tool — it's a *mode* that intercepts the agent loop.

**Inspiration value.** Interesting idea, but 2,700 LOC of opinionated
workflow. Cheaper to design a thinner version as an extension if the use case
arises than to port omp's implementation.

---

### `capability/` — provider-resolution registry

**What it is.** ~1,000 LOC across 14 files. Generalizes "where does resource
X come from?" — providers register themselves (user dir, repo dir, plugin
dir, marketplace), capabilities query them, results merge with precedence
rules. Underlies omp's handling of skills, prompts, tools, rules, SSH hosts,
system prompts, etc.

**Why it won't port drop-in.** Interwoven with omp's `Settings`,
`ExtensionContext`, `AgentSession` types. Sits underneath most features.

**Inspiration value.** Low standalone. Pays off only when building a system
that loads many resource kinds from many locations.

---

### `exa/` — 22-tool Exa.ai MCP client

**What it is.** 4 search tools, 1 LinkedIn, 1 company research, 2 researcher
(start/poll), 14 websets tools. Uses omp's `CustomTool` type (different
parameter validation, result rendering, and tool-call lifecycle vs
pi-mono's `Tool`).

**Inspiration value.** Low — this fork already has `extensions/web-access/`
with an Exa integration.

---

### `memories/` — async two-stage memory consolidation

**What it is.** Stage 1 extracts candidate memories from session transcripts
(per-thread). Stage 2 consolidates globally. Uses `bun:sqlite` + dedicated
DB, runs as a background job with locks/leases/heartbeats. Prompt templates
for consolidation and read-path queries.

**Why it won't port drop-in.** Uses `AgentMessage` from `pi-agent-core`,
`ModelRegistry` + `model-resolver` from omp's config layer, embeds its own
DB schema with claim/lease/heartbeat machinery.

**Inspiration value.** The *approach* (two-stage consolidation, background
workers, per-thread vs global summaries) is genuinely interesting. Don't
port — study, then write a minimal version for this stack. Or look at Claude
Code's Memory feature directly. Or extend the existing `cortex` extension.

---

### `plan-mode/` — plan vs act mode separation

**What it is.** 62 LOC total in omp — basically a stub (state file +
`approved-plan.ts`). Thin.

**Why pi-mono doesn't have it.** Checked — no plan-mode tool/state in
`packages/coding-agent/src/` (confirmed 2026-04-30). That's a real gap.

**Inspiration value.** Low for porting (omp's version is 62 lines — you'd
build most from scratch anyway). Claude Code has plan-mode natively, so the
pattern is available as reference. Real value only if pi is the primary
driver, not a supplement to CC.

---

### `tools/*` — 61 built-in tools (vs 14 in upstream pi-mono)

**What it is.** Four-fold superset of pi-mono's tools: archive reading,
interactive bash, `ask`, `ast-edit`, `ast-grep`, calculator, checkpoint,
browser, debug, DAP, exit-plan-mode, fetch, find, jupyter, MCP, SSH, STT,
many more.

**Why I initially said "can't port."** Imports `AgentTool` from
`@oh-my-pi/pi-agent-core` — wrong type. pi-mono uses `Tool` from
`@mariozechner/pi-ai`.

**Revised view.** The interface shapes are actually close:

| Surface | omp `AgentTool` | pi-mono `Tool` |
|---|---|---|
| Execute | `execute(ctx, params, onUpdate, signal)` | `execute(toolCallId, params, signal, onUpdate, ctx)` |
| Schema | typebox | typebox |
| Rendering | `renderCall`, `renderResult`, `getUi` | `renderCall`, `renderResult` |

Porting is feasible. Per tool: ~1–3h depending on size, plus replacing
omp-specific helpers (`prompt`, `untilAborted`, theme helpers).

**Inspiration value — per tool.** Varies widely; see candidates below.

---

### `web/scrapers/` — 78 domain-specific scrapers

**What it is.** One file per site. Each knows how to extract clean
structured content from that specific site. Examples: `arxiv.ts`,
`hackernews.ts`, `github.ts`, `gitlab.ts`, `dockerhub.ts`, `crates-io.ts`,
`docs-rs.ts`, `huggingface.ts`, `pypi`, `stackoverflow`, `wikipedia`, etc.

**Why `tools/fetch.ts` (1462 LOC) matters too.** Orchestrates the scrapers:
markit conversion for PDF/DOCX/XLSX/PPTX, Parallel.ai fallback extractor,
`htmlToMarkdown` via native Rust, automatic image resizing, output caching,
list limiting, expand hints.

**Inspiration value — high.** This is the best real port target. Domain
scrapers produce dramatically cleaner extraction than generic HTML-to-markdown
for the sites you actually research (arxiv abstracts, github READMEs,
hackernews threads, stackoverflow answers, etc.). This fork's existing
`web-access` extension is Exa/Gemini-based and lacks site-specific logic.

---

## Revised portability table

Under the model "take inspiration and adjust, don't clone":

| Feature | Real value | Cost | Recommendation |
|---|---|---|---|
| Top ~10 scrapers from `web/scrapers/` | High — used daily for research | ~6–10h (1–2h each, or steal the 10 best) | **Port selected scrapers** into `extensions/web-access/` with this fork's tool shape |
| Memories architecture (concept only) | High | Own minimal version: ~8–12h | **Read the design, write your own** — don't copy files |
| Plan-mode as a proper extension | Medium | ~4h | Skip if CC is the primary driver. Pi-only users should consider. |
| Small standalone tools (`archive-reader`, `calculator`, `checkpoint`) | Low–med | ~1–2h each | Port `archive-reader` only if archives land in agent sessions regularly. Skip the rest. |
| `autoresearch` / `capability` / `exa` / `memories` as full subsystems | — | 50+h each | **Don't port.** Too deeply tied to omp architecture. |
| `tools/*` (61 tools) | Mixed | 1–3h per tool | Port opportunistically when a specific tool solves a real problem. |

---

## Higher-leverage: inspiration from other agents

`oh-my-pi` is one data point. More productive sources:

### Claude Code
- **Plan mode** (`ExitPlanMode` tool, mode separation) — gap in pi-mono
- **Task tool workflow** — `TaskCreate` / `TaskUpdate` / `TaskList` / `TaskGet` — structured tracking across long sessions
- **Hooks** — `PreToolUse` / `PostToolUse` / `SessionStart` / `Stop` / `UserPromptSubmit` — lifecycle interception points
- **Skill tool** with frontmatter-based discovery
- **Memory as filesystem** — simple, inspectable, versionable
- **Extended thinking with effort levels** — `off`/`minimal`/`low`/`medium`/`high`/`xhigh`

### aider
- **`/add <file>`**, **`/drop <file>`** — explicit context pinning/release
- **Auto-commit per change** — git history becomes the undo log
- **Weak/strong model split** — routing cheap tasks to smaller models
- **Diff-based edit model** — edits expressed as minimal diffs, validated before apply

### Cursor
- **`.cursorrules`** — per-repo instruction file, picked up automatically
- **Agentic mode with tool allowlist** — declarative safety scope
- **Composer** — multi-file coordinated edit with single approval

### Cline (VS Code)
- **Plan/Act mode separation** (similar to Claude Code plan mode)
- **Diff approval before write** — every write shown as diff, requires confirmation
- **Progressive output streaming** — partial tool results visible while still running
- **Provider abstraction layer** — swap providers without changing prompts

### Codex / OpenAI agentic
- **Sandboxed exec** — shell commands in isolated env
- **Task checkpointing + rollback** — explicit state markers

---

## Concrete "steal this" candidates

Ordered by real-value-to-effort ratio:

1. **Top 10 web scrapers from omp** — concrete, visible, saves real research
   time. Can be done incrementally.
2. **`/task` slash command** — mirror Claude Code's TaskCreate/Update pattern
   in pi. Useful for long autonomous sessions that need progress tracking.
3. **`.pirules` per-repo file** — project-specific instructions, auto-loaded
   when pi starts in that directory. Cursor-style.
4. **Diff approval mode for write tool** — optional flag that shows every file
   diff before write, requires Enter. Safety net for expensive models.
5. **`/add`, `/drop` explicit context pins** — aider-style. Complements pi's
   existing implicit context management.

---

## Runtime alternatives considered

Not feature-level, but strategically the same question: is there a better
runtime to inspire or switch to?

### `pi_agent_rust`

Third-party Rust rewrite of pi. Claims 5× faster startup, 12× less memory,
91.9% extension compatibility across a 223-extension corpus. Evaluated
2026-04-30.

- Built from source (~13 min), installed alongside existing binary in
  isolation.
- `pi doctor` static analysis on this fork's extensions: 10/11 pass or
  warn-only. Warnings are all "partial support" on node builtins
  (`node:crypto`, `node:fs/promises`, `node:http`).
- `cargo audit`: **11 vulnerabilities in the wasmtime 41.0.4 extension
  sandbox**, including one CVSS 9 critical sandbox escape. Fix requires
  upstream bump to wasmtime ≥42.0.2.
- `registerProvider()` hostcall is supported, but live end-to-end
  validation of custom-provider extensions through the rust runtime was
  not completed.

**Decision: hold migration.** Re-check monthly with `git pull && cargo audit`
until wasmtime bumps.

**Inspiration value from reading its source.** Low to medium. It's a full
runtime rewrite, not a feature bank. The interesting ideas — capability-gated
hostcalls, two-stage exec mediation, per-extension trust lifecycle with
kill-switch audit logs, `#![forbid(unsafe_code)]` at the crate root — are
security-architecture patterns worth knowing about when designing an agent
sandbox. Copying individual pieces into a Node/Bun runtime doesn't translate
cleanly; the value is in adopting the *posture* (capability gates, default
deny, auditable trust lifecycle) when designing extension surfaces.

### Hybrid Rust/Bun split

Considered and rejected. pi_agent_rust is a monolithic runtime (CLI, session
store, extension sandbox, provider implementations) with no clean seam to
swap in isolation. A hybrid would need two binaries running concurrently
(double storage, double auth, double config), IPC for shared state
(sessions, memory, cortex writes), and a unified CLI surface. Integration
cost eats the speed gain. Real workflow bottlenecks are in inference and
auth handshakes, not cold-start — a 5× cold-start improvement doesn't
change the experience meaningfully.

---

## Decision framework

For any candidate feature, ask in order:

1. **Do I have a concrete use case right now?** If no, don't port. Porting
   speculative capability = maintenance debt without return.
2. **Is it tied to a runtime the source tool has that I don't?** If yes,
   port the *idea*, not the code.
3. **Will upstream (`badlogic/pi-mono`) ship this eventually?** If likely,
   wait. Saves a merge conflict later.
4. **Is it cheaper to write fresh than adapt?** Often yes when the source is
   >500 LOC and the runtimes differ.
5. **Don't trust a static analyzer's reasoning uncritically.** Read the
   actual usage before refactoring to satisfy a tool. Example: pi_agent_rust's
   doctor flags `node:net` as forbidden with the rationale "raw sockets
   bypass HTTP policy." Correct for TCP networking; wrong for Unix domain
   sockets (filesystem-path IPC, never touches the network). A bare
   "blocker" from a policy scanner may be a false positive once you read
   the code.

---

## What's been verified (don't re-mine)

Already present in this fork or covered by other means:

- `extensions/stats` — unified pi + Claude Code session aggregation with
  time-range filter, source badges, web dashboard, `/stats` slash command,
  `pi-stats` global CLI
- `extensions/swarm` — multi-agent orchestration (merged omp-swarm +
  ceo-board), interactive deliberation, unattended DAG pipelines
- `getShellConfig`, `killProcessTree` — upstream pi-mono in
  `packages/coding-agent/src/utils/shell.ts`
- Lenient JSONL parsing — `try/catch` in session parsers handles the same
  malformed-line cases as omp's `parseSessionEntriesLenient`
- Recursive session-file discovery — `fs.readdir(..., { recursive: true })`
  in the pi stats parser
- Cost time-series + daily cost chart — identical to upstream omp
- Exa web search — `extensions/web-access/exa.ts`

---

## Bottom line

- **Stop broad mining of omp.** Everything easy is already ported. Further
  mining is archaeology.
- **Do one concrete port from omp:** a selected subset of `web/scrapers/`
  into `extensions/web-access/`. High value, bounded scope.
- **For new capability, steal ideas from other agents** (Claude Code, aider,
  Cursor, Cline) and implement at this fork's scale — cleaner than adapting
  omp's subsystems.
- **Contribute back to upstream** where this fork has clearly useful patches
  (e.g. skill-name normalization in `packages/coding-agent/src/core/skills.ts`).
  Turns fork debt into community value.
