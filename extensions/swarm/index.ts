/**
 * Swarm — Unified multi-agent orchestration for pi
 *
 * Combines unattended DAG pipelines (from oh-my-pi/swarm-extension) with
 * interactive CEO & Board deliberation (from ceo-board extension).
 *
 * Commands:
 *   /swarm run <yaml>      Run unattended pipeline
 *   /swarm begin            Start interactive deliberation (session takeover)
 *   /swarm stop             Abort active deliberation
 *   /swarm quick <topic>    One-round parallel debate
 *   /swarm status [name]    Show pipeline state
 *   /swarm list             Past deliberations
 *   /swarm view [id]        View past memo
 */
import { type ExtensionAPI, getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as path from "node:path";

import { buildDependencyGraph, buildExecutionWaves, detectCycles } from "./src/dag.js";
import { PipelineController } from "./src/pipeline.js";
import { renderSwarmProgress } from "./src/render.js";
import { parseSwarmYaml, type SwarmDefinition, validateSwarmDefinition } from "./src/schema.js";
import { StateTracker } from "./src/state.js";
import { loadPersona, loadExpertise, loadSkills } from "./src/persona.js";
import { executeDialogue, quickRound, type MemberResponse } from "./src/dialogue.js";
import { type ConstraintState, createConstraintState, addBoardCost, addCeoCost, getTotalCost, getElapsedMinutes, checkConstraints } from "./src/constraints.js";
import { listBriefs, loadBrief, saveBrief, parseBrief, validateBrief } from "./src/brief.js";
import { writeDeliberationFiles, type TranscriptEntry } from "./src/memo.js";
import { type MemberStat, renderDeliberationWidget, renderStartup } from "./src/widget.js";

function fmt(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

export default function swarmExtension(pi: ExtensionAPI) {
	const extDir = path.dirname(new URL(import.meta.url).pathname);
	const dataDir = path.join(extDir, ".pi", "swarm");

	// ── Deliberation State ───────────────────────────────────────

	let deliberationActive = false;
	let ceoSystemPrompt = "";
	let briefContent = "";
	let briefTitle = "";
	let sessionId = "";
	let constraintState: ConstraintState | null = null;
	let memberStats: Record<string, MemberStat> = {};
	let dialogueTranscript: TranscriptEntry[] = [];
	let startTime = 0;
	let savedActiveTools: string[] | null = null;
	let memoPath = "";
	let activeAgents: import("./src/schema.js").SwarmAgent[] = [];
	let activeOutputDir = "";

	function generateSessionId(): string { return Math.random().toString(36).slice(2, 8); }

	function cleanupDeliberation(ctx: any) {
		deliberationActive = false;
		ceoSystemPrompt = "";
		briefContent = "";
		briefTitle = "";
		constraintState = null;
		memberStats = {};
		dialogueTranscript = [];
		activeAgents = [];
		ctx.ui.setWidget("swarm", undefined);
		ctx.ui.setStatus("swarm", undefined);
		if (savedActiveTools) { pi.setActiveTools(savedActiveTools); savedActiveTools = null; }
	}

	function themeHelper(ctx: any) {
		return {
			fg: ctx.ui.theme.fg.bind(ctx.ui.theme) as (c: any, t: string) => string,
			bold: ctx.ui.theme.bold.bind(ctx.ui.theme),
		};
	}

	// ── Session Lifecycle ────────────────────────────────────────

	pi.on("before_agent_start", async (_event, _ctx) => {
		if (!deliberationActive) return;
		return { systemPrompt: ceoSystemPrompt };
	});

	pi.on("turn_end", async (event, _ctx) => {
		if (!deliberationActive || !constraintState) return;
		const msg = (event as any).message;
		if (msg?.role === "assistant" && msg.usage?.cost?.total) addCeoCost(constraintState, msg.usage.cost.total);
		const warning = checkConstraints(constraintState);
		if (warning) pi.sendMessage({ customType: "swarm-constraint", content: warning, display: true }, { deliverAs: "steer" } as any);
	});

	pi.on("session_shutdown", async (_event, ctx) => { if (deliberationActive) cleanupDeliberation(ctx); });
	pi.on("session_before_switch", async (_event, ctx) => { if (deliberationActive) cleanupDeliberation(ctx); });
	pi.on("session_before_compact", async (_event, _ctx) => { if (deliberationActive) return { cancel: true }; });

	// Auto-revert after CEO writes memo
	pi.on("tool_result", async (event, ctx) => {
		if (!deliberationActive) return;
		if ((event as any).toolName !== "write") return;
		const writePath = ((event as any).input as any)?.path;
		if (writePath && memoPath && writePath.includes(sessionId) && writePath.endsWith("memo.md")) {
			setTimeout(() => {
				if (!deliberationActive) return;
				cleanupDeliberation(ctx);
				pi.sendMessage({ customType: "swarm-memo", content: "═══════════════════════════════════════════\n  Deliberation complete. Memo written.\n  Session restored.\n═══════════════════════════════════════════", display: true }, { triggerTurn: false });
			}, 500);
		}
	});

	// ── Message Renderers ────────────────────────────────────────

	pi.registerMessageRenderer("swarm-constraint", (message, _opts, theme) =>
		new Text(theme.fg("warning", typeof message.content === "string" ? message.content : ""), 0, 0));

	pi.registerMessageRenderer("swarm-memo", (message, { expanded }, theme) => {
		const content = typeof message.content === "string" ? message.content : "";
		if (!expanded) {
			const heading = content.split("\n").find(l => l.startsWith("# ")) ?? "Swarm Memo";
			const c = new Container();
			c.addChild(new Text(theme.fg("accent", theme.bold("⚖ " + heading.replace(/^#\s*/, ""))), 0, 0));
			c.addChild(new Text(theme.fg("dim", "(Ctrl+O to expand)"), 0, 0));
			return c;
		}
		return new Markdown(content, 0, 0, getMarkdownTheme());
	});

	// ── /swarm command ───────────────────────────────────────────

	pi.registerCommand("swarm", {
		description: "Multi-agent orchestration — pipelines, deliberation, quick debate",
		handler: async (args: string, ctx) => {
			const parts = args.trim().split(/\s+/);
			const sub = parts[0] ?? "help";

			switch (sub) {
				case "run": return handleRun(parts.slice(1).join(" "), ctx);
				case "begin": return handleBegin(ctx, pi);
				case "stop": return handleStop(ctx);
				case "quick": return handleQuick(parts.slice(1).join(" "), ctx, pi);
				case "status": return handleStatus(parts[1], ctx);
				case "list": return handleList(ctx, pi);
				case "view": return handleView(parts[1], ctx, pi);
				default:
					ctx.ui.notify([
						"Swarm — multi-agent orchestration",
						"",
						"  /swarm run <file.yaml>     Run unattended pipeline",
						"  /swarm begin               Start interactive deliberation",
						"  /swarm stop                Abort deliberation",
						"  /swarm quick <topic>       One-round parallel debate",
						"  /swarm status [name]       Pipeline state",
						"  /swarm list                Past deliberations",
						"  /swarm view [id]           View past memo",
					].join("\n"));
			}
		},
	});

	// ── converse tool (registered for interactive mode) ──────────

	pi.registerTool({
		name: "converse",
		label: "Converse",
		description: "Send a message to the board. All or specific members respond with expert analysis.",
		parameters: Type.Object({
			message: Type.String({ description: "Message to the board" }),
			to: Type.Optional(Type.Array(Type.String(), { description: "Specific members. Omit for all." })),
			final_round: Type.Optional(Type.Boolean({ description: "If true, members give final statements." })),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			if (!deliberationActive) throw new Error("No active deliberation. Run /swarm begin first.");

			const targetAgents = params.to
				? activeAgents.filter(a => params.to!.some(t => a.name.toLowerCase().includes(t.toLowerCase())))
				: activeAgents;

			for (const a of targetAgents) { if (memberStats[a.name]) memberStats[a.name].status = "active"; }
			const theme = themeHelper(ctx);
			ctx.ui.setWidget("swarm", renderDeliberationWidget(memberStats, getElapsedMinutes(constraintState!), getTotalCost(constraintState!), theme), { placement: "belowEditor" });

			dialogueTranscript.push({ from: "CEO", to: targetAgents.map(a => a.name).join(", "), content: params.message, timestamp: Date.now(), round: dialogueTranscript.filter(t => t.from === "CEO").length + 1 });

			const result = await executeDialogue({
				agents: targetAgents,
				maxRounds: 1,
				briefContent: `${briefContent}\n\n## CEO's Message\n\n${params.message}`,
				ctx: { piCtx: ctx },
				stateTracker: new StateTracker((ctx as any).cwd ?? process.cwd(), sessionId),
				signal,
				onRound: (round, responses) => {
					for (const r of responses) {
						dialogueTranscript.push({ from: r.name, to: "CEO", content: r.response, timestamp: Date.now(), round });
						if (memberStats[r.name]) {
							memberStats[r.name].turns++;
							memberStats[r.name].cost += r.cost;
							memberStats[r.name].tokens += r.inputTokens + r.outputTokens;
							memberStats[r.name].status = "done";
						}
					}
					if (constraintState) addBoardCost(constraintState, responses.reduce((s, r) => s + r.cost, 0));
				},
			});

			ctx.ui.setWidget("swarm", renderDeliberationWidget(memberStats, getElapsedMinutes(constraintState!), getTotalCost(constraintState!), theme), { placement: "belowEditor" });

			const roundNum = dialogueTranscript.filter(t => t.from === "CEO").length;
			const lines: string[] = [];
			for (const entry of dialogueTranscript.filter(t => t.round === roundNum && t.from !== "CEO")) {
				lines.push(`### ${entry.from}\n\n${entry.content.replace(/<mental_model_update>[\s\S]*?<\/mental_model_update>/gi, "").trim()}`);
			}
			lines.push(`\n---\n*Round ${roundNum} — Board cost: $${result.totalCost.toFixed(2)} — Total: $${getTotalCost(constraintState!).toFixed(2)}*`);

			return { content: [{ type: "text" as const, text: lines.join("\n\n") }], details: { round: roundNum, totalCost: result.totalCost } };
		},

		renderCall(args, theme) {
			const to = args.to ? args.to.join(", ") : "all";
			const final = args.final_round ? theme.fg("warning", " [FINAL]") : "";
			const preview = args.message?.length > 80 ? args.message.slice(0, 80) + "..." : args.message ?? "";
			return new Text(`${theme.fg("accent", theme.bold("converse"))} → ${theme.fg("muted", to)}${final}\n  ${theme.fg("dim", preview)}`, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as any;
			if (!details) { const t = result.content[0]; return new Text(t?.type === "text" ? t.text : "(no response)", 0, 0); }
			if (expanded) { const t = result.content[0]; return new Markdown(t?.type === "text" ? t.text : "", 0, 0, getMarkdownTheme()); }
			return new Text(`${theme.fg("accent", `Round ${details.round}`)} — $${details.totalCost?.toFixed(2) ?? "?"}`, 0, 0);
		},
	});

	// ── end_deliberation tool ────────────────────────────────────

	pi.registerTool({
		name: "end_deliberation",
		label: "End Deliberation",
		description: "Finalize the deliberation. Writes transcript and conversation log. Then write the final memo.",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
			if (!deliberationActive) throw new Error("No active deliberation.");
			const cost = getTotalCost(constraintState!);
			const boardNames = activeAgents.map(a => a.name);
			const files = writeDeliberationFiles(sessionId, dialogueTranscript, cost, startTime, briefTitle, boardNames, activeOutputDir);
			memoPath = files.memoPath;
			const duration = ((Date.now() - startTime) / 60_000).toFixed(1);
			return { content: [{ type: "text" as const, text: `Deliberation ended.\n\n**Session:** ${sessionId}\n**Duration:** ${duration} min\n**Total Cost:** $${cost.toFixed(2)}\n**Transcript:** ${files.transcriptPath}\n**Memo path:** ${files.memoPath}\n\nNow write the final memo to: ${files.memoPath}` }], details: { sessionId, duration, totalCost: cost, memoPath: files.memoPath } };
		},
	});

	// ── Handlers ─────────────────────────────────────────────────

	async function handleRun(yamlPath: string, ctx: any) {
		if (!yamlPath) { ctx.ui.notify("Usage: /swarm run <path/to/pipeline.yaml>", "error"); return; }
		const cwd = ctx.cwd ?? process.cwd();
		const resolvedPath = path.isAbsolute(yamlPath) ? yamlPath : path.resolve(cwd, yamlPath);

		let content: string;
		try { content = fs.readFileSync(resolvedPath, "utf-8"); } catch { ctx.ui.notify(`Cannot read: ${resolvedPath}`, "error"); return; }

		let def: SwarmDefinition;
		try { def = await parseSwarmYaml(content); } catch (e) { ctx.ui.notify(`YAML error: ${e instanceof Error ? e.message : e}`, "error"); return; }

		const errs = validateSwarmDefinition(def);
		if (errs.length > 0) { ctx.ui.notify(`Errors:\n${errs.map(e => `  - ${e}`).join("\n")}`, "error"); return; }

		const deps = buildDependencyGraph(def);
		const cycles = detectCycles(deps);
		if (cycles) { ctx.ui.notify(`Cycle: [${cycles.join(", ")}]`, "error"); return; }
		const waves = buildExecutionWaves(deps);

		// Load personas for agents that have persona field
		for (const [name, agent] of def.agents) {
			if (agent.persona) {
				const personaPath = path.isAbsolute(agent.persona) ? agent.persona : path.resolve(path.dirname(resolvedPath), agent.persona);
				const persona = loadPersona(personaPath, agent.name, agent.color);
				agent.role = persona.name;
				agent.extraContext = persona.systemPrompt;
				if (persona.model && !agent.model) agent.model = persona.model;
			}
		}

		const workspace = path.isAbsolute(def.workspace) ? def.workspace : path.resolve(path.dirname(resolvedPath), def.workspace);
		fs.mkdirSync(workspace, { recursive: true });

		const stateTracker = new StateTracker(workspace, def.name);
		await stateTracker.init([...def.agents.keys()], def.targetCount, def.mode);

		ctx.ui.notify(`Starting '${def.name}': ${def.agents.size} agents, ${waves.length} waves, ${def.targetCount} iteration(s)`);

		const controller = new PipelineController(def, waves, stateTracker);
		const result = await controller.run({
			workspace,
			onProgress: () => { ctx.ui.setWidget("swarm", renderSwarmProgress(stateTracker.state), { placement: "belowEditor" }); },
			ctx: { piCtx: ctx },
		});

		ctx.ui.setWidget("swarm", undefined);
		const elapsed = stateTracker.state.completedAt ? fmt(stateTracker.state.completedAt - stateTracker.state.startedAt) : "?";
		ctx.ui.notify([`'${def.name}' ${result.status}`, `${result.iterations}/${def.targetCount} iterations`, `elapsed: ${elapsed}`, ...(result.errors.length > 0 ? [`${result.errors.length} error(s)`] : [])].join(" | "), result.status === "completed" ? "info" : "error");
	}

	async function handleBegin(ctx: any, pi: ExtensionAPI) {
		if (deliberationActive) { ctx.ui.notify("Deliberation active. /swarm stop to abort.", "warning"); return; }

		// Look for a swarm config or use defaults
		const configPath = path.join(extDir, "config.yaml");
		let agentsDir = path.join(extDir, ".pi", "swarm", "agents");
		let outputDirBase = path.join(extDir, ".pi", "swarm");
		let briefsDir = path.join(extDir, ".pi", "swarm", "briefs");
		let requiredSections = ["situation", "stakes", "constraints", "key question"];
		let maxTimeMins = 5;
		let maxBudget = 5;

		// Try to load config.yaml (backward compat with ceo-board)
		if (fs.existsSync(configPath)) {
			try {
				const jsyaml = await import("js-yaml");
				const cfg = jsyaml.load(fs.readFileSync(configPath, "utf-8")) as any;
				if (cfg?.paths?.agents) agentsDir = path.join(extDir, cfg.paths.agents);
				if (cfg?.paths?.briefs) briefsDir = path.join(extDir, cfg.paths.briefs);
				if (cfg?.meeting?.constraints?.max_time_minutes) maxTimeMins = cfg.meeting.constraints.max_time_minutes;
				if (cfg?.meeting?.constraints?.max_budget) maxBudget = typeof cfg.meeting.constraints.max_budget === "string" ? parseFloat(cfg.meeting.constraints.max_budget.replace("$", "")) : cfg.meeting.constraints.max_budget;
				if (cfg?.meeting?.brief_required_sections) requiredSections = cfg.meeting.brief_required_sections;
				if (cfg?.paths?.memos || cfg?.paths?.deliberations) outputDirBase = path.join(extDir, cfg.paths?.memos ? path.dirname(cfg.paths.memos) : ".");
			} catch { /* use defaults */ }
		}

		// Load agent personas from agents dir
		const agents: import("./src/schema.js").SwarmAgent[] = [];
		if (fs.existsSync(agentsDir)) {
			for (const file of fs.readdirSync(agentsDir).filter(f => f.endsWith(".md") && f !== "ceo.md")) {
				const persona = loadPersona(path.join(agentsDir, file), file.replace(".md", ""), "#ffffff");
				agents.push({
					name: persona.name,
					role: persona.name,
					task: "Respond to the CEO's brief and messages with your expert analysis.",
					extraContext: persona.systemPrompt,
					reportsTo: [], waitsFor: [],
					model: persona.model || undefined,
					dialogue: true, maxRounds: 3,
					color: persona.color,
				});
			}
		}

		if (agents.length === 0) { ctx.ui.notify(`No agent personas found in ${agentsDir}`, "error"); return; }

		// Select or create brief
		const briefs = listBriefs(briefsDir);
		let selectedBriefDir: string;

		if (briefs.length > 0 && ctx.hasUI) {
			const items = [...briefs.map(b => b.name), "[New brief]"];
			const choice = await ctx.ui.select("Select a brief:", items);
			if (!choice) { ctx.ui.notify("Cancelled.", "info"); return; }
			if (choice === "[New brief]") {
				const template = "# [Your question]\n\n## Situation\n[Facts.]\n\n## Stakes\n[Upside and downside.]\n\n## Constraints\n[Limits.]\n\n## Key Question\n[The question.]";
				const edited = await ctx.ui.editor("Write Brief", template);
				if (!edited || edited.trim() === template.trim()) { ctx.ui.notify("Cancelled.", "warning"); return; }
				const { title } = parseBrief(edited);
				selectedBriefDir = saveBrief(briefsDir, title, edited);
			} else {
				const found = briefs.find(b => b.name === choice);
				if (!found) return;
				selectedBriefDir = found.path;
			}
		} else {
			const template = "# [Your question]\n\n## Situation\n[Facts.]\n\n## Stakes\n[Upside and downside.]\n\n## Constraints\n[Limits.]\n\n## Key Question\n[The question.]";
			const edited = await ctx.ui.editor("Write Brief", template);
			if (!edited) { ctx.ui.notify("Cancelled.", "warning"); return; }
			const { title } = parseBrief(edited);
			selectedBriefDir = saveBrief(briefsDir, title, edited);
		}

		const brief = loadBrief(selectedBriefDir);
		const missing = validateBrief(brief.raw, requiredSections);
		if (missing.length > 0) { ctx.ui.notify(`Brief missing: ${missing.join(", ")}`, "error"); return; }

		// Build CEO system prompt
		const ceoPath = path.join(agentsDir, "ceo.md");
		const ceoPersona = loadPersona(ceoPath, "CEO", "#7dcfff");
		ceoSystemPrompt = ceoPersona.systemPrompt;
		const boardNames = agents.map(a => a.name).join(", ");
		ceoSystemPrompt += `\n\n## Runtime Context\n\n**Board Members:** ${boardNames}\n**Time:** ${maxTimeMins} min\n**Budget:** $${maxBudget}\n`;

		// Activate
		sessionId = generateSessionId();
		briefContent = brief.raw + (brief.contextFiles.length > 0 ? "\n\n---\n\n## Additional Context\n\n" + brief.contextFiles.join("\n\n---\n\n") : "");
		briefTitle = brief.title;
		startTime = Date.now();
		deliberationActive = true;
		constraintState = createConstraintState(maxTimeMins, maxBudget);
		activeAgents = agents;
		activeOutputDir = outputDirBase;
		memberStats = {};
		dialogueTranscript = [];
		for (const a of agents) memberStats[a.name] = { name: a.name, color: a.color, turns: 0, cost: 0, tokens: 0, status: "idle" };

		savedActiveTools = pi.getActiveTools();
		pi.setSessionName(`Deliberation: ${brief.title}`);

		const theme = themeHelper(ctx);
		ctx.ui.setWidget("swarm", renderStartup(agents.map(a => a.name), { maxTime: maxTimeMins, maxBudget }, theme), { placement: "belowEditor" });
		ctx.ui.setStatus("swarm", `⏳ ${brief.title} — Session ${sessionId}`);

		pi.sendUserMessage(`# Brief: ${brief.title}\n\nSession ID: ${sessionId}\n\n${briefContent}\n\n---\n\nYou are the CEO. Read this brief, frame the decision, and begin. Use converse() to engage the board. When done, call end_deliberation() and write the memo.`);
	}

	async function handleStop(ctx: any) {
		if (!deliberationActive) { ctx.ui.notify("No active deliberation.", "info"); return; }
		cleanupDeliberation(ctx);
		ctx.ui.notify("Deliberation aborted. Session restored.", "info");
	}

	async function handleQuick(topic: string, ctx: any, pi: ExtensionAPI) {
		if (!topic) { ctx.ui.notify("Usage: /swarm quick <topic>", "warning"); return; }

		const agentsDir = path.join(extDir, ".pi", "swarm", "agents");
		const agents: import("./src/schema.js").SwarmAgent[] = [];
		if (fs.existsSync(agentsDir)) {
			for (const file of fs.readdirSync(agentsDir).filter(f => f.endsWith(".md") && f !== "ceo.md")) {
				const persona = loadPersona(path.join(agentsDir, file), file.replace(".md", ""), "#ffffff");
				agents.push({ name: persona.name, role: persona.name, task: topic, extraContext: persona.systemPrompt, reportsTo: [], waitsFor: [], dialogue: false, maxRounds: 1, color: persona.color });
			}
		}
		if (agents.length === 0) { ctx.ui.notify(`No agents in ${agentsDir}`, "error"); return; }

		ctx.ui.setStatus("swarm", "⏳ Board perspectives...");

		try {
			const result = await quickRound(topic, agents, undefined, { piCtx: ctx }, ctx.signal);
			if (result.responses.length === 0) { ctx.ui.notify("No responses.", "warning"); ctx.ui.setStatus("swarm", undefined); return; }

			const formatted = result.responses
				.map(r => `### ${r.name}\n\n${r.response.replace(/<mental_model_update>[\s\S]*?<\/mental_model_update>/i, "").trim()}`)
				.join("\n\n---\n\n");

			pi.sendMessage({ customType: "swarm-memo", content: `## Quick Take: ${topic}\n\n${formatted}\n\n---\n*${result.responses.length} perspectives — $${result.totalCost.toFixed(2)}*`, display: true }, { deliverAs: "followUp" } as any);
			ctx.ui.setStatus("swarm", `✅ Quick — $${result.totalCost.toFixed(2)}`);
			setTimeout(() => ctx.ui.setStatus("swarm", undefined), 5000);
		} catch (err) {
			ctx.ui.notify(`Quick debate failed: ${err instanceof Error ? err.message : err}`, "error");
			ctx.ui.setStatus("swarm", undefined);
		}
	}

	async function handleStatus(name: string | undefined, ctx: any) {
		if (!name) { ctx.ui.notify("Usage: /swarm status <name>", "info"); return; }
		const cwd = ctx.cwd ?? process.cwd();
		const stateTracker = new StateTracker(cwd, name);
		const state = await stateTracker.load();
		if (!state) { ctx.ui.notify(`No state for '${name}'`, "error"); return; }
		ctx.ui.notify(renderSwarmProgress(state).join("\n"));
	}

	async function handleList(ctx: any, pi: ExtensionAPI) {
		const memosDir = path.join(dataDir, "memos");
		if (!fs.existsSync(memosDir)) { ctx.ui.notify("No deliberations yet.", "info"); return; }
		const sessions = fs.readdirSync(memosDir).filter(d => fs.existsSync(path.join(memosDir, d, "memo.md"))).sort().reverse();
		if (sessions.length === 0) { ctx.ui.notify("No deliberations yet.", "info"); return; }
		const items = sessions.map(s => {
			const c = fs.readFileSync(path.join(memosDir, s, "memo.md"), "utf-8");
			const t = c.match(/title:\s*"?([^"\n]+)"?/);
			const cost = c.match(/budget_used:\s*(\S+)/);
			return `${s} — ${t?.[1] ?? "Untitled"} (${cost?.[1] ?? "?"})`;
		});
		if (ctx.hasUI) {
			const choice = await ctx.ui.select("Past Deliberations", items);
			if (choice) { const sid = choice.split(" — ")[0]; pi.sendMessage({ customType: "swarm-memo", content: fs.readFileSync(path.join(memosDir, sid, "memo.md"), "utf-8"), display: true }); }
		} else {
			pi.sendMessage({ customType: "swarm-memo", content: items.join("\n"), display: true });
		}
	}

	async function handleView(id: string | undefined, ctx: any, pi: ExtensionAPI) {
		if (!id) { ctx.ui.notify("Usage: /swarm view <session-id>", "warning"); return; }
		const mp = path.join(dataDir, "memos", id.trim(), "memo.md");
		if (!fs.existsSync(mp)) { ctx.ui.notify(`No memo: ${id}`, "error"); return; }
		pi.sendMessage({ customType: "swarm-memo", content: fs.readFileSync(mp, "utf-8"), display: true });
	}
}
