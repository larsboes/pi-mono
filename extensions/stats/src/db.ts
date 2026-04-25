import { Database } from "bun:sqlite";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type {
	AggregatedStats, CostTimeSeriesPoint, FolderStats, MessageStats,
	ModelPerformancePoint, ModelStats, ModelTimeSeriesPoint, TimeSeriesPoint,
} from "./types";

const PI_DIR = path.join(os.homedir(), ".pi");
const DB_PATH = path.join(PI_DIR, "stats.db");

let db: Database | null = null;

export async function initDb(): Promise<Database> {
	if (db) return db;
	await fs.mkdir(PI_DIR, { recursive: true });
	db = new Database(DB_PATH);
	db.exec("PRAGMA journal_mode = WAL");
	db.exec(`
		CREATE TABLE IF NOT EXISTS messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_file TEXT NOT NULL,
			entry_id TEXT NOT NULL,
			folder TEXT NOT NULL,
			model TEXT NOT NULL,
			provider TEXT NOT NULL,
			api TEXT NOT NULL,
			timestamp INTEGER NOT NULL,
			duration INTEGER,
			ttft INTEGER,
			stop_reason TEXT NOT NULL,
			error_message TEXT,
			input_tokens INTEGER NOT NULL,
			output_tokens INTEGER NOT NULL,
			cache_read_tokens INTEGER NOT NULL,
			cache_write_tokens INTEGER NOT NULL,
			total_tokens INTEGER NOT NULL,
			premium_requests REAL NOT NULL DEFAULT 0,
			cost_input REAL NOT NULL,
			cost_output REAL NOT NULL,
			cost_cache_read REAL NOT NULL,
			cost_cache_write REAL NOT NULL,
			cost_total REAL NOT NULL,
			UNIQUE(session_file, entry_id)
		);
		CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
		CREATE INDEX IF NOT EXISTS idx_messages_model ON messages(model);
		CREATE INDEX IF NOT EXISTS idx_messages_folder ON messages(folder);
		CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_file);
		CREATE TABLE IF NOT EXISTS file_offsets (
			session_file TEXT PRIMARY KEY,
			offset INTEGER NOT NULL,
			last_modified INTEGER NOT NULL
		);
	`);
	return db;
}

export function getFileOffset(sessionFile: string): { offset: number; lastModified: number } | null {
	if (!db) return null;
	const row = db.prepare("SELECT offset, last_modified FROM file_offsets WHERE session_file = ?").get(sessionFile) as any;
	return row ? { offset: row.offset, lastModified: row.last_modified } : null;
}

export function setFileOffset(sessionFile: string, offset: number, lastModified: number): void {
	db?.prepare("INSERT OR REPLACE INTO file_offsets (session_file, offset, last_modified) VALUES (?, ?, ?)").run(sessionFile, offset, lastModified);
}

