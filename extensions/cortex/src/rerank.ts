import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

// ── Paths ──────────────────────────────────────────────────────────────────

const CORTEX_DIR = join(homedir(), ".pi", "memory", "cortex");
const RERANK_CACHE_FILE = join(CORTEX_DIR, "rerank-cache.json");
const MODEL_CACHE_DIR = join(homedir(), ".cache", "pi-cortex", "models");

// ── Config ─────────────────────────────────────────────────────────────────

// Primary: all-MiniLM-L6-v2 (proven working, public, fast)
// Note: mixedbread-ai rerankers have tensor format issues
// Note: Xenova/cross-encoder-ms-marco requires HuggingFace auth
const RERANKER_MODEL = "Xenova/all-MiniLM-L6-v2";

// Cache TTL: 1 hour (3600000 ms)
const CACHE_TTL_MS = 3600_000;

// Batch size for inference
const BATCH_SIZE = 4;

// ── Types ───────────────────────────────────────────────────────────────────

interface RerankCacheEntry {
	query: string;
	documentText: string;
	score: number;
	timestamp: number;
	model: string;
}

interface RerankCache {
	entries: Record<string, RerankCacheEntry>;
	version: number;
}

export interface RerankResult {
	text: string;
	score: number;
	rerankScore: number;
	source: string;
	method: "vector" | "keyword";
}

// ── State ───────────────────────────────────────────────────────────────────

let rerankerPipeline: FeatureExtractionPipeline | null = null;
let currentModelName: string | null = null;
let cache: RerankCache | null = null;
let modelLoadPromise: Promise<FeatureExtractionPipeline> | null = null;

// ── Cache Management ────────────────────────────────────────────────────────

function getCacheKey(query: string, documentText: string): string {
	const q = query.slice(0, 50);
	const d = documentText.slice(0, 50);
	return `${query.length}:${q}:${documentText.length}:${d}`;
}

async function loadCache(): Promise<RerankCache> {
	if (cache) return cache;

	if (!existsSync(CORTEX_DIR)) {
		await mkdir(CORTEX_DIR, { recursive: true });
	}

	if (existsSync(RERANK_CACHE_FILE)) {
		try {
			const raw = await readFile(RERANK_CACHE_FILE, "utf-8");
			const parsed = JSON.parse(raw) as RerankCache;
			const now = Date.now();
			const cleaned: Record<string, RerankCacheEntry> = {};
			for (const [key, entry] of Object.entries(parsed.entries)) {
				if (now - entry.timestamp < CACHE_TTL_MS) {
					cleaned[key] = entry;
				}
			}
			cache = { entries: cleaned, version: parsed.version || 1 };
			return cache;
		} catch {
			// Corrupt cache, reset
		}
	}

	cache = { entries: {}, version: 1 };
	return cache;
}

async function saveCache(): Promise<void> {
	if (!cache) return;
	await writeFile(RERANK_CACHE_FILE, JSON.stringify(cache, null, 2));
}

async function getCachedScore(query: string, documentText: string): Promise<number | null> {
	const c = await loadCache();
	const key = getCacheKey(query, documentText);
	const entry = c.entries[key];
	if (!entry) return null;

	const now = Date.now();
	if (now - entry.timestamp >= CACHE_TTL_MS) {
		delete c.entries[key];
		return null;
	}

	return entry.score;
}

async function setCachedScore(query: string, documentText: string, score: number): Promise<void> {
	const c = await loadCache();
	const key = getCacheKey(query, documentText);
	c.entries[key] = {
		query,
		documentText,
		score,
		timestamp: Date.now(),
		model: currentModelName || RERANKER_MODEL,
	};
	await saveCache();
}

// ── Model Loading ───────────────────────────────────────────────────────────

async function loadModel(): Promise<FeatureExtractionPipeline> {
	// Return existing pipeline
	if (rerankerPipeline) return rerankerPipeline;

	// Return in-flight promise if loading
	if (modelLoadPromise) return modelLoadPromise;

	// Start new load
	modelLoadPromise = (async () => {
		if (!existsSync(MODEL_CACHE_DIR)) {
			await mkdir(MODEL_CACHE_DIR, { recursive: true });
		}

		console.log(`[cortex/rerank] Loading model: ${RERANKER_MODEL}...`);

		const pipe = await pipeline("feature-extraction", RERANKER_MODEL, {
			cache_dir: MODEL_CACHE_DIR,
			quantized: true,
		});

		rerankerPipeline = pipe;
		currentModelName = RERANKER_MODEL;
		console.log(`[cortex/rerank] Model loaded: ${RERANKER_MODEL}`);
		return pipe;
	})();

	try {
		return await modelLoadPromise;
	} catch (e) {
		modelLoadPromise = null;
		throw e;
	}
}

