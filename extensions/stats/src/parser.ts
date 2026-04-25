import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { MessageStats, SessionEntry, SessionMessageEntry } from "./types";

const SESSIONS_DIR = path.join(os.homedir(), ".pi", "agent", "sessions");

function extractFolderFromPath(sessionPath: string): string {
	const rel = path.relative(SESSIONS_DIR, sessionPath);
	const projectDir = rel.split(path.sep)[0];
	return projectDir.replace(/^--/, "/").replace(/--/g, "/");
}

function isAssistantMessage(entry: SessionEntry): entry is SessionMessageEntry {
	if (entry.type !== "message") return false;
	return (entry as SessionMessageEntry).message?.role === "assistant";
}

function extractStats(sessionFile: string, folder: string, entry: SessionMessageEntry): MessageStats | null {
	const msg = entry.message as Record<string, unknown>;
	if (!msg || msg.role !== "assistant") return null;

	return {
		sessionFile,
		entryId: entry.id,
		folder,
		model: (msg.model as string) ?? "unknown",
		provider: (msg.provider as string) ?? "unknown",
		api: (msg.api as string) ?? "unknown",
		timestamp: typeof msg.timestamp === "number" ? msg.timestamp : new Date(entry.timestamp).getTime(),
		duration: (msg.duration as number | undefined) ?? null,
		ttft: (msg.ttft as number | undefined) ?? null,
		stopReason: (msg.stopReason as string) ?? "end_turn",
		errorMessage: (msg.errorMessage as string | undefined) ?? null,
		usage: (msg.usage as MessageStats["usage"]) ?? {
			input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
			premiumRequests: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
	};
}

function parseLines(text: string): SessionEntry[] {
	const entries: SessionEntry[] = [];
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
		if (isAssistantMessage(entry)) {
			const s = extractStats(sessionPath, folder, entry);
			if (s) stats.push(s);
		}
	}

	const fullSize = (await fs.stat(sessionPath)).size;
	return { stats, newOffset: fullSize };
}

export async function listSessionFolders(): Promise<string[]> {
	try {
		const entries = await fs.readdir(SESSIONS_DIR, { withFileTypes: true });
		return entries.filter(e => e.isDirectory()).map(e => path.join(SESSIONS_DIR, e.name));
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
		if ("id" in entry && (entry as SessionMessageEntry).id === entryId) return entry;
	}
	return null;
}
