import { readFile, writeFile, appendFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { LocalIndex } from "vectra";
import { glob } from "glob";
import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";
import { rerank as rerankResults, isRerankerAvailable } from "./rerank.js";
import { classifyIntent, getIntentWeights, categorizeSource, type QueryIntent } from "./intent.js";
import { extractEntities, traverseGraph, updateGraph } from "./graph.js";
import { logInteraction, computePersonalWeights, applyPersonalWeights } from "./feedback.js";

// ── Paths ──────────────────────────────────────────────────────────────────

const HOME = homedir();
const MEMORY_DIR = join(HOME, ".pi", "memory");
const CORTEX_DIR = join(MEMORY_DIR, "cortex");
const INDEX_DIR = join(CORTEX_DIR, "vectors");
const DAILY_DIR = join(MEMORY_DIR, "daily");
const ENV_FILE = join(HOME, ".pi", ".env");
const MODEL_CACHE_DIR = join(HOME, ".cache", "pi-cortex", "models");

// Shared PAI memory store (CC relationship notes, learning, pi daily summaries)
const PAI_MEMORY_DIR = join(HOME, ".pai", "MEMORY");
const PAI_DAILY_DIR = join(PAI_MEMORY_DIR, "DAILY");

const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
const LOCAL_EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

// ── Types ──────────────────────────────────────────────────────────────────

export interface MemoryResult {
	source: string;
	text: string;
	score: number;
	method: "vector" | "keyword";
	/** Cross-encoder rerank score (0-1, higher = more relevant). Present if reranking enabled. */
	rerankScore?: number;
	/** Phase 8.4: granularity level of this chunk */
	granularity?: "document" | "section" | "chunk";
}

interface ItemMetadata {
	source: string;
	type: string;
	text: string;
	timestamp: string;
	// granularity and parentId are written as Phase 8.4 extras; omitted = old chunk
	[key: string]: string | number | boolean;
}

// ── State ──────────────────────────────────────────────────────────────────

let geminiKey: string | null = null;
let embeddingPipeline: FeatureExtractionPipeline | null = null;
let embeddingLoadPromise: Promise<FeatureExtractionPipeline> | null = null;
let usingLocalEmbeddings = false;
let index: LocalIndex | null = null;
let initialized = false;

// ── Init ───────────────────────────────────────────────────────────────────

export async function init(): Promise<{ hasKey: boolean; hasIndex: boolean }> {
	if (initialized) {
		return {
			hasKey: !!geminiKey || usingLocalEmbeddings,
			hasIndex: index ? await index.isIndexCreated() : false,
		};
	}

	// Ensure directories
	for (const dir of [MEMORY_DIR, CORTEX_DIR, INDEX_DIR, DAILY_DIR]) {
		if (!existsSync(dir)) await mkdir(dir, { recursive: true });
	}

	// Always use local embeddings — no external API calls
	usingLocalEmbeddings = true;
	console.log(`[cortex/memory] Using local embeddings (${LOCAL_EMBEDDING_MODEL})`);

	// Init vector index
	index = new LocalIndex(INDEX_DIR);

	initialized = true;

	return {
		hasKey: !!geminiKey || usingLocalEmbeddings,
		hasIndex: await index.isIndexCreated(),
	};
}

function loadGeminiKey(): string | null {
	// Prefer .env file over process.env (shell env may have stale keys)
	try {
		const content = require("node:fs").readFileSync(ENV_FILE, "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
			const [key, ...rest] = trimmed.split("=");
			if (key.trim() === "GEMINI_API_KEY") return rest.join("=").trim();
		}
	} catch {
		// No .env file
	}

	if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
	return null;
}

// ── Embeddings ─────────────────────────────────────────────────────────────

async function getGeminiEmbedding(text: string): Promise<number[] | null> {
	if (!geminiKey) return null;

	const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${geminiKey}`;

	const res = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ content: { parts: [{ text }] } }),
	});

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Embedding API ${res.status}: ${err}`);
	}

	const data = (await res.json()) as { embedding?: { values?: number[] } };
	if (data.embedding?.values) return data.embedding.values;
	throw new Error("Invalid embedding response");
}

