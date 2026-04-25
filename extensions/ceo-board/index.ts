/**
 * CEO & Board — Multi-agent strategic deliberation extension for pi
 *
 * The CEO IS the session agent. /ceo-begin transforms the session:
 * overrides the system prompt, registers converse() + end_deliberation()
 * tools, and the CEO drives the deliberation with full agency.
 *
 * Commands:
 *   /ceo-begin          — Select brief, transform session, start deliberation
 *   /ceo-stop           — Abort deliberation, revert session
 *   /ceo-quick <topic>  — Fast one-round parallel debate, no brief needed
 *   /ceo-list           — List past deliberations
 *   /ceo-view [id]      — View a past memo
 */

import {
	type ExtensionAPI,
	getMarkdownTheme,
} from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Container, Markdown, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as path from "node:path";

import { loadConfig, resolvePath } from "./src/config.js";
import { loadExpertise, loadPersona, loadSkills } from "./src/agents.js";
import { listBriefs, loadBrief, saveBrief, validateBrief } from "./src/brief.js";
import {
	type ConverseResult,
	converse,
	quickRound,
	getConversationLog,
	getRoundCounter,
	getTotalBoardCost,
	resetState,
} from "./src/converse.js";
import {
	type ConstraintState,
	checkConstraints,
	createConstraintState,
	getBudgetPercent,
	getElapsedMinutes,
	getTimePercent,
	getTotalCost,
} from "./src/constraints.js";
import { writeDeliberationFiles } from "./src/memo.js";
import { type MemberStat as WidgetMemberStat, renderStartup, renderWidget } from "./src/widget.js";

