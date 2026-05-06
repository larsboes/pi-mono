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

// Phase 4: Keyword-based specialist auto-detection
const SPECIALIST_TRIGGERS: Record<string, string[]> = {
	"ciso": ["security", "vulnerability", "auth", "authentication", "encryption", "breach", "compliance", "pentest", "attack", "threat", "access control", "zero trust", "credentials", "secrets", "token"],
	"operations": ["deploy", "deployment", "infra", "infrastructure", "uptime", "SLA", "incident", "monitoring", "scale", "kubernetes", "docker", "CI/CD", "pipeline", "rollback", "observability", "on-call"],
	"legal": ["license", "GDPR", "privacy", "liability", "terms", "IP", "patent", "copyright", "open source", "compliance", "regulation", "data protection", "consent"],
	"growth": ["acquisition", "funnel", "viral", "marketing", "distribution", "SEO", "conversion", "retention", "churn", "CAC", "LTV", "growth loop", "onboarding"],
	"data-scientist": ["ML", "machine learning", "model", "metrics", "A/B test", "analytics", "prediction", "data pipeline", "experiment", "statistical", "dataset", "training"],
	"career-strategist": ["career", "job", "promotion", "interview", "personal", "resume", "salary", "negotiate", "quit", "opportunity", "employer", "freelance"],
	"academic": ["thesis", "research", "methodology", "paper", "study", "literature", "hypothesis", "peer review", "publication", "university", "bachelor", "master", "PhD", "dissertation"],
	"devrel": ["API design", "SDK", "developer experience", "documentation", "DX", "onboarding", "developer adoption", "API", "plugin", "extension", "integration"],
};

function detectSpecialistsFromBrief(briefText: string): string[] {
	const lower = briefText.toLowerCase();
	const scores: { slug: string; hits: number }[] = [];
	for (const [slug, keywords] of Object.entries(SPECIALIST_TRIGGERS)) {
		const hits = keywords.filter(kw => lower.includes(kw.toLowerCase())).length;
		if (hits >= 2) scores.push({ slug, hits }); // Need at least 2 keyword matches
	}
	return scores.sort((a, b) => b.hits - a.hits).map(s => s.slug);
}

const DEFAULT_BRIEF_TEMPLATE = "# [Your question]\n\n## Situation\n[Facts.]\n\n## Stakes\n[Upside and downside.]\n\n## Constraints\n[Limits.]\n\n## Key Question\n[The question.]";

