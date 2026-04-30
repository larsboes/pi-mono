#!/usr/bin/env bun

import { parseArgs } from "node:util";
import { closeDb } from "./db";
import { getDashboardStats, getTotalMessageCount, syncAllSessions } from "./aggregator";
import { startServer } from "./server";

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

async function printStats(sinceTs?: number): Promise<void> {
	const stats = await getDashboardStats(sinceTs);
	const { overall, byModel, byFolder } = stats;

	console.log("\n=== AI Usage Statistics ===\n");
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
			const badge = `[${m.source === "claude-code" ? "CC" : "pi"}]`;
			console.log(`  ${badge} ${m.model} (${m.provider}): ${fmt(m.totalRequests)} reqs, ${fmtCost(m.totalCost)}, ${fmtPct(m.cacheRate)} cache`);
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
			since: { type: "string", default: undefined },
			help: { type: "boolean", short: "h", default: false },
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.log(`
pi-stats — unified AI usage statistics dashboard (pi + Claude Code)

Usage:
  pi-stats [options]

Options:
  -p, --port <port>   Dashboard port (default: 3847)
  -j, --json          Output stats as JSON and exit
  -s, --sync          Sync and print summary (no dashboard)
      --since <spec>  Window: 24h, 7d, 30d, 90d (applies to -s/-j)
  -h, --help          Show help

Dashboard: http://localhost:3847
`);
		return;
	}

	const sinceTs = parseSinceSpec(values.since as string | undefined);

	try {
		console.log("Syncing session files...");
		const { processed, files, bySource } = await syncAllSessions();
		const total = await getTotalMessageCount();
		const sourceSummary = Object.entries(bySource)
			.filter(([, n]) => n > 0)
			.map(([src, n]) => `${src}:${n}`)
			.join(" ");
		console.log(`Synced ${processed} new entries from ${files} files (${total} total)${sourceSummary ? ` [${sourceSummary}]` : ""}\n`);

		if (values.json) {
			console.log(JSON.stringify(await getDashboardStats(sinceTs), null, 2));
			return;
		}

		if (values.sync) {
			await printStats(sinceTs);
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

// Parse "24h" / "7d" / "30d" / "90d" / "all" into a millisecond cutoff or undefined.
export function parseSinceSpec(spec: string | undefined): number | undefined {
	if (!spec || spec === "all") return undefined;
	const m = spec.match(/^(\d+)([hd])$/);
	if (!m) return undefined;
	const n = parseInt(m[1], 10);
	const unitMs = m[2] === "h" ? 3600000 : 86400000;
	return Date.now() - n * unitMs;
}

if (import.meta.main) main();
