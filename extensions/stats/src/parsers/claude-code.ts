import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { calculateCost, getModel, getProviders, getModels } from "@mariozechner/pi-ai";
import type { Api, KnownProvider, Model, Usage } from "@mariozechner/pi-ai";
import type { MessageStats, SessionEntry, SessionMessageEntry } from "../types";

const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

type CCUsage = {
	input_tokens?: number;
	output_tokens?: number;
	cache_read_input_tokens?: number;
	cache_creation_input_tokens?: number;
};

type CCAssistantEntry = {
	type: "assistant";
	uuid: string;
	timestamp: string;
	sessionId?: string;
	cwd?: string;
	message: {
		id?: string;
		model?: string;
		role?: string;
		stop_reason?: string | null;
		usage?: CCUsage;
	};
};

function extractFolderFromPath(sessionPath: string): string {
	const rel = path.relative(PROJECTS_DIR, sessionPath);
	const projectDir = rel.split(path.sep)[0];
	return projectDir.replace(/^--/, "/").replace(/--/g, "/");
}

function detectProvider(messageId: string | undefined): string {
	if (!messageId) return "anthropic";
	if (messageId.startsWith("msg_bdrk_")) return "amazon-bedrock";
	if (messageId.startsWith("msg_vrtx_")) return "google-vertex";
	return "anthropic";
}

function detectApi(provider: string): string {
	if (provider === "amazon-bedrock") return "bedrock-converse-stream";
	if (provider === "google-vertex") return "google-vertex";
	return "anthropic-messages";
}

// Cross-provider model lookup: CC may record bare IDs ("claude-haiku-4-5-20251001")
// or Bedrock-prefixed IDs ("anthropic.claude-haiku-4-5-20251001-v1:0").
// Walk the full registry to find a matching price regardless of provider.
function findModelPricing(modelId: string): Model<Api> | null {
	const providers = getProviders();
	for (const provider of providers) {
		const direct = getModel(provider as KnownProvider, modelId as never);
		if (direct) return direct as Model<Api>;
	}
	for (const provider of providers) {
		for (const m of getModels(provider as KnownProvider)) {
			const id = (m as Model<Api>).id;
			if (id === modelId) return m as Model<Api>;
			if (id.endsWith(modelId) || id.includes(modelId)) return m as Model<Api>;
			if (modelId.endsWith(id) || modelId.includes(id)) return m as Model<Api>;
		}
	}
	return null;
}

function emptyUsage(): Usage {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function buildUsage(ccUsage: CCUsage | undefined, modelId: string): Usage {
	const input = ccUsage?.input_tokens ?? 0;
	const output = ccUsage?.output_tokens ?? 0;
	const cacheRead = ccUsage?.cache_read_input_tokens ?? 0;
	const cacheWrite = ccUsage?.cache_creation_input_tokens ?? 0;
	const usage: Usage = {
		input,
		output,
		cacheRead,
		cacheWrite,
		totalTokens: input + output + cacheRead + cacheWrite,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
	const model = findModelPricing(modelId);
	if (model) {
		calculateCost(model, usage);
	}
	return usage;
}

function isAssistantEntry(entry: unknown): entry is CCAssistantEntry {
	if (!entry || typeof entry !== "object") return false;
	const e = entry as { type?: unknown; message?: { role?: unknown } };
	return e.type === "assistant" && e.message?.role === "assistant";
}

function extractStats(sessionFile: string, folder: string, entry: CCAssistantEntry): MessageStats | null {
	const msg = entry.message;
	if (!msg) return null;
	const modelId = msg.model ?? "unknown";
	const provider = detectProvider(msg.id);
	const api = detectApi(provider);
	return {
		sessionFile,
		entryId: entry.uuid,
		folder,
		source: "claude-code",
		model: modelId,
		provider,
		api,
		timestamp: new Date(entry.timestamp).getTime(),
		duration: null,
		ttft: null,
		stopReason: msg.stop_reason ?? "end_turn",
		errorMessage: null,
		usage: msg.usage ? buildUsage(msg.usage, modelId) : emptyUsage(),
	};
}

function parseLines(text: string): unknown[] {
	const entries: unknown[] = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			entries.push(JSON.parse(trimmed));
		} catch {
			// skip malformed lines
		}
	}
	return entries;
}

export async function parseSessionFile(
	sessionPath: string,
	fromOffset = 0,
): Promise<{ stats: MessageStats[]; newOffset: number }> {
	let content: string;
	try {
		const buf = await fs.readFile(sessionPath);
		content = buf.subarray(fromOffset).toString("utf-8");
	} catch {
		return { stats: [], newOffset: fromOffset };
	}

	const folder = extractFolderFromPath(sessionPath);
	const entries = parseLines(content);
	const stats: MessageStats[] = [];

	for (const entry of entries) {
		if (isAssistantEntry(entry)) {
			const s = extractStats(sessionPath, folder, entry);
			if (s) stats.push(s);
		}
	}

	const fullSize = (await fs.stat(sessionPath)).size;
	return { stats, newOffset: fullSize };
}

export async function listSessionFolders(): Promise<string[]> {
	try {
		const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
		return entries.filter(e => e.isDirectory()).map(e => path.join(PROJECTS_DIR, e.name));
	} catch {
		return [];
	}
}

export async function listSessionFiles(folderPath: string): Promise<string[]> {
	try {
		const entries = await fs.readdir(folderPath, { recursive: true, withFileTypes: true });
		return entries
			.filter(e => e.isFile() && e.name.endsWith(".jsonl"))
			.map(e => path.join((e as unknown as { parentPath: string }).parentPath ?? folderPath, e.name));
	} catch {
		return [];
	}
}

export async function listAllSessionFiles(): Promise<string[]> {
	const folders = await listSessionFolders();
	const all: string[] = [];
	for (const folder of folders) {
		all.push(...(await listSessionFiles(folder)));
	}
	return all;
}

export async function getSessionEntry(sessionPath: string, entryId: string): Promise<SessionEntry | null> {
	let content: string;
	try {
		content = await fs.readFile(sessionPath, "utf-8");
	} catch {
		return null;
	}
	for (const entry of parseLines(content)) {
		if (entry && typeof entry === "object") {
			const e = entry as { uuid?: string };
			if (e.uuid === entryId) return entry as unknown as SessionEntry;
		}
	}
	return null;
}
