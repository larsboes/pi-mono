/**
 * Phase 9.1: Query Expansion
 *
 * Enriches search queries with contextual terms to improve recall.
 * Three expansion strategies:
 *
 * 1. Session context — adds recent file names and tools as implicit context
 * 2. Entity graph — adds co-occurring entities from the graph
 * 3. Synonym/reformulation — generates alternative phrasings
 *
 * The expanded query is used alongside the original for retrieval,
 * NOT as a replacement (original intent is preserved).
 */

import { getRelatedEntities } from "./graph.js";
import { getContextEntities } from "./session.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ExpandedQuery {
	/** Original query unchanged */
	original: string;
	/** Additional terms from expansion (for boosting, not replacing) */
	expansionTerms: string[];
	/** Strategy that produced each term */
	sources: Array<{ term: string; source: "session" | "graph" | "reformulation" }>;
}

// ── Reformulation Rules ────────────────────────────────────────────────────

interface ReformulationRule {
	pattern: RegExp;
	expand: (match: RegExpMatchArray) => string[];
}

const REFORMULATION_RULES: ReformulationRule[] = [
	// "how do I X" → also search for "X tutorial", "X example"
	{
		pattern: /\bhow\s+(?:do|can|to)\s+(?:I\s+)?(.+)/i,
		expand: (m) => [`${m[1].trim()} example`, `${m[1].trim()} guide`],
	},
	// "fix X" / "debug X" → "X error", "X issue"
	{
		pattern: /\b(?:fix|debug|solve|resolve)\s+(.+)/i,
		expand: (m) => [`${m[1].trim()} error`, `${m[1].trim()} issue`],
	},
	// "why does X" → "X cause", "X reason"
	{
		pattern: /\bwhy\s+(?:does|is|did|do)\s+(.+)/i,
		expand: (m) => [`${m[1].trim()} cause`, `${m[1].trim()} reason`],
	},
	// "what is X" → "X definition", "X overview"
	{
		pattern: /\bwhat\s+(?:is|are)\s+(.+)/i,
		expand: (m) => [`${m[1].trim()} overview`],
	},
];

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Expand a query with contextual terms.
 * Returns the original query + expansion terms for boosting.
 *
 * The expansion is lightweight and synchronous for session/reformulation,
 * async only for graph lookups.
 */
export async function expandQuery(query: string, maxTerms = 8): Promise<ExpandedQuery> {
	const sources: ExpandedQuery["sources"] = [];

	// ── Strategy 1: Session context ──────────────────────────────────
	// Add recent file basenames that appear related to the query
	const sessionEntities = getContextEntities();
	const queryLower = query.toLowerCase();
	const sessionTerms = sessionEntities
		.filter((entity) => {
			// Only include if the entity is somewhat relevant to the query
			// (shares words or the query mentions something related)
			const entityLower = entity.toLowerCase().replace(/[^a-z0-9]/g, " ");
			const queryWords = queryLower.split(/\s+/);
			return queryWords.some((w) => w.length > 2 && entityLower.includes(w));
		})
		.slice(0, 3);

	for (const term of sessionTerms) {
		sources.push({ term, source: "session" });
	}

	// ── Strategy 2: Entity graph ─────────────────────────────────────
	// Find entities co-occurring with query terms
	try {
		const graphEntities = await getRelatedEntities(query, 10);
		const graphTerms = graphEntities
			.filter((e) => !sessionTerms.includes(e) && e.length > 2)
			.slice(0, 3);
		for (const term of graphTerms) {
			sources.push({ term, source: "graph" });
		}
	} catch {
		// Graph expansion is best-effort
	}

	// ── Strategy 3: Reformulation ────────────────────────────────────
	for (const rule of REFORMULATION_RULES) {
		const match = query.match(rule.pattern);
		if (match) {
			const expansions = rule.expand(match).slice(0, 2);
			for (const term of expansions) {
				sources.push({ term, source: "reformulation" });
			}
			break; // Only apply first matching rule
		}
	}

	// Deduplicate and limit
	const seen = new Set<string>();
	const uniqueSources = sources.filter((s) => {
		const key = s.term.toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	}).slice(0, maxTerms);

	return {
		original: query,
		expansionTerms: uniqueSources.map((s) => s.term),
		sources: uniqueSources,
	};
}

/**
 * Build an expanded search string combining original query + expansion terms.
 * Used for keyword search fallback.
 */
export function buildExpandedSearchText(expanded: ExpandedQuery): string {
	if (expanded.expansionTerms.length === 0) return expanded.original;
	return `${expanded.original} ${expanded.expansionTerms.join(" ")}`;
}
