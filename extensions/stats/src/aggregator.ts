import * as fs from "node:fs";
import {
	getCostTimeSeries, getFileOffset, getMessageById, getMessageCount,
	getModelPerformanceSeries, getModelTimeSeries, getOverallStats,
	getRecentErrors as dbGetRecentErrors, getRecentRequests as dbGetRecentRequests,
	getSessionsSummary, getStatsByFolder, getStatsByModel, getTimeSeries, initDb, insertMessageStats, setFileOffset,
} from "./db";
import type { SessionSummaryRow } from "./db";
import * as piParser from "./parsers/pi";
import * as ccParser from "./parsers/claude-code";
import type { DashboardStats, MessageStats, RequestDetails, StatsSource } from "./types";

type Parser = {
	parseSessionFile: (path: string, fromOffset?: number) => Promise<{ stats: MessageStats[]; newOffset: number }>;
	listAllSessionFiles: () => Promise<string[]>;
	getSessionEntry: (path: string, entryId: string) => Promise<unknown | null>;
};

const parsers: Record<StatsSource, Parser> = {
	pi: piParser as Parser,
	"claude-code": ccParser as Parser,
};

async function syncSessionFile(parser: Parser, sessionFile: string): Promise<number> {
	let fileStats: fs.Stats;
	try { fileStats = await fs.promises.stat(sessionFile); } catch { return 0; }

	const lastModified = fileStats.mtimeMs;
	const stored = getFileOffset(sessionFile);
	if (stored && stored.lastModified >= lastModified) return 0;

	const fromOffset = stored?.offset ?? 0;
	const { stats, newOffset } = await parser.parseSessionFile(sessionFile, fromOffset);
	if (stats.length > 0) insertMessageStats(stats);
	setFileOffset(sessionFile, newOffset, lastModified);
	return stats.length;
}

export async function syncAllSessions(): Promise<{ processed: number; files: number; bySource: Record<string, number> }> {
	await initDb();
	let totalProcessed = 0, filesProcessed = 0;
	const bySource: Record<string, number> = {};

	for (const [sourceName, parser] of Object.entries(parsers)) {
		const files = await parser.listAllSessionFiles();
		let sourceCount = 0;
		for (const file of files) {
			const count = await syncSessionFile(parser, file);
			if (count > 0) { totalProcessed += count; filesProcessed++; sourceCount += count; }
		}
		bySource[sourceName] = sourceCount;
	}

	return { processed: totalProcessed, files: filesProcessed, bySource };
}

export async function getDashboardStats(sinceTs?: number): Promise<DashboardStats> {
	await initDb();
	return {
		overall: getOverallStats(sinceTs),
		byModel: getStatsByModel(sinceTs),
		byFolder: getStatsByFolder(sinceTs),
		timeSeries: getTimeSeries(24, sinceTs),
		modelSeries: getModelTimeSeries(14, sinceTs),
		modelPerformanceSeries: getModelPerformanceSeries(14, sinceTs),
		costSeries: getCostTimeSeries(90, sinceTs),
	};
}

export async function getRecentRequests(limit?: number): Promise<MessageStats[]> {
	await initDb();
	return dbGetRecentRequests(limit);
}

export async function getRecentErrors(limit?: number): Promise<MessageStats[]> {
	await initDb();
	return dbGetRecentErrors(limit);
}

export async function getRequestDetails(id: number): Promise<RequestDetails | null> {
	await initDb();
	const msg = getMessageById(id);
	if (!msg) return null;
	const parser = parsers[msg.source ?? "pi"];
	if (!parser) return null;
	const entry = await parser.getSessionEntry(msg.sessionFile, msg.entryId);
	if (!entry) return null;
	// pi entries have .type === "message"; CC entries have .type === "assistant".
	// Normalize output so downstream keeps working.
	const e = entry as { type?: string; message?: unknown };
	return { ...msg, messages: [entry], output: e.message ?? entry };
}

export async function getTotalMessageCount(): Promise<number> {
	await initDb();
	return getMessageCount();
}

export interface SessionInfo {
	id: string;
	file: string;
	folder: string;
	source: string;
	startedAt: number;
	lastActiveAt: number;
	durationMin: number;
	requests: number;
	cost: number;
	tokens: number;
	models: string[];
	firstUserMessage: string | null;
}

/** Extract first user message from a session JSONL file (reads first ~8KB). */
async function getFirstUserMessage(sessionPath: string): Promise<string | null> {
	try {
		const handle = await fs.promises.open(sessionPath, "r");
		const buf = Buffer.alloc(8192);
		const { bytesRead } = await handle.read(buf, 0, 8192, 0);
		await handle.close();
		const text = buf.subarray(0, bytesRead).toString("utf-8");
		for (const line of text.split("\n")) {
			if (!line.trim()) continue;
			try {
				const obj = JSON.parse(line);
				if (obj.type === "message" && obj.message?.role === "user") {
					const content = obj.message.content;
					if (typeof content === "string") return content.slice(0, 120);
					if (Array.isArray(content)) {
						for (const part of content) {
							if (part?.type === "text" && part.text) return part.text.slice(0, 120);
						}
					}
				}
			} catch { /* skip malformed lines */ }
		}
	} catch { /* file unreadable */ }
	return null;
}

/** Extract session UUID from filename (format: timestamp_uuid.jsonl). */
function extractSessionId(filePath: string): string {
	const basename = filePath.split("/").pop() ?? filePath;
	const match = basename.match(/_([-a-f0-9]+)\.jsonl$/);
	return match ? match[1] : basename;
}

export async function listSessions(sinceTs?: number, limit = 20): Promise<SessionInfo[]> {
	await initDb();
	const rows = getSessionsSummary(sinceTs, limit + 20); // fetch extra to filter
	const results: SessionInfo[] = [];

	for (const row of rows) {
		// Skip noise: CC synthetic sessions with 1 req and no cost
		if (row.source === "claude-code" && row.totalRequests <= 1 && row.totalCost < 0.01) continue;
		const firstMsg = await getFirstUserMessage(row.sessionFile);
		const durationMin = Math.round((row.lastTimestamp - row.firstTimestamp) / 60000);
		results.push({
			id: extractSessionId(row.sessionFile),
			file: row.sessionFile,
			folder: row.folder,
			source: row.source,
			startedAt: row.firstTimestamp,
			lastActiveAt: row.lastTimestamp,
			durationMin,
			requests: row.totalRequests,
			cost: row.totalCost,
			tokens: row.totalInputTokens + row.totalOutputTokens,
			models: row.models ? row.models.split(",").slice(0, 3) : [],
			firstUserMessage: firstMsg,
		});
		if (results.length >= limit) break;
	}

	return results;
}
