/**
 * doctrine-parser.ts — structured parser for PAI Algorithm doctrine output.
 *
 * The doctrine-enforcer used to scan with ad-hoc regexes that were brittle
 * across model families. This module replaces that with a single pure parser
 * consumed by every compliance check (phantom-capability, thinking-floor,
 * deliverable-manifest, summary-block, intent-echo).
 *
 * STRICT INVARIANT: pure function, zero I/O, zero process.env. Tests can run
 * it on string fixtures without setup.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type EffortTier = "e1" | "e2" | "e3" | "e4" | "e5";

export type CapabilityKind = "thinking" | "delegation" | "unknown";

export interface ParsedCapability {
	/** Canonical name (verbatim match against the closed enumeration if `kind=thinking`). */
	name: string;
	/** Raw text of the line, trimmed. */
	rawLine: string;
	kind: CapabilityKind;
	/** True iff `kind=thinking` AND `name` does NOT appear in CLOSED_THINKING_LIST. */
	isPhantom: boolean;
}

export interface ParsedDoctrineOutput {
	/** Phase headers detected in order: `["OBSERVE", "THINK", ...]`. May contain duplicates. */
	phaseHeaders: string[];
	/** First-line `🎯 INTENT: ...` echo if present. */
	intentEcho: string | null;
	/** Capabilities under `🏹 CAPABILITIES SELECTED:`. */
	capabilities: ParsedCapability[];
	/** Counts derived from capabilities. */
	capabilityCounts: {
		thinking: number;
		delegation: number;
		phantom: number;
	};
	/** Sub-tasks under `📦 DELIVERABLE MANIFEST:`. */
	deliverableManifest: string[];
	/** Whether the closing `━━━ 📃 SUMMARY ━━━` block is present. */
	hasSummaryBlock: boolean;
	/** True if the response opens a phase header (vs. freeform reply). */
	enteredAlgorithm: boolean;
}

// ── Closed enumeration (mirrors v6.3.0 § Capability-Name Audit Gate) ────────

/**
 * The 19-entry closed enumeration of THINKING capabilities. Names MUST come
 * verbatim from this list; case-insensitive comparison. Anything else under
 * 🏹 CAPABILITIES SELECTED that doesn't match a delegation name is a phantom.
 */
export const CLOSED_THINKING_LIST: readonly string[] = [
	"IterativeDepth",
	"ApertureOscillation",
	"FeedbackMemoryConsult",
	"Advisor",
	"ReReadCheck",
	"FirstPrinciples",
	"SystemsThinking",
	"RootCauseAnalysis",
	"Council",
	"RedTeam",
	"Science",
	"BeCreative",
	"Ideate",
	"BitterPillEngineering",
	"Evals",
	"WorldThreatModel",
	"Fabric patterns",
	"ContextSearch",
	"ISA",
] as const;

/**
 * Recognized DELEGATION capabilities — these are valid under 🏹 CAPABILITIES
 * SELECTED but do NOT count toward the thinking floor. Anything not in either
 * list is a phantom.
 */
export const DELEGATION_LIST: readonly string[] = [
	"Forge",
	"Anvil",
	"Cato",
	"Engineer",
	"Architect",
	"Algorithm",
	"Explore",
	"Plan",
	"Designer",
	"BrowserAgent",
	"QATester",
	"UIReviewer",
	"Pentester",
	"Silas",
	"Artist",
	"Research",
	"general-purpose",
	"Agent Teams",
	"Custom Agents",
	"Background Agents",
	"Worktree Isolation",
	"ClaudeResearcher",
	"PerplexityResearcher",
	"GrokResearcher",
	"GeminiResearcher",
	"CodexResearcher",
	"advisor_check",
	"cato_audit",
	"pai_skill",
] as const;

const THINKING_LOWER = new Set(CLOSED_THINKING_LIST.map((n) => n.toLowerCase()));
const DELEGATION_LOWER = new Set(DELEGATION_LIST.map((n) => n.toLowerCase()));

// ── Phase headers ────────────────────────────────────────────────────────────

const PHASES = ["OBSERVE", "THINK", "PLAN", "BUILD", "EXECUTE", "VERIFY", "LEARN", "SUMMARY"] as const;

/**
 * Match `━━━ 👁️ OBSERVE ━━━` AND paraphrased forms `━━━ OBSERVE ━━━`. The
 * non-greedy `[^━\n]*` allows arbitrary emoji/whitespace between the rules.
 */
const PHASE_HEADER_RX = /━━━[^━\n]*\b(OBSERVE|THINK|PLAN|BUILD|EXECUTE|VERIFY|LEARN|SUMMARY)\b[^━\n]*━━━/gi;

const INTENT_ECHO_RX = /🎯\s*INTENT:\s*([^\n]+)/i;
const SUMMARY_BLOCK_RX = /━━━\s*📃?\s*SUMMARY\s*━━━/i;

// ── Capabilities block extraction ────────────────────────────────────────────

