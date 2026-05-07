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
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { buildISAContext } from "./isa.js";

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
}

/** Feedback history file */
const FEEDBACK_DIR = join(homedir(), ".pai", "data");
const FEEDBACK_FILE = join(FEEDBACK_DIR, "algo-feedback.jsonl");
const MAX_FEEDBACK_ENTRIES = 500;

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
 * Classify a user prompt into MINIMAL / NATIVE / ALGORITHM.
 * Lightweight heuristic — no external model call.
 */
function classifyPrompt(prompt: string): { mode: DetectedMode; tier: EffortTier } {
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

// ── Algorithm Context ────────────────────────────────────────────────────────

/**
 * Generate algorithm instructions proportional to the effort tier.
 */
function buildAlgorithmContext(tier: EffortTier): string {
	const base = `
<pai-algorithm tier="${tier}">
## PAI Algorithm — Structured Execution

Follow this phased approach for this task:

### Phase 1: OBSERVE
- Restate the user's intent in one sentence
- Identify what success looks like (criteria)
- Note risks and assumptions
- Check: do you have enough information to proceed? If not, ask.

### Phase 2: THINK
- What's the riskiest assumption?
- What could go wrong? (premortem)
- What approach will you take and why?
`;

	const extended = `
### Phase 3: PLAN
- Break work into steps
- Identify what can be parallelized
- Note dependencies between steps
- For each step: what tool verifies it worked?

### Phase 4: EXECUTE
- Do the work step by step
- After each step, verify it succeeded with a tool call (read, bash, etc.)
- Never claim something works without evidence

### Phase 5: VERIFY
- Re-read the user's original request
- Check each success criterion against actual results
- Use tool calls to prove each criterion is met
- "Should work" is NOT verification — run the actual check
`;

	const deep = `
### Phase 6: LEARN
- What would you do differently next time?
- Were there any surprises?
- Note any reusable patterns discovered

## Verification Doctrine
- Every claim must have tool-verified evidence
- Read files after writing them
- Run commands and check output
- Never use "should work" or "expected to" without proof
- If you can't verify something, say so explicitly

## Criteria Quality
- Each success criterion should be one binary check
- Split "X and Y" into separate criteria
- Name the tool that would verify each criterion

## Thinking Skills (invoke for complex analysis)
- **FirstPrinciples** — decompose to fundamental truths when stuck or facing constraints
- **SystemsThinking** — map feedback loops and leverage points for recurring/systemic problems
- **RootCauseAnalysis** — 5 Whys or Fishbone when diagnosing failures
- **RedTeam** — stress-test proposals before committing
- **DeepAnalysis** — map structure/flow/dependencies before acting on complex systems
- **Science** — hypothesis-test cycles when the answer isn't obvious
`;

	// E1: just base (observe + think)
	if (tier === "e1") {
		return base + "\nKeep execution fast. Observe briefly, think briefly, then execute and verify.\n</pai-algorithm>";
	}

	// E2: base + plan/execute/verify
	if (tier === "e2") {
		return base + extended + "</pai-algorithm>";
	}

	// E3+: full algorithm
	return base + extended + deep + "</pai-algorithm>";
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

		const { mode: detected, tier: detectedTier } = classifyPrompt(event.prompt);
		state.lastDetected = detected;
		state.lastPrompt = event.prompt;
		state.lastPromptTime = Date.now();

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

		// Build and inject algorithm context + project ISA
		const algoContext = buildAlgorithmContext(adjustedTier);
		const isaContext = buildISAContext(ctx.cwd) || "";
		const newPrompt = event.systemPrompt + "\n\n" + algoContext + isaContext;

		return { systemPrompt: newPrompt };
	});

	// Collect feedback after agent completes
	pi.on("agent_end", async (event) => {
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
		});
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
				ctx.ui.notify(
					`Algorithm: ${modeLabel} | Tier: ${tierLabel} | Last: ${lastLabel}${fbInfo}`,
					"info"
				);
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
				"Usage: /algo [off|auto|on|e1|e2|e3|e4|e5|reset|status]",
				"warning"
			);
		},
	});
}
