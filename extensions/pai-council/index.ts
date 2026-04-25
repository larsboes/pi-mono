/**
 * pai-council — Multi-agent deliberation extension for pi
 *
 * Spawns a council of specialized agents that debate a question across
 * structured rounds, producing a decision memo with visible transcripts.
 *
 * Commands:
 *   /council [topic]       — Full deliberation (2+ rounds, transcript, memo)
 *   /council-quick [topic] — Fast single-round sanity check
 *   /council-list          — List past deliberations
 *   /council-view [id]     — View a past memo
 */

import { type ExtensionAPI, getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Text } from "@mariozechner/pi-tui";
import * as fs from "node:fs";
import * as path from "node:path";
import { loadConfig, resolveAgentPath } from "./src/config.js";
import { loadAgentPersona } from "./src/agents.js";
import { type MemberStats, deliberate, parseBrief, quickDeliberate } from "./src/deliberate.js";
import { writeMemoFiles } from "./src/memo.js";
import { renderBoardWidget, renderStartupBoard } from "./src/widget.js";

export default function paiCouncil(pi: ExtensionAPI) {
	// Extension base directory (where council-config.yaml + agent .md files live)
	const extDir = path.dirname(new URL(import.meta.url).pathname);

	let config = loadConfig(extDir);

	// ── Helpers ──────────────────────────────────────────────────

	function loadPersonas() {
		const chairPersona = loadAgentPersona(
			resolveAgentPath(extDir, config.chair.path),
			config.chair.name,
			config.chair.color,
		);
		const memberPersonas = config.council.map((m) =>
			loadAgentPersona(resolveAgentPath(extDir, m.path), m.name, m.color),
		);
		return { chairPersona, memberPersonas };
	}

	function getOutputDir(ctx: { cwd: string }): string {
		// Write outputs to cwd (project-local), not extension dir
		return ctx.cwd;
	}

	function buildBriefFromArgs(args: string | undefined): string | null {
		if (!args || !args.trim()) return null;
		const trimmed = args.trim();

		// Check if it's a file path
		if (fs.existsSync(trimmed)) {
			return fs.readFileSync(trimmed, "utf-8");
		}

		// Inline topic → minimal brief
		return `# ${trimmed}\n\n## Key Question\n\n${trimmed}\n\n## Situation\n\n[User provided this as an inline topic — council should treat it as the core question.]\n\n## Stakes\n\n[To be determined by the council discussion.]\n\n## Constraints\n\n[None specified.]`;
	}

	// ── /council — Full deliberation ─────────────────────────────

	pi.registerCommand("council", {
		description: "Start a council deliberation — pass a topic inline or path to a brief.md",
		handler: async (args, ctx) => {
			config = loadConfig(extDir);

			let briefContent = buildBriefFromArgs(args);

			if (!briefContent) {
				if (!ctx.hasUI) {
					ctx.ui.notify("No topic provided. Usage: /council <topic or path>", "error");
					return;
				}

				const template = [
					"# [Your question here]",
					"",
					"## Situation",
					"[What is happening right now. Facts only.]",
					"",
					"## Stakes",
					"[What's at risk. Upside if right, downside if wrong.]",
					"",
					"## Constraints",
					"[Budget, time, team capacity, known blockers.]",
					"",
					"## Key Question",
					"[The single most important question for the council to answer.]",
					"",
					"## Context Files",
					"[Optional: paths to supporting docs, code, data]",
				].join("\n");

				const edited = await ctx.ui.editor("Council Brief", template);
				if (!edited || edited.trim() === template.trim()) {
					ctx.ui.notify("Council cancelled — no brief provided.", "warning");
					return;
				}
				briefContent = edited;
			}

			const brief = parseBrief(briefContent);
			const outputDir = getOutputDir(ctx);

			// Save brief
			const datePrefix = new Date().toISOString().split("T")[0];
			const slug = brief.title
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.slice(0, 40);
			const briefDir = path.join(outputDir, config.paths.briefs, `${datePrefix}-${slug}`);
			fs.mkdirSync(briefDir, { recursive: true });
			fs.writeFileSync(path.join(briefDir, "brief.md"), briefContent);

			const { chairPersona, memberPersonas } = loadPersonas();

			// Live status widget
			const allStats: Record<string, MemberStats> = {};
			const theme = {
				fg: ctx.ui.theme.fg.bind(ctx.ui.theme) as (color: any, text: string) => string,
				bold: ctx.ui.theme.bold.bind(ctx.ui.theme),
			};

			const onStatusUpdate = (memberName: string, status: "active" | "done", stats: MemberStats) => {
				allStats[memberName] = stats;
				const lines = renderBoardWidget(allStats, theme);
				ctx.ui.setWidget("council-status", lines, { placement: "belowEditor" });
				if (status === "active") {
					ctx.ui.setStatus("council", `⏳ ${memberName} deliberating...`);
				}
			};

			ctx.ui.notify(`Council convened: "${brief.title}"`, "info");
			ctx.ui.setStatus("council", "⏳ Deliberation in progress...");

			try {
				const result = await deliberate(config, brief, chairPersona, memberPersonas, ctx, onStatusUpdate);
				const files = await writeMemoFiles(result, config, outputDir);

				ctx.ui.setStatus("council", `✅ Done — ${result.sessionId} — $${result.totalCost.toFixed(2)}`);

				pi.sendMessage(
					{
						customType: "council-memo",
						content: `# Council Deliberation Complete\n\n**Session:** ${result.sessionId}\n**Duration:** ${((result.endTime - result.startTime) / 60000).toFixed(1)}min\n**Cost:** $${result.totalCost.toFixed(2)}\n**Memo:** ${files.memoPath}\n**Transcript:** ${files.transcriptPath}\n\n---\n\n${result.synthesis}`,
						display: true,
					},
					{ triggerTurn: true, deliverAs: "followUp" },
				);

				setTimeout(() => {
					ctx.ui.setWidget("council-status", undefined);
					ctx.ui.setStatus("council", undefined);
				}, 5000);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				if (msg.includes("aborted") || msg.includes("abort")) {
					ctx.ui.notify("Council cancelled.", "warning");
				} else {
					ctx.ui.notify(`Council failed: ${msg}`, "error");
				}
				ctx.ui.setStatus("council", undefined);
				ctx.ui.setWidget("council-status", undefined);
			}
		},
	});

	// ── /council-quick — Fast single-round check ─────────────────

	pi.registerCommand("council-quick", {
		description: "Quick council check — single round, fast perspectives on a topic",
		handler: async (args, ctx) => {
			config = loadConfig(extDir);

			let briefContent = buildBriefFromArgs(args);
			if (!briefContent) {
				ctx.ui.notify("Usage: /council-quick <topic>", "warning");
				return;
			}

			const brief = parseBrief(briefContent);
			const { memberPersonas } = loadPersonas();

			ctx.ui.notify(`Quick council: "${brief.title}"`, "info");
			ctx.ui.setStatus("council", "⏳ Gathering perspectives...");

			try {
				const result = await quickDeliberate(config, brief, memberPersonas, ctx);

				ctx.ui.setStatus("council", `✅ Quick — $${result.totalCost.toFixed(2)}`);

				pi.sendMessage(
					{
						customType: "council-memo",
						content: result.synthesis,
						display: true,
					},
					{ triggerTurn: true, deliverAs: "followUp" },
				);

				setTimeout(() => ctx.ui.setStatus("council", undefined), 5000);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				ctx.ui.notify(`Quick council failed: ${msg}`, "error");
				ctx.ui.setStatus("council", undefined);
			}
		},
	});

	// ── /council-list — Show past deliberations ──────────────────

	pi.registerCommand("council-list", {
		description: "List past council deliberations",
		handler: async (_args, ctx) => {
			const memosDir = path.join(ctx.cwd, config.paths.memos);
			if (!fs.existsSync(memosDir)) {
				ctx.ui.notify("No deliberations in this project.", "info");
				return;
			}

			const sessions = fs
				.readdirSync(memosDir)
				.filter((d) => fs.existsSync(path.join(memosDir, d, "memo.md")))
				.sort()
				.reverse();

			if (sessions.length === 0) {
				ctx.ui.notify("No deliberations in this project.", "info");
				return;
			}

			if (!ctx.hasUI) {
				// Non-interactive: just list them
				const list = sessions
					.map((s) => {
						const content = fs.readFileSync(path.join(memosDir, s, "memo.md"), "utf-8");
						const titleMatch = content.match(/title:\s*"?([^"\n]+)"?/);
						return `${s}: ${titleMatch?.[1] ?? "Untitled"}`;
					})
					.join("\n");
				pi.sendMessage({ customType: "council-memo", content: `# Past Deliberations\n\n${list}`, display: true });
				return;
			}

			const items = sessions.map((s) => {
				const memoPath = path.join(memosDir, s, "memo.md");
				const content = fs.readFileSync(memoPath, "utf-8");
				const titleMatch = content.match(/title:\s*"?([^"\n]+)"?/);
				const dateMatch = content.match(/date:\s*(\S+)/);
				const costMatch = content.match(/budget_used:\s*(\S+)/);
				return `${s} — ${dateMatch?.[1] ?? "?"} — ${titleMatch?.[1] ?? "Untitled"} (${costMatch?.[1] ?? "?"})`;
			});

			const choice = await ctx.ui.select("Past Deliberations", items);
			if (choice) {
				const sessionId = choice.split(" — ")[0];
				const memoPath = path.join(memosDir, sessionId, "memo.md");
				const content = fs.readFileSync(memoPath, "utf-8");

				pi.sendMessage({
					customType: "council-memo",
					content: `# Past Council Memo: ${sessionId}\n\n${content}`,
					display: true,
				});
			}
		},
	});

	// ── /council-view — View a specific memo ─────────────────────

	pi.registerCommand("council-view", {
		description: "View a past council memo by session ID",
		getArgumentCompletions: (prefix: string) => {
			// Autocomplete session IDs from memos dir (use extDir as fallback, cwd not available here)
			const dirs = [config.paths.memos];
			const ids: Array<{ value: string; label: string }> = [];
			for (const base of [extDir, process.cwd()]) {
				const memosDir = path.join(base, config.paths.memos);
				if (!fs.existsSync(memosDir)) continue;
				for (const d of fs.readdirSync(memosDir)) {
					if (fs.existsSync(path.join(memosDir, d, "memo.md")) && d.startsWith(prefix)) {
						const content = fs.readFileSync(path.join(memosDir, d, "memo.md"), "utf-8");
						const titleMatch = content.match(/title:\s*"?([^"\n]+)"?/);
						ids.push({ value: d, label: `${d} — ${titleMatch?.[1] ?? "Untitled"}` });
					}
				}
			}
			return ids.length > 0 ? ids : null;
		},
		handler: async (args, ctx) => {
			if (!args || !args.trim()) {
				ctx.ui.notify("Usage: /council-view <session-id>", "warning");
				return;
			}

			const sessionId = args.trim();
			const memoPath = path.join(ctx.cwd, config.paths.memos, sessionId, "memo.md");

			if (!fs.existsSync(memoPath)) {
				ctx.ui.notify(`No memo found for session: ${sessionId}`, "error");
				return;
			}

			const content = fs.readFileSync(memoPath, "utf-8");

			pi.sendMessage({
				customType: "council-memo",
				content: `# Council Memo: ${sessionId}\n\n${content}`,
				display: true,
			});
		},
	});

	// ── Message Renderer ────────────────────────────────────────

	pi.registerMessageRenderer("council-memo", (message, { expanded }, theme) => {
		const content = typeof message.content === "string" ? message.content : "";
		const mdTheme = getMarkdownTheme();

		if (!expanded) {
			// Collapsed: show header line + first few lines
			const lines = content.split("\n");
			const heading = lines.find((l) => l.startsWith("# ")) ?? "Council Memo";
			const meta = lines
				.filter((l) => l.startsWith("**"))
				.slice(0, 3)
				.join("  ");

			const container = new Container();
			container.addChild(
				new Text(
					theme.fg("accent", theme.bold("⚖ ")) + theme.fg("accent", theme.bold(heading.replace(/^#\s*/, ""))),
					0,
					0,
				),
			);
			if (meta) {
				container.addChild(new Text(theme.fg("muted", meta), 0, 0));
			}
			container.addChild(new Text(theme.fg("dim", "(Ctrl+O to expand)"), 0, 0));
			return container;
		}

		// Expanded: full markdown rendering
		return new Markdown(content, 0, 0, mdTheme);
	});
}
