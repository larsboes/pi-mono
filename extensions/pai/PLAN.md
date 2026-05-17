# PAI on Pi — Remaining Work

Tracks what's left between the Pi `pai` extension and canonical CC PAI Algorithm v6.3.0. Reference: `~/.claude/PAI/Algorithm/v6.3.0.md`.

**Shipped:** Doctrine injection (auto-fires at E2+), voice tool, twelve-section ISA + 6 Pi tools, inline-verification interceptor, per-ISC checkpoint commits, completeness gate auto-fire, ISC quality validator (count + anti-criterion), CC-aligned reflection JSONL, sync-deploy meta-pack unfold + case-insensitive cleanup, install.sh Pi setup section, skills.yaml Pack/Sub docs, README, closing summary block check. **+ 2026-05-16:** model-call.ts subprocess helper (zero pi-ai imports), `pai_skill` Skill primitive (parity with CC), `advisor_check` (Rule 2), `cato_audit` (Rule 2a — cross-vendor with Gemini default), classifier upgraded from heuristic to model-call.ts/fast with heuristic fail-safe, default model flipped to Sonnet/Bedrock. Dead `skills.ts` discoverer removed. **+ 2026-05-16 (later):** shared `doctrine-parser.ts` substrate; `#3` ISC granularity heuristic, `#6` phantom thinking-capability detection, `#8` tier thinking-floor enforcement, `#18` Deliverable Manifest nudge — all promoted from doctrine-only to programmatic. Model-family hint prepended to doctrine for non-Anthropic sessions. Cato auth fallback chain across cross-vendor providers (Vertex / OpenAI / Bedrock). **+ 2026-05-17:** TELOS multi-file injection (`telos.ts`) — IDENTITY + SOUL + TELOS + PERSONAL_CONTEXT plus auto-managed SHADOW/STORY/CORRECTIONS, mtime-keyed cache; BM25-ranked skill nudge with closed-enumeration↔invocation table; claude-soul-style signal extractor (`signals.ts`) with 6 typed kinds; tiered dream reflection (Quick/Deep/Meta) with framework evidence-tier engine (hypothesis→observed→validated→retired); `applier.ts` closes dream→action loop (skill scaffold, ISA append, algo-tune, knowledge); `forge.ts` cross-vendor code producer (sister to Cato); doctrine block now binds every closed-enumeration name to the exact Pi tool invocation; auto-fire wired (session_start checks `shouldAutoDream`). **45/45 smoke checks pass.** **27 of 29 v6.3.0 mechanisms WIRED.**

---

## Open work — UNBLOCKED 2026-05-16 ✅

Three steps that previously shared the pi-ai-poison blocker are now WIRED via `model-call.ts` (RPC subprocess, never imports pi-ai):

| Step | What | Status |
|------|------|--------|
| 5 | Mode classifier — replaces heuristic with `callModel("fast", ...)`. Fail-safe: timeout/parse-fail → heuristic. `algo-feedback.jsonl` records `source: classifier\|fail-safe\|heuristic\|explicit`. | ✅ WIRED |
| 6 | Advisor — `advisor.ts` registers `advisor_check` tool. Doctrine references it at the three commitment boundaries. | ✅ WIRED |
| 9 | Cato adapter — `cato.ts` registers `cato_audit` tool. Cross-vendor enforced via separate provider config (Gemini-via-Vertex default; override at `~/.pai/cato-provider.json`). E4/E5 mandatory. | ✅ WIRED |