async function selectBriefTemplate(ctx: any, extDir: string): Promise<string> {
	const templatesDir = path.join(extDir, ".pi", "swarm", "templates");
	if (!fs.existsSync(templatesDir) || !ctx.hasUI) return DEFAULT_BRIEF_TEMPLATE;

	const templates = fs.readdirSync(templatesDir).filter(f => f.endsWith(".md"));
	if (templates.length === 0) return DEFAULT_BRIEF_TEMPLATE;

	const items = ["Blank brief", ...templates.map(f => f.replace(".md", "").replace(/-/g, " "))];
	const choice = await ctx.ui.select("Brief template:", items);

	if (!choice || choice === "Blank brief") return DEFAULT_BRIEF_TEMPLATE;

	const fileName = choice.replace(/ /g, "-") + ".md";
	const filePath = path.join(templatesDir, fileName);
	if (fs.existsSync(filePath)) return fs.readFileSync(filePath, "utf-8");
	return DEFAULT_BRIEF_TEMPLATE;
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

	// ── Register top-level commands for discoverability ─────────

	pi.registerCommand("deliberate", {
		description: "Start a swarm deliberation (interactive board session)",
		handler: async (args: string, ctx) => {
			const withMatch = args.match(/--with\s+([\w,\-]+)/);
			const withSpecialists = withMatch ? withMatch[1].split(",").map(s => s.trim().toLowerCase()) : [];
			const tierMatch = args.match(/--tier\s+(quick|standard|high)/);
			const tier = tierMatch ? tierMatch[1] as "quick" | "standard" | "high" : undefined;
			return handleBegin(ctx, pi, withSpecialists, tier);
		},
	});

	pi.registerCommand("brief", {
		description: "Create a swarm brief file to edit externally",
		getArgumentCompletions: (_argumentPrefix: string) => {
			const templatesDir = path.join(extDir, ".pi", "swarm", "templates");
			if (!fs.existsSync(templatesDir)) return null;
			return fs.readdirSync(templatesDir)
				.filter(f => f.endsWith(".md"))
				.map(f => f.replace(".md", ""))
				.map(t => ({ value: t, label: t, description: "Brief template" }));
		},
		handler: async (args: string, ctx) => handleBrief(args.trim(), ctx),
	});

	pi.registerCommand("quick-debate", {
		description: "One-round parallel board debate on a topic",
		handler: async (args: string, ctx) => {
			const withMatch = args.match(/--with\s+([\w,\-]+)/);
			const withSpecialists = withMatch ? withMatch[1].split(",").map(s => s.trim().toLowerCase()) : [];
			const topic = args.replace(/--with\s+[\w,\-]+/, "").trim();
			return handleQuick(topic, ctx, pi, withSpecialists);
		},
	});

	pi.registerCommand("roster", {
		description: "Show swarm board members + available specialists",
		handler: async (_args: string, ctx) => handleRoster(ctx),
	});

	// ── Main /swarm command (umbrella + help) ───────────────────

	pi.registerCommand("swarm", {
		description: "Multi-agent orchestration — pipelines, deliberation, quick debate",
		handler: async (args: string, ctx) => {

			// Parse --with flag from args
			const withMatch = args.match(/--with\s+([\w,\-]+)/);
			const withSpecialists = withMatch ? withMatch[1].split(",").map(s => s.trim().toLowerCase()) : [];
			// Parse --tier flag
			const tierMatch = args.match(/--tier\s+(quick|standard|high)/);
			const tier = tierMatch ? tierMatch[1] as "quick" | "standard" | "high" : undefined;
			const cleanArgs = args.replace(/--with\s+[\w,\-]+/, "").replace(/--tier\s+\w+/, "").trim();
			const cleanParts = cleanArgs.split(/\s+/);
			const cleanSub = cleanParts[0] ?? "help";

			switch (cleanSub) {
				case "run": return handleRun(cleanParts.slice(1).join(" "), ctx);
				case "begin": return handleBegin(ctx, pi, withSpecialists, tier);
				case "stop": return handleStop(ctx);
				case "quick": return handleQuick(cleanParts.slice(1).join(" "), ctx, pi, withSpecialists);
				case "brief": return handleBrief(cleanParts.slice(1).join(" "), ctx);
				case "status": return handleStatus(cleanParts[1], ctx);
				case "list": return handleList(ctx, pi);
				case "view": return handleView(cleanParts[1], ctx, pi);
				case "roster": return handleRoster(ctx);
				default:
					ctx.ui.notify([
						"Swarm — multi-agent orchestration",
						"",
						"  /swarm run <file.yaml>     Run unattended pipeline",
						"  /swarm begin [--with x,y]  Start interactive deliberation",
						"         [--tier quick|standard|high]",
						"  /swarm stop                Abort deliberation",
						"  /swarm quick <topic>       One-round parallel debate",
						"  /swarm brief [template]    Create a brief to edit externally",
						"  /swarm roster              Show available board + specialists",
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
				expertiseDir: path.join(extDir, ".pi", "swarm", "expertise"),
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

			// Persist mental model updates to expertise files
			const expertiseDir = path.join(extDir, ".pi", "swarm", "expertise");
			fs.mkdirSync(expertiseDir, { recursive: true });
			for (const agent of activeAgents) {
				const agentEntries = dialogueTranscript.filter(t => t.from === agent.name);
				const mmUpdates: string[] = [];
				for (const entry of agentEntries) {
					const match = entry.content.match(/<mental_model_update>([\s\S]*?)<\/mental_model_update>/i);
					if (match?.[1]?.trim()) mmUpdates.push(match[1].trim());
				}
				if (mmUpdates.length > 0) {
					const slug = agent.name.toLowerCase().replace(/\s+/g, "-");
					const expertisePath = path.join(expertiseDir, `${slug}.md`);
					const date = new Date().toISOString().split("T")[0];
					const header = `\n\n## ${date} \u2014 \"${briefTitle}\" [session: ${sessionId}]\n\n`;
					const body = mmUpdates.join("\n");
					let existing = "";
					if (fs.existsSync(expertisePath)) existing = fs.readFileSync(expertisePath, "utf-8");
					else existing = `# ${agent.name} \u2014 Accumulated Expertise\n`;
					fs.writeFileSync(expertisePath, existing + header + body + "\n\n---\n", "utf-8");
				}
			}

			const duration = ((Date.now() - startTime) / 60_000).toFixed(1);
			return { content: [{ type: "text" as const, text: `Deliberation ended.\n\n**Session:** ${sessionId}\n**Duration:** ${duration} min\n**Total Cost:** $${cost.toFixed(2)}\n**Transcript:** ${files.transcriptPath}\n**Memo path:** ${files.memoPath}\n\nNow write the final memo to: ${files.memoPath}` }], details: { sessionId, duration, totalCost: cost, memoPath: files.memoPath } };
		},
	});

	// ── recruit_specialist tool (mid-session) ───────────────────

	pi.registerTool({
		name: "recruit_specialist",
		label: "Recruit Specialist",
		description: "Bring a domain specialist into the active deliberation mid-session. They will participate in subsequent converse() calls.",
		parameters: Type.Object({
			name: Type.String({ description: "Specialist slug (e.g. 'ciso', 'operations', 'legal'). Use /swarm roster to see available." }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!deliberationActive) throw new Error("No active deliberation. Run /swarm begin first.");

			const specialistsDir = path.join(extDir, ".pi", "swarm", "specialists");
			const slug = params.name.toLowerCase().replace(/\s+/g, "-");
			const filePath = path.join(specialistsDir, `${slug}.md`);

			if (!fs.existsSync(filePath)) {
				const available = fs.existsSync(specialistsDir)
					? fs.readdirSync(specialistsDir).filter(f => f.endsWith(".md")).map(f => f.replace(".md", "")).join(", ")
					: "(none)";
				throw new Error(`Specialist '${slug}' not found. Available: ${available}`);
			}

			// Check if already in the session
			const alreadyPresent = activeAgents.find(a => a.name.toLowerCase().replace(/\s+/g, "-") === slug);
			if (alreadyPresent) {
				return { content: [{ type: "text" as const, text: `${alreadyPresent.name} is already in this deliberation.` }], details: {} };
			}

			const persona = loadPersona(filePath, slug, "#ffffff");
			const skills = loadSkills([".pi/swarm/skills/mental-model.md", ".pi/swarm/skills/quantify.md"], extDir);
			const fullContext = skills ? `${persona.systemPrompt}\n\n---\n\n${skills}` : persona.systemPrompt;
			const newAgent: import("./src/schema.js").SwarmAgent = {
				name: persona.name,
				role: persona.name,
				task: "Respond to the CEO's brief and messages with your specialist analysis.",
				extraContext: fullContext,
				reportsTo: [], waitsFor: [],
				model: persona.model || undefined,
				dialogue: true, maxRounds: 3,
				color: persona.color,
			};

			activeAgents.push(newAgent);
			memberStats[persona.name] = { name: persona.name, color: persona.color, turns: 0, cost: 0, tokens: 0, status: "idle" };

			const theme = themeHelper(ctx);
			ctx.ui.setWidget("swarm", renderDeliberationWidget(memberStats, getElapsedMinutes(constraintState!), getTotalCost(constraintState!), theme), { placement: "belowEditor" });

			return { content: [{ type: "text" as const, text: `**${persona.name}** joined the deliberation.\n\n*${persona.description}*\n\nThey will respond to your next converse() call.` }], details: { recruited: persona.name } };
		},

		renderCall(args, theme) {
			return new Text(`${theme.fg("accent", theme.bold("recruit"))} → ${theme.fg("muted", args.name ?? "?")}`, 0, 0);
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

	async function handleRoster(ctx: any) {
		const agentsDir = path.join(extDir, ".pi", "swarm", "agents");
		const specialistsDir = path.join(extDir, ".pi", "swarm", "specialists");
		const lines: string[] = ["═══ SWARM ROSTER ═══", "", "CORE BOARD (always present):"];

		if (fs.existsSync(agentsDir)) {
			for (const file of fs.readdirSync(agentsDir).filter(f => f.endsWith(".md"))) {
				const persona = loadPersona(path.join(agentsDir, file), file.replace(".md", ""), "#ffffff");
				const role = file === "ceo.md" ? "(facilitator)" : "";
				lines.push(`  • ${persona.name} — ${persona.description} ${role}`);
			}
		}

		lines.push("", "SPECIALISTS (use --with <name,...>):");
		if (fs.existsSync(specialistsDir)) {
			for (const file of fs.readdirSync(specialistsDir).filter(f => f.endsWith(".md"))) {
				const persona = loadPersona(path.join(specialistsDir, file), file.replace(".md", ""), "#ffffff");
				const slug = file.replace(".md", "");
				lines.push(`  • ${slug} → ${persona.name} — ${persona.description}`);
			}
		} else {
			lines.push("  (no specialists directory found)");
		}

		lines.push("", "Usage: /swarm begin --with ciso,legal");
		lines.push("       /swarm quick \"topic\" --with operations,ciso");
		ctx.ui.notify(lines.join("\n"));
	}

	async function handleBegin(ctx: any, pi: ExtensionAPI, withSpecialists: string[] = [], tier?: "quick" | "standard" | "high") {
		if (deliberationActive) { ctx.ui.notify("Deliberation active. /swarm stop to abort.", "warning"); return; }

		// Look for a swarm config or use defaults
		const configPath = path.join(extDir, "config.yaml");
		let agentsDir = path.join(extDir, ".pi", "swarm", "agents");
		let outputDirBase = path.join(extDir, ".pi", "swarm");
		let briefsDir = path.join(extDir, ".pi", "swarm", "briefs");
		let requiredSections = ["situation", "stakes", "constraints", "key question"];
		let maxTimeMins = 5;
		let maxBudget = 5;
		let modelOverride: string | undefined;

		// Try to load config.yaml
		let boardConfig: any[] = [];
		if (fs.existsSync(configPath)) {
			try {
				const jsyaml = await import("js-yaml");
				const cfg = jsyaml.load(fs.readFileSync(configPath, "utf-8")) as any;
				if (cfg?.paths?.agents) agentsDir = path.join(extDir, cfg.paths.agents);
				if (cfg?.paths?.briefs) briefsDir = path.join(extDir, cfg.paths.briefs);
				if (cfg?.meeting?.brief_required_sections) requiredSections = cfg.meeting.brief_required_sections;
				if (cfg?.paths?.memos || cfg?.paths?.deliberations) outputDirBase = path.join(extDir, cfg.paths?.memos ? path.dirname(cfg.paths.memos) : ".");
				if (cfg?.board) boardConfig = cfg.board;

				// Apply tier settings
				const tierConfig = tier && cfg?.meeting?.tiers?.[tier];
				if (tierConfig) {
					if (tierConfig.max_time_minutes) maxTimeMins = tierConfig.max_time_minutes;
					if (tierConfig.max_budget) maxBudget = typeof tierConfig.max_budget === "string" ? parseFloat(tierConfig.max_budget.replace("$", "")) : tierConfig.max_budget;
					if (tierConfig.model_override) modelOverride = tierConfig.model_override;
				} else {
					if (cfg?.meeting?.constraints?.max_time_minutes) maxTimeMins = cfg.meeting.constraints.max_time_minutes;
					if (cfg?.meeting?.constraints?.max_budget) maxBudget = typeof cfg.meeting.constraints.max_budget === "string" ? parseFloat(cfg.meeting.constraints.max_budget.replace("$", "")) : cfg.meeting.constraints.max_budget;
				}
			} catch { /* use defaults */ }
		}

		// Load agent personas from agents dir (core board)
		const agents: import("./src/schema.js").SwarmAgent[] = [];
		if (fs.existsSync(agentsDir)) {
			for (const file of fs.readdirSync(agentsDir).filter(f => f.endsWith(".md") && f !== "ceo.md")) {
				const persona = loadPersona(path.join(agentsDir, file), file.replace(".md", ""), "#ffffff");
				// Find matching board config entry for skills
				const boardEntry = boardConfig.find((b: any) => b.name === persona.name || b.path?.includes(file));
				const skills = boardEntry?.skills ? loadSkills(boardEntry.skills, extDir) : "";
				const fullContext = skills ? `${persona.systemPrompt}\n\n---\n\n${skills}` : persona.systemPrompt;
				agents.push({
					name: persona.name,
					role: persona.name,
					task: "Respond to the CEO's brief and messages with your expert analysis.",
					extraContext: fullContext,
					reportsTo: [], waitsFor: [],
					model: persona.model || undefined,
					dialogue: true, maxRounds: 3,
					color: persona.color,
				});
			}
		}

		// Load specialists if --with was specified
		const specialistsDir = path.join(extDir, ".pi", "swarm", "specialists");
		const defaultSpecialistSkills = [".pi/swarm/skills/mental-model.md", ".pi/swarm/skills/quantify.md"];
		if (withSpecialists.length > 0 && fs.existsSync(specialistsDir)) {
			for (const slug of withSpecialists) {
				const filePath = path.join(specialistsDir, `${slug}.md`);
				if (fs.existsSync(filePath)) {
					const persona = loadPersona(filePath, slug, "#ffffff");
					const skills = loadSkills(defaultSpecialistSkills, extDir);
					const fullContext = skills ? `${persona.systemPrompt}\n\n---\n\n${skills}` : persona.systemPrompt;
					agents.push({
						name: persona.name,
						role: persona.name,
						task: "Respond to the CEO's brief and messages with your specialist analysis.",
						extraContext: fullContext,
						reportsTo: [], waitsFor: [],
						model: persona.model || undefined,
						dialogue: true, maxRounds: 3,
						color: persona.color,
					});
				} else {
					ctx.ui.notify(`Specialist not found: ${slug} (available: ${fs.readdirSync(specialistsDir).map(f => f.replace(".md", "")).join(", ")})`, "warning");
				}
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
				const template = await selectBriefTemplate(ctx, extDir);
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
			const template = await selectBriefTemplate(ctx, extDir);
			const edited = await ctx.ui.editor("Write Brief", template);
			if (!edited) { ctx.ui.notify("Cancelled.", "warning"); return; }
			const { title } = parseBrief(edited);
			selectedBriefDir = saveBrief(briefsDir, title, edited);
		}

		const brief = loadBrief(selectedBriefDir);
		const missing = validateBrief(brief.raw, requiredSections);
		if (missing.length > 0) { ctx.ui.notify(`Brief missing: ${missing.join(", ")}`, "error"); return; }

		// Phase 4: Auto-detect specialists from brief content if none specified
		if (withSpecialists.length === 0 && fs.existsSync(specialistsDir)) {
			const detected = detectSpecialistsFromBrief(brief.raw);
			if (detected.length > 0) {
				const suggestions = detected.slice(0, 3); // max 3 auto-detected
				if (ctx.hasUI) {
					const confirm = await ctx.ui.select(
						`Detected relevant specialists: ${suggestions.join(", ")}. Add them?`,
						["Yes, add suggested specialists", "No, core board only", "Let me pick..."]
					);
					if (confirm === "Yes, add suggested specialists") {
						for (const slug of suggestions) {
							const filePath = path.join(specialistsDir, `${slug}.md`);
							if (fs.existsSync(filePath)) {
								const persona = loadPersona(filePath, slug, "#ffffff");
								const skills = loadSkills(defaultSpecialistSkills, extDir);
								const fullCtx = skills ? `${persona.systemPrompt}\n\n---\n\n${skills}` : persona.systemPrompt;
								agents.push({
									name: persona.name, role: persona.name,
									task: "Respond to the CEO's brief and messages with your specialist analysis.",
									extraContext: fullCtx,
									reportsTo: [], waitsFor: [],
									model: persona.model || undefined,
									dialogue: true, maxRounds: 3,
									color: persona.color,
								});
							}
						}
					} else if (confirm === "Let me pick...") {
						const allSpecialists = fs.readdirSync(specialistsDir).filter(f => f.endsWith(".md")).map(f => f.replace(".md", ""));
						for (const slug of allSpecialists) {
							const persona = loadPersona(path.join(specialistsDir, `${slug}.md`), slug, "#ffffff");
							const pick = await ctx.ui.select(`Add ${persona.name}?`, ["Yes", "No"]);
							if (pick === "Yes") {
								const skills = loadSkills(defaultSpecialistSkills, extDir);
								const fullCtx = skills ? `${persona.systemPrompt}\n\n---\n\n${skills}` : persona.systemPrompt;
								agents.push({
									name: persona.name, role: persona.name,
									task: "Respond to the CEO's brief and messages with your specialist analysis.",
									extraContext: fullCtx,
									reportsTo: [], waitsFor: [],
									model: persona.model || undefined,
									dialogue: true, maxRounds: 3,
									color: persona.color,
								});
							}
						}
					}
				}
			}
		}

		// Build CEO system prompt
		const ceoPath = path.join(agentsDir, "ceo.md");
		const ceoPersona = loadPersona(ceoPath, "CEO", "#7dcfff");
		ceoSystemPrompt = ceoPersona.systemPrompt;
		const boardNames = agents.map(a => a.name).join(", ");
		const tierLabel = tier ? ` [${tier.toUpperCase()} tier]` : "";
		ceoSystemPrompt += `\n\n## Runtime Context\n\n**Board Members:** ${boardNames}\n**Time:** ${maxTimeMins} min\n**Budget:** $${maxBudget}${tierLabel}\n`;

		// Apply model override from tier (e.g., high tier forces opus for all)
		if (modelOverride) {
			for (const agent of agents) agent.model = modelOverride;
		}

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

	async function handleQuick(topic: string, ctx: any, pi: ExtensionAPI, withSpecialists: string[] = []) {
		if (!topic) { ctx.ui.notify("Usage: /swarm quick <topic> [--with specialist,...]", "warning"); return; }

		const agentsDir = path.join(extDir, ".pi", "swarm", "agents");
		const specialistsDir = path.join(extDir, ".pi", "swarm", "specialists");
		const agents: import("./src/schema.js").SwarmAgent[] = [];
		if (fs.existsSync(agentsDir)) {
			for (const file of fs.readdirSync(agentsDir).filter(f => f.endsWith(".md") && f !== "ceo.md")) {
				const persona = loadPersona(path.join(agentsDir, file), file.replace(".md", ""), "#ffffff");
				agents.push({ name: persona.name, role: persona.name, task: topic, extraContext: persona.systemPrompt, reportsTo: [], waitsFor: [], dialogue: false, maxRounds: 1, color: persona.color });
			}
		}
		// Load specialists
		if (withSpecialists.length > 0 && fs.existsSync(specialistsDir)) {
			for (const slug of withSpecialists) {
				const filePath = path.join(specialistsDir, `${slug}.md`);
				if (fs.existsSync(filePath)) {
					const persona = loadPersona(filePath, slug, "#ffffff");
					agents.push({ name: persona.name, role: persona.name, task: topic, extraContext: persona.systemPrompt, reportsTo: [], waitsFor: [], dialogue: false, maxRounds: 1, color: persona.color });
				}
			}
		}
		if (agents.length === 0) { ctx.ui.notify(`No agents in ${agentsDir}`, "error"); return; }

		ctx.ui.setStatus("swarm", "⏳ Board perspectives...");

		try {
			const result = await quickRound(topic, agents, undefined, { piCtx: ctx }, ctx.signal, path.join(extDir, ".pi", "swarm", "expertise"));
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

	async function handleBrief(templateArg: string, ctx: any) {
		const briefsDir = path.join(extDir, ".pi", "swarm", "briefs");
		const templatesDir = path.join(extDir, ".pi", "swarm", "templates");

		// Determine which template to use
		let template = DEFAULT_BRIEF_TEMPLATE;
		let templateName = "blank";

		if (templateArg) {
			// Direct template name provided — try to match a template file
			const slug = templateArg.toLowerCase().replace(/\s+/g, "-");
			const filePath = path.join(templatesDir, `${slug}.md`);
			if (fs.existsSync(filePath)) {
				template = fs.readFileSync(filePath, "utf-8");
				templateName = slug;
			} else {
				const available = fs.existsSync(templatesDir)
					? fs.readdirSync(templatesDir).filter(f => f.endsWith(".md")).map(f => f.replace(".md", "")).join(", ")
					: "(none)";
				ctx.ui.notify(`Template '${slug}' not found.\nAvailable: ${available}`, "warning");
				return;
			}
		}
		// No arg = blank brief (skip interactive picker — it blocks in some contexts)

		// Create the brief directory + file
		const date = new Date().toISOString().split("T")[0];
		const slug = templateName === "blank" ? "new" : templateName;
		// Avoid collisions by appending a short random suffix
		const suffix = Math.random().toString(36).slice(2, 6);
		const dirName = `${date}-${slug}-${suffix}`;
		const briefDir = path.join(briefsDir, dirName);
		fs.mkdirSync(briefDir, { recursive: true });

		const briefPath = path.join(briefDir, "brief.md");
		fs.writeFileSync(briefPath, template, "utf-8");

		// List available templates for reference
		const availableTemplates = fs.existsSync(templatesDir)
			? fs.readdirSync(templatesDir).filter(f => f.endsWith(".md")).map(f => f.replace(".md", ""))
			: [];

		const lines = [
			`✓ Brief created:`,
			`  ${briefPath}`,
			"",
			`Template: ${templateName}`,
			"",
			"Edit the file, then run /swarm begin to deliberate.",
		];
		if (availableTemplates.length > 0 && !templateArg) {
			lines.push("", `Tip: /swarm brief <template> for a pre-filled brief:`);
			lines.push(`  ${availableTemplates.join(", ")}`);
		}
		ctx.ui.notify(lines.join("\n"));
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
