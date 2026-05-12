/**
 * Phase 10.1: Sub-sequence Pattern Mining
 *
 * The raw pattern store captures full tool sequences per turn, which are
 * mostly unique (264 patterns, few with count > 1). Real workflow patterns
 * are SHORT sub-sequences (2-3 tools) that recur across many turns.
 *
 * This module:
 * 1. Extracts 2-gram and 3-gram sub-sequences from all recorded patterns
 * 2. Aggregates counts across all sessions
 * 3. Identifies truly repeated micro-workflows worth crystallizing
 * 4. Provides the self-extension status with meaningful candidates
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Paths ──────────────────────────────────────────────────────────────────

const CORTEX_DIR = join(homedir(), ".pi", "memory", "cortex");
const PATTERNS_FILE = join(CORTEX_DIR, "patterns.json");
const SUBSEQUENCE_CACHE_FILE = join(CORTEX_DIR, "subsequences.json");

// ── Types ──────────────────────────────────────────────────────────────────

export interface SubSequence {
	/** Signature e.g. "read→edit→bash" */
	signature: string;
	/** Total occurrences across all sessions */
	totalCount: number;
	/** Number of unique parent patterns containing this */
	patternCount: number;
	/** Example prompts that triggered parent patterns */
	examples: string[];
	/** Last seen timestamp */
	lastSeen: string;
}

interface SubSequenceCache {
	subsequences: Record<string, SubSequence>;
	lastComputed: string;
	patternsHash: number;
}

// ── Mining ─────────────────────────────────────────────────────────────────

interface PatternEntry {
	tools: string[];
	count: number;
	lastSeen: string;
	examplePrompt: string;
}

interface PatternStore {
	sequences: Record<string, PatternEntry>;
	sessionsAnalyzed: number;
}

function hashPatterns(store: PatternStore): number {
	// Simple hash: sessionsAnalyzed + count of sequences
	return store.sessionsAnalyzed * 1000 + Object.keys(store.sequences).length;
}

/**
 * Extract n-gram sub-sequences from a tool list.
 */
function extractNGrams(tools: string[], n: number): string[] {
	const grams: string[] = [];
	for (let i = 0; i <= tools.length - n; i++) {
		grams.push(tools.slice(i, i + n).join("→"));
	}
	return grams;
}

/**
 * Mine sub-sequences from the pattern store.
 */
function mineSubSequences(store: PatternStore): Record<string, SubSequence> {
	const results: Record<string, SubSequence> = {};

	for (const [_sig, entry] of Object.entries(store.sequences)) {
		const tools = entry.tools;
		if (tools.length < 2) continue;

		// Extract 2-grams and 3-grams
		for (const n of [2, 3]) {
			for (const gram of extractNGrams(tools, n)) {
				if (!results[gram]) {
					results[gram] = {
						signature: gram,
						totalCount: 0,
						patternCount: 0,
						examples: [],
						lastSeen: entry.lastSeen,
					};
				}
				results[gram].totalCount += entry.count;
				results[gram].patternCount++;
				if (results[gram].examples.length < 3 && entry.examplePrompt && entry.examplePrompt !== "(unknown)") {
					results[gram].examples.push(entry.examplePrompt.slice(0, 100));
				}
				if (entry.lastSeen > results[gram].lastSeen) {
					results[gram].lastSeen = entry.lastSeen;
				}
			}
		}
	}

	return results;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Get aggregated sub-sequence patterns.
 * Uses a cache to avoid re-mining on every call.
 */
export async function getSubSequences(): Promise<SubSequence[]> {
	if (!existsSync(PATTERNS_FILE)) return [];
	if (!existsSync(CORTEX_DIR)) await mkdir(CORTEX_DIR, { recursive: true });

	let store: PatternStore;
	try {
		store = JSON.parse(await readFile(PATTERNS_FILE, "utf-8"));
	} catch {
		return [];
	}

	const currentHash = hashPatterns(store);

	// Check cache
	if (existsSync(SUBSEQUENCE_CACHE_FILE)) {
		try {
			const cache: SubSequenceCache = JSON.parse(await readFile(SUBSEQUENCE_CACHE_FILE, "utf-8"));
			if (cache.patternsHash === currentHash) {
				return Object.values(cache.subsequences);
			}
		} catch {
			// Recompute
		}
	}

	// Mine and cache
	const subsequences = mineSubSequences(store);
	const cache: SubSequenceCache = {
		subsequences,
		lastComputed: new Date().toISOString(),
		patternsHash: currentHash,
	};
	await writeFile(SUBSEQUENCE_CACHE_FILE, JSON.stringify(cache, null, 2));

	return Object.values(subsequences);
}

/**
 * Get top crystallization candidates — sub-sequences that are:
 * - Short (2-3 tools)
 * - Highly recurring (totalCount >= threshold)
 * - Seen across multiple parent patterns (patternCount >= 3)
 * - Recently active
 */
export async function getCrystallizationCandidates(minCount = 20): Promise<SubSequence[]> {
	const all = await getSubSequences();
	return all
		.filter((s) => s.totalCount >= minCount && s.patternCount >= 3)
		.sort((a, b) => b.totalCount - a.totalCount)
		.slice(0, 15);
}

/**
 * Get a formatted status string for self-extension injection.
 */
export async function getSubSequenceStatus(): Promise<string | null> {
	const candidates = await getCrystallizationCandidates(20);
	if (candidates.length === 0) return null;

	const lines = candidates.slice(0, 10).map((s) => {
		const example = s.examples[0] ? ` (e.g. "${s.examples[0].slice(0, 60)}")` : "";
		return `- \`${s.signature}\` — seen ${s.totalCount}×${example}`;
	});

	return `**⚡ Crystallization candidates** (repeated patterns — consider making a skill):\n${lines.join("\n")}`;
}
