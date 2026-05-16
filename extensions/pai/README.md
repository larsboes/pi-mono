# pai

PAI (Personal AI) integration for pi. Brings the PAI Algorithm v6.3.0 doctrine, twelve-section ISA, voice notifications, inline-verification, per-ISC checkpointing, completeness gates, and a unified statusline widget into the Pi coding agent.

## Quick start

The extension is auto-loaded by Pi when symlinked into `~/.pi/agent/extensions/pai`. No build step — Pi loads TypeScript via jiti.

```bash
# One-time symlink (or run PAI/install.sh — does this for you)
ln -sfn ~/Developer/pi-mono/extensions/pai ~/.pi/agent/extensions/pai
cd ~/Developer/pi-mono/extensions/pai && bun install
```

Optional env vars:
```bash
export PAI_VOICE_ENABLED=true
export PAI_VOICE_ID=<elevenlabs-id>
export PAI_VOICE_ENDPOINT=http://localhost:31337/notify  # default
export VAULT_PATH=~/Developer/knowledge-base   # for TELOS injection
```

## What it does

The Algorithm fires automatically — `mode: "auto"` is default. Every prompt is classified; if the classifier says ALGORITHM, the v6.3.0-adapted doctrine block is injected as a `<system-reminder>` at E2+ (E1 stays a fast-path lite block to preserve <90s budget). You don't type `/algo` to enable — only to override.

## Pi tools registered

| Tool | Purpose |
|------|---------|
| `voice_notify` | Speak Algorithm phase transitions via TTS server (no-op if voice not configured) |
| `pai_skill` | Invoke a PAI skill by name; returns SKILL.md content for the model to use (parity with CC's Skill tool) |
| `advisor_check` | Commitment-boundary second-opinion. Spawns advisor model subprocess; returns verdict + concerns + recommendations |
| `cato_audit` | Cross-vendor audit (E4/E5 mandatory). Spawns a different provider (Gemini default) read-only against the ISA; returns pass/concerns/fail + critical_findings |
| `isa_scaffold` | Write twelve-section ISA template to `.pi/ISA.md` with frontmatter |
| `isa_append_decision` | Timestamped Decisions entry (with optional `refined:` prefix) |
| `isa_append_changelog` | Conjecture/refutation/learning quad — refuses partial entries |
| `isa_mark_isc` | Toggle `[ ]→[x]`, refresh `progress:`, optionally append Verification |
| `isa_check_completeness` | Validate required sections per tier + ISC count + anti-criterion |
| `isa_update_frontmatter` | Surgical YAML frontmatter edit (preserves order, auto-bumps `updated`) |

## Slash commands

| Command | What |
|---------|------|
| `/algo [off\|auto\|on\|e1..e5\|reset\|status\|stats]` | Algorithm mode + tier override |
| `/isa [view\|init [slug]\|path\|check [tier]\|phase <new>]` | ISA management |
| `/voice [text]` | Test voice or send ad-hoc message |
| `/pai` | Toggle the statusline widget |
| `/dream*` | (See dream.ts) |

## Background behavior

| File | Triggers on | What |
|------|-------------|------|
| `algorithm.ts` | `before_agent_start`, `agent_end` | Doctrine injection at E2+, feedback-adjusted tier learning, CC-aligned reflection JSONL |
| `voice.ts` | `session_start`, `voice_notify` tool | TTS announcements (opt-in via env) |
| `verification.ts` | `tool_result` (Edit/Write on `.pi/ISA.md`) | Detects `[ ]→[x]` without evidence → next-turn nudge; auto-fires completeness gate on `phase: complete` |
| `checkpoint.ts` | `tool_result` (ISC transitions) | Auto-commits to repos in `~/.pai/checkpoint-repos.txt`, idempotent via `.pi/.checkpoint-state.json` |
| `isa.ts` | `before_agent_start` | Injects `.pi/ISA.md` content into system prompt |
| `index.ts` | All | TELOS injection, statusline widget, location/weather caching |
| `skill-nudge.ts` | `before_agent_start` | Compact skill index in system prompt |
| `workspace-tree.ts` | `before_agent_start` | Project structure into system prompt |
| `search-tools.ts` | (custom tool) | BM25 tool discovery |
| `session-learning.ts` | Session lifecycle | Captures execution patterns |
| `security.ts` | `tool_call` (bash) | Blocks dangerous commands |
| `dream.ts` | `/dream` command, idle | Periodic self-improvement analysis |

## Files written

- `~/.pai/data/algo-feedback.jsonl` — per-execution metrics for feedback-adjusted tier (now includes `source: classifier|fail-safe|heuristic|explicit`)
- `~/.pai/data/verification-violations.jsonl` — doctrine + verification violations. Event types:
  - `unverified-isc-transition` — `[ ]→[x]` without a matching tool probe in recent history
  - `phase-complete-without-required-sections` — completeness gate blocked at tier
  - `missing-closing-summary-block` — phase headers without the SUMMARY block
  - `doctrine-format-violation` — score-based check (intent / phase / summary / capabilities) under threshold
  - `phantom-thinking-capability` — capability name not in the closed 19-entry enumeration
  - `thinking-floor-miss` — declared genuine thinking caps below tier floor
  - `missing-deliverable-manifest` — multi-task prompt without `📦 DELIVERABLE MANIFEST` block
  - `isc-granularity-flag` — ISC criterion looks non-atomic ("and"/"with"/scope-words)
- `~/.pai/data/model-call.jsonl` — per-call log for `model-call.ts` (role, provider, latency, cache hit/miss)
- `~/.pai/data/model-call-cache.json` — SHA-256-keyed response cache, capped at 500 entries
- `~/.pai/data/cato-attempts.jsonl` — per-provider attempt log for the Cato auth fallback chain
- `~/.pai/data/doctrine-enforcer-trace.jsonl` — diagnostic trace of every enforcer invocation
- `~/.claude/PAI/MEMORY/LEARNING/REFLECTIONS/algorithm-reflections.jsonl` — CC-aligned schema, `source: "pi"`
- `<project>/.pi/ISA.md` — twelve-section ISA per project
- `<project>/.pi/.checkpoint-state.json` — already-committed ISC ids (idempotency)

## Subprocess model calls

`model-call.ts` spawns `pi --mode rpc --no-session --no-tools --no-extensions` to
make model calls without importing `@mariozechner/pi-ai` (which poisons the
api-registry → 403). Used by the mode classifier, `advisor_check`, and `cato_audit`.

Role mapping (override at `~/.pai/model-call-roles.json`):
- `fast` — `amazon-bedrock/eu.anthropic.claude-haiku-4-5-20251001-v1:0`, 10s timeout
- `standard` — `amazon-bedrock/eu.anthropic.claude-sonnet-4-6`, 30s timeout
- `smart` — `amazon-bedrock/eu.anthropic.claude-opus-4-7`, 60s timeout
- `advisor` — `amazon-bedrock/eu.anthropic.claude-opus-4-7`, 60s timeout

Cato cross-vendor provider (override at `~/.pai/cato-provider.json`):
- default: `google-vertex/gemini-3.1-pro-preview`

Set `PAI_CLASSIFIER=heuristic` to disable model-based classification (fall back
to the regex-style heuristic). Set `PAI_CLASSIFIER_TIMEOUT_MS` to override the
10s default.

## Doctrine reference

Full canonical doctrine: `~/.claude/PAI/Algorithm/v6.3.0.md`. The injected block is a Pi-adapted compression — references the file path so the model can read on demand.

## Status

See `PLAN.md` for what's wired vs DOCTRINE-ONLY vs blocked.
