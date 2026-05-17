/**
 * signals.ts — claude-soul-style automated signal extraction.
 *
 * RATIONALE
 * Dream's analysis prompt is rich, but its inputs were aggregate metrics only
 * (tier accuracy, tool patterns) — never the *actual conversation* where a
 * user says "no", "actually", "stop". Without per-turn signal capture the
 * learning loop is blind to corrections.
 *
 * What this does
 *   On every agent_end:
 *     1. Inspect the last user message + last assistant message
 *     2. Classify the user reply as one or more typed signals:
 *        - correction      "no", "actually", "instead", "stop"
 *        - confusion       "?", "what do you mean", "huh", "i don't get"
 *        - gratitude       "thanks", "perfect", "exactly", "great"
 *        - restart         "let's start over", "redo", "from scratch"
 *        - success         marker phrases ("works", "fixed", "deployed")
 *        - frustration     "ugh", caps + exclamation density, "still broken"
 *     3. Append a typed record to ~/.pai/data/signals.jsonl
 *
 * Schema (one JSON line per signal):
 *   { ts, kind, evidence, prompt_excerpt, response_excerpt, session_id?, cwd }
 *
 * Reading
 *   - dream.ts gathers signals.jsonl in addition to algo-feedback.jsonl
 *   - applier.ts may write CORRECTIONS.md entries from clusters of correction
 *     signals
 *   - The data is intentionally additive — never deleted. Dream may downgrade
 *     a framework when correction signals contradict it.
 *
 * Privacy
 *   Signals capture excerpts (≤300 chars), not full transcripts. The vault is
 *   local-first, the file is local-only. Lars can clear it any time.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Paths ────────────────────────────────────────────────────────────────────

const DATA_DIR = join(homedir(), ".pai", "data");
const SIGNALS_FILE = join(DATA_DIR, "signals.jsonl");
const MAX_ENTRIES = 5000;

// ── Types ────────────────────────────────────────────────────────────────────

export type SignalKind =
	| "correction"
	| "confusion"
	| "gratitude"
	| "restart"
	| "success"
	| "frustration";

export interface SignalRecord {
	ts: string;
	kind: SignalKind;
	confidence: number; // 0..1
	evidence: string;   // pattern that matched
	prompt_excerpt: string;
	response_excerpt: string;
	session_id?: string;
	cwd: string;
}

// ── Pattern bank ─────────────────────────────────────────────────────────────

interface SignalPattern {
	kind: SignalKind;
	regex: RegExp;
	weight: number;
	evidence: string;
}

const PATTERNS: SignalPattern[] = [
	// CORRECTION — strongest learning signal
	{ kind: "correction", regex: /\b(no|nope|not\s+quite|that'?s\s+wrong|incorrect)\b/i, weight: 0.85, evidence: "negation" },
	{ kind: "correction", regex: /\b(actually|instead|rather)\b/i, weight: 0.7, evidence: "redirect" },
	{ kind: "correction", regex: /\b(stop|halt|wait)\b[!.,]/i, weight: 0.9, evidence: "halt" },
	{ kind: "correction", regex: /\bdon'?t\s+(do|use|run|call|make)\b/i, weight: 0.85, evidence: "prohibition" },

	// CONFUSION
	{ kind: "confusion", regex: /\?\?+/, weight: 0.6, evidence: "multi-question-mark" },
	{ kind: "confusion", regex: /\b(what\s+do\s+you\s+mean|i\s+don'?t\s+(get|understand)|huh|unclear)\b/i, weight: 0.85, evidence: "explicit-confusion" },
	{ kind: "confusion", regex: /\b(why\s+(did|are)\s+you|why\s+would\s+you)\b/i, weight: 0.7, evidence: "why-question" },

	// GRATITUDE — positive reinforcement
	{ kind: "gratitude", regex: /\b(thanks?|thank\s+you|thx|ty)\b/i, weight: 0.6, evidence: "thanks" },
	{ kind: "gratitude", regex: /\b(perfect|exactly|spot\s+on|nailed\s+it)\b/i, weight: 0.85, evidence: "affirmation" },
	{ kind: "gratitude", regex: /\b(great|awesome|amazing|excellent|love\s+it)\b/i, weight: 0.7, evidence: "praise" },

	// RESTART — strong dissatisfaction
	{ kind: "restart", regex: /\b(let'?s\s+(start\s+over|restart|begin\s+again))\b/i, weight: 0.9, evidence: "explicit-restart" },
	{ kind: "restart", regex: /\b(redo|do\s+it\s+again|from\s+scratch)\b/i, weight: 0.85, evidence: "redo" },
	{ kind: "restart", regex: /\b(scrap\s+(this|that|all)|throw\s+(this|that)\s+out)\b/i, weight: 0.85, evidence: "scrap" },

	// SUCCESS
	{ kind: "success", regex: /\b(works?|working|fixed|solved|done|shipped|deployed)\b/i, weight: 0.65, evidence: "completion" },
	{ kind: "success", regex: /\b(ship\s+it|merge\s+it|approved)\b/i, weight: 0.8, evidence: "ship-signal" },

	// FRUSTRATION
	{ kind: "frustration", regex: /\b(ugh|argh|wtf|seriously|come\s+on|jesus)\b/i, weight: 0.85, evidence: "exclamation" },
	{ kind: "frustration", regex: /\b(still\s+(broken|wrong|failing|not\s+working))\b/i, weight: 0.85, evidence: "still-broken" },
	{ kind: "frustration", regex: /\b(why\s+is\s+(this|it)\s+(so|still))\b/i, weight: 0.7, evidence: "lament" },
];

// ── Classification ───────────────────────────────────────────────────────────

/**
 * Run all patterns against `text` and return a list of (kind, confidence, evidence).
 * Multiple kinds may fire for one text. Confidence sums weights then clamps to 1.
 */
