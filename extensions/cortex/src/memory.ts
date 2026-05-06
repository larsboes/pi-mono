import { readFile, writeFile, appendFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { LocalIndex } from "vectra";
import { glob } from "glob";
import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";
import { rerank as rerankResults, isRerankerAvailable } from "./rerank.js";
import { classifyIntentFull, getIntentWeights, getWeightForSource, type QueryIntent, type IntentResult } from "./intent.js";
import { getRelatedEntities, updateGraph } from "./graph.js";
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
	/** Phase 8.2: intent that was used for scoring */
	intent?: QueryIntent;
}

interface ItemMetadata {
	source: string;
	type: string;
	text: string;
	timestamp: string;
	granularity?: string;
	intent?: string;
	[key: string]: string | number | boolean | undefined;
}

// ── State ──────────────────────────────────────────────────────────────────

let embeddingPipeline: FeatureExtractionPipeline | null = null;
let embeddingLoadPromise: Promise<FeatureExtractionPipeline> | null = null;
let index: LocalIndex | null = null;
let initialized = false;

// ── Init ───────────────────────────────────────────────────────────────────

export async function init(): Promise<{ hasKey: boolean; hasIndex: boolean }> {
	if (initialized) {
		return {
			hasKey: true,
			hasIndex: index ? await index.isIndexCreated() : false,
		};
	}

	// Ensure directories
	for (const dir of [MEMORY_DIR, CORTEX_DIR, INDEX_DIR, DAILY_DIR]) {
		if (!existsSync(dir)) await mkdir(dir, { recursive: true });
	}

	console.log(`[cortex/memory] Using local embeddings (${LOCAL_EMBEDDING_MODEL})`);

	// Init vector index
	index = new LocalIndex(INDEX_DIR);
	initialized = true;

	return {
		hasKey: true,
		hasIndex: await index.isIndexCreated(),
	};
}

// ── Embeddings ─────────────────────────────────────────────────────────────

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

