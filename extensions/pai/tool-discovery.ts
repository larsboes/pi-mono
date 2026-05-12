/**
 * BM25-based tool discovery search.
 *
 * Builds a search index over all registered tools (builtin + extension + MCP).
 * The agent can search for tools semantically using natural language queries.
 *
 * Inspired by oh-my-pi's tool-discovery/tool-index.ts
 */

// ─── BM25 Constants ──────────────────────────────────────────────────────

const BM25_K1 = 1.2;
const BM25_B = 0.75;

const FIELD_WEIGHTS: Record<string, number> = {
	name: 6,
	description: 3,
	parameterKey: 1,
};

// ─── Types ───────────────────────────────────────────────────────────────

export interface DiscoverableTool {
	name: string;
	description: string;
	parameterKeys: string[];
	source: string; // "builtin" | "extension" | "mcp" | "sdk"
}

interface SearchDocument {
	tool: DiscoverableTool;
	termFrequencies: Map<string, number>;
	length: number;
}

export interface ToolSearchIndex {
	documents: SearchDocument[];
	averageLength: number;
	documentFrequencies: Map<string, number>;
}

export interface ToolSearchResult {
	tool: DiscoverableTool;
	score: number;
}

// ─── Tokenization ────────────────────────────────────────────────────────

function tokenize(value: string): string[] {
	return value
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2") // camelCase split
		.replace(/[^a-zA-Z0-9]+/g, " ")
		.toLowerCase()
		.trim()
		.split(/\s+/)
		.filter((t) => t.length > 0);
}

// ─── Index Building ──────────────────────────────────────────────────────

function buildTermFrequencies(tool: DiscoverableTool): { tf: Map<string, number>; length: number } {
	const tf = new Map<string, number>();
	let totalLength = 0;

	const addTokens = (text: string, weight: number): void => {
		const tokens = tokenize(text);
		for (const token of tokens) {
			tf.set(token, (tf.get(token) || 0) + weight);
			totalLength += weight;
		}
	};

	addTokens(tool.name, FIELD_WEIGHTS.name);
	addTokens(tool.description, FIELD_WEIGHTS.description);
	for (const key of tool.parameterKeys) {
		addTokens(key, FIELD_WEIGHTS.parameterKey);
	}

	return { tf, length: totalLength };
}

/**
 * Build a BM25 search index from an array of discoverable tools.
 */
export function buildToolSearchIndex(tools: DiscoverableTool[]): ToolSearchIndex {
	const documents: SearchDocument[] = [];
	const documentFrequencies = new Map<string, number>();

	for (const tool of tools) {
		const { tf, length } = buildTermFrequencies(tool);
		documents.push({ tool, termFrequencies: tf, length });

		// Count document frequencies (unique terms per document)
		for (const term of tf.keys()) {
			documentFrequencies.set(term, (documentFrequencies.get(term) || 0) + 1);
		}
	}

	const averageLength = documents.length > 0 ? documents.reduce((sum, d) => sum + d.length, 0) / documents.length : 0;

	return { documents, averageLength, documentFrequencies };
}

/**
 * Search the tool index using BM25 scoring.
 */
export function searchTools(index: ToolSearchIndex, query: string, limit = 8): ToolSearchResult[] {
	const queryTokens = tokenize(query);
	if (queryTokens.length === 0) return [];

	const N = index.documents.length;
	const results: ToolSearchResult[] = [];

	for (const doc of index.documents) {
		let score = 0;

		for (const token of queryTokens) {
			const tf = doc.termFrequencies.get(token) || 0;
			if (tf === 0) continue;

			const df = index.documentFrequencies.get(token) || 0;
			// IDF with floor to prevent negative scores
			const idf = Math.max(0, Math.log((N - df + 0.5) / (df + 0.5) + 1));
			// BM25 term frequency normalization
			const tfNorm =
				(tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * (doc.length / index.averageLength)));

			score += idf * tfNorm;
		}

		if (score > 0) {
			results.push({ tool: doc.tool, score });
		}
	}

	// Sort by score descending
	results.sort((a, b) => b.score - a.score);
	return results.slice(0, limit);
}

/**
 * Convert ToolInfo array (from AgentSession.getAllTools()) to DiscoverableTool array.
 */
export function toDiscoverableTools(
	tools: Array<{ name: string; description?: string; parameters?: unknown; sourceInfo?: { source?: string } }>,
): DiscoverableTool[] {
	return tools.map((t) => ({
		name: t.name,
		description: t.description || "",
		parameterKeys: getParameterKeys(t.parameters),
		source: t.sourceInfo?.source || "unknown",
	}));
}

function getParameterKeys(parameters: unknown): string[] {
	if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return [];
	const props = (parameters as { properties?: unknown }).properties;
	if (!props || typeof props !== "object" || Array.isArray(props)) return [];
	return Object.keys(props as Record<string, unknown>);
}
