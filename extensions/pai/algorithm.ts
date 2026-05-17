/**
 * PAI Algorithm Integration for Pi
 *
 * Lightweight adaptation of PAI Algorithm v6.3.0 for Pi's extension system.
 * Injects structured execution methodology into the system prompt when
 * the task warrants it. No hooks, no ISA files, no voice — just the
 * thinking methodology.
 *
 * Integration points:
 * - before_agent_start: classify prompt → inject algorithm context
 * - /algo command: toggle mode, set tier
 * - Widget: show current mode/tier in PAI statusline
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { buildISAContext } from "./isa.js";
import { callModel } from "./model-call.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type AlgoMode = "off" | "auto" | "always";
export type EffortTier = "e1" | "e2" | "e3" | "e4" | "e5";
export type DetectedMode = "minimal" | "native" | "algorithm";

interface AlgoState {
	mode: AlgoMode;
	forceTier: EffortTier | null;
	lastDetected: DetectedMode | null;
	lastTier: EffortTier | null;
	lastPrompt: string | null;
	lastPromptTime: number | null;
	lastClassifierSource?: "classifier" | "fail-safe" | "heuristic" | "explicit";
	lastClassifierReason?: string;
}

/** Recorded execution data for feedback learning */
interface ExecutionRecord {
	ts: number;
	promptWords: number;
	detectedTier: EffortTier;
	actualTurns: number;
	actualTokens: number;
	actualTools: number;
	durationMs: number;
	/** Computed ideal tier based on actual execution */
	idealTier: EffortTier;
	/** v6.3.0 — source of the classification: "classifier" (model call), "fail-safe" (timeout/error), "heuristic" (model disabled) */
	source?: "classifier" | "fail-safe" | "heuristic" | "explicit";
}

/** Feedback history file */
const FEEDBACK_DIR = join(homedir(), ".pai", "data");
const FEEDBACK_FILE = join(FEEDBACK_DIR, "algo-feedback.jsonl");
const MAX_FEEDBACK_ENTRIES = 500;

/** CC-aligned reflection log — shared with CC at ~/.claude/PAI/MEMORY/LEARNING/REFLECTIONS/algorithm-reflections.jsonl */
const REFLECTION_FILE = join(
	homedir(),
	".claude",
	"PAI",
	"MEMORY",
	"LEARNING",
	"REFLECTIONS",
	"algorithm-reflections.jsonl",
);
const VERIFICATION_LOG = join(homedir(), ".pai", "data", "verification-violations.jsonl");
const ISA_REL_PATH = ".pi/ISA.md";

// ── State ────────────────────────────────────────────────────────────────────

const state: AlgoState = {
	mode: "auto",
	forceTier: null,
	lastDetected: null,
	lastTier: null,
	lastPrompt: null,
	lastPromptTime: null,
};

// ── Feedback History ─────────────────────────────────────────────────────────

let feedbackHistory: ExecutionRecord[] = [];

function loadFeedback() {
	try {
		if (!existsSync(FEEDBACK_FILE)) return;
		const lines = readFileSync(FEEDBACK_FILE, "utf-8").split("\n").filter(l => l.startsWith("{"));
		feedbackHistory = lines.slice(-MAX_FEEDBACK_ENTRIES).map(l => JSON.parse(l));
	} catch {}
}

function appendFeedback(record: ExecutionRecord) {
	feedbackHistory.push(record);
	if (feedbackHistory.length > MAX_FEEDBACK_ENTRIES) {
		feedbackHistory = feedbackHistory.slice(-MAX_FEEDBACK_ENTRIES);
	}
	try {
		mkdirSync(FEEDBACK_DIR, { recursive: true });
		writeFileSync(FEEDBACK_FILE, feedbackHistory.map(r => JSON.stringify(r)).join("\n") + "\n");
	} catch {}
}

/**
 * Read the ISA frontmatter + criteria progress for the current cwd, if present.
 * Used by the CC-aligned reflection writer to fill criteria_passed / prd_id.
 */
