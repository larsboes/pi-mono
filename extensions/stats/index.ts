import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getDashboardStats, getTotalMessageCount, listSessions, syncAllSessions } from "./src/aggregator";
import { startServer } from "./src/server";
import { parseSinceSpec } from "./src/cli";

/**
 * pi-stats — unified AI usage dashboard (pi + Claude Code sessions).
 *
 * Registers the `/stats` slash command so you can get summaries or launch
 * the HTTP dashboard from inside an active pi session.
 */

type CommandCtx = {
	ui: {
		notify: (m: string, t?: "info" | "warning" | "error") => void;
		setStatus: (k: string, v: string | undefined) => void;
	};
};

const USAGE = [
	"/stats                       → overall summary (all time)",
	"/stats 7d | 30d | 90d | 24h  → summary for a time window",
	"/stats sessions [<since>]    → list recent sessions with topics",
	"/stats models [<since>]      → per-model breakdown",
	"/stats folders [<since>]     → per-project breakdown",
	"/stats dashboard [port]      → launch HTTP dashboard (default :3847)",
	"/stats sync                  → re-sync session files without output",
].join("\n");

function fmtCost(n: number): string {
	if (n < 0.01) return `$${n.toFixed(4)}`;
	if (n < 1) return `$${n.toFixed(3)}`;
	return `$${n.toFixed(2)}`;
}

function fmtPct(n: number): string {
	return `${(n * 100).toFixed(1)}%`;
}

function fmtTokens(n: number): string {
	if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return `${n}`;
}

/** Render a sparkline from an array of values (max 20 points). */
function sparkline(values: number[]): string {
	if (values.length === 0) return "";
	const chars = "▁▂▃▄▅▆▇█";
	const max = Math.max(...values, 1);
	const min = Math.min(...values);
	const range = max - min || 1;
	// Take last 20 points
	const recent = values.slice(-20);
	return recent.map((v) => chars[Math.min(7, Math.floor(((v - min) / range) * 7))]).join("");
}

/** Simple trend indicator comparing recent vs older halves. */
function trend(values: number[]): string {
	if (values.length < 4) return "";
	const mid = Math.floor(values.length / 2);
	const older = values.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
	const newer = values.slice(mid).reduce((a, b) => a + b, 0) / (values.length - mid);
	if (older === 0 && newer === 0) return "─";
	const pctChange = older > 0 ? ((newer - older) / older) * 100 : 100;
	if (pctChange > 15) return `↑${Math.round(pctChange)}%`;
	if (pctChange < -15) return `↓${Math.round(Math.abs(pctChange))}%`;
	return "→";
}

let runningServer: { port: number; stop: () => void } | null = null;