async function loadLocalEmbeddingModel(): Promise<FeatureExtractionPipeline> {
	if (embeddingPipeline) return embeddingPipeline;
	if (embeddingLoadPromise) return embeddingLoadPromise;

	embeddingLoadPromise = (async () => {
		if (!existsSync(MODEL_CACHE_DIR)) {
			await mkdir(MODEL_CACHE_DIR, { recursive: true });
		}

		console.log(`[cortex/memory] Loading local embedding model: ${LOCAL_EMBEDDING_MODEL}...`);

		const pipe = await pipeline("feature-extraction", LOCAL_EMBEDDING_MODEL, {
			cache_dir: MODEL_CACHE_DIR,
			quantized: true,
		});

		embeddingPipeline = pipe;
		console.log(`[cortex/memory] Local embedding model loaded: ${LOCAL_EMBEDDING_MODEL}`);
		return pipe;
	})();

	try {
		return await embeddingLoadPromise;
	} catch (e) {
		embeddingLoadPromise = null;
		throw e;
	}
}

async function getLocalEmbedding(text: string): Promise<number[] | null> {
	try {
		const pipe = await loadLocalEmbeddingModel();
		const truncated = text.slice(0, 512);
		const result = await pipe(truncated, { pooling: "mean", normalize: true });
		return Array.from(result.data as Float32Array);
	} catch (e) {
		console.error(`[cortex/memory] Local embedding failed: ${(e as Error).message}`);
		return null;
	}
}

async function getEmbedding(text: string): Promise<number[] | null> {
	return getLocalEmbedding(text);
}

// ── Keyword Search (BM25-lite fallback) ────────────────────────────────────