export default function ceoBoard(pi: ExtensionAPI) {
	const extDir = path.dirname(new URL(import.meta.url).pathname);

	let config = loadConfig(extDir);

	// ── Deliberation State ───────────────────────────────────────

	let deliberationActive = false;
	let ceoSystemPrompt = "";
	let briefContent = "";
	let briefTitle = "";
	let sessionId = "";
	let constraintState: ConstraintState | null = null;
	let memberStats: Record<string, WidgetMemberStat> = {};
	let startTime = 0;
	let savedActiveTools: string[] | null = null;
	let memoPath = "";

	function generateSessionId(): string {
		return Math.random().toString(36).slice(2, 8);
	}

	function cleanupDeliberation(ctx: { ui: { setWidget: any; setStatus: any } }) {
		deliberationActive = false;
		ceoSystemPrompt = "";
		briefContent = "";
		briefTitle = "";
		constraintState = null;
		memberStats = {};
		resetState();
		ctx.ui.setWidget("ceo-board", undefined);
		ctx.ui.setStatus("ceo", undefined);

		// Restore tools
		if (savedActiveTools) {
			pi.setActiveTools(savedActiveTools);
			savedActiveTools = null;
		}
	}

	let modelOverride: string | null = null;

	async function pickModel(ctx: any): Promise<string | null> {
		const available = ctx.modelRegistry.getAvailable();
		if (available.length === 0) return null;

		const current = ctx.model;
		const items = available.map((m: any) => {
			const label = `${m.provider}/${m.id}`;
			return label === `${current?.provider}/${current?.id}` ? `${label} (current)` : label;
		});
		items.unshift("$default (session model)");

		const choice = await ctx.ui.select("Model for board members:", items);
		if (!choice) return null;
		if (choice.startsWith("$default")) return "$default";
		return choice.replace(" (current)", "");
	}

	// ── Theme helper ─────────────────────────────────────────────

	function themeHelper(ctx: any) {
		return {
			fg: ctx.ui.theme.fg.bind(ctx.ui.theme) as (c: any, t: string) => string,
			bold: ctx.ui.theme.bold.bind(ctx.ui.theme),
		};
	}

	// ── Lifecycle ────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		config = loadConfig(extDir);
		// Reset any stale deliberation state from previous session
		if (deliberationActive) {
			cleanupDeliberation(ctx);
		}
	});

	// Override system prompt when deliberation is active
	pi.on("before_agent_start", async (event, _ctx) => {
		if (!deliberationActive) return;
		return { systemPrompt: ceoSystemPrompt };
	});

	// No input blocking — system prompt override via before_agent_start is sufficient.
	// Input blocking caused persistent state bugs across session restarts.

	// Track CEO cost from turn_end events
	pi.on("turn_end", async (event, _ctx) => {
		if (!deliberationActive || !constraintState) return;
		const msg = event.message;
		if (msg?.role === "assistant" && msg.usage?.cost?.total) {
			constraintState.ceoCost += msg.usage.cost.total;
		}

		// Check constraints after each CEO turn
		const warning = checkConstraints(constraintState, pi);
		if (warning) {
			pi.sendMessage(
				{ customType: "ceo-constraint", content: warning, display: true },
				{ deliverAs: "steer" },
			);
		}
	});

	// Clean up on session switch/shutdown
	pi.on("session_shutdown", async (_event, ctx) => {
		if (deliberationActive) cleanupDeliberation(ctx);
	});

	pi.on("session_before_switch", async (_event, ctx) => {
		if (deliberationActive) cleanupDeliberation(ctx);
	});

	pi.on("session_before_compact", async (_event, _ctx) => {
		if (deliberationActive) return { cancel: true };
	});

	// ── /ceo-begin — Start deliberation ──────────────────────────

	pi.registerCommand("ceo-begin", {
		description: "Start a CEO & Board deliberation",
		handler: async (_args, ctx) => {
			if (deliberationActive) {
				ctx.ui.notify("Deliberation already in progress. /ceo-stop to abort.", "warning");
				return;
			}

			config = loadConfig(extDir);
			const theme = themeHelper(ctx);

			// ── Select or create brief ───────────────────────
			const briefsDir = resolvePath(extDir, config.paths.briefs);
			const briefs = listBriefs(briefsDir);

			let selectedBriefDir: string;

			if (briefs.length > 0 && ctx.hasUI) {
				const items = [...briefs.map((b) => b.name), "[New brief]"];
				const choice = await ctx.ui.select("Select a brief:", items);
				if (!choice) {
					ctx.ui.notify("Cancelled.", "info");
					return;
				}
				if (choice === "[New brief]") {
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
						"[The single most important question for the board to answer.]",
						"",
						"## Context Files",
						"[Optional: paths to supporting docs]",
					].join("\n");

					const edited = await ctx.ui.editor("Write Brief", template);
					if (!edited || edited.trim() === template.trim()) {
						ctx.ui.notify("Cancelled — no brief.", "warning");
						return;
					}

					const { title } = await import("./src/brief.js").then((m) => m.parseBrief(edited));
					selectedBriefDir = saveBrief(briefsDir, title, edited);
				} else {
					const found = briefs.find((b) => b.name === choice);
					if (!found) return;
					selectedBriefDir = found.path;
				}
			} else {
				// No briefs exist or no UI — try to create one
				if (!ctx.hasUI) {
					ctx.ui.notify("No briefs found. Create one in " + briefsDir, "error");
					return;
				}
				const template = [
					"# [Your question here]",
					"",
					"## Situation",
					"[Facts.]",
					"",
					"## Stakes",
					"[Upside and downside.]",
					"",
					"## Constraints",
					"[Limits.]",
					"",
					"## Key Question",
					"[The question.]",
				].join("\n");
				const edited = await ctx.ui.editor("Write Brief", template);
				if (!edited || edited.trim() === template.trim()) {
					ctx.ui.notify("Cancelled.", "warning");
					return;
				}
				const { title } = await import("./src/brief.js").then((m) => m.parseBrief(edited));
				selectedBriefDir = saveBrief(briefsDir, title, edited);
			}

			// ── Load + validate brief ────────────────────────
			const brief = loadBrief(selectedBriefDir);
			const missing = validateBrief(brief.raw, config.meeting.brief_required_sections);
			if (missing.length > 0) {
				ctx.ui.notify(`Brief missing required sections: ${missing.join(", ")}`, "error");
				return;
			}

			// ── Select model ─────────────────────────────────
			if (ctx.hasUI) {
				const picked = await pickModel(ctx);
				if (picked && picked !== "$default") {
					modelOverride = picked;
					config.ceo.model = picked;
					for (const m of config.board) m.model = picked;
				} else {
					modelOverride = null;
				}
			}

			// ── Build CEO system prompt ──────────────────────
			const ceoPersona = loadPersona(
				resolvePath(extDir, config.ceo.path),
				config.ceo.name,
				config.ceo.color,
			);
			const ceoExpertise = loadExpertise(config.ceo.expertise, extDir);
			const ceoSkills = loadSkills(config.ceo.skills, extDir);

			ceoSystemPrompt = ceoPersona.systemPrompt;

			// Inject runtime variables
			const boardNames = config.board.map((m) => m.name).join(", ");
			ceoSystemPrompt += `\n\n## Runtime Context\n\n`;
			ceoSystemPrompt += `**Board Members:** ${boardNames}\n`;
			ceoSystemPrompt += `**Time Constraint:** ${config.meeting.constraints.max_time_minutes} minutes\n`;
			ceoSystemPrompt += `**Budget Constraint:** $${config.meeting.constraints.max_budget}\n`;
			ceoSystemPrompt += `**Rounds Hint:** ~${config.meeting.constraints.rounds_hint} rounds\n`;
			ceoSystemPrompt += `**Memo Output Path:** ${resolvePath(extDir, config.paths.memos)}/{session_id}/memo.md\n`;

			if (ceoExpertise) {
				ceoSystemPrompt += `\n\n## Your Expertise (from past sessions)\n\n${ceoExpertise}`;
			}
			if (ceoSkills) {
				ceoSystemPrompt += `\n\n## Skills\n\n${ceoSkills}`;
			}

			// ── Activate deliberation ────────────────────────
			sessionId = generateSessionId();
			briefContent = brief.raw;
			if (brief.contextFiles.length > 0) {
				briefContent += "\n\n---\n\n## Additional Context\n\n" + brief.contextFiles.join("\n\n---\n\n");
			}
			briefTitle = brief.title;
			startTime = Date.now();
			deliberationActive = true;
			constraintState = createConstraintState(
				config.meeting.constraints.max_time_minutes,
				config.meeting.constraints.max_budget,
			);

			// Initialize member stats for widget
			memberStats = {};
			for (const m of config.board) {
				memberStats[m.name] = {
					name: m.name,
					color: m.color,
					turns: 0,
					cost: 0,
					tokens: 0,
					status: "idle",
				};
			}

			// Save current tools and add our custom tools
			savedActiveTools = pi.getActiveTools();

			// Set session name
			pi.setSessionName(`CEO & Board: ${brief.title}`);

			// Show startup widget
			const startupLines = renderStartup(
				config.ceo.name,
				config.ceo.model,
				config.board.map((m) => ({ name: m.name, model: m.model })),
				{
					maxTime: config.meeting.constraints.max_time_minutes,
					maxBudget: config.meeting.constraints.max_budget,
				},
				theme,
			);
			ctx.ui.setWidget("ceo-board", startupLines, { placement: "belowEditor" });
			ctx.ui.setStatus("ceo", `⏳ ${brief.title} — Session ${sessionId}`);

			// Inject brief as first user message — this triggers the CEO
			pi.sendUserMessage(
				`# Brief: ${brief.title}\n\nSession ID: ${sessionId}\n\n${briefContent}\n\n---\n\nYou are the CEO. Read this brief, frame the decision, and begin the deliberation. Use converse() to engage the board. When you have enough perspectives, call end_deliberation() and write the memo to ${resolvePath(extDir, config.paths.memos)}/${sessionId}/memo.md`,
			);
		},
	});

	// ── /ceo-stop — Abort deliberation ───────────────────────────

	pi.registerCommand("ceo-stop", {
		description: "Abort the current deliberation and revert the session",
		handler: async (_args, ctx) => {
			if (!deliberationActive) {
				ctx.ui.notify("No active deliberation.", "info");
				return;
			}
			cleanupDeliberation(ctx);
			ctx.ui.notify("Deliberation aborted. Session restored.", "info");
		},
	});

	// ── converse tool ────────────────────────────────────────────

	pi.registerTool({
		name: "converse",
		label: "Converse",
		description:
			"Send a message to the board. All members (or specific ones via `to`) respond with their expert analysis. Use final_round=true for final statements.",
		parameters: Type.Object({
			message: Type.String({ description: "CEO's message to the board" }),
			to: Type.Optional(
				Type.Array(Type.String(), {
					description: "Specific board members to address. Omit for all.",
				}),
			),
			final_round: Type.Optional(
				Type.Boolean({
					description: "If true, members give final statements. Contrarian speaks last.",
				}),
			),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			if (!deliberationActive) {
				throw new Error("No active deliberation. Run /ceo-begin first.");
			}

			// Update widget — mark targeted members as active
			const targetNames = params.to ?? config.board.map((m) => m.name);
			for (const name of targetNames) {
				if (memberStats[name]) memberStats[name].status = "active";
			}
			const theme = themeHelper(ctx);
			ctx.ui.setWidget(
				"ceo-board",
				renderWidget(memberStats, getElapsedMinutes(constraintState!), getTotalCost(constraintState!), theme),
				{ placement: "belowEditor" },
			);

			// Execute converse
			const result = await converse(
				params.message,
				params.to,
				params.final_round ?? false,
				briefContent,
				config,
				extDir,
				ctx,
				signal,
			);

			// Update member stats
			for (const r of result.responses) {
				const stat = memberStats[r.name];
				if (stat) {
					stat.turns++;
					stat.cost += r.cost;
					stat.tokens += r.inputTokens + r.outputTokens;
					stat.status = "done";
				}
			}
			ctx.ui.setWidget(
				"ceo-board",
				renderWidget(memberStats, getElapsedMinutes(constraintState!), getTotalCost(constraintState!), theme),
				{ placement: "belowEditor" },
			);

			// Check constraints after converse
			if (constraintState) {
				const warning = checkConstraints(constraintState, pi);
				if (warning) {
					pi.sendMessage(
						{ customType: "ceo-constraint", content: warning, display: true },
						{ deliverAs: "steer" },
					);
				}
			}

			// Format response for CEO
			const lines: string[] = [];
			for (const r of result.responses) {
				lines.push(`### ${r.name}\n\n${r.response}`);
			}
			if (result.abortedCount > 0) {
				lines.push(`\n*${result.abortedCount} member(s) did not respond (aborted).*`);
			}
			lines.push(
				`\n---\n*Round ${getRoundCounter()} — Board cost: $${result.totalCost.toFixed(2)} — Total: $${getTotalCost(constraintState!).toFixed(2)}*`,
			);

			return {
				content: [{ type: "text", text: lines.join("\n\n") }],
				details: {
					round: getRoundCounter(),
					responses: result.responses.map((r) => ({ name: r.name, cost: r.cost })),
					totalCost: result.totalCost,
					abortedCount: result.abortedCount,
				},
			};
		},

		renderCall(args, theme, _context) {
			const to = args.to ? args.to.join(", ") : "all";
			const final = args.final_round ? theme.fg("warning", " [FINAL]") : "";
			const preview = args.message?.length > 80 ? args.message.slice(0, 80) + "..." : args.message ?? "";
			return new Text(
				`${theme.fg("accent", theme.bold("converse"))} → ${theme.fg("muted", to)}${final}\n  ${theme.fg("dim", preview)}`,
				0,
				0,
			);
		},

		renderResult(result, { expanded }, theme, _context) {
			const details = result.details as any;
			if (!details?.responses) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "(no response)", 0, 0);
			}

			const mdTheme = getMarkdownTheme();

			if (expanded) {
				const text = result.content[0];
				return new Markdown(text?.type === "text" ? text.text : "", 0, 0, mdTheme);
			}

			// Collapsed: one line per member
			let text = `${theme.fg("accent", `Round ${details.round}`)} — $${details.totalCost?.toFixed(2) ?? "?"}`;
			for (const r of details.responses) {
				text += `\n  ${theme.fg("success", "✓")} ${r.name} ($${r.cost.toFixed(3)})`;
			}
			if (details.abortedCount > 0) {
				text += `\n  ${theme.fg("error", "✗")} ${details.abortedCount} aborted`;
			}
			return new Text(text, 0, 0);
		},
	});

	// ── end_deliberation tool ────────────────────────────────────

	pi.registerTool({
		name: "end_deliberation",
		label: "End Deliberation",
		description:
			"Finalize the deliberation. Writes the transcript and conversation log. After calling this, write the final memo.",
		parameters: Type.Object({}),

		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			if (!deliberationActive) {
				throw new Error("No active deliberation.");
			}

			const log = getConversationLog();
			const totalCost = getTotalCost(constraintState!);

			const files = writeDeliberationFiles(sessionId, log, totalCost, startTime, briefTitle, config, extDir);
			memoPath = files.memoPath;

			const duration = ((Date.now() - startTime) / 60_000).toFixed(1);

			return {
				content: [
					{
						type: "text",
						text: `Deliberation ended.\n\n**Session:** ${sessionId}\n**Duration:** ${duration} min\n**Total Cost:** $${totalCost.toFixed(2)}\n**Rounds:** ${getRoundCounter()}\n**Transcript:** ${files.transcriptPath}\n**Memo path:** ${files.memoPath}\n\nNow write the final memo to: ${files.memoPath}`,
					},
				],
				details: { sessionId, duration, totalCost, rounds: getRoundCounter(), memoPath: files.memoPath },
			};
		},
	});

	// ── /ceo-quick — Fast one-round parallel debate ─────────────

	pi.registerCommand("ceo-quick", {
		description: "Quick board debate — one parallel round on a topic, no brief needed",
		handler: async (args, ctx) => {
			const topic = args?.trim();
			if (!topic) {
				ctx.ui.notify("Usage: /ceo-quick <topic or question>", "warning");
				return;
			}

			config = loadConfig(extDir);

			if (ctx.hasUI) {
				const picked = await pickModel(ctx);
				if (picked && picked !== "$default") {
					for (const m of config.board) m.model = picked;
				}
			}

			ctx.ui.setStatus("ceo", "⏳ Board perspectives...");

			try {
				const result = await quickRound(topic, config, extDir, ctx, ctx.signal);

				if (result.responses.length === 0) {
					ctx.ui.notify("No board responses received.", "warning");
					ctx.ui.setStatus("ceo", undefined);
					return;
				}

				const formatted = result.responses
					.map((r) => `### ${r.name}\n\n${r.response.replace(/<mental_model_update>[\s\S]*?<\/mental_model_update>/i, "").trim()}`)
					.join("\n\n---\n\n");

				const output = `## Board Quick Take: ${topic}\n\n${formatted}\n\n---\n*${result.responses.length} perspectives — $${result.totalCost.toFixed(2)}*`;

				pi.sendMessage(
					{ customType: "ceo-quick", content: output, display: true },
					{ deliverAs: "followUp" },
				);

				ctx.ui.setStatus("ceo", `✅ Quick — $${result.totalCost.toFixed(2)}`);
				setTimeout(() => ctx.ui.setStatus("ceo", undefined), 5000);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				ctx.ui.notify(`Quick debate failed: ${msg}`, "error");
				ctx.ui.setStatus("ceo", undefined);
			}
		},
	});

	// ── /ceo-list — Past deliberations ───────────────────────────

	pi.registerCommand("ceo-list", {
		description: "List past CEO & Board deliberations",
		handler: async (_args, ctx) => {
			const memosDir = resolvePath(extDir, config.paths.memos);
			if (!fs.existsSync(memosDir)) {
				ctx.ui.notify("No deliberations yet.", "info");
				return;
			}
			const sessions = fs
				.readdirSync(memosDir)
				.filter((d) => fs.existsSync(path.join(memosDir, d, "memo.md")))
				.sort()
				.reverse();

			if (sessions.length === 0) {
				ctx.ui.notify("No deliberations yet.", "info");
				return;
			}

			const items = sessions.map((s) => {
				const content = fs.readFileSync(path.join(memosDir, s, "memo.md"), "utf-8");
				const titleMatch = content.match(/title:\s*"?([^"\n]+)"?/);
				const costMatch = content.match(/budget_used:\s*(\S+)/);
				return `${s} — ${titleMatch?.[1] ?? "Untitled"} (${costMatch?.[1] ?? "?"})`;
			});

			if (!ctx.hasUI) {
				pi.sendMessage({ customType: "ceo-memo", content: items.join("\n"), display: true });
				return;
			}

			const choice = await ctx.ui.select("Past Deliberations", items);
			if (choice) {
				const sid = choice.split(" — ")[0];
				const content = fs.readFileSync(path.join(memosDir, sid, "memo.md"), "utf-8");
				pi.sendMessage({ customType: "ceo-memo", content, display: true });
			}
		},
	});

	// ── /ceo-view — View specific memo ───────────────────────────

	pi.registerCommand("ceo-view", {
		description: "View a past CEO & Board memo by session ID",
		getArgumentCompletions: (prefix: string) => {
			const memosDir = resolvePath(extDir, config.paths.memos);
			if (!fs.existsSync(memosDir)) return null;
			const ids = fs
				.readdirSync(memosDir)
				.filter((d) => d.startsWith(prefix) && fs.existsSync(path.join(memosDir, d, "memo.md")));
			return ids.length > 0 ? ids.map((d) => ({ value: d, label: d })) : null;
		},
		handler: async (args, ctx) => {
			if (!args?.trim()) {
				ctx.ui.notify("Usage: /ceo-view <session-id>", "warning");
				return;
			}
			const memosDir = resolvePath(extDir, config.paths.memos);
			const mp = path.join(memosDir, args.trim(), "memo.md");
			if (!fs.existsSync(mp)) {
				ctx.ui.notify(`No memo found: ${args.trim()}`, "error");
				return;
			}
			pi.sendMessage({ customType: "ceo-memo", content: fs.readFileSync(mp, "utf-8"), display: true });
		},
	});

	// ── Message Renderers ────────────────────────────────────────

	pi.registerMessageRenderer("ceo-constraint", (message, _opts, theme) => {
		const content = typeof message.content === "string" ? message.content : "";
		return new Text(theme.fg("warning", content), 0, 0);
	});

	pi.registerMessageRenderer("ceo-memo", (message, { expanded }, theme) => {
		const content = typeof message.content === "string" ? message.content : "";
		if (!expanded) {
			const heading = content.split("\n").find((l) => l.startsWith("# ")) ?? "CEO Memo";
			const container = new Container();
			container.addChild(
				new Text(theme.fg("accent", theme.bold("⚖ " + heading.replace(/^#\s*/, ""))), 0, 0),
			);
			container.addChild(new Text(theme.fg("dim", "(Ctrl+O to expand)"), 0, 0));
			return container;
		}
		return new Markdown(content, 0, 0, getMarkdownTheme());
	});

	// ── Revert session after CEO writes memo ─────────────────────
	// Watch for the CEO writing the memo file. Once written, revert.
	pi.on("tool_result", async (event, ctx) => {
		if (!deliberationActive) return;
		if (event.toolName !== "write") return;

		// Check if the CEO just wrote to the memo path
		const writePath = (event.input as any)?.path;
		if (writePath && memoPath && writePath.includes(sessionId) && writePath.endsWith("memo.md")) {
			// CEO wrote the memo — revert session
			setTimeout(() => {
				if (!deliberationActive) return;
				const theme = themeHelper(ctx);
				cleanupDeliberation(ctx);

				pi.sendMessage(
					{
						customType: "ceo-memo",
						content: `═══════════════════════════════════════════\n  Deliberation complete. Memo written.\n  Session restored — you can discuss the memo.\n═══════════════════════════════════════════`,
						display: true,
					},
					{ triggerTurn: false },
				);
			}, 500);
		}
	});
}