/**
 * Find the `🏹 CAPABILITIES SELECTED:` block and return its sub-lines (the
 * lines immediately following, prefixed with `🏹` or `-` or `*`). Stops at the
 * next blank line, next emoji-bullet of a different kind, or next phase
 * header.
 */
function extractCapabilitiesBlock(text: string): string[] {
	const lines = text.split(/\r?\n/);
	let inBlock = false;
	const out: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!inBlock) {
			if (/🏹\s*CAPABILITIES\s+SELECTED/i.test(line)) {
				inBlock = true;
				continue;
			}
		} else {
			// Stop at blank line, phase header, or different bullet emoji
			if (line.trim() === "") break;
			if (/━━━.*━━━/.test(line)) break;
			if (/^\s*(?:🏹|-|\*|•)/.test(line)) {
				out.push(line);
			} else if (/^\s+/.test(line)) {
				// Continuation/indented prose of a previous bullet — keep
				out.push(line);
			} else {
				// Unrelated content — block ended
				break;
			}
		}
	}
	return out;
}

/**
 * Pull capability names out of bullet lines. Heuristics:
 *   - Bold-wrapped name: `🏹 **FirstPrinciples** → THINK | …` → "FirstPrinciples"
 *   - Plain after bullet: `🏹 FirstPrinciples → THINK | …` → "FirstPrinciples"
 *   - Multi-word names ("Fabric patterns", "Custom Agents", "Agent Teams") need
 *     greedy-then-shrinking match against the known lists.
 */
function extractCapabilityName(rawLine: string): string {
	// Strip leading bullet/emoji
	let s = rawLine.replace(/^\s*(?:🏹|-|\*|•)\s*/, "");

	// Prefer bold-wrapped name
	const bold = s.match(/^\*\*([^*]+)\*\*/);
	if (bold) return bold[1].trim();

	// Otherwise, take prefix before the first arrow/colon/pipe/em-dash/dash
	const cut = s.split(/(?:→|->|\||:|—)/, 1)[0];
	let candidate = cut.trim();

	// If that prefix happens to start with a known multi-word name, prefer the longest match
	const lower = candidate.toLowerCase();
	for (const known of [...CLOSED_THINKING_LIST, ...DELEGATION_LIST]) {
		if (lower.startsWith(known.toLowerCase())) {
			return known;
		}
	}

	// Strip trailing punctuation/whitespace
	candidate = candidate.replace(/[\s\-_.,;]+$/, "");
	return candidate;
}

function classifyCapability(name: string): { kind: CapabilityKind; isPhantom: boolean } {
	const lower = name.toLowerCase();
	if (THINKING_LOWER.has(lower)) return { kind: "thinking", isPhantom: false };
	if (DELEGATION_LOWER.has(lower)) return { kind: "delegation", isPhantom: false };
	// Anything that looks like a thinking-cap intent (lowercase prose like "decomposition", "tradeoff analysis")
	// counts as phantom thinking. We classify all unknowns as phantom thinking, since the closed-enumeration
	// rule applies to thinking caps; unknown delegation just means a non-PAI agent name we don't track.
	return { kind: "thinking", isPhantom: true };
}

// ── Deliverable manifest ─────────────────────────────────────────────────────

