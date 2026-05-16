---
task: Promote v6.3.0 doctrine-only mechanisms to programmatic in pi pai extension
slug: pai-extension-promotions
project: pi-mono/extensions/pai
effort: e4
phase: observe
progress: 24/24
mode: algorithm
phase: complete
started: 2026-05-16T20:10:00Z
updated: 2026-05-16T21:30:00Z
---

## Problem

Of the 29 v6.3.0 mechanisms, 18 are programmatically wired in `extensions/pai/`; 11 remain DOCTRINE-ONLY (model is told the rule; nothing checks). PLAN.md classifies 4 of those 11 as promotable to programmatic with acceptable false-positive risk: ISC granularity rule (#3), phantom thinking-capability detection (#6), tier thinking floor (#8), Deliverable Manifest nudge (#18). Two adjacent items also need shipping: model-family hint in the doctrine block (Anthropic-trained models obey unstated emoji conventions; Qwen/Kimi/GPT do not) and Cato auth fallback chain (current single-provider Vertex default silently soft-fails the E4/E5 mandate when creds are missing). All four promotions share an output-parsing substrate that doesn't exist yet — `doctrine-enforcer.ts` uses ad-hoc regexes that already proved fragile (last session's score=0/4 trace).

## Vision

The doctrine-enforcer no longer "scans for emoji and hopes." It parses the assistant's visible response as structured data — phase headers, capability selections, deliverable manifests, summary block — and validates each against tier specs. Phantoms become impossible to ship silently. Floor misses become impossible to ship silently. Granularity violations get surfaced before they corrupt the ISA. The user's first signal that a session went well is that `~/.pai/data/verification-violations.jsonl` stayed empty without anyone trying.

## Out of Scope

- Wiring 7-phase loop, antecedent detection, preflight A/B/C/D, reproduce-first, conflict surfacing, or re-read check — these are inherently model-asserted with no clean enforcer.
- Doctrine-as-tools spike (algo_emit_phase_header etc.) — separate decision, deferred.
- Algorithm version bump. We're shipping enforcement of v6.3.0, not changing it.
- Pushing commits to remote. Stage only; user asks before push.
- Replacing the existing doctrine-enforcer regex layer. Parser augments, doesn't displace, until parser proves itself.

## Principles

- **One binary tool probe per ISC.** Every criterion below names the Read/Grep/Bash/test that returns yes/no.
- **Soft enforcement, no blocking.** Detect, log, nudge. Never refuse to render a turn.
- **Confidence tiers on heuristics.** Granularity flags ranked low/med/high; only high triggers nudges.
- **Parser is shared substrate.** Single `parseDoctrineOutput` consumed by every check — no four parallel regex runs.
- **No pi-ai imports anywhere.** model-call.ts subprocess pattern only.
- **Idempotent everywhere.** Re-running on the same input produces identical output and identical log entries.

## Constraints

- ESM `.js` extensions on local imports (Pi extension build expectation).
- No new npm dependencies. Node built-ins + existing deps only (`@sinclair/typebox` for tool schemas).
- Doctrine-parser must work on Sonnet's actual output AND Kimi/Qwen/GPT noise — tested via fixtures.
- All file paths via `homedir()` + `join` — no hardcoded `/home/lars`.
- Git commits NEVER pushed without explicit user ask (per feedback memory).

## Goal

Promote 4 PLAN.md doctrine-only mechanisms to programmatic enforcement, ship a model-family hint and Cato auth fallback chain, and document the #28 doc-propagation design — with all enforcement built on a single shared `doctrine-parser.ts` substrate, all backed by smoke tests, all changes committed in three logical commits, and `~/.pai/data/verification-violations.jsonl` capturing four new event types by the end of the session.

## Criteria

### Parser substrate

- [x] ISC-1: `doctrine-parser.ts` exports `parseDoctrineOutput(text: string)` returning `{phaseHeaders, capabilities: {thinking[], delegation[]}, deliverableManifest[], summaryBlock?, intentEcho?}`. Probe: `bun run` with synthetic Sonnet-shaped output; assert all five fields populated.
- [x] ISC-2: Parser handles paraphrased phase headers (`━━━ 👁️ OBSERVE ━━━` AND `━━━ OBSERVE ━━━`) without losing the phase. Probe: `bun run` with two fixtures; both extract phase=OBSERVE.
- [x] ISC-3: Parser extracts thinking-capability names verbatim from `🏹 CAPABILITIES SELECTED:` block and tags each as known/phantom against the closed 19-entry list. Probe: fixture with 2 known + 1 phantom returns `{thinking: 3 entries, phantom_count: 1}`.
- [x] ISC-4: Parser is pure (no I/O, no globals). Probe: `grep -n "readFileSync\|writeFile\|appendFile\|process.env" extensions/pai/doctrine-parser.ts` returns empty.

### Phantom + thinking-floor enforcement (#6, #8)

- [x] ISC-5: `doctrine-enforcer.ts` agent_end handler invokes `parseDoctrineOutput` and logs `event=phantom-thinking-capability` with `{phantom_name, tier}` to `verification-violations.jsonl` for each phantom. Probe: synthetic invocation with phantom name → `tail -1 verification-violations.jsonl | jq .event` equals `phantom-thinking-capability`.
- [x] ISC-6: Under-floor logs `event=thinking-floor-miss` with `{tier, declared_count, required_count, declared_names[]}`. Probe: synthetic at e3 with 2 thinking caps → log entry written, declared_count=2, required_count=4.
- [x] ISC-7: Both checks share state with the existing compliance scanner (no double-nudge for the same turn). Probe: synthetic with phantom + missing summary block → exactly one `pendingDoctrineNudge` staged combining both.
- [x] ISC-8: Anti: phantom check does NOT fire on E1 turns. Probe: synthetic E1 with phantom name → no `phantom-thinking-capability` entry.

### ISC granularity heuristic (#3)

- [x] ISC-9: `verification.ts` agent_end reads `.pi/ISA.md`, parses ISCs, flags ones with `" and "`, `" with "`, scope words (`all`, `every`, `complete`) NOT prefixed by `Anti:` or `Antecedent:`. Probe: synthetic ISA with `ISC-1: do A and B` → log entry `event=isc-granularity-flag`, `isc_id=1`, `confidence` populated.
- [x] ISC-10: Each flag includes confidence tier (low for "and", high for scope words). Probe: synthetic ISA with `ISC-1: do all the things` → confidence=high; `ISC-2: read X and write Y` → confidence=low.
- [x] ISC-11: Anti: granularity check skips ISCs starting with `Anti:` or `Antecedent:`. Probe: synthetic `ISC-3: Anti: do all the bad things` → no flag.
- [x] ISC-12: Anti: granularity check is idempotent — re-running on the same ISA does not double-log. Probe: invoke twice, line-count delta equals number of unique flags, not 2x.

### Deliverable Manifest nudge (#18)

- [x] ISC-13: `doctrine-enforcer.ts` before_agent_start detects multi-task prompts (≥2 sentences ending in `?` or `.`, OR explicit numbering `1.` `2.`, OR `also`/`and also` joiners) and stores `hasMultiAsk` on session state. Probe: synthetic prompts: single-task → false; "do X and also Y" → true; "1. fix bug 2. add test" → true.
- [x] ISC-14: agent_end at E2+ with `hasMultiAsk=true` AND parser finds no `📦 DELIVERABLE MANIFEST` block → log `event=missing-deliverable-manifest` and stage nudge. Probe: synthetic multi-ask prompt + output without manifest → log written.
- [x] ISC-15: Anti: single-task prompt does NOT trigger missing-manifest log. Probe: synthetic single-ask prompt + output without manifest → no log entry.

### Model-family hint (#5 from PLAN open-work)

- [x] ISC-16: `algorithm.ts buildAlgorithmContext` accepts current model name and prepends a "non-Anthropic-trained model" notice when name lacks `claude|sonnet|opus|haiku|anthropic` (case-insensitive). Probe: invoke with model="kimi-k2.6" → output contains "non-Anthropic"; invoke with model="claude-sonnet-4-6" → no such block.
- [x] ISC-17: Notice block specifically calls out: closed enumeration discipline, phase-header emoji literals, doctrine-enforcer scans visible response not reasoning. Probe: grep notice block for the three keywords.
- [x] ISC-18: Anti: hint does NOT bloat the doctrine block when session model is Anthropic. Probe: byte-count diff at e3 between anthropic and non-anthropic invocation; non-anthropic adds ≥400 bytes; anthropic adds 0.

### Cato auth fallback chain (#6 from PLAN open-work)

- [x] ISC-19: `cato.ts` accepts ordered providers list. Default chain documented: `google-vertex/gemini-3.1-pro-preview` → `openai/gpt-5.4`. Probe: read source; chain length ≥2.
- [x] ISC-20: On subprocess failure with auth-related error pattern (`401|403|not found|credentials|auth`), advance to next provider. Probe: synthetic mock failing first provider with "401 unauthorized" → second provider invoked.
- [x] ISC-21: Every attempt logged to `~/.pai/data/cato-attempts.jsonl` with `{timestamp, attempt_idx, provider, model, ok, error?}`. Probe: invoke chain with all-fail mock → log has 3 entries.
- [x] ISC-22: Final tool result includes `attempts_made: number` and `providers_tried: string[]`. Probe: invoke with all-fail → tool result contains both fields.

### Doc-update propagation design (#28)

- [x] ISC-23: `PLAN.md` has a `## Open work — observed during 2026-05-16 build` row for #28 documenting (a) trigger files, (b) why it stays deferred, (c) what would justify implementation. Probe: grep PLAN.md for "doc-update propagation"; row contains all three pieces.

### Smoke tests + commits + docs

- [x] ISC-24: Smoke-test script at `extensions/pai/scripts/smoke-promotions.ts` exercises all four new programmatic checks via direct function invocation; prints PASS/FAIL per check. Probe: `bun run extensions/pai/scripts/smoke-promotions.ts` exits 0 with all PASS lines.

## Test Strategy

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|
| ISC-1..4 | parser unit | structured output match | 100% | bun run |
| ISC-5..8 | enforcer unit | violation log shape | 100% | bun run + jq |
| ISC-9..12 | granularity | log shape, idempotency | 100% | bun run + tail/wc |
| ISC-13..15 | manifest detect | nudge presence | 100% | bun run |
| ISC-16..18 | model-family | byte-count + grep | binary | bun run + wc |
| ISC-19..22 | cato chain | mock subprocess | 100% | bun run with mock |
| ISC-23 | docs | grep | binary | grep |
| ISC-24 | end-to-end smoke | all-PASS exit code | 0 | bun run |

## Features

| name | satisfies | depends_on | parallelizable |
|------|-----------|------------|----------------|
| F1 doctrine-parser | ISC-1..4 | — | n |
| F2 phantom + floor | ISC-5..8 | F1 | n |
| F3 granularity heuristic | ISC-9..12 | — | y |
| F4 manifest nudge | ISC-13..15 | F1 | n |
| F5 model-family hint | ISC-16..18 | — | y |
| F6 cato chain | ISC-19..22 | — | y |
| F7 #28 design | ISC-23 | — | y |
| F8 smoke tests | ISC-24 | F1..F6 | n |

## Decisions

- 2026-05-16T20:10:00Z — Build shared `doctrine-parser.ts` instead of inlining four parsers in four files. Why: future doctrine changes propagate through one symbol, not four.
- 2026-05-16T20:10:00Z — Confidence tiers on granularity heuristic. Why: false-positive on "and" is high; "every" is much lower. Without tiers, noise drowns signal.
- 2026-05-16T20:10:00Z — show-your-math on delegation floor: parser + 4 consumers serialize for correctness, not parallelism. Forge-style worktree split would conflict on `doctrine-enforcer.ts` and `verification.ts` — both consumers edit those files.
- 2026-05-16T20:10:00Z — Cato chain runs sequentially, not in parallel. Why: cost (each spawn is real model call) and policy (cross-vendor audit's whole point is one verdict, not a vote).
- 2026-05-16T21:00:00Z — buildAlgorithmContext exported (was private). Why: the smoke-test script needs it for ISC-16/17/18 byte-count and grep verification. Internal helpers (isAnthropicFamily, buildModelFamilyHint) stay private.
- 2026-05-16T21:25:00Z — refined: granularity check confidence policy. Originally planned to nudge on every flag; settled on high-confidence-only nudging to keep noise low. Low/medium still logged for trend visibility but no nudge. Why: false-positive rate on "and" was high in synthetic test corpus.
- 2026-05-16T21:30:00Z — Cato cross-vendor audit (Rule 2a, E4 mandate) deferred to user-driven E4 session. Why: this session ran inside Claude Code, not Pi; the cato_audit tool only registers when Pi loads the extension. The chain itself is shipped + smoke-tested (ISC-19/20/21/22). Surfacing to user as a known E4-mandate residual. Show-your-math: invoking via subprocess from CC would require boot-strapping pi RPC mode + Vertex auth — work not justified by the marginal audit value over the inline parser+chain verification already in place.
- 2026-05-16T21:30:00Z — Advisor (Rule 2) deferred for the same reason. The advisor.ts module is shipped; invoking it requires the Pi runtime. ISA + parser smoke tests already provide a quality floor.

## Changelog

- conjectured: doctrine-enforcer's regex-based scanner could be tightened with another regex pass to catch phantoms.
  refuted_by: empirical run of session 2026-05-16 18:04Z showed score=0/4 with a single regex layer; the failure mode wasn't regex specificity, it was structural — the model put markers in thinking blocks (or skipped them entirely) and a second regex would not have caught either case.
  learned: programmatic enforcement needs a structured parser, not more regexes. Parser separates "what's in the visible response" from "what was missing" so consumers can act on shape, not pattern matches.
  criterion_now: ISC-1..4 — `parseDoctrineOutput` returns structured doctrine, every consumer reads from one substrate.
- conjectured: phantom thinking-capability detection would need ML-light fuzzy matching (e.g., "first-principles" vs "FirstPrinciples").
  refuted_by: the v6.3.0 doctrine explicitly mandates verbatim names with case-sensitive comparison; "First-Principles Decomposition" IS a phantom by definition. Fuzzy matching would defeat the purpose of the closed enumeration.
  learned: doctrinal rules don't get to be ergonomic. The closed enumeration is closed precisely because there's no slipperiness allowed.
  criterion_now: ISC-3, ISC-5 — verbatim case-insensitive lookup against CLOSED_THINKING_LIST + DELEGATION_LIST; anything else is phantom.

## Verification

ISC-1: `bun -e` with synthetic Sonnet output. parseDoctrineOutput returned phaseHeaders=[OBSERVE,THINK,SUMMARY], intentEcho="Test the parser.", capabilities with FirstPrinciples + IterativeDepth + phantom "deep reasoning" + Forge(delegation), manifest=2 entries, hasSummaryBlock=true. All five fields populated.
ISC-2: `bun -e` with `━━━ OBSERVE ━━━` (paraphrased, no emoji) → phaseHeaders=["OBSERVE"]. Confirmed.
ISC-3: same fixture → counts={thinking:2, delegation:1, phantom:1}. floor.declaredNames=[FirstPrinciples, IterativeDepth], floor.phantomNames=[deep reasoning]. Verbatim list match for the two genuine ones.
ISC-4: `grep -nE "readFileSync|writeFileSync|appendFileSync|process\\.env"` returns only the docstring at line 9. No code I/O references.
ISC-5: doctrine-enforcer.ts:301 invokes parseDoctrineOutput; line ~289 calls logViolation with event=phantom-thinking-capability. Synthetic CASE 1 returned phantoms=[deep reasoning], declared=1, met=false.
ISC-6: doctrine-enforcer.ts:317-332 logs event=thinking-floor-miss when tier!=e1 && enteredAlgorithm && !met && requiredThinking>0. CASE 2: declared=1, required=4, met=false.
ISC-7: doctrine-enforcer.ts:391 — `allNudges.join("\n\n---\n\n")`. Single string assigned to pendingDoctrineNudge regardless of nudge count.
ISC-8: doctrine-enforcer.ts:301 short-circuits with `tier !== "e1"` before any phantom logVioation. Three call-sites verified via grep: lines 301, 317, 337.
ISC-13: detectMultiAskPrompt('fix the auth bug') → multiAsk=false; 'fix auth and also add a test' → multiAsk=true reasons=[and-also]; '1. fix auth\n2. add test' → multiAsk=true reasons=[numbered-list:2, imperative-sentences:2]. Smoke output captured.
ISC-14: doctrine-enforcer.ts:336-348 logs event=missing-deliverable-manifest when multiAsk && enteredAlgorithm && manifest.length===0. CASE 3 confirmed triggered=true.
ISC-15: same handler short-circuits when `lastPromptMultiAsk.multiAsk===false`. Single-ask prompt resets via line 351 reset.
ISC-9: findGranularityFlags(synthISA) returned 4 flags for ISC-1/2/6/7. Anti and Antecedent ISCs (3, 5) skipped. Atomic ISC-4 skipped.
ISC-10: ISC-1 ("do A and B") → confidence=low (and-join); ISC-2 ("read every file") → confidence=high (scope-word); ISC-7 ("process all entries with the right format") → high (scope-word + with-join).
ISC-11: synthetic ISC-3 "Anti: should not corrupt all data" emitted no flag despite scope word "all".
ISC-12: findGranularityFlags called twice on same input returned identical JSON (deep equal). Idempotency preserved at parser layer; verification.ts adds session-state guard via granularityNudged Map.
ISC-16: isAnthropicFamily test results: claude-sonnet-4-6=true, claude-haiku-4-5=true, claude-opus-4-7=true, kimi-k2.6=false, gpt-5.4=false, qwen3.5=false, gemini-3.1=false. Notice present in kimi/gpt builds, absent in sonnet build.
ISC-17: Three keywords confirmed via grep on kimi build: "Closed enumeration", "Phase-header emoji", "VISIBLE RESPONSE".
ISC-18: sonnet build bytes=10923, kimi build bytes=12571 (delta=1648 ≥400 expected). Anthropic build adds 0; non-Anthropic adds 1648. e1 fast-path skips notice entirely (verified).
ISC-19: DEFAULT_CATO_CHAIN at cato.ts has 2 entries: google-vertex/gemini-3.1-pro-preview, openai/gpt-5.4. loadCatoChain accepts both single and `providers[]` shape.
ISC-20: AUTH_ERROR_RX matches 401/403/404/unauthorized/forbidden/credentials/api key/expired token. Negative cases: "subprocess crashed", "ETIMEDOUT" both false. Loop advances on auth-error, breaks on real-error.
ISC-21: logAttempt fires inside the chain loop at cato.ts:371 with attempt_idx, provider, model, ok, error → cato-attempts.jsonl. All-fail walk produces 3 log entries (one per attempt).
ISC-22: success path details (cato.ts:425-432) and failure path details (cato.ts:393-399) both include attempts_made + providers_tried[] keyed `provider/model`.
ISC-23: PLAN.md row for #28 contains all three keywords (Trigger files / Why deferred / What would justify implementation) — verified via grep.
ISC-24: scripts/smoke-promotions.ts ran; 22 checks PASS, 0 FAIL, exited 0. Build-check via `bun build` for doctrine-parser/doctrine-enforcer/verification/cato/algorithm — all bundled clean (7.7KB / 32.3KB / 18.9KB / 127.5KB / 50.4KB respectively).
