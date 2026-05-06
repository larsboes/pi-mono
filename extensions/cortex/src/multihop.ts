/**
 * Phase 9.3: Multi-hop Retrieval
 *
 * Two-pass search that uses entities from first-pass results to find
 * deeper connections. Especially useful for:
 * - "What was I working on when X happened?" (needs context bridging)
 * - "How does X relate to Y?" (needs entity chain)
 * - Questions about projects/tools mentioned across multiple sessions
 *
 * Pipeline:
 * 1. First pass: standard search with original query
 * 2. Extract entities from top-N results
 * 3. Second pass: search with extracted entities (excluding already-seen results)
 * 4. Merge both passes with hop-distance scoring
 */

import type { MemoryResult, SearchOptions } from "./memory.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface MultiHopResult extends MemoryResult {
	/** Which hop found this result (1 = direct, 2 = via entity chain) */
	hop: number;
	/** Entity that bridged to this result (for hop 2) */
	bridgeEntity?: string;
}

export interface MultiHopOptions {
	/** Max results from first pass to extract entities from */
	firstPassTop?: number;
	/** Max entities to extract for second pass */
	maxBridgeEntities?: number;
	/** Score penalty for second-hop results (0-1, applied as multiplier) */
	secondHopPenalty?: number;
}

const DEFAULTS: Required<MultiHopOptions> = {
	firstPassTop: 5,
	maxBridgeEntities: 5,
	secondHopPenalty: 0.7,
};

// ── Entity Extraction ──────────────────────────────────────────────────────

// Simple entity extraction from text (file names, project names, tools, etc.)
const ENTITY_PATTERNS = [
	// File paths / basenames
	/(?:[\w-]+\/)*[\w-]+\.\w{1,5}/g,
	// Capitalized project/tool names (2+ chars)
	/\b[A-Z][a-zA-Z0-9]+(?:[-_][A-Za-z0-9]+)*\b/g,
	// kebab-case identifiers (3+ chars, not common words)
	/\b[a-z][a-z0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\b/g,
];

const STOP_WORDS = new Set([
	"the", "and", "for", "that", "this", "with", "from", "into",
	"session", "activity", "files", "tools", "skills", "reads",
	"edits", "writes", "commands", "density", "true", "false",
	"null", "undefined", "string", "number", "boolean",
]);

/**
 * Extract meaningful entities from search results for the second hop.
 */
export function extractBridgeEntities(results: MemoryResult[], maxEntities: number): string[] {
	const entityCounts = new Map<string, number>();

	for (const result of results) {
		const text = `${result.source} ${result.text}`;

		for (const pattern of ENTITY_PATTERNS) {
			const matches = text.matchAll(new RegExp(pattern.source, pattern.flags));
			for (const match of matches) {
				const entity = match[0];
				if (entity.length < 3 || entity.length > 60) continue;
				if (STOP_WORDS.has(entity.toLowerCase())) continue;
				entityCounts.set(entity, (entityCounts.get(entity) || 0) + 1);
			}
		}
	}

	// Sort by frequency, return top N
	return Array.from(entityCounts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, maxEntities)
		.map(([entity]) => entity);
}

/**
 * Perform multi-hop retrieval.
 *
 * @param firstPassSearch - Function to execute a search (injected to avoid circular dep)
 * @param query - Original user query
 * @param maxResults - Total results to return (across both hops)
 * @param options - Multi-hop configuration
 */
export async function multiHopSearch(
	firstPassSearch: (query: string, maxResults: number, options?: SearchOptions) => Promise<MemoryResult[]>,
	query: string,
	maxResults: number,
	options?: MultiHopOptions & SearchOptions,
): Promise<MultiHopResult[]> {
	const config = { ...DEFAULTS, ...options };

	// ── First pass: standard search ──────────────────────────────────
	const firstPassResults = await firstPassSearch(query, config.firstPassTop * 2, options);
	const firstPassTop = firstPassResults.slice(0, config.firstPassTop);

	// Mark first-pass results
	const hop1Results: MultiHopResult[] = firstPassResults.slice(0, maxResults).map((r) => ({
		...r,
		hop: 1,
	}));

	// If first pass already found enough high-quality results, skip second hop
	const highConfidence = firstPassTop.filter((r) => r.score >= 0.7);
	if (highConfidence.length >= maxResults) {
		return hop1Results.slice(0, maxResults);
	}

	// ── Extract bridge entities from first pass ──────────────────────
	const bridgeEntities = extractBridgeEntities(firstPassTop, config.maxBridgeEntities);
	if (bridgeEntities.length === 0) {
		return hop1Results.slice(0, maxResults);
	}

	// ── Second pass: search with bridge entities ─────────────────────
	const bridgeQuery = bridgeEntities.join(" ");
	const secondPassResults = await firstPassSearch(bridgeQuery, maxResults, {
		...options,
		// Don't rerank second pass (already lower confidence)
		rerank: false,
	});

	// Filter out results already in first pass
	const firstPassKeys = new Set(hop1Results.map((r) => `${r.source}:${r.text.slice(0, 50)}`));
	const hop2Results: MultiHopResult[] = secondPassResults
		.filter((r) => !firstPassKeys.has(`${r.source}:${r.text.slice(0, 50)}`))
		.map((r) => ({
			...r,
			score: r.score * config.secondHopPenalty,
			hop: 2,
			bridgeEntity: bridgeEntities[0], // Primary bridge entity
		}));

	// ── Merge: interleave hop 1 and hop 2 results ────────────────────
	const merged = [...hop1Results, ...hop2Results]
		.sort((a, b) => b.score - a.score)
		.slice(0, maxResults);

	return merged;
}

/**
 * Check if a query would benefit from multi-hop retrieval.
 * Multi-hop is useful for relational queries but wasteful for simple lookups.
 */
export function shouldUseMultiHop(query: string): boolean {
	const multiHopIndicators = [
		/\brelat(?:e|ed|ion)\b/i,
		/\bconnect(?:ed|ion)?\b/i,
		/\bwhen\s+(?:I|we)\s+(?:was|were|did)\b/i,
		/\bcontext\s+(?:of|around|for)\b/i,
		/\bhow\s+does\s+.+\s+(?:relate|connect|fit)\b/i,
		/\bwhat\s+(?:else|other)\b/i,
		/\b(?:before|after|during|while)\s+(?:I|we)\b/i,
		/\b(?:project|work|session)\s+(?:with|about|on)\b/i,
	];
	return multiHopIndicators.some((p) => p.test(query));
}
