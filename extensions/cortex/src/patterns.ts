import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Paths ──────────────────────────────────────────────────────────────────

const CORTEX_DIR = join(homedir(), ".pi", "memory", "cortex");
const PATTERNS_FILE = join(CORTEX_DIR, "patterns.json");

// ── Types ──────────────────────────────────────────────────────────────────

export interface ToolSequence {
	/** Ordered tool names used in this workflow */
	tools: string[];
	/** How many times this exact sequence has been observed */
	count: number;
	/** Last time this sequence was observed */
	lastSeen: string;
	/** Example prompt that triggered it */
	examplePrompt: string;
}

export interface PatternStore {
	/** Tool sequences keyed by normalized signature (e.g. "read→edit→bash") */
	sequences: Record<string, ToolSequence>;
	/** Total sessions analyzed */
	sessionsAnalyzed: number;
	/** Last updated */
	lastUpdated: string;
}

// ── State ──────────────────────────────────────────────────────────────────

let store: PatternStore | null = null;

// ── Persistence ────────────────────────────────────────────────────────────

async function load(): Promise<PatternStore> {
	if (store) return store;

	if (!existsSync(CORTEX_DIR)) await mkdir(CORTEX_DIR, { recursive: true });

	if (existsSync(PATTERNS_FILE)) {
		try {
			const raw = await readFile(PATTERNS_FILE, "utf-8");
			store = JSON.parse(raw) as PatternStore;
			return store;
		} catch {
			// Corrupt file — reset
		}
	}

	store = { sequences: {}, sessionsAnalyzed: 0, lastUpdated: new Date().toISOString() };
	return store;
}

async function save(): Promise<void> {
	if (!store) return;
	store.lastUpdated = new Date().toISOString();
	await writeFile(PATTERNS_FILE, JSON.stringify(store, null, 2));
}

// ── Pattern Extraction ─────────────────────────────────────────────────────

/**
 * Extract the tool call sequence from an array of agent messages.
 * Pi uses { type: "toolCall", name: "..." } content blocks (not Anthropic's "tool_use").
 */
function extractToolNames(messages: unknown[]): string[] {
	const tools: string[] = [];

	for (const msg of messages) {
		const m = msg as { role?: string; content?: unknown[] };
		if (m.role !== "assistant" || !Array.isArray(m.content)) continue;

		for (const block of m.content) {
			const b = block as { type?: string; name?: string };
			if (b.type === "toolCall" && b.name) {
				tools.push(b.name);
			}
		}
	}

	return tools;
}

/**
 * Extract the user's initial prompt from messages.
 */
function extractPrompt(messages: unknown[]): string {
	for (const msg of messages) {
		const m = msg as { role?: string; content?: unknown };
		if (m.role === "user") {
			if (typeof m.content === "string") return m.content.slice(0, 200);
			if (Array.isArray(m.content)) {
				for (const block of m.content) {
					const b = block as { type?: string; text?: string };
					if (b.type === "text" && b.text) return b.text.slice(0, 200);
				}
			}
		}
	}
	return "(unknown)";
}

/**
 * Normalize a tool sequence into a signature string.
 * Collapses consecutive duplicates: [read, read, edit, bash, bash] → "read→edit→bash"
 */
function toSignature(tools: string[]): string {
	if (tools.length === 0) return "";

	const collapsed: string[] = [tools[0]];
	for (let i = 1; i < tools.length; i++) {
		if (tools[i] !== tools[i - 1]) {
			collapsed.push(tools[i]);
		}
	}
	return collapsed.join("→");
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Record tool usage from a completed agent loop.
 * Call this from the agent_end hook.
 */
export async function recordSession(messages: unknown[]): Promise<{
	signature: string;
	count: number;
	isNew: boolean;
} | null> {
	const tools = extractToolNames(messages);
	if (tools.length < 2) return null; // Single tool use isn't a pattern

	const signature = toSignature(tools);
	if (!signature) return null;

	// Ignore single-step workflows (e.g. repeated "edit, edit" collapsing to "edit").
	if (!signature.includes("→")) return null;

	const normalizedTools = signature.split("→");

	const s = await load();
	const prompt = extractPrompt(messages);
	const isNew = !(signature in s.sequences);

	if (isNew) {
		s.sequences[signature] = {
			tools: normalizedTools,
			count: 1,
			lastSeen: new Date().toISOString(),
			examplePrompt: prompt,
		};
	} else {
		s.sequences[signature].count++;
		s.sequences[signature].lastSeen = new Date().toISOString();
	}

	s.sessionsAnalyzed++;
	await save();

	return { signature, count: s.sequences[signature].count, isNew };
}

/**
 * Get patterns that have been observed multiple times.
 * These are candidates for crystallization into skills.
 */
export async function getCrystallizationCandidates(
	minCount = 3,
): Promise<Array<ToolSequence & { signature: string }>> {
	const s = await load();

	return Object.entries(s.sequences)
		.filter(([_, seq]) => seq.count >= minCount)
		.sort(([_, a], [__, b]) => b.count - a.count)
		.map(([sig, seq]) => ({ ...seq, signature: sig }));
}

/**
 * Get all recorded patterns with their counts.
 */
export async function getAllPatterns(): Promise<PatternStore> {
	return load();
}

/**
 * Get summary stats.
 */
export async function getStats(): Promise<{
	totalPatterns: number;
	totalSessions: number;
	crystallizationCandidates: number;
	topPatterns: Array<{ signature: string; count: number }>;
}> {
	const s = await load();

	const entries = Object.entries(s.sequences).sort(([_, a], [__, b]) => b.count - a.count);

	return {
		totalPatterns: entries.length,
		totalSessions: s.sessionsAnalyzed,
		crystallizationCandidates: entries.filter(([_, seq]) => seq.count >= 3).length,
		topPatterns: entries.slice(0, 5).map(([sig, seq]) => ({ signature: sig, count: seq.count })),
	};
}