// ── Scoring Logic ───────────────────────────────────────────────────────────

async function embedText(pipe: FeatureExtractionPipeline, text: string): Promise<Float32Array> {
	const maxLen = 512;
	const truncated = text.slice(0, maxLen);
	const result = await pipe(truncated, { pooling: "mean", normalize: true });
	return result.data as Float32Array;
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
	let dot = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
	}
	// Both normalized, so dot product = cosine similarity
	return (dot + 1) / 2; // Scale to 0-1
}

async function scorePair(pipe: FeatureExtractionPipeline, query: string, document: string): Promise<number> {
	const cached = await getCachedScore(query, document);
	if (cached !== null) return cached;

	const [queryVec, docVec] = await Promise.all([
		embedText(pipe, query),
		embedText(pipe, document),
	]);

	const score = cosineSimilarity(queryVec, docVec);
	await setCachedScore(query, document, score);
	return score;
}

async function scoreBatch(
	pipe: FeatureExtractionPipeline,
	query: string,
	documents: Array<{ text: string; source: string; method: "vector" | "keyword" }>,
): Promise<Array<{ text: string; source: string; method: "vector" | "keyword"; score: number }>> {
	const results: Array<{ text: string; source: string; method: "vector" | "keyword"; score: number }> = [];

	for (let i = 0; i < documents.length; i += BATCH_SIZE) {
		const batch = documents.slice(i, i + BATCH_SIZE);
		const batchPromises = batch.map(async (doc) => {
			const score = await scorePair(pipe, query, doc.text);
			return { ...doc, score };
		});

		const batchResults = await Promise.all(batchPromises);
		results.push(...batchResults);
	}

	return results;
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function rerank(
	query: string,
	candidates: Array<{ text: string; score: number; source: string; method: "vector" | "keyword" }>,
	topK = 5,
): Promise<RerankResult[]> {
	if (candidates.length === 0) return [];

	const candidatesToRerank = candidates.length <= topK * 2 ? candidates : candidates.slice(0, topK * 2);

	console.log(`[cortex/rerank] Reranking ${candidatesToRerank.length} candidates...`);
	const startTime = Date.now();

	try {
		const pipe = await loadModel();
		const scored = await scoreBatch(
			pipe,
			query,
			candidatesToRerank.map((c) => ({ text: c.text, source: c.source, method: c.method })),
		);

		// Combine: 30% original + 70% rerank
		const combined = candidatesToRerank.map((orig, i) => ({
			text: orig.text,
			source: orig.source,
			method: orig.method,
			score: orig.score,
			rerankScore: scored[i]?.score ?? 0.5,
			combinedScore: orig.score * 0.3 + (scored[i]?.score ?? 0.5) * 0.7,
		}));

		combined.sort((a, b) => b.combinedScore - a.combinedScore);

		const elapsed = Date.now() - startTime;
		console.log(`[cortex/rerank] Reranking complete in ${elapsed}ms`);

		return combined.slice(0, topK);
	} catch (e) {
		console.error(`[cortex/rerank] Reranking failed: ${(e as Error).message}`);
		return candidates.slice(0, topK).map((c) => ({ ...c, rerankScore: c.score }));
	}
}

export async function isRerankerAvailable(): Promise<boolean> {
	try {
		await loadModel();
		return true;
	} catch {
		return false;
	}
}

export async function getStatus(): Promise<{
	available: boolean;
	model: string | null;
	cacheSize: number;
}> {
	const c = await loadCache();
	return {
		available: rerankerPipeline !== null,
		model: currentModelName,
		cacheSize: Object.keys(c.entries).length,
	};
}

export async function clearCache(): Promise<void> {
	cache = { entries: {}, version: 1 };
	await saveCache();
	console.log("[cortex/rerank] Cache cleared");
}
