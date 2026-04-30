import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getDashboardStats, getTotalMessageCount, syncAllSessions } from "./src/aggregator";
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
				const summary = [
					`AI Usage (${windowLabel}):`,
					`  Range:    ${firstDate} → ${lastDate}`,
					`  Requests: ${o.totalRequests.toLocaleString()} (${o.failedRequests} errors, ${fmtPct(o.errorRate)} error rate)`,
					`  Tokens:   ${(o.totalInputTokens + o.totalOutputTokens).toLocaleString()} (${fmtPct(o.cacheRate)} cache)`,
					`  Cost:     ${fmtCost(o.totalCost)}`,
					`  (use /stats models, /stats folders, or /stats dashboard for detail)`,
				].join("\n");
				notify(ctx, summary);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				notify(ctx, `stats error: ${message}`, "error");
			}
		},
	});
}
