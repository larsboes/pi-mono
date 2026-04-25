#!/usr/bin/env bun

import { parseArgs } from "node:util";
import { closeDb } from "./db";
import { getDashboardStats, getTotalMessageCount, syncAllSessions } from "./aggregator";
import { startServer } from "./server";

export { getDashboardStats, getTotalMessageCount, syncAllSessions } from "./aggregator";
export { closeDb } from "./db";
export { startServer } from "./server";
export type {
	AggregatedStats, DashboardStats, FolderStats, MessageStats,
	ModelPerformancePoint, ModelStats, ModelTimeSeriesPoint, TimeSeriesPoint,
} from "./types";

function fmt(n: number, decimals = 0): string {
	return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

function fmtCost(n: number): string {
	if (n < 0.01) return `$${n.toFixed(4)}`;
	if (n < 1) return `$${n.toFixed(3)}`;
	return `$${n.toFixed(2)}`;
}

function fmtPct(n: number): string {
	return `${(n * 100).toFixed(1)}%`;
}

function fmtMs(n: number | null): string {
	if (n === null) return "-";
	if (n < 1000) return `${n.toFixed(0)}ms`;
	return `${(n / 1000).toFixed(1)}s`;
}

async function printStats(): Promise<void> {
	const stats = await getDashboardStats();
	const { overall, byModel, byFolder } = stats;

	console.log("\n=== pi Usage Statistics ===\n");
	console.log("Overall:");
	console.log(`  Requests:        ${fmt(overall.totalRequests)} (${fmt(overall.failedRequests)} errors, ${fmtPct(overall.errorRate)} error rate)`);
	console.log(`  Tokens:          ${fmt(overall.totalInputTokens + overall.totalOutputTokens)}`);
	console.log(`  Cache Rate:      ${fmtPct(overall.cacheRate)}`);
	console.log(`  Total Cost:      ${fmtCost(overall.totalCost)}`);
	console.log(`  Avg Duration:    ${fmtMs(overall.avgDuration)}`);
	console.log(`  Avg TTFT:        ${fmtMs(overall.avgTtft)}`);
	if (overall.avgTokensPerSecond !== null) {
		console.log(`  Avg Tokens/s:    ${overall.avgTokensPerSecond.toFixed(1)}`);
	}

	if (byModel.length > 0) {
		console.log("\nBy Model:");
		for (const m of byModel.slice(0, 10)) {
			console.log(`  ${m.model}: ${fmt(m.totalRequests)} reqs, ${fmtCost(m.totalCost)}, ${fmtPct(m.cacheRate)} cache`);
		}
	}

	if (byFolder.length > 0) {
		console.log("\nBy Project:");
		for (const f of byFolder.slice(0, 10)) {
			console.log(`  ${f.folder}: ${fmt(f.totalRequests)} reqs, ${fmtCost(f.totalCost)}`);
		}
	}
	console.log("");
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			port: { type: "string", short: "p", default: "3847" },
			json: { type: "boolean", short: "j", default: false },
			sync: { type: "boolean", short: "s", default: false },
			help: { type: "boolean", short: "h", default: false },
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.log(`
pi-stats — AI usage statistics dashboard

Usage:
  pi-stats [options]

Options:
  -p, --port <port>  Dashboard port (default: 3847)
  -j, --json         Output stats as JSON and exit
  -s, --sync         Sync and print summary
  -h, --help         Show help

Dashboard: http://localhost:3847
`);
		return;
	}

	try {
		console.log("Syncing session files...");
		const { processed, files } = await syncAllSessions();
		const total = await getTotalMessageCount();
		console.log(`Synced ${processed} new entries from ${files} files (${total} total)\n`);

		if (values.json) {
			console.log(JSON.stringify(await getDashboardStats(), null, 2));
			return;
		}

		if (values.sync) {
			await printStats();
			return;
		}

		const port = parseInt(values.port ?? "3847", 10);
		const { port: actualPort } = await startServer(port);
		console.log(`Dashboard: http://localhost:${actualPort}`);
		console.log("Ctrl+C to stop\n");

		process.on("SIGINT", () => {
			closeDb();
			process.exit(0);
		});
	} catch (error) {
		console.error("Error:", error);
		closeDb();
		process.exit(1);
	}
}

if (import.meta.main) main();