function snapshotISAStateForReflection(cwd: string): {
	prdId: string | null;
	criteriaCount: number;
	criteriaPassed: number;
	criteriaFailed: number;
} {
	const path = join(cwd, ISA_REL_PATH);
	if (!existsSync(path)) {
		return { prdId: null, criteriaCount: 0, criteriaPassed: 0, criteriaFailed: 0 };
	}
	let content: string;
	try {
		content = readFileSync(path, "utf-8");
	} catch {
		return { prdId: null, criteriaCount: 0, criteriaPassed: 0, criteriaFailed: 0 };
	}
	const slugMatch = content.match(/^slug:\s*(.+)$/m);
	const prdId = slugMatch ? slugMatch[1].trim().replace(/^["']|["']$/g, "") : null;
	const passed = (content.match(/^-\s*\[x\]\s*ISC-/gm) || []).length;
	const total = (content.match(/^-\s*\[[ x]\]\s*ISC-/gm) || []).length;
	return {
		prdId,
		criteriaCount: total,
		criteriaPassed: passed,
		criteriaFailed: Math.max(0, total - passed),
	};
}

/**
 * Inspect the verification log written by verification.ts to determine which
 * doctrine gates fired during the most recent run window.
 */
function readDoctrineFired(sincePromptTime: number | null): {
	live_probe: boolean | null;
	advisor: boolean | null;
	cato: boolean | null;
	conflict: boolean | null;
	thinking_floor_met: boolean | null;
	completeness_gate_met: boolean | null;
} {
	const result = {
		live_probe: null as boolean | null,
		advisor: null as boolean | null,
		cato: null as boolean | null,
		conflict: null as boolean | null,
		thinking_floor_met: null as boolean | null,
		completeness_gate_met: null as boolean | null,
	};
	if (!sincePromptTime || !existsSync(VERIFICATION_LOG)) return result;
	try {
		const lines = readFileSync(VERIFICATION_LOG, "utf-8").split("\n").filter((l) => l.startsWith("{"));
		let liveProbeViolation = false;
		let completenessViolation = false;
		for (const line of lines) {
			let entry: any;
			try {
				entry = JSON.parse(line);
			} catch {
				continue;
			}
			const ts = Date.parse(entry.timestamp || "");
			if (!Number.isFinite(ts) || ts < sincePromptTime) continue;
			if (entry.event === "phase-complete-without-required-sections") completenessViolation = true;
			else if (entry.iscId) liveProbeViolation = true;
		}
		result.live_probe = !liveProbeViolation;
		result.completeness_gate_met = !completenessViolation;
	} catch {}
	return result;
}

interface ReflectionRecord {
	timestamp: string;
	effort_level: EffortTier;
	effort_source: "auto" | "explicit" | "classifier" | "context-override";
	task_description: string;
	criteria_count: number;
	criteria_passed: number;
	criteria_failed: number;
	prd_id: string | null;
	implied_sentiment: number | null;
	satisfaction_prediction: number | null;
	reflection_q1: string | null;
	reflection_q2: string | null;
	reflection_q3: string | null;
	knowledge_flags: number;
	within_budget: boolean | null;
	living_doc_refinements: number;
	doctrine_fired: ReturnType<typeof readDoctrineFired>;
	source: "pi";
}

function appendReflection(record: ReflectionRecord) {
	try {
		mkdirSync(join(homedir(), ".claude", "PAI", "MEMORY", "LEARNING", "REFLECTIONS"), {
			recursive: true,
		});
		appendFileSync(REFLECTION_FILE, JSON.stringify(record) + "\n");
	} catch {}
}

/**
 * Given actual execution metrics, compute what tier SHOULD have been assigned.
 */
function computeIdealTier(turns: number, tokens: number, tools: number, durationMs: number): EffortTier {
	const seconds = durationMs / 1000;

	// Heuristic: map actual complexity to ideal tier
	if (turns <= 1 && tools <= 2 && seconds < 30) return "e1";
	if (turns <= 3 && tools <= 8 && seconds < 120) return "e2";
	if (turns <= 8 && tools <= 20 && seconds < 300) return "e3";
	if (turns <= 15 && tools <= 40 && seconds < 600) return "e4";
	return "e5";
}

/**
 * Use feedback history to adjust tier detection.
 * Returns a tier adjustment based on patterns in past executions.
 */
function feedbackAdjustedTier(baseTier: EffortTier, promptWords: number): EffortTier {
	if (feedbackHistory.length < 10) return baseTier; // Need enough data

	// Find executions with similar prompt length (±30%)
	const similar = feedbackHistory.filter(r =>
		Math.abs(r.promptWords - promptWords) / Math.max(promptWords, 1) < 0.3
	);

	if (similar.length < 5) return baseTier; // Not enough similar

	// If the model consistently needed higher tiers than detected, bump up
	const upgrades = similar.filter(r => tierNum(r.idealTier) > tierNum(r.detectedTier)).length;
	const downgrades = similar.filter(r => tierNum(r.idealTier) < tierNum(r.detectedTier)).length;

	const upgradeRate = upgrades / similar.length;
	const downgradeRate = downgrades / similar.length;

	if (upgradeRate > 0.6) {
		// Consistently under-estimating → bump up one tier
		return bumpTier(baseTier, 1);
	}
	if (downgradeRate > 0.6) {
		// Consistently over-estimating → bump down one tier
		return bumpTier(baseTier, -1);
	}

	return baseTier;
}

function tierNum(tier: EffortTier): number {
	return parseInt(tier[1]);
}

function bumpTier(tier: EffortTier, delta: number): EffortTier {
	const n = Math.max(1, Math.min(5, tierNum(tier) + delta));
	return `e${n}` as EffortTier;
}

// ── Mode Detection ───────────────────────────────────────────────────────────

/**
 * Lightweight heuristic classifier — used as fail-safe and as the seed answer
 * the model classifier can override.
 */
function classifyPromptHeuristic(prompt: string): { mode: DetectedMode; tier: EffortTier } {
	const trimmed = prompt.trim();
	const lower = trimmed.toLowerCase();
	const wordCount = trimmed.split(/\s+/).length;

	// Check for explicit tier override: /e1, /e2, etc.
	const tierMatch = lower.match(/\/e([1-5])\b/);
	if (tierMatch) {
		return { mode: "algorithm", tier: `e${tierMatch[1]}` as EffortTier };
	}

	// MINIMAL: greetings, single-word acknowledgments, ratings
	if (wordCount <= 3) {
		const minimalPatterns = /^(hi|hey|hello|thanks|ok|yes|no|sure|got it|k|ty|thx|good|great|nice|cool|done|rate|rating|\d{1,2}\/10|\d)$/i;
		if (minimalPatterns.test(trimmed)) {
			return { mode: "minimal", tier: "e1" };
		}
	}

	// NATIVE: single-action requests (one file, one command, one lookup)
	const nativePatterns = [
		/^(show|cat|read|print|display|what'?s in)\s+\S+$/i,
		/^(run|execute)\s+.{3,40}$/i,
		/^(ls|pwd|cd|git status|git log|git diff)\b/i,
		/^what (is|are|does)\s+.{3,30}\??$/i,
	];
	if (wordCount <= 12 && nativePatterns.some(p => p.test(trimmed))) {
		return { mode: "native", tier: "e1" };
	}

	// ALGORITHM: everything else — determine tier by complexity signals
	const tier = detectTier(trimmed, wordCount);
	return { mode: "algorithm", tier };
}

/**
 * Estimate effort tier from prompt complexity.
 */
function detectTier(prompt: string, wordCount: number): EffortTier {
	const lower = prompt.toLowerCase();
	let score = 0;

	// Length signals
	if (wordCount > 100) score += 3;
	else if (wordCount > 50) score += 2;
	else if (wordCount > 20) score += 1;

	// Complexity keywords
	const complexitySignals = [
		/architect|design|refactor|migrate|restructure/i,
		/implement|build|create.*system|create.*app/i,
		/investigate|debug|diagnose|why does/i,
		/plan|strategy|approach|proposal/i,
		/multiple.*files|across.*project|whole.*codebase/i,
		/security|performance|optimize/i,
	];
	for (const p of complexitySignals) {
		if (p.test(prompt)) score += 1;
	}

	// Multi-step signals
	if (/\b(and|then|also|plus|additionally)\b/i.test(prompt)) score += 1;
	if (/\d+\./m.test(prompt)) score += 1; // numbered list
	if (prompt.includes("\n")) score += 1; // multi-line

	if (score >= 6) return "e4";
	if (score >= 4) return "e3";
	if (score >= 2) return "e2";
	return "e1";
}

// ── Model-based classifier (v6.3.0) ──────────────────────────────────────────

/**
 * Disable the model classifier by setting PAI_CLASSIFIER=heuristic.
 * Default: model-based with 10s timeout and heuristic fail-safe.
 */
const CLASSIFIER_MODE = (process.env.PAI_CLASSIFIER ?? "model").toLowerCase();
const CLASSIFIER_TIMEOUT_MS = Number(process.env.PAI_CLASSIFIER_TIMEOUT_MS ?? 10_000);

const CLASSIFIER_SYSTEM_PROMPT = `You are the PAI mode classifier. Read the user prompt and emit ONE JSON object naming the execution mode and tier. No prose, no markdown fences.

Modes:
- MINIMAL — greetings, ratings, single-token acknowledgments.
- NATIVE — single fact lookup OR single-line edit on a named file OR one command run, AND no new artifact created, AND no multi-step plan.
- ALGORITHM — everything else. Includes any build/create/make/implement/design/refactor/migrate/integrate request, anything touching multiple files, anything ambiguous, anything affecting doctrine/system-prompt/hooks/CLAUDE.md/Algorithm/ISA, anything spanning multiple projects, any meta-question about the system itself.

Tier (ALGORITHM only — for MINIMAL/NATIVE always emit "e1"):
- e1 — trivial, ~<90s
- e2 — single-domain, ~3min
- e3 — multi-file substantial, ~10min
- e4 — cross-cutting / doctrine / architecture, ~30min
- e5 — comprehensive, >2h

Bias higher when in doubt — under-escalation is the failure mode.

Output exactly:
{"mode":"MINIMAL|NATIVE|ALGORITHM","tier":"e1|e2|e3|e4|e5","reason":"one short sentence"}`;

interface ClassifierOutcome {
	mode: DetectedMode;
	tier: EffortTier;
	reason: string;
	source: "classifier" | "fail-safe" | "heuristic" | "explicit";
}

function parseClassifier(text: string): { mode: DetectedMode; tier: EffortTier; reason: string } | null {
	if (!text) return null;
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	const candidate = fenced ? fenced[1] : text;
	const start = candidate.indexOf("{");
	const end = candidate.lastIndexOf("}");
	if (start === -1 || end === -1 || end <= start) return null;
	try {
		const parsed = JSON.parse(candidate.slice(start, end + 1)) as { mode?: string; tier?: string; reason?: string };
		const mode = (parsed.mode ?? "").toLowerCase();
		const tier = (parsed.tier ?? "").toLowerCase();
		if (mode !== "minimal" && mode !== "native" && mode !== "algorithm") return null;
		if (!["e1", "e2", "e3", "e4", "e5"].includes(tier)) return null;
		return {
			mode: mode as DetectedMode,
			tier: tier as EffortTier,
			reason: typeof parsed.reason === "string" ? parsed.reason : "",
		};
	} catch {
		return null;
	}
}

async function classifyPrompt(prompt: string): Promise<ClassifierOutcome> {
	// Explicit /e1../e5 override always wins
	const tierMatch = prompt.toLowerCase().match(/\/e([1-5])\b/);
	if (tierMatch) {
		return {
			mode: "algorithm",
			tier: `e${tierMatch[1]}` as EffortTier,
			reason: "explicit /eN override",
			source: "explicit",
		};
	}

	// PAI_CLASSIFIER=heuristic disables model calls entirely
	if (CLASSIFIER_MODE === "heuristic" || CLASSIFIER_MODE === "off") {
		const h = classifyPromptHeuristic(prompt);
		return { mode: h.mode, tier: h.tier, reason: "heuristic-only mode (PAI_CLASSIFIER)", source: "heuristic" };
	}

	const heuristic = classifyPromptHeuristic(prompt);

	try {
		const result = await callModel("fast", prompt, {
			systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
			thinking: "off",
			timeoutMs: CLASSIFIER_TIMEOUT_MS,
			cache: true,
		});
		if (!result.ok) {
			return {
				mode: heuristic.mode,
				tier: heuristic.tier,
				reason: `fail-safe: ${result.error ?? "model call failed"}`,
				source: "fail-safe",
			};
		}
		const parsed = parseClassifier(result.text ?? "");
		if (!parsed) {
			return {
				mode: heuristic.mode,
				tier: heuristic.tier,
				reason: "fail-safe: classifier output unparseable",
				source: "fail-safe",
			};
		}
		return {
			mode: parsed.mode,
			tier: parsed.tier,
			reason: parsed.reason || "classifier",
			source: "classifier",
		};
	} catch (err) {
		return {
			mode: heuristic.mode,
			tier: heuristic.tier,
			reason: `fail-safe: ${(err as Error).message}`,
			source: "fail-safe",
		};
	}
}

// ── Algorithm Context ────────────────────────────────────────────────────────

/** Path to the canonical CC Algorithm — used as authoritative reference if present. */
const CC_ALGORITHM_DIR = join(homedir(), ".claude", "PAI", "Algorithm");
const CC_ALGORITHM_LATEST = join(CC_ALGORITHM_DIR, "LATEST");

/** Cache the resolved doctrine version per-session. */
let cachedAlgorithmVersion: string | null | undefined = undefined;

function getCanonicalAlgorithmVersion(): string | null {
	if (cachedAlgorithmVersion !== undefined) return cachedAlgorithmVersion;
	try {
		if (!existsSync(CC_ALGORITHM_LATEST)) {
			cachedAlgorithmVersion = null;
			return null;
		}
		cachedAlgorithmVersion = readFileSync(CC_ALGORITHM_LATEST, "utf-8").trim();
		return cachedAlgorithmVersion;
	} catch {
		cachedAlgorithmVersion = null;
		return null;
	}
}

/**
 * Detect whether a model id/provider string corresponds to an Anthropic-trained
 * model (claude/sonnet/opus/haiku/anthropic). Anthropic-family models follow
 * the doctrine output format with little prompting; non-Anthropic models
 * (Qwen/Kimi/Gemini/GPT) often skip phase headers and intent-echo unless told
 * very explicitly. The hint block is appended to the doctrine ONLY for
 * non-Anthropic sessions.
 */
function isAnthropicFamily(modelLabel: string): boolean {
	const s = modelLabel.toLowerCase();
	return /\b(claude|sonnet|opus|haiku|anthropic)\b/.test(s);
}

/**
 * Build a strong "non-Anthropic-trained model" notice for the doctrine block.
 * Three keywords required for ISC-17: "closed enumeration", "phase-header emoji",
 * "visible response not reasoning".
 */
function buildModelFamilyHint(modelLabel: string, cwd?: string): string {
	const cwdLine = cwd
		? `**Current working directory: \`${cwd}\`.** Resolve every relative path against this. Anchor file lookups here BEFORE running broad \`find\` / \`glob\` searches across the whole filesystem.`
		: `**Anchor file lookups in the current working directory FIRST** before running broad \`find\` / \`glob\` searches.`;
	return `
<pai-non-anthropic-notice priority="high">
## Heads-up — non-Anthropic-trained session model

Your underlying model (\`${modelLabel}\`) is NOT trained on PAI doctrine and historically skips conventions that Anthropic-family models follow automatically. Read this once and apply it for every Algorithm response in this session:

1. **Closed enumeration discipline.** Under \`🏹 CAPABILITIES SELECTED\`, every thinking-capability name MUST come VERBATIM from the closed list (IterativeDepth, FirstPrinciples, etc.). Inventing names ("decomposition", "tradeoff analysis", "deep reasoning") is a CRITICAL FAILURE. The doctrine-enforcer parses your output and logs phantom names to verification-violations.jsonl.

2. **Phase-header emoji are LITERAL.** Output \`━━━ 👁️ OBSERVE ━━━\` exactly. Do not paraphrase to \`### OBSERVE\` or strip the emoji or replace the box-drawing characters. The phase-header parser scans for the literal pattern.

3. **The doctrine-enforcer scans your VISIBLE RESPONSE, not your reasoning trace.** If you have extended thinking enabled, you may use it freely — but the markers (🎯 INTENT, phase headers, 🏹 CAPABILITIES SELECTED, 📃 SUMMARY block) MUST appear in the visible text the user sees. Markers buried in reasoning do not count and produce a doctrine-format violation.

4. **CWD anchoring + filename disambiguation.** ${cwdLine} When the user names a file with a common name (e.g. \`algorithm.ts\`, \`config.ts\`, \`index.ts\`, \`README.md\`), prefer files inside the current project tree over \`~/.claude/\`, \`~/.pi/\`, \`~/Developer/PAI/\`, or any \`PAI-upstream/Releases/\` archive — UNLESS the user explicitly named one of those paths. If \`find\` returns more than 3 candidates, list them with their parent directory and ASK before reading. Reading the wrong file wastes a 50KB context window and sends the rest of the run off-track.

These four rules are not stylistic. They are how the system measures whether you actually entered the Algorithm. Skipping them leaves \`~/.pai/data/verification-violations.jsonl\` full of evidence that the session model ignored doctrine — and the next prompt will receive a corrective nudge with that evidence inline.
</pai-non-anthropic-notice>
`;
}

/**
 * ISC floors and thinking floors per tier — mirrors v6.3.0 § Effort Levels.
 */
const TIER_SPECS: Record<EffortTier, { budget: string; iscFloor: number; thinkingFloor: number; delegationFloor: number }> = {
	e1: { budget: "<90s", iscFloor: 0, thinkingFloor: 0, delegationFloor: 0 },
	e2: { budget: "<3min", iscFloor: 16, thinkingFloor: 2, delegationFloor: 1 },
	e3: { budget: "<10min", iscFloor: 32, thinkingFloor: 4, delegationFloor: 2 },
	e4: { budget: "<30min", iscFloor: 128, thinkingFloor: 6, delegationFloor: 2 },
	e5: { budget: "<120min+", iscFloor: 256, thinkingFloor: 8, delegationFloor: 4 },
};

/**
 * Generate the Pi-native PAI Algorithm doctrine block.
 *
 * Strategy: this is a Pi-adapted compression of the canonical CC Algorithm
 * v6.3.0 (~673 lines). It preserves doctrine — phases, ISC quality system,
 * verification rules, thinking-capability enumeration — and adapts the
 * mechanism: Pi has no hooks, no ISA Skill, no Forge/Cato agents. Instead
 * Pi uses the isa_* tools (isa_scaffold, isa_mark_isc, isa_append_decision,
 * isa_append_changelog, isa_check_completeness, isa_update_frontmatter) and
 * the voice_notify tool when the voice extension is enabled.
 *
 * E1 stays a fast-path lite block to preserve the <90s budget.
 * E2+ injects the full doctrine.
 *
 * The full canonical version lives at ~/.claude/PAI/Algorithm/v{LATEST}.md
 * (CC-only) — if present, we point the model at it for deeper reference.
 */
export function buildAlgorithmContext(tier: EffortTier, modelLabel?: string, cwd?: string): string {
	const spec = TIER_SPECS[tier];
	const ccVersion = getCanonicalAlgorithmVersion();
	const referenceLine = ccVersion
		? `Full canonical doctrine: ~/.claude/PAI/Algorithm/v${ccVersion}.md (CC-side authoritative). Read on demand for ambiguous cases.`
		: `(No CC-side doctrine file detected — this block is the source of truth for this session.)`;

	// Non-Anthropic-family hint — prepended to the doctrine when the session
	// model isn't trained on Claude conventions. Adds ~700 bytes when active,
	// 0 bytes for Anthropic-family sessions (ISC-18).
	const familyHint = modelLabel && !isAnthropicFamily(modelLabel)
		? buildModelFamilyHint(modelLabel, cwd)
		: "";

	// E1 fast-path — stay light, preserve <90s budget
	if (tier === "e1") {
		return `
<pai-algorithm tier="e1">
## PAI Algorithm — Fast Path (E1, ${spec.budget})

Single-pass execution. Observe → Think → Execute → Verify. No ISA file, no manifest.

- Restate intent in one sentence.
- Name 2-4 binary success checks before acting.
- After every change, run a tool call that proves it worked (Read after Write, Bash output check, etc.).
- "Should work" is NOT verification.

${referenceLine}
</pai-algorithm>
`;
	}

	// E2+ — full doctrine compression
	return `
<pai-algorithm tier="${tier}">
${familyHint}## PAI Algorithm — Structured Execution (${tier.toUpperCase()}, ${spec.budget})

> **Doctrine:** Every Algorithm run transitions from CURRENT STATE to IDEAL STATE. The mechanism: articulate ideal state as testable criteria (ISCs), pursue them through phases, verify each is met. Goal: euphoric surprise on convergence — the user instantly recognizes truth they couldn't have predicted.

${referenceLine}

### Tier Floors (HARD where marked)

- **Time budget:** ${spec.budget} (hard ceiling).
- **ISC floor:** ≥${spec.iscFloor} criteria (soft).
- **Thinking floor:** ≥${spec.thinkingFloor} thinking capabilities invoked (HARD — non-relaxable).
- **Delegation floor:** ≥${spec.delegationFloor} delegation patterns invoked (soft, "show your math" if under).

### Phase 1 — OBSERVE

1. **🎯 INTENT ECHO (FIRST):** restate the user's request in ONE sentence. If you cannot, re-read their message.
2. **🔎 REVERSE ENGINEER:** explicit wants, explicit not-wanted, implied not-wanted, urgency signal — one bullet each.
3. **🚦 PREFLIGHT GATES (fire all that match):**
   - **A: Diagnostic** — bug-fix → reproduce the failure BEFORE reading suspect code.
   - **B: Deploy/API** — confirm credentials and CLI tools exist.
   - **C: External service** — load relevant skill context.
   - **D: Research** — search docs before code archaeology on unfamiliar APIs.
4. **🔁 REPRODUCE-FIRST (blocking if Gate A fired):** capture artifact (curl output, screenshot, stderr, failing test output) BEFORE Read/Grep on suspect path.
5. **💪🏼 EFFORT:** confirm tier (currently ${tier.toUpperCase()}). Override hierarchy: explicit /eN > classifier > context > auto.
6. **🏹 CAPABILITIES SELECTED:** name each capability and its target phase. Naming is a binding commitment to invoke it via the matching Pi tool — text-only is dishonest. **Thinking capability vocabulary is a CLOSED ENUMERATION (use names verbatim):**

   | Name (verbatim) | How to invoke in this Pi session |
   |-----------------|----------------------------------|
   | IterativeDepth | \`pai_skill name="IterativeDepth"\` |
   | ApertureOscillation | \`pai_skill name="ApertureOscillation"\` |
   | FeedbackMemoryConsult | grep \`~/.claude/projects/-home-lars/memory/feedback_*.md\` (in-context) |
   | Advisor | \`advisor_check\` tool |
   | ReReadCheck | re-read user's last message verbatim before \`phase: complete\` (in-context) |
   | FirstPrinciples | \`pai_skill name="FirstPrinciples"\` |
   | SystemsThinking | \`pai_skill name="SystemsThinking"\` |
   | RootCauseAnalysis | \`pai_skill name="RootCauseAnalysis"\` |
   | Council | \`pai_skill name="Council"\` |
   | RedTeam | \`pai_skill name="RedTeam"\` |
   | Science | \`pai_skill name="Science"\` |
   | BeCreative | \`pai_skill name="BeCreative"\` |
   | Ideate | \`pai_skill name="Ideate"\` |
   | BitterPillEngineering | \`pai_skill name="BitterPillEngineering"\` |
   | Evals | \`pai_skill name="Evals"\` |
   | WorldThreatModel | \`pai_skill name="WorldThreatModel"\` |
   | Fabric patterns | \`pai_skill name="Fabric" args="<pattern>"\` |
   | ContextSearch | \`pai_skill name="ContextSearch"\` |
   | ISA | \`isa_scaffold\` / \`isa_mark_isc\` / \`isa_append_decision\` / \`isa_append_changelog\` / \`isa_check_completeness\` |

   Delegation capabilities (auto-include thresholds in parens):
   - **Forge** (E3+ coding) → \`forge_code\` tool. Cross-vendor code producer (GPT-5.4 by default; Gemini fallback). Use for substantial coding tasks where another vendor's lineage is materially valuable, OR when whole-project context fits Forge's window better than yours.
   - **Cato** (E4/E5 mandatory) → \`cato_audit\` tool. Cross-vendor read-only audit before \`phase: complete\`.
   - **Anvil** (no Pi tool yet) — Kimi K2.6 long-context coder. Skip if not present.

   Inventing generic labels ("decomposition", "tradeoff analysis", "deep reasoning") is a PHANTOM and does NOT count toward the floor. New names require Algorithm version bump, never ad-hoc invention.

7. **Build ISCs.** Apply the **Splitting Test** to every criterion:
   - **Granularity rule:** each ISC = one binary tool probe (Read/Grep/Bash/curl/screenshot returns yes/no). If you can't name the probe, split.
   - Split when: "and"/"with" joins two things; independent failure possible; scope words ("all", "every"); domain boundary crosses (UI/API/data/logic).
   - Format: \`- [ ] ISC-N: criterion text\`. IDs never re-number on edit (splits become ISC-N.M).
   - **Anti-criteria (≥1 required):** \`- [ ] ISC-N: Anti: <what must NOT happen>\`.
   - **Antecedents (≥1 required when goal is experiential):** \`- [ ] ISC-N: Antecedent: <precondition>\`.

8. **ISC quality gates** (all must pass before THINK):
   - Granularity: every ISC has a nameable single-tool probe.
   - Tier ISC floor: ≥${spec.iscFloor} (soft).
   - Thinking floor: ≥${spec.thinkingFloor} thinking caps from closed list (HARD).
   - Delegation floor: ≥${spec.delegationFloor} (soft, justify if under).

### Phase 2 — THINK

- **🎲 RISKIEST ASSUMPTIONS:** what the work depends on being true.
- **⚰️ PREMORTEM:** failure modes the work must withstand.
- **☑️ PREREQUISITES:** blockers, incorporating preflight findings.
- **🎯 EUPHORIC SURPRISE PREDICTION (E2+):** if every ISC passes, what will the user instantly recognize as true that they couldn't have predicted? Score 1-10. If you can't name an insight, predict ≤6.
- Re-apply Splitting Test on ISCs. Add criteria for premortem failure modes.

### Phase 3 — PLAN

- **📐 SCOPE:** depth | breadth | breadth-then-depth, with 8-word justification.
- **📦 DELIVERABLE MANIFEST (MANDATORY when 2+ explicit sub-tasks):** enumerate D1..DN, each quoting distinctive phrasing from the user. Each maps to ≥1 ISC.
- **📐 DELEGATION GATE (before spawning any agent):** "Can I do this with Glob+Grep in <30s?" YES → do it directly. NEVER delegate directed lookups.
- **🚀 PARALLELISM SCAN:** default-on for research, multi-URL probes, independent-file edits. Default-off for sequential chains and single-file surgical edits.

### Phase 4 — BUILD

- Invoke each selected capability via tool call (Skill or pi.spawn). Text-only is NOT invocation.
- **🩻 ROOT-CAUSE-AT-INGESTION:** before any output-side fix, ask: where does this bad state enter? If fixing at ingestion makes 3 similar bugs disappear, move the fix upstream. For UI bugs, trace display-down (Reproduce-First forces it).

### Phase 5 — EXECUTE

- Execute work. As each criterion passes, IMMEDIATELY mark \`- [ ]\` → \`- [x]\` and update progress.
- **🧪 INLINE VERIFICATION MANDATE:** no ISC may transition to [x] without verification evidence in the same or immediately-following tool block.

  | ISC type | Minimum verification |
  |----------|---------------------|
  | File write | Read the file, confirm content |
  | Code edit | Grep for new symbol, or Read range |
  | Command exec | Bash with checked output |
  | HTTP/API | curl -i, status + body shape |
  | UI change | Screenshot at target route |
  | Schema/DB | SELECT confirming migration |
  | Config/env | Read-back of file, confirm value |

- **Forbidden language:** "should work", "should be", "expected to", "the change is in place" (without Read/Grep), "done" (without tool evidence), "no errors" (without the actual log).

### Phase 6 — VERIFY

Four rules:

**Rule 1 — Live-Probe for User-Facing Artifacts.** Mark passed ONLY with tool-verified probe evidence. "Should work / looks fine / tests pass" are NOT evidence for user-facing criteria. Probe-impossible escape: \`[DEFERRED-VERIFY]\` with required follow-up task ID — never a bare [x].

**Rule 2 — Commitment-Boundary Advisor (E2+).** Call \`advisor_check\` at: (a) before committing to an approach (after PLAN, before BUILD), (b) when stuck after two distinct attempts on the same problem, (c) once before \`phase: complete\`. Pass concrete \`task\` + \`question\` + ISA path in \`context_paths\`. Verdict \`concerns\` or \`disagree\` → do NOT silently override; surface to user.

**Rule 2a — Cross-Vendor Audit (E4/E5 only).** After advisor returns and before \`phase: complete\`, invoke \`cato_audit\` with the ISA path. Cato runs on a different provider (GPT/Gemini by default) so blind spots inherent to one vendor don't propagate. Verdict \`fail\` or any \`critical_findings\` → BLOCK \`phase: complete\` and return to BUILD/EXECUTE.

**Rule 3 — Conflict Surfacing.** If empirical results contradict advisor or Cato output, do NOT silently switch — re-call with the conflict surfaced. Hard cap: 2 re-calls on same conflict, then escalate to user.

**Verification output:**
\`\`\`
✅ VERIFICATION:
 ISC-N: [method used] — [evidence summary]
 Coverage: N/N passed (N tool-verified, N inspection)
\`\`\`

**🔄 RE-READ CHECK (MANDATORY at every tier).** Final gate: re-read the user's last message verbatim, enumerate every explicit ask against what shipped. ANY ✗ blocks completion.
\`\`\`
🔄 RE-READ:
 🔄 [ask 1 — quote distinctive phrasing]: [✓ addressed | ✗ missed | SKIP reason]
\`\`\`

**📦 DELIVERABLE COMPLIANCE.** Check each D1..DN against shipped work.

### Phase 7 — LEARN

- 🧠 What should I have done differently?
- 🧠 What would a smarter algorithm have done?
- 🧠 Did preflight gates fire? Useful or wasted effort?
- 🧠 Did the Verification Doctrine fire? Did it catch anything?

**Learning Router** — for each candidate learning: classify (knowledge/rule/gotcha/state/business/identity/doctrine/permission), then route. Default disposition: SKIP. Only keep what's surprising or non-obvious.

### Pi-Specific Adaptations (vs CC Algorithm)

The full v6.3.0 was designed for Claude Code with hooks, the ISA Skill, Forge, Cato, and Sonnet-classifier subprocesses. Pi has none of those. Substitutions:

- **ISA Skill (Scaffold/Append/Reconcile/CheckCompleteness)** → Pi has dedicated ISA tools — use them, do NOT free-form-edit the ISA file:
  - \`isa_scaffold\` at OBSERVE for E2+ — writes the twelve-section template at \`.pi/ISA.md\` with frontmatter (\`task\`, \`slug\`, \`effort\`, \`phase\`, \`progress\`, \`started\`, \`updated\`).
  - \`isa_update_frontmatter\` on every phase transition — pass \`{ phase: "<new>" }\`. Auto-bumps \`updated\`.
  - \`isa_mark_isc\` when an ISC passes — toggles \`[ ]\`→\`[x]\`, refreshes \`progress:\`, optionally writes the Verification entry in the same call.
  - \`isa_append_decision\` for any decision in any phase. Use \`refined: true\` when a prior decision is being sharpened.
  - \`isa_append_changelog\` at LEARN — refuses partial entries; supply all four fields (\`conjectured\`, \`refuted_by\`, \`learned\`, \`criterion_now\`).
  - \`isa_check_completeness\` before declaring \`phase: complete\` — pass current tier; blocks completion if required sections per tier are missing.
  - For ad-hoc work that doesn't belong to a persistent project, write the ISA directly to \`~/.pai/MEMORY/WORK/{slug}/ISA.md\` via Edit/Write — the \`isa_*\` tools default to \`.pi/ISA.md\` (project home).
- **Voice curl** → invoke the \`voice_notify\` Pi tool with the same phase-transition messages ("Entering the Algorithm", "Entering the Observe phase.", etc.). The tool no-ops silently if voice isn't configured, so it's safe to call unconditionally at E2+.
- **Hook-driven phase sync** → just announce phase transitions in your output. The kitty-tab integration doesn't exist in Pi.
- **Skill primitive** → invoke a PAI skill via the \`pai_skill\` tool — pass \`name\` (e.g. "Architecture", "DeepDebug", "Personal/daily") and optional \`args\`. Returns SKILL.md content as tool result. Use this whenever you select a capability from the closed enumeration that has a backing skill.
- **Advisor (Rule 2)** → \`advisor_check\` Pi tool. Spawns a separate model subprocess with structured prompt — returns verdict + concerns + recommendations.
- **Cato cross-vendor audit (Rule 2a, E4/E5)** → \`cato_audit\` Pi tool. Spawns a different provider (GPT or Gemini-via-Vertex by default) read-only. Verdict structure: pass | concerns | fail.
- **Forge code producer (auto-include at E3+ coding tasks)** → \`forge_code\` Pi tool. Spawns a different provider (GPT-5.4 by default; Gemini fallback). Pass concrete \`task\` + \`context_paths\`. Receives unified diff or fenced file blocks back. Sister to Cato — Cato audits, Forge writes.
- **Mode classifier** → model-call.ts fast role with heuristic fail-safe. Tier source recorded in \`~/.pai/data/algo-feedback.jsonl\` as \`source: classifier|fail-safe|heuristic|explicit\`.
- **Reflection JSONL** → the Pi extension auto-captures execution metrics in \`~/.pai/data/algo-feedback.jsonl\`; you don't need to write reflections manually.

### Output Format (MANDATORY closing block)

Every Algorithm run ends with:

\`\`\`
━━━ 📃 SUMMARY ━━━

🔄 ITERATION on: [16 words of context — only on follow-ups]
📃 CONTENT: [up to 128 lines]
🖊️ STORY: [4 8-word Paul-Graham bullets: problem, what we did, how it went, what's next]
🗣️ [DA name]: [8-16 word summary]
\`\`\`

After this block: nothing.

</pai-algorithm>
`;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function getAlgoState(): AlgoState {
	return { ...state };
}

export function setMode(mode: AlgoMode) {
	state.mode = mode;
}

export function setForceTier(tier: EffortTier | null) {
	state.forceTier = tier;
}

// ── Extension Registration ───────────────────────────────────────────────────

export function registerAlgorithm(pi: ExtensionAPI) {
	// Load feedback history on startup
	loadFeedback();

	// Inject algorithm context before agent starts
	pi.on("before_agent_start", async (event, ctx) => {
		if (state.mode === "off") {
			state.lastDetected = null;
			state.lastTier = null;
			return;
		}

		const classification = await classifyPrompt(event.prompt);
		const detected = classification.mode;
		const detectedTier = classification.tier;
		state.lastDetected = detected;
		state.lastPrompt = event.prompt;
		state.lastPromptTime = Date.now();
		state.lastClassifierSource = classification.source;
		state.lastClassifierReason = classification.reason;

		// Determine if we should inject
		const shouldInject =
			state.mode === "always" ||
			(state.mode === "auto" && detected === "algorithm");

		if (!shouldInject) {
			state.lastTier = null;
			return;
		}

		// Resolve tier: forced > feedback-adjusted > detected
		const promptWords = event.prompt.trim().split(/\s+/).length;
		const adjustedTier = state.forceTier ?? feedbackAdjustedTier(detectedTier, promptWords);
		state.lastTier = adjustedTier;

		// Build and inject algorithm context + project ISA. Pass the current model
		// label so non-Anthropic-family sessions get the doctrine-discipline hint
		// prepended (ISC-16, 17, 18).
		const modelLabel = ctx?.model
			? `${(ctx.model as { provider?: string }).provider ?? ""}/${(ctx.model as { id?: string }).id ?? ""}`
			: undefined;
		const algoContext = buildAlgorithmContext(adjustedTier, modelLabel, ctx.cwd);
		const isaContext = buildISAContext(ctx.cwd) || "";
		const newPrompt = event.systemPrompt + "\n\n" + algoContext + isaContext;

		// Diagnostic — log every injection so we can confirm doctrine actually
		// reaches the model. ~/.pai/data/algo-injection.jsonl is append-only.
		try {
			mkdirSync(join(homedir(), ".pai", "data"), { recursive: true });
			appendFileSync(
				join(homedir(), ".pai", "data", "algo-injection.jsonl"),
				JSON.stringify({
					ts: new Date().toISOString(),
					tier: adjustedTier,
					source: classification.source,
					prompt_words: promptWords,
					base_prompt_len: event.systemPrompt.length,
					injected_total_len: newPrompt.length,
					algo_block_len: algoContext.length,
					isa_block_len: isaContext.length,
					algo_block_head: algoContext.slice(0, 200),
				}) + "\n",
			);
		} catch {}

		return { systemPrompt: newPrompt };
	});

	// Collect feedback after agent completes
	pi.on("agent_end", async (event, ctx) => {
		if (!state.lastTier || !state.lastPromptTime) return;

		const messages = event.messages || [];
		const assistantMsgs = messages.filter((m: any) => m.role === "assistant");
		const toolResults = messages.filter((m: any) => m.role === "toolResult");

		const turns = assistantMsgs.length;
		const totalTokens = assistantMsgs.reduce((sum: number, m: any) =>
			sum + (m.usage?.output || 0), 0);
		const tools = toolResults.length;
		const durationMs = Date.now() - state.lastPromptTime;
		const promptWords = (state.lastPrompt || "").trim().split(/\s+/).length;

		const idealTier = computeIdealTier(turns, totalTokens, tools, durationMs);

		appendFeedback({
			ts: Date.now(),
			promptWords,
			detectedTier: state.lastTier,
			actualTurns: turns,
			actualTokens: totalTokens,
			actualTools: tools,
			durationMs,
			idealTier,
			source: state.lastClassifierSource,
		});

		// CC-aligned reflection — written to ~/.claude/PAI/MEMORY/LEARNING/REFLECTIONS/algorithm-reflections.jsonl
		// so PAIUpgrade.MineReflections can mine Pi runs alongside CC runs.
		const isaSnap = ctx?.cwd
			? snapshotISAStateForReflection(ctx.cwd)
			: { prdId: null, criteriaCount: 0, criteriaPassed: 0, criteriaFailed: 0 };
		const tierBudgetMs: Record<EffortTier, number> = {
			e1: 90_000,
			e2: 180_000,
			e3: 600_000,
			e4: 1_800_000,
			e5: 7_200_000,
		};
		const reflection: ReflectionRecord = {
			timestamp: new Date().toISOString(),
			effort_level: state.lastTier,
			effort_source:
				state.lastClassifierSource === "explicit"
					? "explicit"
					: state.lastClassifierSource === "classifier"
						? "classifier"
						: "auto",
			task_description: (state.lastPrompt || "").slice(0, 240),
			criteria_count: isaSnap.criteriaCount,
			criteria_passed: isaSnap.criteriaPassed,
			criteria_failed: isaSnap.criteriaFailed,
			prd_id: isaSnap.prdId,
			implied_sentiment: null,
			satisfaction_prediction: null,
			reflection_q1: null,
			reflection_q2: null,
			reflection_q3: null,
			knowledge_flags: 0,
			within_budget: durationMs <= tierBudgetMs[state.lastTier],
			living_doc_refinements: 0,
			doctrine_fired: readDoctrineFired(state.lastPromptTime),
			source: "pi",
		};
		appendReflection(reflection);
	});

	// /algo command
	pi.registerCommand("algo", {
		description: "PAI Algorithm — toggle mode or set effort tier",
		handler: async (args, ctx) => {
			const arg = args?.trim().toLowerCase();

			if (!arg || arg === "status") {
				const modeLabel = state.mode === "auto" ? "auto (detect per prompt)" :
					state.mode === "always" ? "always on" : "off";
				const tierLabel = state.forceTier ? `forced ${state.forceTier.toUpperCase()}` : "auto-detect";
				const lastLabel = state.lastDetected
					? `${state.lastDetected}${state.lastTier ? ` @ ${state.lastTier.toUpperCase()}` : ""}`
					: "none";
				const fbCount = feedbackHistory.length;
				const fbInfo = fbCount > 0 ? ` | Feedback: ${fbCount} records` : "";
				const sourceLabel = state.lastClassifierSource ? ` | Source: ${state.lastClassifierSource}` : "";
				ctx.ui.notify(
					`Algorithm: ${modeLabel} | Tier: ${tierLabel} | Last: ${lastLabel}${sourceLabel}${fbInfo}`,
					"info"
				);
				return;
			}

			// Verify command — full diagnostic: confirm classifier, doctrine, advisor, cato are wired
			if (arg === "verify" || arg === "diagnose" || arg === "doctor") {
				const lines: string[] = [];
				lines.push(`Algorithm mode: ${state.mode}, tier: ${state.forceTier ?? "auto"}`);
				lines.push(`Last classified: ${state.lastDetected ?? "none"} @ ${state.lastTier ?? "—"} (source: ${state.lastClassifierSource ?? "—"}, reason: ${state.lastClassifierReason ?? "—"})`);

				// Read recent injection log
				try {
					const injectionLog = join(homedir(), ".pai", "data", "algo-injection.jsonl");
					if (existsSync(injectionLog)) {
						const lines2 = readFileSync(injectionLog, "utf-8").trim().split("\n");
						const recent = lines2.slice(-3).map((l) => {
							try {
								const e = JSON.parse(l) as { ts: string; tier: string; algo_block_len: number; injected_total_len: number };
								return `  ${e.ts.slice(11, 19)} ${e.tier} doctrine=${e.algo_block_len}b total=${e.injected_total_len}b`;
							} catch {
								return "  (parse error)";
							}
						});
						lines.push(`Recent injections (${lines2.length} total):`);
						lines.push(...recent);
					} else {
						lines.push("Recent injections: (no log yet — run a prompt first)");
					}
				} catch {}

				// Recent classifier sources from feedback
				const recentFb = feedbackHistory.slice(-10);
				if (recentFb.length > 0) {
					const sources: Record<string, number> = {};
					for (const r of recentFb) {
						const s = r.source ?? "unknown";
						sources[s] = (sources[s] ?? 0) + 1;
					}
					const sourceStr = Object.entries(sources).map(([k, v]) => `${k}:${v}`).join(", ");
					lines.push(`Recent (last 10) classifier sources: ${sourceStr}`);
				}

				// Recent model-call latencies
				try {
					const modelCallLog = join(homedir(), ".pai", "data", "model-call.jsonl");
					if (existsSync(modelCallLog)) {
						const lines2 = readFileSync(modelCallLog, "utf-8").trim().split("\n");
						const recent = lines2.slice(-10);
						let okCount = 0;
						let cachedCount = 0;
						let totalLatency = 0;
						for (const l of recent) {
							try {
								const e = JSON.parse(l) as { ok: boolean; cached: boolean; latencyMs: number };
								if (e.ok) okCount++;
								if (e.cached) cachedCount++;
								totalLatency += e.latencyMs;
							} catch {}
						}
						lines.push(`model-call.ts last 10: ${okCount}/10 ok, ${cachedCount} cached, avg ${Math.round(totalLatency / Math.max(recent.length, 1))}ms`);
					} else {
						lines.push("model-call.ts log: empty (subprocess never fired — extension may not be loaded)");
					}
				} catch {}

				// Recent doctrine violations
				try {
					const violationLog = join(homedir(), ".pai", "data", "verification-violations.jsonl");
					if (existsSync(violationLog)) {
						const lines2 = readFileSync(violationLog, "utf-8").trim().split("\n");
						const doctrineViolations = lines2.filter((l) => l.includes("doctrine-format-violation")).slice(-5);
						if (doctrineViolations.length > 0) {
							lines.push(`Recent doctrine-format violations (${doctrineViolations.length}):`);
							for (const v of doctrineViolations) {
								try {
									const e = JSON.parse(v) as { ts: string; tier: string; missing: string[]; score: number };
									lines.push(`  ${e.ts.slice(11, 19)} ${e.tier} score=${e.score}/4 missing: ${e.missing.join(", ")}`);
								} catch {}
							}
						} else {
							lines.push("No doctrine-format violations recorded.");
						}
					}
				} catch {}

				ctx.ui.notify(lines.join("\n"), "info");
				return;
			}

			// Mode commands
			if (arg === "off") {
				state.mode = "off";
				state.forceTier = null;
				ctx.ui.notify("Algorithm OFF — no structured execution", "info");
				return;
			}
			if (arg === "auto") {
				state.mode = "auto";
				state.forceTier = null;
				ctx.ui.notify("Algorithm AUTO — activates for complex tasks", "info");
				return;
			}
			if (arg === "on" || arg === "always") {
				state.mode = "always";
				ctx.ui.notify("Algorithm ALWAYS — structured execution for every prompt", "info");
				return;
			}

			// Tier commands: /algo e1, /algo e3, etc.
			const tierMatch = arg.match(/^e([1-5])$/);
			if (tierMatch) {
				const tier = `e${tierMatch[1]}` as EffortTier;
				state.mode = "always";
				state.forceTier = tier;
				ctx.ui.notify(`Algorithm ON @ ${tier.toUpperCase()} — forced tier for all prompts`, "info");
				return;
			}

			// Reset tier
			if (arg === "reset" || arg === "clear") {
				state.forceTier = null;
				ctx.ui.notify("Tier reset to auto-detect", "info");
				return;
			}

			// Stats command
			if (arg === "stats" || arg === "feedback") {
				if (feedbackHistory.length === 0) {
					ctx.ui.notify("No feedback data yet. Use pi normally and data accumulates.", "info");
					return;
				}
				const total = feedbackHistory.length;
				const upgrades = feedbackHistory.filter(r => tierNum(r.idealTier) > tierNum(r.detectedTier)).length;
				const downgrades = feedbackHistory.filter(r => tierNum(r.idealTier) < tierNum(r.detectedTier)).length;
				const accurate = total - upgrades - downgrades;
				const avgTurns = (feedbackHistory.reduce((s, r) => s + r.actualTurns, 0) / total).toFixed(1);
				const avgTools = (feedbackHistory.reduce((s, r) => s + r.actualTools, 0) / total).toFixed(1);
				ctx.ui.notify(
					`Feedback: ${total} records | Accuracy: ${Math.round(accurate/total*100)}% | Under: ${upgrades} | Over: ${downgrades} | Avg turns: ${avgTurns} | Avg tools: ${avgTools}`,
					"info"
				);
				return;
			}

			ctx.ui.notify(
				"Usage: /algo [off|auto|on|e1|e2|e3|e4|e5|reset|status|verify|stats]",
				"warning"
			);
		},
	});
}