async function getEmbedding(text: string): Promise<number[] | null> {
	try {
		const pipe = await loadLocalEmbeddingModel();
		const truncated = text.slice(0, 512);
		const result = await pipe(truncated, { pooling: "mean", normalize: true });
		return Array.from(result.data as Float32Array);
	} catch (e) {
		console.error(`[cortex/memory] Embedding failed: ${(e as Error).message}`);
		return null;
	}
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

export interface SearchOptions {
	rerank?: boolean;
	intent?: QueryIntent;
	granularity?: "document" | "section" | "chunk";
	contextEntities?: string[];
}

/**
 * Search memory: full Phase 8 pipeline.
 *
 * Pipeline stages (in order):
 * 1. Retrieve candidates (bi-encoder vector or keyword fallback)
 * 2. Intent classification + auto-granularity routing (8.2 + 8.4)
 * 3. Granularity filter (8.4)
 * 4. Intent-weighted scoring (8.2)
 * 5. Entity graph expansion boost (8.3)
 * 6. Session context boost (8.5)
 * 7. Personal weight adjustment (8.6)
 * 8. Cross-encoder reranking (8.1)
 */
export async function search(
	query: string,
	maxResults = 5,
	options?: SearchOptions,
): Promise<MemoryResult[]> {
	await init();

	// ── Stage 1: Retrieve candidates ────────────────────────────────
	let candidates: MemoryResult[] = [];
	try {
		const vectorResults = await vectorSearch(query, maxResults * 4);
		if (vectorResults && vectorResults.length > 0) {
			candidates = vectorResults;
		}
	} catch (e) {
		console.error(`[cortex/memory] Vector search failed: ${(e as Error).message}, falling back to keyword`);
	}

	if (candidates.length === 0) {
		candidates = await keywordSearch(query, maxResults * 4);
	}

	if (candidates.length === 0) return [];

	// ── Stage 2: Intent classification (8.2) ─────────────────────────
	const intentResult: IntentResult = classifyIntentFull(query);
	const activeIntent = options?.intent ?? intentResult.intent;
	const intentWeights = getIntentWeights(activeIntent);

	// ── Stage 3: Granularity filter (8.4) ────────────────────────────
	// Use explicit granularity if provided, else auto-route from intent
	const granularityFilter = options?.granularity ?? intentResult.suggestedGranularity;
	if (granularityFilter) {
		const filtered = candidates.filter((r) => {
			// Keep items without granularity metadata (old index entries)
			if (!r.granularity) return true;
			return r.granularity === granularityFilter;
		});
		// Only apply filter if it doesn't eliminate everything
		if (filtered.length >= Math.min(3, candidates.length * 0.3)) {
			candidates = filtered;
		}
	}

	// ── Stage 4: Intent-weighted scoring (8.2) ───────────────────────
	if (activeIntent !== "general") {
		candidates = candidates.map((r) => {
			const multiplier = getWeightForSource(r.source, intentWeights);
			return { ...r, score: Math.min(1.0, r.score * multiplier), intent: activeIntent };
		});
		candidates.sort((a, b) => b.score - a.score);
	}

	// ── Stage 5: Entity graph expansion boost (8.3) ──────────────────
	try {
		const relatedEntities = await getRelatedEntities(query, 15);
		if (relatedEntities.length > 0) {
			candidates = candidates.map((r) => {
				const lowerText = (r.source + " " + r.text).toLowerCase();
				const matchCount = relatedEntities.filter((e) =>
					lowerText.includes(e.toLowerCase())
				).length;
				if (matchCount === 0) return r;
				// Graduated boost: more entity matches = bigger boost (diminishing returns)
				const boost = Math.min(0.2, matchCount * 0.05);
				return { ...r, score: Math.min(1.0, r.score + boost) };
			});
			candidates.sort((a, b) => b.score - a.score);
		}
	} catch {
		// graph expansion is best-effort
	}

	// ── Stage 6: Session context boost (8.5) ─────────────────────────
	if (options?.contextEntities && options.contextEntities.length > 0) {
		candidates = candidates.map((r) => {
			const lowerText = (r.source + " " + r.text).toLowerCase();
			const matchCount = options.contextEntities!.filter((e) =>
				lowerText.includes(e.toLowerCase())
			).length;
			if (matchCount === 0) return r;
			// Boost scales with how many session entities match, but caps at 0.2
			const boost = Math.min(0.2, matchCount * 0.07);
			return { ...r, score: Math.min(1.0, r.score + boost) };
		});
		candidates.sort((a, b) => b.score - a.score);
	}

	// ── Stage 7: Personal weight adjustment (8.6) ────────────────────
	try {
		const weights = await computePersonalWeights();
		if (Object.keys(weights).length > 0) {
			const adjusted = applyPersonalWeights(
				candidates.map(c => ({ source: c.source, score: c.score })),
				weights,
			);
			// Apply adjusted scores back
			for (let i = 0; i < candidates.length; i++) {
				if (adjusted[i]) candidates[i].score = adjusted[i].score;
			}
			candidates.sort((a, b) => b.score - a.score);
		}
	} catch {
		// personalization is best-effort
	}

	// ── Stage 8: Cross-encoder reranking (8.1) ───────────────────────
	if (options?.rerank && candidates.length > 0) {
		const canRerank = await isRerankerAvailable();
		if (canRerank) {
			try {
				const reranked = await rerankResults(query, candidates, maxResults);
				const finalResults: MemoryResult[] = reranked.map((r) => ({
					source: r.source,
					text: r.text,
					score: r.score,
					method: r.method,
					rerankScore: r.rerankScore,
					granularity: candidates.find((c) => c.source === r.source && c.text === r.text)?.granularity,
					intent: activeIntent,
				}));
				// Log interaction for feedback loop
				logInteraction(query, finalResults.map((r) => r.source), "search", activeIntent).catch(() => {});
				return finalResults;
			} catch (e) {
				console.error(`[cortex/memory] Reranking failed: ${(e as Error).message}`);
			}
		}
	}

	const finalResults = candidates.slice(0, maxResults);
	// Log interaction for feedback loop
	logInteraction(query, finalResults.map((r) => r.source), "search", activeIntent).catch(() => {});
	return finalResults;
}

/**
 * Store text in memory. Optionally add to daily log.
 * Phase 8.3: Also updates entity graph with extracted entities.
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
			granularity: "chunk",
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

		// Phase 8.3: Update entity graph from stored text
		updateGraph(text, `store-daily-${today}`).catch(() => {});

		return `Stored in daily/${today}.md`;
	}

	const file = join(MEMORY_DIR, "MEMORY.md");
	await appendFile(file, `\n\n${text}`);

	await addToIndex(text, {
		source: "MEMORY.md",
		type: "core",
		text,
		timestamp: new Date().toISOString(),
		granularity: "chunk",
	});

	// Phase 8.3: Update entity graph
	updateGraph(text, `store-core-${Date.now()}`).catch(() => {});

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
		if (!vector) return;
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
 * Phase 8.4: Indexes at three granularity levels (document, section, chunk).
 */
export async function reindex(): Promise<{ totalChunks: number; files: string[] }> {
	await init();

	// Ensure local model is ready
	await loadLocalEmbeddingModel();

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

		// Phase 8.4: Document-level (whole file → date-range and summary queries)
		if (content.trim().length > 20) {
			// For document level, truncate to first 2000 chars to keep embedding meaningful
			const docText = content.trim().slice(0, 2000);
			await addToIndex(docText, { source: filename, type, text: docText, timestamp: ts, granularity: "document" });
			count++;
		}

		// Phase 8.4: Section-level (## headings → topic clusters)
		const sections = content.split(/\n(?=##[^#])/).filter((s) => s.trim().length > 20);
		if (sections.length > 1) {
			for (const section of sections) {
				const sectionText = section.trim().slice(0, 1000);
				await addToIndex(sectionText, { source: filename, type, text: sectionText, timestamp: ts, granularity: "section" });
				count++;
			}
		}

		// Phase 8.4: Chunk-level (paragraphs → specific facts)
		const chunks = content.split("\n\n").filter((c) => c.trim().length > 20);
		for (const chunk of chunks) {
			const chunkText = chunk.trim().slice(0, 512);
			await addToIndex(chunkText, { source: filename, type, text: chunkText, timestamp: ts, granularity: "chunk" });
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
		hasKey: true,
		hasIndex: index ? await index.isIndexCreated() : false,
		embeddingModel: `${LOCAL_EMBEDDING_MODEL} (local)`,
		memoryDir: MEMORY_DIR,
		coreFiles,
		dailyFiles,
	};
}