export function classifySignals(text: string): Array<Pick<SignalRecord, "kind" | "confidence" | "evidence">> {
	if (!text || typeof text !== "string") return [];
	const lower = text.toLowerCase();

	// Dampener: very short pure-acknowledgment ("ok", "k", "yes") shouldn't fire.
	if (lower.trim().length < 3) return [];

	const buckets = new Map<SignalKind, { confidence: number; evidence: string[] }>();

	for (const p of PATTERNS) {
		if (!p.regex.test(text)) continue;
		const cur = buckets.get(p.kind) ?? { confidence: 0, evidence: [] };
		cur.confidence = Math.min(1, cur.confidence + p.weight);
		cur.evidence.push(p.evidence);
		buckets.set(p.kind, cur);
	}

	const results: Array<Pick<SignalRecord, "kind" | "confidence" | "evidence">> = [];
	for (const [kind, { confidence, evidence }] of buckets) {
		results.push({ kind, confidence, evidence: evidence.join(",") });
	}
	return results;
}

// ── Persistence ──────────────────────────────────────────────────────────────

function ensureDataDir(): void {
	try {
		mkdirSync(DATA_DIR, { recursive: true });
	} catch {}
}

function appendSignal(record: SignalRecord): void {
	ensureDataDir();
	try {
		appendFileSync(SIGNALS_FILE, JSON.stringify(record) + "\n");
	} catch {}
	// Trim if over MAX_ENTRIES (cheap: read tail, slice, rewrite).
	try {
		const lines = readFileSync(SIGNALS_FILE, "utf-8").split("\n").filter((l) => l.startsWith("{"));
		if (lines.length > MAX_ENTRIES) {
			writeFileSync(SIGNALS_FILE, lines.slice(-MAX_ENTRIES).join("\n") + "\n");
		}
	} catch {}
}

// ── Stats / queries (consumed by dream.ts and applier.ts) ───────────────────

export interface SignalStats {
	total: number;
	byKind: Record<SignalKind, number>;
	last: SignalRecord | null;
}