export default function statsExtension(pi: ExtensionAPI): void {
	const notify = (ctx: CommandCtx, message: string, type: "info" | "warning" | "error" = "info") => {
		ctx.ui.notify(message, type);
		ctx.ui.setStatus("stats", message.slice(0, 240));
	};

	pi.registerCommand("stats", {
		description: "AI usage stats (pi + Claude Code). Usage: /stats [7d|30d|dashboard|models|folders|sync]",
		handler: async (args, ctx) => {
			const trimmed = (args ?? "").trim();
			const parts = trimmed ? trimmed.split(/\s+/) : [];
			const first = parts[0] ?? "";
			const rest = parts.slice(1);

			try {
				// Always sync before any read. Fresh data matters more than latency here.
				if (first === "sync" && rest.length === 0) {
					const r = await syncAllSessions();
					const total = await getTotalMessageCount();
					notify(ctx, `Synced ${r.processed} new entries from ${r.files} files (${total} total). pi:${r.bySource.pi ?? 0} cc:${r.bySource["claude-code"] ?? 0}`);
					return;
				}

				if (first === "dashboard") {
					if (runningServer) {
						notify(ctx, `Dashboard already running at http://localhost:${runningServer.port}`, "info");
						return;
					}
					const port = rest[0] ? parseInt(rest[0], 10) : 3847;
					await syncAllSessions();
					runningServer = await startServer(Number.isFinite(port) ? port : 3847);
					notify(ctx, `Dashboard started at http://localhost:${runningServer.port}. Run /stats dashboard-stop to stop.`);
					return;
				}

				if (first === "dashboard-stop") {
					if (!runningServer) {
						notify(ctx, "No dashboard running.", "info");
						return;
					}
					runningServer.stop();
					runningServer = null;
					notify(ctx, "Dashboard stopped.");
					return;
				}

				if (first === "help" || first === "--help" || first === "-h") {
					notify(ctx, USAGE);
					return;
				}

				// Remaining variants all produce a summary, differing only by scope + window.
				await syncAllSessions();

				// /stats sessions [<since>]
				if (first === "sessions") {
					const sinceTs = parseSinceSpec(rest[0]);
					const sessions = await listSessions(sinceTs, 20);
					if (sessions.length === 0) {
						notify(ctx, "No sessions found.");
						return;
					}
					const windowLabel = rest[0] && rest[0] !== "all" ? `last ${rest[0]}` : "recent";
					const lines = [`Sessions (${windowLabel}):\n`];
					for (const s of sessions) {
						const time = new Date(s.startedAt).toLocaleString("en-GB", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
						const badge = s.source === "claude-code" ? "CC" : "pi";
						const dur = s.durationMin > 0 ? `${s.durationMin}m` : "<1m";
						const cost = s.cost < 0.01 ? "<$0.01" : `$${s.cost.toFixed(2)}`;
						const shortId = s.id.slice(0, 8);
						const topic = s.firstUserMessage ? s.firstUserMessage.slice(0, 70) : "(no user message)";
						const model = s.models[0]?.replace(/^eu\.anthropic\.|^anthropic\.|\-v\d+$/g, "").slice(0, 20) ?? "?";
						lines.push(`  [${badge}] ${time} │ ${dur} │ ${s.requests} reqs │ ${cost} │ ${model}`);
						lines.push(`        ${shortId}  ${topic}`);
						lines.push(`        ${s.folder}`);
						lines.push("");
					}
					lines.push(`Resume: pi --session <id> (use first 8 chars shown above)`);
					notify(ctx, lines.join("\n"));
					return;
				}

				// /stats models [<since>]  or  /stats folders [<since>]  or  /stats <since>
				let scope: "overall" | "models" | "folders" = "overall";
				let sinceSpec: string | undefined;
				if (first === "models" || first === "folders") {
					scope = first;
					sinceSpec = rest[0];
				} else if (first) {
					sinceSpec = first;
				}
				const sinceTs = parseSinceSpec(sinceSpec);
				const stats = await getDashboardStats(sinceTs);
				const windowLabel = sinceSpec && sinceSpec !== "all" ? `last ${sinceSpec}` : "all time";

				if (scope === "models") {
					const lines = [`Models (${windowLabel}):`];
					for (const m of stats.byModel.slice(0, 15)) {
						const badge = m.source === "claude-code" ? "CC" : "pi";
						lines.push(`  [${badge}] ${m.model} (${m.provider}): ${m.totalRequests.toLocaleString()} reqs, ${fmtCost(m.totalCost)}, ${fmtPct(m.cacheRate)} cache`);
					}
					notify(ctx, lines.join("\n"));
					return;
				}

				if (scope === "folders") {
					const lines = [`Projects (${windowLabel}):`];
					for (const f of stats.byFolder.slice(0, 15)) {
						lines.push(`  ${f.folder}: ${f.totalRequests.toLocaleString()} reqs, ${fmtCost(f.totalCost)}`);
					}
					notify(ctx, lines.join("\n"));
					return;
				}

				// Overall summary.
				const o = stats.overall;
				const firstDate = o.firstTimestamp ? new Date(o.firstTimestamp).toISOString().slice(0, 10) : "-";
				const lastDate = o.lastTimestamp ? new Date(o.lastTimestamp).toISOString().slice(0, 10) : "-";

				// Sparklines from time series
				const costValues = stats.costSeries.map((p) => p.cost);
				const reqValues = stats.timeSeries.map((p) => p.requests);
				const costSpark = sparkline(costValues);
				const reqSpark = sparkline(reqValues);
				const costTrend = trend(costValues);
				const reqTrend = trend(reqValues);

				// Source breakdown
				const piModels = stats.byModel.filter((m) => m.source === "pi");
				const ccModels = stats.byModel.filter((m) => m.source === "claude-code");
				const piReqs = piModels.reduce((a, m) => a + m.totalRequests, 0);
				const ccReqs = ccModels.reduce((a, m) => a + m.totalRequests, 0);
				const piCost = piModels.reduce((a, m) => a + m.totalCost, 0);
				const ccCost = ccModels.reduce((a, m) => a + m.totalCost, 0);
				const piTokens = piModels.reduce((a, m) => a + m.totalInputTokens + m.totalOutputTokens, 0);
				const ccTokens = ccModels.reduce((a, m) => a + m.totalInputTokens + m.totalOutputTokens, 0);

				const summary = [
					`AI Usage (${windowLabel}):`,
					`  Range:     ${firstDate} → ${lastDate}`,
					`  Requests:  ${o.totalRequests.toLocaleString()} (${o.failedRequests} errors, ${fmtPct(o.errorRate)} err rate)`,
					`  Tokens:    ${fmtTokens(o.totalInputTokens + o.totalOutputTokens)} (${fmtPct(o.cacheRate)} cache hit)`,
					`  Cost:      ${fmtCost(o.totalCost)}`,
					``,
					`  Sources:`,
					`    pi:          ${piReqs.toLocaleString()} reqs │ ${fmtTokens(piTokens)} tok │ ${fmtCost(piCost)}`,
					`    claude-code:  ${ccReqs.toLocaleString()} reqs │ ${fmtTokens(ccTokens)} tok │ ${fmtCost(ccCost)}`,
					``,
					...(costSpark ? [`  Cost:  ${costSpark} ${costTrend}`] : []),
					...(reqSpark ? [`  Reqs:  ${reqSpark} ${reqTrend}`] : []),
					``,
					`  Top Models:`,
					...stats.byModel.slice(0, 5).map((m) => {
						const badge = m.source === "claude-code" ? "CC" : "pi";
						return `    [${badge}] ${m.model}: ${m.totalRequests.toLocaleString()} reqs, ${fmtCost(m.totalCost)}`;
					}),
					``,
					`  (/stats models, /stats folders, /stats dashboard for detail)`,
				].join("\n");
				notify(ctx, summary);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				notify(ctx, `stats error: ${message}`, "error");
			}
		},
	});
}
