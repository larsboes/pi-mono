import { readFile, writeFile, appendFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { LocalIndex } from "vectra";
import { glob } from "glob";
import { rerank as rerankResults, isRerankerAvailable } from "./rerank.js";

// ── Paths ──────────────────────────────────────────────────────────────────

const HOME = homedir();
const MEMORY_DIR = join(HOME, ".pi", "memory");
const CORTEX_DIR = join(MEMORY_DIR, "cortex");
const INDEX_DIR = join(CORTEX_DIR, "vectors");
const DAILY_DIR = join(MEMORY_DIR, "daily");
const ENV_FILE = join(HOME, ".pi", ".env");

const EMBEDDING_MODEL = "gemini-embedding-001";

// ── Types ──────────────────────────────────────────────────────────────────

export interface MemoryResult {
	source: string;
	text: string;
	score: number;
	method: "vector" | "keyword";
	/** Cross-encoder rerank score (0-1, higher = more relevant). Present if reranking enabled. */
	rerankScore?: number;
}

interface ItemMetadata {
	source: string;
	type: string;
	text: string;
	timestamp: string;
	[key: string]: string | number | boolean;
}

// ── State ──────────────────────────────────────────────────────────────────

let geminiKey: string | null = null;
let index: LocalIndex | null = null;
let initialized = false;

// ── Init ───────────────────────────────────────────────────────────────────

export async function init(): Promise<{ hasKey: boolean; hasIndex: boolean }> {
	if (initialized) {
		return {
			hasKey: !!geminiKey,
			hasIndex: index ? await index.isIndexCreated() : false,
		};
	}

	// Ensure directories
	for (const dir of [MEMORY_DIR, CORTEX_DIR, INDEX_DIR, DAILY_DIR]) {
		if (!existsSync(dir)) await mkdir(dir, { recursive: true });
	}

	// Load API key
	geminiKey = loadGeminiKey();

	// Init vector index
	index = new LocalIndex(INDEX_DIR);

	initialized = true;

	return {
		hasKey: !!geminiKey,
		hasIndex: await index.isIndexCreated(),
	};
}

function loadGeminiKey(): string | null {
	if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;

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
	return null;
}

// ── Embeddings ─────────────────────────────────────────────────────────────

async function getEmbedding(text: string): Promise<number[] | null> {
	if (!geminiKey) return null;

	const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${geminiKey}`;

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
	const allFiles = [...coreFiles, ...dailyFiles];

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
	}));
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Search memory: vector first, keyword fallback.
 * Optionally reranks results with local cross-encoder for higher precision.
 */
export async function search(
	query: string,
	maxResults = 5,
	options?: { rerank?: boolean },
): Promise<MemoryResult[]> {
	await init();

	// Stage 1: Retrieve candidates (bi-encoder or keyword)
	let candidates: MemoryResult[] = [];
	try {
		const vectorResults = await vectorSearch(query, maxResults * 2);
		if (vectorResults && vectorResults.length > 0) {
			candidates = vectorResults;
		}
	} catch (e) {
		console.error(`[cortex/memory] Vector search failed: ${(e as Error).message}, falling back to keyword`);
	}

	if (candidates.length === 0) {
		candidates = await keywordSearch(query, maxResults * 2);
	}

	// Stage 2: Rerank with cross-encoder if requested and available
	if (options?.rerank && candidates.length > 0) {
		const canRerank = await isRerankerAvailable();
		if (canRerank) {
			try {
				const { rerank } = await import("./rerank.js");
				const reranked = await rerank(query, candidates, maxResults);
				return reranked.map((r) => ({
					source: r.source,
					text: r.text,
					score: r.score,
					method: r.method,
					rerankScore: r.rerankScore,
				}));
			} catch (e) {
				console.error(`[cortex/memory] Reranking failed: ${(e as Error).message}, returning original results`);
			}
		} else {
			console.log("[cortex/memory] Reranker not available, using original scores");
		}
	}

	return candidates.slice(0, maxResults);
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
		if (!vector) return; // No API key — skip silently
		await index.insertItem({ vector, metadata });
	} catch (e) {
		console.error(`[cortex/memory] Index insert failed: ${(e as Error).message}`);
	}
}

/**
 * Rebuild vector index from all memory files.
 */
export async function reindex(): Promise<{ totalChunks: number; files: string[] }> {
	await init();

	if (!geminiKey) {
		throw new Error("No GEMINI_API_KEY found. Set it in ~/.pi/.env or environment.");
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

	// Core files
	for (const filename of ["MEMORY.md", "IDENTITY.md", "USER.md", "SOUL.md"]) {
		const file = join(MEMORY_DIR, filename);
		if (!existsSync(file)) continue;
		const content = await readFile(file, "utf-8");
		const chunks = content.split("\n\n").filter((c) => c.trim().length > 20);
		for (const chunk of chunks) {
			await addToIndex(chunk.trim(), { source: filename, type: "core", text: chunk.trim(), timestamp: new Date().toISOString() });
			totalChunks++;
		}
		indexedFiles.push(`${filename} (${chunks.length} chunks)`);
	}

	// Daily notes
	const dailyFiles = await glob(join(DAILY_DIR, "*.md"));
	for (const file of dailyFiles) {
		const content = await readFile(file, "utf-8");
		const chunks = content.split("\n\n").filter((c) => c.trim().length > 20);
		const filename = basename(file);
		for (const chunk of chunks) {
			await addToIndex(chunk.trim(), { source: filename, type: "daily", text: chunk.trim(), timestamp: new Date().toISOString() });
			totalChunks++;
		}
		indexedFiles.push(`${filename} (${chunks.length} chunks)`);
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
		hasKey: !!geminiKey,
		hasIndex: index ? await index.isIndexCreated() : false,
		embeddingModel: EMBEDDING_MODEL,
		memoryDir: MEMORY_DIR,
		coreFiles,
		dailyFiles,
	};
}