export function loadSignals(): SignalRecord[] {
	if (!existsSync(SIGNALS_FILE)) return [];
	try {
		return readFileSync(SIGNALS_FILE, "utf-8")
			.split("\n")
			.filter((l) => l.startsWith("{"))
			.map((l) => {
				try {
					return JSON.parse(l) as SignalRecord;
				} catch {
					return null;
				}
			})
			.filter((s): s is SignalRecord => s !== null);
	} catch {
		return [];
	}
}

export function getSignalStats(): SignalStats {
	const records = loadSignals();
	const byKind: Record<SignalKind, number> = {
		correction: 0, confusion: 0, gratitude: 0, restart: 0, success: 0, frustration: 0,
	};
	for (const r of records) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
	return {
		total: records.length,
		byKind,
		last: records[records.length - 1] ?? null,
	};
}

// ── Message extraction ───────────────────────────────────────────────────────

interface MessageLike {
	role?: string;
	content?: unknown;
}

function extractText(msg: MessageLike): string {
	if (!msg) return "";
	const c = msg.content;
	if (typeof c === "string") return c;
	if (Array.isArray(c)) {
		const parts: string[] = [];
		for (const block of c as Array<{ type?: string; text?: string }>) {
			if (block && typeof block.text === "string") parts.push(block.text);
		}
		return parts.join("\n");
	}
	return "";
}

function lastByRole(messages: MessageLike[], role: "user" | "assistant"): MessageLike | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (m && m.role === role) return m;
	}
	return null;
}

function excerpt(text: string, max = 300): string {
	const trimmed = text.trim().replace(/\s+/g, " ");
	return trimmed.length > max ? trimmed.slice(0, max) + "…" : trimmed;
}

// ── Extension registration ───────────────────────────────────────────────────

export function registerSignals(pi: ExtensionAPI): void {
	pi.on("agent_end", async (event, ctx) => {
		const messages = (event.messages ?? []) as MessageLike[];

		// Signal extraction looks at the user message that *preceded* the
		// final assistant message — that's the user's reaction to whatever
		// the agent did before it. For the first turn there is no prior
		// reaction; just record the user's seed prompt against an empty
		// response_excerpt so we still capture stated intent signals (e.g.
		// initial frustration framing).
		const lastUser = lastByRole(messages, "user");
		const lastAssistant = lastByRole(messages, "assistant");
		if (!lastUser) return;

		const userText = extractText(lastUser);
		const responseText = extractText(lastAssistant ?? {});

		const matches = classifySignals(userText);
		if (matches.length === 0) return;

		const sessionId = ctx?.sessionManager?.getSessionId?.();
		const cwd = ctx?.cwd ?? process.cwd();
		const ts = new Date().toISOString();

		for (const m of matches) {
			appendSignal({
				ts,
				kind: m.kind,
				confidence: m.confidence,
				evidence: m.evidence,
				prompt_excerpt: excerpt(userText),
				response_excerpt: excerpt(responseText),
				session_id: sessionId,
				cwd,
			});
		}
	});

	pi.registerCommand("signals", {
		description: "Show signal extraction stats (corrections, gratitude, confusion...)",
		handler: async (_args, ctx) => {
			const stats = getSignalStats();
			const lines = [
				`Signals: ${stats.total} total`,
				...Object.entries(stats.byKind).map(([k, v]) => `  ${k}: ${v}`),
			];
			if (stats.last) {
				lines.push("");
				lines.push(`Last: ${stats.last.kind} (conf=${stats.last.confidence.toFixed(2)}, evidence=${stats.last.evidence})`);
				lines.push(`  prompt: ${stats.last.prompt_excerpt.slice(0, 100)}`);
			}
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}

// ── CLI test harness ────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
	const sample = process.argv.slice(2).join(" ") || "no actually that's wrong, let's start over";
	const matches = classifySignals(sample);
	console.log(JSON.stringify({ input: sample, matches }, null, 2));
}