async function keywordSearch(query: string, maxResults: number): Promise<MemoryResult[]> {
	const terms = query
		.toLowerCase()
		.split(/\s+/)
		.filter((t) => t.length > 1);
	if (terms.length === 0) return [];

	const results: MemoryResult[] = [];

	const coreFiles = ["MEMORY.md", "IDENTITY.md", "USER.md", "SOUL.md"].map((f) =>
		join(MEMORY_DIR, f),
	);
	const dailyFiles = await glob(join(DAILY_DIR, "*.md"));
	const paiFiles = existsSync(PAI_MEMORY_DIR)
		? await glob(join(PAI_MEMORY_DIR, "{RELATIONSHIP,LEARNING,DAILY}", "**", "*.md"))
		: [];
	const allFiles = [...coreFiles, ...dailyFiles, ...paiFiles];

	for (const file of allFiles) {
		if (!existsSync(file)) continue;
		const content = await readFile(file, "utf-8");
		const chunks = content.split("\n\n").filter((c) => c.trim().length > 20);
		const filename = basename(file);

		for (const chunk of chunks) {
			const lower = chunk.toLowerCase();
			const matchCount = terms.filter((t) => lower.includes(t)).length;
			if (matchCount > 0) {
				results.push({
					source: filename,
					text: chunk.trim(),
					score: matchCount / terms.length,
					method: "keyword",
				});
			}
		}
	}

	return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

// ── Vector Search ──────────────────────────────────────────────────────────

async function vectorSearch(query: string, maxResults: number): Promise<MemoryResult[] | null> {
	if (!index || !(await index.isIndexCreated())) return null;

	const vector = await getEmbedding(query);
	if (!vector) return null;

	const results = await index.queryItems(vector, maxResults);
	return results.map((r) => ({
		source: (r.item.metadata as ItemMetadata).source,
		text: (r.item.metadata as ItemMetadata).text,
		score: r.score,
		method: "vector" as const,
		granularity: (r.item.metadata as ItemMetadata).granularity as MemoryResult["granularity"],
	}));
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Search memory: vector first, keyword fallback.
 * Integrates intent weighting (8.2), graph expansion (8.3), granularity filter (8.4),
 * session context boost (8.5), feedback personalization (8.6), and cross-encoder reranking (8.1).
 */
export async function search(
	query: string,
	maxResults = 5,
	options?: {
		rerank?: boolean;
		intent?: QueryIntent;
		granularity?: "document" | "section" | "chunk";
		contextEntities?: string[];
	},
): Promise<MemoryResult[]> {
	await init();

	// Stage 1: Retrieve candidates (bi-encoder or keyword)
	let candidates: MemoryResult[] = [];
	try {
		const vectorResults = await vectorSearch(query, maxResults * 3);
		if (vectorResults && vectorResults.length > 0) {
			candidates = vectorResults;
		}
	} catch (e) {
		console.error(`[cortex/memory] Vector search failed: ${(e as Error).message}, falling back to keyword`);
	}

	if (candidates.length === 0) {
		candidates = await keywordSearch(query, maxResults * 3);
	}

	// Phase 8.4: Granularity filter
	if (options?.granularity) {
		const filtered = candidates.filter((r) => !r.granularity || r.granularity === options.granularity);
		if (filtered.length > 0) candidates = filtered;
	}

	// Phase 8.2: Intent-based score weighting
	const intent = options?.intent ?? classifyIntent(query);
	if (intent !== "general") {
		const weights = getIntentWeights(intent);
		candidates = candidates.map((r) => {
			const cat = categorizeSource(r.source);
			let multiplier = 1.0;
			if (cat === "daily") multiplier = weights.recencyBias;
			else if (cat === "skill") multiplier = weights.skillBoost;
			else if (cat === "error") multiplier = weights.errorBoost;
			else if (cat === "path") multiplier = weights.pathBoost;
			return { ...r, score: Math.min(1.0, r.score * multiplier) };
		});
		candidates.sort((a, b) => b.score - a.score);
	}

	// Phase 8.3: Graph entity expansion — boost results sharing entities with query
	try {
		const queryEntities = extractEntities(query);
		const neighborSets = await Promise.all(queryEntities.slice(0, 5).map((e) => traverseGraph(e, 2)));
		const graphNeighbors = neighborSets.flat();
		const allEntities = [...queryEntities, ...graphNeighbors];
		if (allEntities.length > 0) {
			candidates = candidates.map((r) => {
				const lowerText = (r.source + " " + r.text).toLowerCase();
				const hasEntity = allEntities.some((e) => lowerText.includes(e.toLowerCase()));
				return hasEntity ? { ...r, score: Math.min(1.0, r.score + 0.1) } : r;
			});
			candidates.sort((a, b) => b.score - a.score);
		}
	} catch {
		// graph expansion is best-effort
	}

	// Phase 8.5: Session context boost
	if (options?.contextEntities && options.contextEntities.length > 0) {
		candidates = candidates.map((r) => {
			const lowerText = (r.source + " " + r.text).toLowerCase();
			const hasContext = options.contextEntities!.some((e) => lowerText.includes(e.toLowerCase()));
			return hasContext ? { ...r, score: Math.min(1.0, r.score + 0.15) } : r;
		});
		candidates.sort((a, b) => b.score - a.score);
	}

	// Phase 8.6: Personal weight adjustment
	try {
		const weights = await computePersonalWeights();
		if (Object.keys(weights).length > 0) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const adjusted = applyPersonalWeights(candidates as any, weights);
			candidates = adjusted.map((r) => ({ ...r } as unknown as MemoryResult));
			candidates.sort((a, b) => b.score - a.score);
		}
	} catch {
		// personalization is best-effort
	}

	// Phase 8.1: Rerank with cross-encoder if requested
	if (options?.rerank && candidates.length > 0) {
		const canRerank = await isRerankerAvailable();
		if (canRerank) {
			try {
				const { rerank } = await import("./rerank.js");
				const reranked = await rerank(query, candidates, maxResults);
				const finalResults = reranked.map((r) => ({
					source: r.source,
					text: r.text,
					score: r.score,
					method: r.method,
					rerankScore: r.rerankScore,
					granularity: candidates.find((c) => c.source === r.source && c.text === r.text)?.granularity,
				}));
				// Phase 8.6: Log interaction
				logInteraction(query, finalResults.map((r) => r.source)).catch(() => {});
				return finalResults;
			} catch (e) {
				console.error(`[cortex/memory] Reranking failed: ${(e as Error).message}, returning original results`);
			}
		} else {
			console.log("[cortex/memory] Reranker not available, using original scores");
		}
	}

	const finalResults = candidates.slice(0, maxResults);
	// Phase 8.6: Log interaction
	logInteraction(query, finalResults.map((r) => r.source)).catch(() => {});
	return finalResults;
}

/**
 * Store text in memory. Optionally add to daily log.
 */
export async function store(text: string, daily = false): Promise<string> {
	await init();

	const today = new Date().toISOString().split("T")[0];

	if (daily) {
		const file = join(DAILY_DIR, `${today}.md`);
		const isNew = !existsSync(file);
		if (isNew) {
			await writeFile(file, `# ${today}\n\n${text}`);
		} else {
			await appendFile(file, `\n\n${text}`);
		}

		await addToIndex(text, {
			source: `${today}.md`,
			type: "daily",
			text,
			timestamp: new Date().toISOString(),
		});

		// Dual-write to shared PAI store so CC LoadContext can read pi session summaries
		try {
			const paiMonthDir = join(PAI_DAILY_DIR, today.slice(0, 7));
			const paiFile = join(paiMonthDir, `${today}.md`);
			if (!existsSync(paiMonthDir)) await mkdir(paiMonthDir, { recursive: true });
			const paiIsNew = !existsSync(paiFile);
			if (paiIsNew) {
				await writeFile(paiFile, `# ${today}\n\n${text}`);
			} else {
				await appendFile(paiFile, `\n\n${text}`);
			}
		} catch (e) {
			console.error(`[cortex/memory] PAI dual-write failed (non-fatal): ${(e as Error).message}`);
		}

		return `Stored in daily/${today}.md`;
	}

	const file = join(MEMORY_DIR, "MEMORY.md");
	await appendFile(file, `\n\n${text}`);

	await addToIndex(text, {
		source: "MEMORY.md",
		type: "core",
		text,
		timestamp: new Date().toISOString(),
	});

	return "Stored in MEMORY.md";
}

/**
 * Add a text chunk to the vector index.
 */
async function addToIndex(text: string, metadata: ItemMetadata): Promise<void> {
	if (!index) return;
	if (!(await index.isIndexCreated())) await index.createIndex();

	try {
		const vector = await getEmbedding(text);
		if (!vector) return; // No embedding available — skip silently
		// Strip undefined values — Vectra MetadataTypes doesn't include undefined
		const cleanMeta = Object.fromEntries(
			Object.entries(metadata).filter(([, v]) => v !== undefined)
		) as Record<string, string | number | boolean>;
		await index.insertItem({ vector, metadata: cleanMeta });
	} catch (e) {
		console.error(`[cortex/memory] Index insert failed: ${(e as Error).message}`);
	}
}

/**
 * Rebuild vector index from all memory files.
 */
export async function reindex(): Promise<{ totalChunks: number; files: string[] }> {
	await init();

	// Ensure we can produce embeddings (local model if no Gemini key)
	if (!geminiKey) {
		await loadLocalEmbeddingModel();
	}

	// Clear and recreate
	if (existsSync(INDEX_DIR)) {
		await rm(INDEX_DIR, { recursive: true, force: true });
		await mkdir(INDEX_DIR, { recursive: true });
	}
	index = new LocalIndex(INDEX_DIR);
	await index.createIndex();

	let totalChunks = 0;
	const indexedFiles: string[] = [];

	const ts = new Date().toISOString();

	async function indexFile(filename: string, content: string, type: string): Promise<number> {
		let count = 0;
		// Document-level chunk (whole file for date-range / summary queries)
		if (content.trim().length > 20) {
			await addToIndex(content.trim(), { source: filename, type, text: content.trim(), timestamp: ts, granularity: "document" });
			count++;
		}
		// Section-level chunks (split on ## headings)
		const sections = content.split(/\n(?=##[^#])/).filter((s) => s.trim().length > 20);
		if (sections.length > 1) {
			for (const section of sections) {
				await addToIndex(section.trim(), { source: filename, type, text: section.trim(), timestamp: ts, granularity: "section" });
				count++;
			}
		}
		// Chunk-level chunks (paragraph splitting)
		const chunks = content.split("\n\n").filter((c) => c.trim().length > 20);
		for (const chunk of chunks) {
			await addToIndex(chunk.trim(), { source: filename, type, text: chunk.trim(), timestamp: ts, granularity: "chunk" });
			count++;
		}
		return count;
	}

	// Core files
	for (const filename of ["MEMORY.md", "IDENTITY.md", "USER.md", "SOUL.md"]) {
		const file = join(MEMORY_DIR, filename);
		if (!existsSync(file)) continue;
		const content = await readFile(file, "utf-8");
		const count = await indexFile(filename, content, "core");
		totalChunks += count;
		indexedFiles.push(`${filename} (${count} chunks)`);
	}

	// Daily notes
	const dailyFiles = await glob(join(DAILY_DIR, "*.md"));
	for (const file of dailyFiles) {
		const content = await readFile(file, "utf-8");
		const filename = basename(file);
		const count = await indexFile(filename, content, "daily");
		totalChunks += count;
		indexedFiles.push(`${filename} (${count} chunks)`);
	}

	// PAI shared memory: relationship notes, learning, pi daily summaries
	// Excludes WORK/ and STATE/ to avoid PRD boilerplate noise in search results
	for (const subdir of ["RELATIONSHIP", "LEARNING", "DAILY"]) {
		const paiSubDir = join(PAI_MEMORY_DIR, subdir);
		if (!existsSync(paiSubDir)) continue;
		const paiFiles = await glob(join(paiSubDir, "**", "*.md"));
		for (const file of paiFiles) {
			const content = await readFile(file, "utf-8");
			const filename = `pai/${subdir.toLowerCase()}/${basename(file)}`;
			const count = await indexFile(filename, content, "pai");
			totalChunks += count;
			if (count > 0) indexedFiles.push(`${filename} (${count} chunks)`);
		}
	}

	return { totalChunks, files: indexedFiles };
}

/**
 * Get memory system status.
 */
export async function status(): Promise<{
	hasKey: boolean;
	hasIndex: boolean;
	embeddingModel: string;
	memoryDir: string;
	coreFiles: number;
	dailyFiles: number;
}> {
	await init();

	const coreFiles = ["MEMORY.md", "IDENTITY.md", "USER.md", "SOUL.md"].filter((f) =>
		existsSync(join(MEMORY_DIR, f)),
	).length;
	const dailyFiles = (await glob(join(DAILY_DIR, "*.md"))).length;

	return {
		hasKey: !!geminiKey || usingLocalEmbeddings,
		hasIndex: index ? await index.isIndexCreated() : false,
		embeddingModel: geminiKey ? GEMINI_EMBEDDING_MODEL : `${LOCAL_EMBEDDING_MODEL} (local)`,
		memoryDir: MEMORY_DIR,
		coreFiles,
		dailyFiles,
	};
}