function extractDeliverableManifest(text: string): string[] {
	const lines = text.split(/\r?\n/);
	let inBlock = false;
	const out: string[] = [];
	for (const line of lines) {
		if (!inBlock) {
			if (/📦\s*DELIVERABLE\s+MANIFEST/i.test(line)) {
				inBlock = true;
				continue;
			}
		} else {
			if (line.trim() === "") break;
			if (/━━━.*━━━/.test(line)) break;
			const m = line.match(/^\s*(?:📦|-|\*|•)\s*(?:D\d+:?\s*)?(.+)$/);
			if (m) {
				out.push(m[1].trim());
			} else if (/^\s+/.test(line)) {
				out.push(line.trim());
			} else {
				break;
			}
		}
	}
	return out;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function parseDoctrineOutput(text: string): ParsedDoctrineOutput {
	const phaseHeaders: string[] = [];
	for (const m of text.matchAll(PHASE_HEADER_RX)) {
		phaseHeaders.push(m[1].toUpperCase());
	}

	const intentMatch = text.match(INTENT_ECHO_RX);
	const intentEcho = intentMatch ? intentMatch[1].trim() : null;

	const capabilityLines = extractCapabilitiesBlock(text);
	const capabilities: ParsedCapability[] = capabilityLines
		.map((rawLine) => {
			const name = extractCapabilityName(rawLine);
			if (!name) return null;
			const { kind, isPhantom } = classifyCapability(name);
			return { name, rawLine: rawLine.trim(), kind, isPhantom };
		})
		.filter((c): c is ParsedCapability => c !== null);

	let thinkingCount = 0;
	let delegationCount = 0;
	let phantomCount = 0;
	for (const c of capabilities) {
		if (c.isPhantom) {
			phantomCount++;
			thinkingCount++; // phantoms claim to be thinking but don't count toward floor
		} else if (c.kind === "thinking") {
			thinkingCount++;
		} else if (c.kind === "delegation") {
			delegationCount++;
		}
	}

	const deliverableManifest = extractDeliverableManifest(text);
	const hasSummaryBlock = SUMMARY_BLOCK_RX.test(text);
	const enteredAlgorithm = phaseHeaders.length > 0;

	return {
		phaseHeaders,
		intentEcho,
		capabilities,
		capabilityCounts: {
			thinking: thinkingCount - phantomCount, // genuine thinking caps only
			delegation: delegationCount,
			phantom: phantomCount,
		},
		deliverableManifest,
		hasSummaryBlock,
		enteredAlgorithm,
	};
}

// ── Tier floor specs (mirrors algorithm.ts TIER_SPECS) ───────────────────────

export const TIER_THINKING_FLOORS: Record<EffortTier, number> = {
	e1: 0,
	e2: 2,
	e3: 4,
	e4: 6,
	e5: 8,
};

export interface FloorCheckResult {
	tier: EffortTier;
	declaredThinking: number;
	requiredThinking: number;
	met: boolean;
	declaredNames: string[];
	phantomNames: string[];
}

export function checkThinkingFloor(parsed: ParsedDoctrineOutput, tier: EffortTier): FloorCheckResult {
	const required = TIER_THINKING_FLOORS[tier];
	const declared = parsed.capabilityCounts.thinking;
	const declaredNames = parsed.capabilities
		.filter((c) => c.kind === "thinking" && !c.isPhantom)
		.map((c) => c.name);
	const phantomNames = parsed.capabilities.filter((c) => c.isPhantom).map((c) => c.name);
	return {
		tier,
		declaredThinking: declared,
		requiredThinking: required,
		met: declared >= required,
		declaredNames,
		phantomNames,
	};
}

// ── Multi-task prompt detection (used by Deliverable Manifest nudge) ─────────

const MULTI_ASK_NUMBERED_RX = /(?:^|\n)\s*(?:[1-9]|\d{2,})[.)]\s+\S/g;
const MULTI_ASK_AND_ALSO_RX = /\b(?:and also|also|plus also)\b/i;

export function detectMultiAskPrompt(prompt: string): { multiAsk: boolean; reasons: string[] } {
	const reasons: string[] = [];

	// Numbered list with at least 2 items
	const numbered = [...prompt.matchAll(MULTI_ASK_NUMBERED_RX)];
	if (numbered.length >= 2) reasons.push(`numbered-list:${numbered.length}`);

	// "and also" connector
	if (MULTI_ASK_AND_ALSO_RX.test(prompt)) reasons.push("and-also");

	// Multiple imperative sentences (heuristic: ≥2 verbs at sentence start)
	const sentences = prompt.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
	const imperativeStarters =
		/^(?:add|fix|implement|build|create|make|write|update|remove|delete|refactor|migrate|deploy|test|verify|check|review|analyze|investigate|design|wire|ship|land|run|configure|integrate|merge|extract)\b/i;
	const imperativeCount = sentences.filter((s) => imperativeStarters.test(s)).length;
	if (imperativeCount >= 2) reasons.push(`imperative-sentences:${imperativeCount}`);

	return { multiAsk: reasons.length > 0, reasons };
}

// ── ISC granularity heuristic ────────────────────────────────────────────────

export interface ISCGranularityFlag {
	iscId: string;
	criterion: string;
	confidence: "low" | "medium" | "high";
	reason: string;
}

const SCOPE_WORD_RX = /\b(?:all|every|complete|entire|whole|each)\b/i;
const SPLIT_AND_RX = /\s+and\s+/i;
const SPLIT_WITH_RX = /\s+with\s+/i;
const ISC_LINE_RX = /^-\s*\[[ x]\]\s*ISC-([\w.]+):\s*(.+)$/gm;

export function findGranularityFlags(isaContent: string): ISCGranularityFlag[] {
	const flags: ISCGranularityFlag[] = [];
	for (const m of isaContent.matchAll(ISC_LINE_RX)) {
		const iscId = m[1];
		let criterion = m[2].trim();

		// Skip Anti: and Antecedent: prefixes — these are doctrinal markers, not granularity violations
		if (/^(?:anti|antecedent):/i.test(criterion)) continue;

		// Skip [DROPPED — see Decisions] tombstones
		if (/^\[DROPPED\b/i.test(criterion)) continue;

		// Score
		const reasons: string[] = [];
		let confidence: "low" | "medium" | "high" | null = null;

		if (SCOPE_WORD_RX.test(criterion)) {
			reasons.push("scope-word");
			confidence = "high";
		}
		if (SPLIT_AND_RX.test(criterion)) {
			reasons.push("and-join");
			if (!confidence) confidence = "low";
		}
		if (SPLIT_WITH_RX.test(criterion)) {
			reasons.push("with-join");
			if (!confidence) confidence = "low";
		}
		// Both and+with → bump to medium
		if (reasons.includes("and-join") && reasons.includes("with-join")) confidence = "medium";

		if (confidence) {
			flags.push({
				iscId,
				criterion: criterion.slice(0, 240),
				confidence,
				reason: reasons.join(","),
			});
		}
	}
	return flags;
}