The pattern: spawn `pi --mode rpc --no-session --no-tools --no-extensions --provider X --model Y`, write JSONL prompt to stdin (don't close), read JSONL events from stdout, terminate on `agent_end`. See `model-call.ts` for the canonical implementation; `cato.ts` re-implements inline so it can swap provider per-call.

---

## Open work — DOCTRINE-ONLY rows worth promoting

These v6.3.0 mechanisms are currently only in the doctrine block (model is told; nothing checks). Most are inherently model-asserted. A few could become programmatic:

| # | Mechanism | Why it stays DOCTRINE-ONLY (or how to promote) |
|---|-----------|------------------------------------------------|
| 1 | 7-phase loop | Inherently model-asserted. No clean enforcer. |
| 3 | ISC granularity rule | ✅ **WIRED 2026-05-16** — `findGranularityFlags()` in `doctrine-parser.ts`, consumed by `verification.ts` agent_end. Confidence-tiered (low for "and"/"with", high for scope words "all"/"every"/"complete"). Skips Anti:/Antecedent: prefixes. Idempotent via per-ISA seen-set. Logs `event=isc-granularity-flag` to `verification-violations.jsonl`. |
| 5 | Antecedent ≥1 (experiential goals) | Detecting experiential intent requires reading Vision/Goal — too brittle, leave doctrine-only. |
| 6 | Closed thinking-capability enumeration (phantom detection) | ✅ **WIRED 2026-05-16** — `parseDoctrineOutput()` extracts capability names; closed 19-entry list classified verbatim. Phantoms logged as `event=phantom-thinking-capability` in `doctrine-enforcer.ts` agent_end with corrective nudge. E1 short-circuited. |
| 8 | Tier thinking floor (HARD) | ✅ **WIRED 2026-05-16** — `checkThinkingFloor()` in `doctrine-parser.ts`. E2/E3/E4/E5 floors (2/4/6/8). Phantom names excluded from genuine count. Logged as `event=thinking-floor-miss` with declared/required/declared_names. |
| 16 | Reproduce-First blocking gate | Inherently model-asserted (only the model knows if Gate A "fired"). |
| 17 | Preflight gates A/B/C/D | Same. |
| 18 | Deliverable Manifest | ✅ **WIRED 2026-05-16** — `detectMultiAskPrompt()` in before_agent_start (numbered lists, "and also", multiple imperative sentences). agent_end logs `event=missing-deliverable-manifest` if multi-ask AND no `📦 DELIVERABLE MANIFEST` block in visible response. |
| 21 | Live-Probe doctrine | Already partially WIRED via the Inline Verification interceptor (probe-kind classifier). Tightening would mean stricter probe-type matching. |
| 24 | Conflict surfacing | Requires advisor (Step 6) first. |
| 25 | Re-Read check | Model-asserted, no good enforcer. |

---

## Open work — MISSING with no clear Pi path

| # | Mechanism | Status |
|---|-----------|--------|
| 28 | Documentation-update propagation (CC invokes a release skill on system-file edits) | No equivalent in Pi yet. Could port if/when needed. |
| 23 | Cato cross-vendor audit | See Step 9 above — WIRED via `cato_audit` tool with Gemini default. |

---

## Open work — observed during 2026-05-16 build

| Item | Detail |
|------|--------|
| Doc-update propagation (#28) — DESIGN ONLY, deferred | **Trigger files:** any edit to `extensions/pai/algorithm.ts`, `doctrine-enforcer.ts`, `doctrine-parser.ts`, `verification.ts`, `isa.ts`, `cato.ts`, `advisor.ts`, `model-call.ts`, `voice.ts`, `checkpoint.ts`, `pai-skill.ts`, OR `index.ts` — these are the system files whose behavior shapes the doctrine experience. **Why deferred:** CC's mechanism is `Skill("<release-skill>", "documentation update — I changed these system files: ...")`. Pi has no equivalent release skill yet. Building one is a separate effort that needs a real release-management workflow before automation. **What would justify implementation:** ≥3 sessions where README.md or PLAN.md fell out of sync with shipped behavior, OR explicit user request. **Soft enforcement option:** on agent_end, count Edit/Write tool calls touching the trigger-file list; if ≥1, append a one-line nudge to next turn ("you changed N system files this session — consider updating README.md/PLAN.md if they no longer reflect shipped behavior"). Trivial to add (5 lines in doctrine-enforcer or verification), but only worth the noise if the misalignment problem actually surfaces. **Decision logged in `extensions/pai/.pi/ISA.md` Decisions section.** |
| Live end-to-end test in pi session | Components individually verified via `bun run`; the full chain (pi loads extension → classifier fires → tool returns) hasn't yet been observed running through a real pi session. **Action:** restart pi and run a moderately complex prompt; watch `~/.pai/data/model-call.jsonl` for entries and check that doctrine block appears in the system prompt. |
| Classifier latency cost | ~1.85s per top-level prompt added. Bedrock Haiku via subprocess. **Mitigation:** cache hits are free; `PAI_CLASSIFIER=heuristic` env var disables the model call entirely. **Watch:** if cache hit rate is low (lots of unique prompts), consider whether the marginal classification quality is worth the latency for E1 prompts. |
| Cato cross-vendor auth dependency | Default provider is `google-vertex/gemini-3.1-pro-preview`. Requires Vertex auth env. If user doesn't have it, `cato_audit` returns clean error — safe but doesn't fulfill E4/E5 mandate. **Action:** override at `~/.pai/cato-provider.json` to whichever cross-vendor route the user actually has credentials for. |
| Cache write race (TOCTOU) | Identified by Cato during E4 audit. Two parallel `callModel()` could lose entries on concurrent writes. **Fixed inline** with merge-on-write + per-call unique tmp names. Not a true mutex; documented in ISA Decisions/Changelog. |
| Doctrine compliance varies by session model | Anthropic models (Sonnet/Opus) follow doctrine cleanly. Qwen/Kimi/Gemini/GPT-5 vary at E4/E5 — phantom capability names and skipped phase headers more common. **Mitigation:** verification-violations.jsonl catches the misses; cato_audit is the backstop. **Open question:** worth adding a model-family hint to the doctrine block (e.g. "you are not an Anthropic model — be extra careful with the closed enumeration")? Test in real runs first.|

---

## Things to test next

A short list of prompts that should each exercise different parts of the system. Run them through pi to validate the full chain.

| Tier | Prompt shape | What it exercises |
|------|--------------|-------------------|
| E1 | "what's in `~/.pi/agent/settings.json`?" | NATIVE classification — should NOT inject doctrine |
| E2 | "explain how the classifier in `algorithm.ts` falls back" | Doctrine inject, single-domain, no ISA scaffold needed |
| E3 | "investigate whether `pi-stats` and `model-call.jsonl` could share a widget; propose 2-3 designs" | Full ISA, advisor_check at PLAN→BUILD boundary, ≥32 ISCs |
| E4 | "audit external skill packs against pai-mono pai extension and produce a reconciliation plan" | Full doctrine, advisor + cato_audit mandatory |
| Skill invocation | "use the Architecture skill to review `extensions/pai/`" | Tests `pai_skill` tool — should load Architecture/SKILL.md and continue |

---

## Cross-cutting — DONE

- ✅ `install.sh` Pi setup section: detects `~/Developer/pi-mono/extensions/pai`, symlinks into `~/.pi/agent/extensions/`, runs `bun install` if `node_modules/` missing, prints env-var hints. Idempotent. Verified by re-running on this machine.
- ✅ `skills.yaml` documents the `Pack/Sub` granular form in the header comment.
- ✅ Pi extension `README.md` rewritten — tour of registered tools, slash commands, background behavior, files written, doctrine reference.
- ✅ Closing summary block check (PLAN #29): `verification.ts` scans last assistant turn on `agent_end`; if a phase header appeared but no `📃 SUMMARY` block, logs to `verification-violations.jsonl` and stages a nudge for next turn. 3-case smoke test passed.
- ✅ Sync-deploy case-insensitive real-dir cleanup: caught the kebab-case duplicates the symlink-only dedup missed.
- ✅ Skills hygiene: CC + Gemini cleaned of all non-PAI real directories. All three targets now exactly 56 PAI symlinks. Backup at `~/skills-backup-2026-05-16/` (14 MB).

---

## Out of scope

- CLAUDE.md / settings.json / hooks port to Pi.
- Forge / Anvil / Engineer agent equivalents in Pi.
- Algorithm version lockstep with CC. Re-snapshot when CC bumps to v6.4+, don't hot-track.

---

## Done condition for "Pi has the PAI Algorithm proper"

- A clean E3 task run in Pi produces: ISA twelve-section, ≥32 ISCs, anti-criterion present, all transitions tool-verified, completeness check passed, reflection JSONL entry written, closing summary block. **All achievable today** without subprocess work.
- Subprocess-blocked steps (5/6/9) become "deferred — usage data doesn't justify" *or* the helper gets built. Either is acceptable.
