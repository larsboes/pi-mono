import * as fs from "node:fs";
import {
	getCostTimeSeries, getFileOffset, getMessageById, getMessageCount,
	getModelPerformanceSeries, getModelTimeSeries, getOverallStats,
	getRecentErrors as dbGetRecentErrors, getRecentRequests as dbGetRecentRequests,
	getStatsByFolder, getStatsByModel, getTimeSeries, initDb, insertMessageStats, setFileOffset,
} from "./db";
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