export function insertMessageStats(stats: MessageStats[]): number {
	if (!db || stats.length === 0) return 0;
	const stmt = db.prepare(`
		INSERT OR IGNORE INTO messages (
			session_file, entry_id, folder, model, provider, api, timestamp,
			duration, ttft, stop_reason, error_message,
			input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens, premium_requests,
			cost_input, cost_output, cost_cache_read, cost_cache_write, cost_total
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	let inserted = 0;
	db.transaction(() => {
		for (const s of stats) {
			const r = stmt.run(
				s.sessionFile, s.entryId, s.folder, s.model, s.provider, s.api, s.timestamp,
				s.duration, s.ttft, s.stopReason, s.errorMessage,
				s.usage.input, s.usage.output, s.usage.cacheRead ?? 0, s.usage.cacheWrite ?? 0, s.usage.totalTokens ?? 0,
				(s.usage as any).premiumRequests ?? 0,
				s.usage.cost?.input ?? 0, s.usage.cost?.output ?? 0,
				s.usage.cost?.cacheRead ?? 0, s.usage.cost?.cacheWrite ?? 0, s.usage.cost?.total ?? 0,
			);
			if (r.changes > 0) inserted++;
		}
	})();
	return inserted;
}

function buildAggregatedStats(rows: unknown[]): AggregatedStats {
	if (rows.length === 0) return {
		totalRequests: 0, successfulRequests: 0, failedRequests: 0, errorRate: 0,
		totalInputTokens: 0, totalOutputTokens: 0, totalCacheReadTokens: 0, totalCacheWriteTokens: 0,
		cacheRate: 0, totalCost: 0, totalPremiumRequests: 0,
		avgDuration: null, avgTtft: null, avgTokensPerSecond: null, firstTimestamp: 0, lastTimestamp: 0,
	};
	const row = rows[0] as Record<string, number>;
	const totalRequests = row.total_requests ?? 0;
	const failedRequests = row.failed_requests ?? 0;
	const totalInputTokens = row.total_input_tokens ?? 0;
	const totalCacheReadTokens = row.total_cache_read_tokens ?? 0;
	return {
		totalRequests, successfulRequests: totalRequests - failedRequests, failedRequests,
		errorRate: totalRequests > 0 ? failedRequests / totalRequests : 0,
		totalInputTokens, totalOutputTokens: row.total_output_tokens ?? 0,
		totalCacheReadTokens, totalCacheWriteTokens: row.total_cache_write_tokens ?? 0,
		cacheRate: totalInputTokens + totalCacheReadTokens > 0 ? totalCacheReadTokens / (totalInputTokens + totalCacheReadTokens) : 0,
		totalCost: row.total_cost ?? 0, totalPremiumRequests: row.total_premium_requests ?? 0,
		avgDuration: row.avg_duration ?? null, avgTtft: row.avg_ttft ?? null,
		avgTokensPerSecond: row.avg_tokens_per_second ?? null,
		firstTimestamp: row.first_timestamp ?? 0, lastTimestamp: row.last_timestamp ?? 0,
	};
}

export function getOverallStats(): AggregatedStats {
	if (!db) return buildAggregatedStats([]);
	return buildAggregatedStats(db.prepare(`
		SELECT COUNT(*) as total_requests,
			SUM(CASE WHEN stop_reason='error' THEN 1 ELSE 0 END) as failed_requests,
			SUM(input_tokens) as total_input_tokens, SUM(output_tokens) as total_output_tokens,
			SUM(cache_read_tokens) as total_cache_read_tokens, SUM(cache_write_tokens) as total_cache_write_tokens,
			SUM(premium_requests) as total_premium_requests, SUM(cost_total) as total_cost,
			AVG(duration) as avg_duration, AVG(ttft) as avg_ttft,
			AVG(CASE WHEN duration>0 THEN output_tokens*1000.0/duration ELSE NULL END) as avg_tokens_per_second,
			MIN(timestamp) as first_timestamp, MAX(timestamp) as last_timestamp
		FROM messages`).all());
}

export function getStatsByModel(): ModelStats[] {
	if (!db) return [];
	return (db.prepare(`
		SELECT model, provider,
			COUNT(*) as total_requests,
			SUM(CASE WHEN stop_reason='error' THEN 1 ELSE 0 END) as failed_requests,
			SUM(input_tokens) as total_input_tokens, SUM(output_tokens) as total_output_tokens,
			SUM(cache_read_tokens) as total_cache_read_tokens, SUM(cache_write_tokens) as total_cache_write_tokens,
			SUM(premium_requests) as total_premium_requests, SUM(cost_total) as total_cost,
			AVG(duration) as avg_duration, AVG(ttft) as avg_ttft,
			AVG(CASE WHEN duration>0 THEN output_tokens*1000.0/duration ELSE NULL END) as avg_tokens_per_second,
			MIN(timestamp) as first_timestamp, MAX(timestamp) as last_timestamp
		FROM messages GROUP BY model, provider ORDER BY total_requests DESC`).all() as unknown[])
		.map(row => ({ model: (row as any).model, provider: (row as any).provider, ...buildAggregatedStats([row]) }));
}

export function getStatsByFolder(): FolderStats[] {
	if (!db) return [];
	return (db.prepare(`
		SELECT folder,
			COUNT(*) as total_requests,
			SUM(CASE WHEN stop_reason='error' THEN 1 ELSE 0 END) as failed_requests,
			SUM(input_tokens) as total_input_tokens, SUM(output_tokens) as total_output_tokens,
			SUM(cache_read_tokens) as total_cache_read_tokens, SUM(cache_write_tokens) as total_cache_write_tokens,
			SUM(premium_requests) as total_premium_requests, SUM(cost_total) as total_cost,
			AVG(duration) as avg_duration, AVG(ttft) as avg_ttft,
			AVG(CASE WHEN duration>0 THEN output_tokens*1000.0/duration ELSE NULL END) as avg_tokens_per_second,
			MIN(timestamp) as first_timestamp, MAX(timestamp) as last_timestamp
		FROM messages GROUP BY folder ORDER BY total_requests DESC`).all() as unknown[])
		.map(row => ({ folder: (row as any).folder, ...buildAggregatedStats([row]) }));
}

export function getTimeSeries(hours = 24): TimeSeriesPoint[] {
	if (!db) return [];
	const cutoff = Date.now() - hours * 3600000;
	return (db.prepare(`
		SELECT (timestamp/3600000)*3600000 as bucket,
			COUNT(*) as requests,
			SUM(CASE WHEN stop_reason='error' THEN 1 ELSE 0 END) as errors,
			SUM(total_tokens) as tokens, SUM(cost_total) as cost
		FROM messages WHERE timestamp>=? GROUP BY bucket ORDER BY bucket ASC`).all(cutoff) as any[])
		.map(r => ({ timestamp: r.bucket, requests: r.requests, errors: r.errors, tokens: r.tokens, cost: r.cost }));
}

export function getModelTimeSeries(days = 14): ModelTimeSeriesPoint[] {
	if (!db) return [];
	const cutoff = Date.now() - days * 86400000;
	return (db.prepare(`
		SELECT (timestamp/86400000)*86400000 as bucket, model, provider, COUNT(*) as requests
		FROM messages WHERE timestamp>=? GROUP BY bucket,model,provider ORDER BY bucket ASC`).all(cutoff) as any[])
		.map(r => ({ timestamp: r.bucket, model: r.model, provider: r.provider, requests: r.requests }));
}

export function getModelPerformanceSeries(days = 14): ModelPerformancePoint[] {
	if (!db) return [];
	const cutoff = Date.now() - days * 86400000;
	return (db.prepare(`
		SELECT (timestamp/86400000)*86400000 as bucket, model, provider, COUNT(*) as requests,
			AVG(ttft) as avg_ttft,
			AVG(CASE WHEN duration>0 THEN output_tokens*1000.0/duration ELSE NULL END) as avg_tokens_per_second
		FROM messages WHERE timestamp>=? GROUP BY bucket,model,provider ORDER BY bucket ASC`).all(cutoff) as any[])
		.map(r => ({ timestamp: r.bucket, model: r.model, provider: r.provider, requests: r.requests, avgTtft: r.avg_ttft, avgTokensPerSecond: r.avg_tokens_per_second }));
}

export function getCostTimeSeries(days = 90): CostTimeSeriesPoint[] {
	if (!db) return [];
	const cutoff = Date.now() - days * 86400000;
	return (db.prepare(`
		SELECT (timestamp/86400000)*86400000 as bucket, model, provider,
			SUM(cost_total) as cost, SUM(cost_input) as cost_input, SUM(cost_output) as cost_output,
			SUM(cost_cache_read) as cost_cache_read, SUM(cost_cache_write) as cost_cache_write,
			COUNT(*) as requests
		FROM messages WHERE timestamp>=? GROUP BY bucket,model,provider ORDER BY bucket ASC`).all(cutoff) as any[])
		.map(r => ({ timestamp: r.bucket, model: r.model, provider: r.provider, cost: r.cost, costInput: r.cost_input, costOutput: r.cost_output, costCacheRead: r.cost_cache_read, costCacheWrite: r.cost_cache_write, requests: r.requests }));
}

export function getMessageCount(): number {
	if (!db) return 0;
	return ((db.prepare("SELECT COUNT(*) as count FROM messages").get()) as any).count;
}

export function getRecentRequests(limit = 100): MessageStats[] {
	if (!db) return [];
	return (db.prepare("SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?").all(limit) as any[]).map(rowToMessageStats);
}

export function getRecentErrors(limit = 100): MessageStats[] {
	if (!db) return [];
	return (db.prepare("SELECT * FROM messages WHERE stop_reason='error' ORDER BY timestamp DESC LIMIT ?").all(limit) as any[]).map(rowToMessageStats);
}

export function getMessageById(id: number): MessageStats | null {
	if (!db) return null;
	const row = db.prepare("SELECT * FROM messages WHERE id=?").get(id);
	return row ? rowToMessageStats(row as any) : null;
}

function rowToMessageStats(row: Record<string, unknown>): MessageStats {
	return {
		id: row.id as number,
		sessionFile: row.session_file as string,
		entryId: row.entry_id as string,
		folder: row.folder as string,
		model: row.model as string,
		provider: row.provider as string,
		api: row.api as string,
		timestamp: row.timestamp as number,
		duration: row.duration as number | null,
		ttft: row.ttft as number | null,
		stopReason: row.stop_reason as string,
		errorMessage: row.error_message as string | null,
		usage: {
			input: row.input_tokens as number,
			output: row.output_tokens as number,
			cacheRead: row.cache_read_tokens as number,
			cacheWrite: row.cache_write_tokens as number,
			totalTokens: row.total_tokens as number,
			premiumRequests: row.premium_requests as number,
			cost: {
				input: row.cost_input as number,
				output: row.cost_output as number,
				cacheRead: row.cost_cache_read as number,
				cacheWrite: row.cost_cache_write as number,
				total: row.cost_total as number,
			},
		} as MessageStats["usage"],
	};
}

export function closeDb(): void {
	db?.close();
	db = null;
}
