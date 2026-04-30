import * as fs from "node:fs";
import {
	getCostTimeSeries, getFileOffset, getMessageById, getMessageCount,
	getModelPerformanceSeries, getModelTimeSeries, getOverallStats,
	getRecentErrors as dbGetRecentErrors, getRecentRequests as dbGetRecentRequests,
	getStatsByFolder, getStatsByModel, getTimeSeries, initDb, insertMessageStats, setFileOffset,
} from "./db";
import { getSessionEntry, listAllSessionFiles, parseSessionFile } from "./parser";
import type { DashboardStats, MessageStats, RequestDetails } from "./types";

async function syncSessionFile(sessionFile: string): Promise<number> {
	let fileStats: fs.Stats;
	try { fileStats = await fs.promises.stat(sessionFile); } catch { return 0; }

	const lastModified = fileStats.mtimeMs;
	const stored = getFileOffset(sessionFile);
	if (stored && stored.lastModified >= lastModified) return 0;

	const fromOffset = stored?.offset ?? 0;
	const { stats, newOffset } = await parseSessionFile(sessionFile, fromOffset);
	if (stats.length > 0) insertMessageStats(stats);
	setFileOffset(sessionFile, newOffset, lastModified);
	return stats.length;
}

export async function syncAllSessions(): Promise<{ processed: number; files: number }> {
	await initDb();
	const files = await listAllSessionFiles();
	let totalProcessed = 0, filesProcessed = 0;
	for (const file of files) {
		const count = await syncSessionFile(file);
		if (count > 0) { totalProcessed += count; filesProcessed++; }
	}
	return { processed: totalProcessed, files: filesProcessed };
}

export async function getDashboardStats(): Promise<DashboardStats> {
	await initDb();
	return {
		overall: getOverallStats(),
		byModel: getStatsByModel(),
		byFolder: getStatsByFolder(),
		timeSeries: getTimeSeries(24),
		modelSeries: getModelTimeSeries(14),
		modelPerformanceSeries: getModelPerformanceSeries(14),
		costSeries: getCostTimeSeries(90),
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
	const entry = await getSessionEntry(msg.sessionFile, msg.entryId);
	if (!entry || entry.type !== "message") return null;
	return { ...msg, messages: [entry], output: (entry as any).message };
}

export async function getTotalMessageCount(): Promise<number> {
	await initDb();
	return getMessageCount();
}
