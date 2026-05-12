import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readFile as readFileFn } from "node:fs/promises";
import { existsSync as existsFn } from "node:fs";
import { join as joinPath } from "node:path";
import { homedir as getHome } from "node:os";
import * as memory from "./src/memory.js";
import * as context from "./src/context.js";
import { classifyIntentFull } from "./src/intent.js";
import * as scratchpad from "./src/scratchpad.js";
import * as correction from "./src/correction.js";
import * as rules from "./src/rules.js";
import * as feedback from "./src/feedback.js";
import * as patterns from "./src/patterns.js";
import * as crystallizer from "./src/crystallizer.js";
import * as capabilities from "./src/capabilities.js";
import * as session from "./src/session.js";
import * as skillTracker from "./src/skill-tracker.js";
import * as selfExtension from "./src/self-extension.js";
import * as extensionCreator from "./src/extension-creator.js";
import { runCompaction } from "./src/compaction.js";
import { runGraphMaintenance } from "./src/graph-maintenance.js";
import { applyTokenBudget, type ContextSection } from "./src/token-budget.js";

/**
 * Cortex — Self-extending agent extension
 *
 * Phase 8: Retrieval quality — intent classification, entity graph,
 * hierarchical index, session context injection, and feedback loop.
 * Phase 9: Temporal intelligence, query expansion, multi-hop retrieval,
 * and weekly compaction.
 * Phase 10: Intelligence layer — sub-sequence pattern mining, token-budgeted
 * context injection, and graph maintenance (decay + pruning).
 */
export default function cortex(pi: ExtensionAPI) {
	// Capture reload function from command context (available in commands but not tools)
	let reloadFn: (() => Promise<void>) | null = null;

	// Abort context cached between agent_end and the next user input event.
	let lastAbortContext: import("./src/correction.js").AbortContext | null = null;

	// ── Lifecycle Hooks ──────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		const { hasKey, hasIndex } = await memory.init();
		const s = await memory.status();
		ctx.ui.notify(`[cortex] Memory initialized — embeddings: ${s.embeddingModel}, index: ${hasIndex ? "✓" : "✗"}`, "info");

		// Auto-reindex on first boot or if index is missing
		if (hasKey && !hasIndex) {
			ctx.ui.notify("[cortex] No vector index found — auto-reindexing...", "info");
			try {
				const result = await memory.reindex();
				ctx.ui.notify(`[cortex] Auto-reindexed ${result.totalChunks} chunks from ${result.files.length} files`, "info");
			} catch (e) {
				ctx.ui.notify(`[cortex] Auto-reindex failed: ${(e as Error).message}`, "error");
			}
		}

		// Initialize session tracking
		await session.initSession();

		// Phase 9.5: Weekly compaction (runs max once per day)
		try {
			const compaction = await runCompaction();
			if (compaction.weeksCompacted > 0) {
				console.log(`[cortex] Compacted ${compaction.weeksCompacted} week(s): ${compaction.newFiles.join(", ")}`);
			}
		} catch (e) {
			console.error(`[cortex] Weekly compaction failed (non-fatal): ${(e as Error).message}`);
		}

		// Phase 10.4: Graph maintenance (temporal decay + pruning, max once per day)
		try {
			const gm = await runGraphMaintenance();
			if (gm.ran) {
				console.log(`[cortex] Graph maintenance: ${gm.edgesPruned} edges pruned, ${gm.nodesPruned} nodes pruned, ${gm.decayApplied} decayed`);
			}
		} catch (e) {
			console.error(`[cortex] Graph maintenance failed (non-fatal): ${(e as Error).message}`);
		}
	});

	pi.on("before_agent_start", async (event, ctx) => {
		// Phase 7+8: Full context injection — hot context + semantic search + self-extension status
		try {
			// Phase 8.5: Get session context entities (recency-weighted)
			const contextEntities = session.getContextEntities();
			// Phase 8.2: Full intent classification with confidence + auto-granularity
			const intentResult = classifyIntentFull(event.prompt);
			const [semanticResults, hotCtx, extensionStatus] = await Promise.all([
				// Phase 8.1: rerank on by default for the top-3 injected memories.
				memory.search(event.prompt, 3, {
					intent: intentResult.intent,
					rerank: true,
					contextEntities: contextEntities.length > 0 ? contextEntities : undefined,
				}),
				context.loadHotContext(),
				selfExtension.buildStatus(),
			]);

			// Phase 8.6: log injection-time retrieval as an interaction signal.
			feedback.logInteraction(
				event.prompt,
				semanticResults.map((r) => r.source),
				ctx.sessionManager.getSessionId(),
				intentResult.intent,
			).catch(() => {});

			const hotBlock = context.formatHotContext(hotCtx);

			// Filter out low-relevance noise
			const relevant = semanticResults.filter((r) => r.score >= 0.4);
			let semanticBlock = "";
			if (relevant.length > 0) {
				const contextText = relevant
					.map((r) => `- [${r.source}] ${r.text.slice(0, 300)}`)
					.join("\n");
				semanticBlock = `\n\n## Relevant Past Context (retrieved)\n${contextText}`;
			}

			// Self-extension status (only surfaces when there's something actionable)
			const extensionBlock = selfExtension.formatStatus(extensionStatus);

			let correctionBlock = "";
			try {
				const block = await rules.buildInjectionBlock(ctx.cwd);
				if (block) correctionBlock = `\n\n${block}`;
			} catch (e) {
				console.error(`[cortex] Correction-rules injection failed: ${(e as Error).message}`);
			}

			if (!hotBlock && !semanticBlock && !extensionBlock && !correctionBlock) return {};

			return {
				systemPrompt: event.systemPrompt + (hotBlock || "") + semanticBlock + extensionBlock + correctionBlock,
			};
		} catch (e) {
			console.error(`[cortex] Context injection failed: ${(e as Error).message}`);
			return {};
		}
	});

	pi.on("agent_end", async (event, _ctx) => {
		// Record per-agent-loop usage, patterns, and skill loads.
		try {
			await capabilities.recordUsage(event.messages);
			const patternResult = await patterns.recordSession(event.messages);
			if (patternResult) {
				console.log(`[cortex] Turn pattern: ${patternResult.signature} (count: ${patternResult.count})`);
				if (patternResult.count === 3) {
					console.log(`[cortex] ⚡ Pattern "${patternResult.signature}" hit 3 occurrences — crystallization candidate`);
				}
			}

			// Track skill loads from read tool calls
			for (const msg of event.messages) {
				const m = msg as { role?: string; content?: unknown[] };
				if (m.role === "assistant" && Array.isArray(m.content)) {
					for (const block of m.content) {
						const b = block as { type?: string; name?: string; arguments?: Record<string, unknown>; input?: Record<string, unknown> };
						if (b.type === "toolCall" && b.name === "read") {
							const args = b.arguments ?? b.input ?? {};
							if (typeof args.path === "string") {
								const skillName = skillTracker.extractSkillName(args.path);
								if (skillName) {
									await skillTracker.recordSkillLoad(skillName);
									console.log(`[cortex] Skill loaded: ${skillName}`);
								}
							}
						}
					}
				}
			}

			// Extract activities for session tracking
			await session.extractFromMessages(event.messages);
			const sessionStats = await session.getStats();
			if (sessionStats) {
				console.log(
					`[cortex] Session stats: ${sessionStats.activityCount} activities, ${sessionStats.filesTouched} files, ${sessionStats.duration}m`,
				);
			}

			// Detect aborted turn for correction-learning. Cache for next input event to pair with user response.
			try {
				const abortCtx = correction.detectAbortedTurn(event.messages);
				if (abortCtx) {
					lastAbortContext = abortCtx;
				}
			} catch (e) {
				console.error(`[cortex] Abort detection failed: ${(e as Error).message}`);
			}
		} catch (e) {
			console.error(`[cortex] agent_end tracking failed: ${(e as Error).message}`);
		}
	});

	pi.on("turn_end", async (event, _ctx) => {
		// Fallback tracking path for modes where agent_end may not fire.
		try {
			const messages = (event as { messages?: unknown[] }).messages;
			if (Array.isArray(messages)) {
				await session.extractFromMessages(messages);
			}
		} catch (e) {
			console.error(`[cortex] turn_end tracking failed: ${(e as Error).message}`);
		}
	});

	pi.on("input", async (event, ctx) => {
		if (!lastAbortContext) return { action: "continue" };
		// "interactive" is the human-typed input source per InputSource = "interactive" | "rpc" | "extension".
		if (event.source !== "interactive") return { action: "continue" };
		try {
			const sessionId = ctx.sessionManager.getSessionId();
			const suggestion = correction.pairWithUserCorrection(
				lastAbortContext,
				event.text,
				ctx.cwd,
				sessionId,
			);
			if (suggestion) {
				await correction.appendSuggestion(suggestion);
				ctx.ui.notify(
					`[cortex] Save this lesson? Type /learn <rule> to remember it next session.`,
					"info",
				);
				if (lastAbortContext.referencedPaths.length > 0) {
					try {
						await feedback.recordCorrectionAsNegativeSignal(lastAbortContext.referencedPaths);
					} catch (e) {
						console.error(`[cortex] Negative-signal write failed: ${(e as Error).message}`);
					}
				}
			}
		} catch (e) {
			console.error(`[cortex] input pairing failed: ${(e as Error).message}`);
		} finally {
			lastAbortContext = null;
		}
		return { action: "continue" };
	});

	pi.on("session_before_switch", async (_event, ctx) => {
		// Flush session tracking before switching to new context
		try {
			const summary = await session.flushSession();
			if (summary) {
				console.log(`[cortex] Session flushed to daily log: ${summary.slice(0, 100)}...`);
				if (ctx.hasUI) ctx.ui.notify(`※ Recap: ${summary}`, "info");
			}
		} catch (e) {
			console.error(`[cortex] Session flush failed: ${(e as Error).message}`);
		}
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		// Flush session tracking on shutdown
		try {
			const summary = await session.flushSession();
			if (summary) {
				console.log(`[cortex] Session flushed to daily log: ${summary.slice(0, 100)}...`);
				if (ctx.hasUI) ctx.ui.notify(`※ Recap: ${summary}`, "info");
			} else {
				console.log(`[cortex] Session shutdown: nothing to flush`);
			}
		} catch (e) {
			console.error(`[cortex] Session flush failed: ${(e as Error).message}`);
		}
		lastAbortContext = null;
	});

	pi.on("resources_discover", async (_event, _ctx) => {
		// Skills in ~/.pi/skills/ are already auto-discovered by pi
		// This hook is here for future use — e.g. skills created in non-standard locations
		return {};
	});

	// Helper: capture reload ref from any command handler
	const captureReload = (ctx: { reload: () => Promise<void> }) => {
		if (!reloadFn) reloadFn = () => ctx.reload();
	};

	// Helper: emit command feedback in multiple UI channels (notify + footer + console)
	const emitCommandFeedback = (
		ctx: { ui: { notify: (m: string, t?: "info" | "warning" | "error") => void; setStatus: (k: string, v: string | undefined) => void } },
		message: string,
		type: "info" | "warning" | "error" = "info",
	) => {
		ctx.ui.notify(message, type);
		ctx.ui.setStatus("cortex", message.slice(0, 240));
		const logFn = type === "error" ? console.error : type === "warning" ? console.warn : console.log;
		logFn(`[cortex/cmd] ${message}`);
	};

	// ── LLM-Callable Tools ───────────────────────────────────────────

	pi.registerTool({
		name: "memory_search",
		label: "Memory Search",
		description:
			"Search long-term memory for relevant past context, learnings, and decisions. Uses semantic vector search (local embeddings) with keyword fallback. Optional cross-encoder reranking for higher precision.",
		parameters: Type.Object({
			query: Type.String({ description: "Search query — natural language or keywords" }),
			limit: Type.Optional(Type.Number({ description: "Max results (default: 5)", default: 5 })),
			rerank: Type.Optional(Type.Boolean({
				description: "Use local cross-encoder to rerank results for higher precision (slower but more accurate)",
				default: false,
			})),
			granularity: Type.Optional(Type.Union([
				Type.Literal("document"),
				Type.Literal("section"),
				Type.Literal("chunk"),
			], { description: "Filter by chunk granularity: document (full file), section (heading), chunk (paragraph)" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			try {
				const intentResult = classifyIntentFull(params.query);
				const contextEntities = session.getContextEntities();
				const results = await memory.search(params.query, params.limit ?? 5, {
					rerank: params.rerank ?? false,
					intent: intentResult.intent,
					granularity: params.granularity as "document" | "section" | "chunk" | undefined,
					contextEntities: contextEntities.length > 0 ? contextEntities : undefined,
				});
				if (results.length === 0) {
					return {
						content: [{ type: "text" as const, text: "No relevant memories found." }],
						details: {},
					};
				}
				const formatted = results
					.map(
						(r, i) => {
							const rerankInfo = r.rerankScore !== undefined
								? `, rerank: ${r.rerankScore.toFixed(2)}`
								: "";
							const granInfo = r.granularity ? `, ${r.granularity}` : "";
							return `${i + 1}. [${r.source}] (score: ${r.score.toFixed(2)}${rerankInfo}${granInfo}, ${r.method}, intent: ${intentResult.intent}/${intentResult.confidence.toFixed(2)})\n${r.text}`;
						},
					)
					.join("\n\n");
				return {
					content: [{ type: "text" as const, text: formatted }],
					details: { resultCount: results.length, intent: intentResult.intent, confidence: intentResult.confidence },
				};
			} catch (e) {
				return {
					content: [
						{ type: "text" as const, text: `Memory search error: ${(e as Error).message}` },
					],
					details: {},
				};
			}
		},
	});

	pi.registerTool({
		name: "memory_store",
		label: "Memory Store",
		description:
			"Store important information, decisions, or learnings in long-term memory. Stored text is embedded and indexed for future semantic search.",
		parameters: Type.Object({
			text: Type.String({ description: "Content to store" }),
			daily: Type.Optional(
				Type.Boolean({ description: "Store in today's daily log (default: false)", default: false }),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				const result = await memory.store(params.text, params.daily ?? false);
				return {
					content: [{ type: "text" as const, text: result }],
					details: {},
				};
			} catch (e) {
				return {
					content: [
						{ type: "text" as const, text: `Memory store error: ${(e as Error).message}` },
					],
					details: {},
				};
			}
		},
	});

	pi.registerTool({
		name: "crystallize_skill",
		label: "Crystallize Skill",
		description:
			"Create a new pi skill from a workflow pattern. Writes SKILL.md to ~/.pi/skills/<name>/ and auto-reloads to make it immediately available.",
		parameters: Type.Object({
			name: Type.String({ description: "Skill name (kebab-case, e.g. 'git-workflow')" }),
			description: Type.String({
				description: "Skill description — MUST start with 'Use when...'",
			}),
			workflow: Type.String({
				description:
					"Full workflow instructions in markdown. Include: overview, when to use, core steps, common mistakes, red flags.",
			}),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				const result = await crystallizer.crystallize({
					name: params.name,
					description: params.description,
					workflow: params.workflow,
				});

				const status = result.alreadyExisted ? "Updated" : "Created";

				// Build response with quality warnings
				let response = `${status} skill "${params.name}" at ${result.skillDir}\nFiles: ${result.files.join(", ")}`;

				if (result.qualityWarnings.length > 0) {
					response += `\n\n⚠ Quality warnings (${result.qualityWarnings.length}):`;
					for (const w of result.qualityWarnings) {
						response += `\n  ⚠ ${w}`;
					}
				}

				// Auto-reload if we have a captured reload reference
				let reloaded = false;
				if (reloadFn) {
					try {
						await reloadFn();
						reloaded = true;
					} catch (e) {
						console.error(`[cortex] Auto-reload failed: ${(e as Error).message}`);
					}
				}

				response += reloaded ? "\n✓ Auto-reloaded — skill is now available." : "\nRun /reload to make it available.";

				return {
					content: [{ type: "text" as const, text: response }],
					details: { qualityWarnings: result.qualityWarnings },
				};
			} catch (e) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Crystallization error: ${(e as Error).message}`,
						},
					],
					details: {},
				};
			}
		},
	});

	pi.registerTool({
		name: "capabilities_query",
		label: "Query Capabilities",
		description:
			"Query the agent's self-awareness inventory — what tools have been used, what skills are available, recent errors, and gaps. Aspects: tools, skills, errors/gaps, or overview (default).",
		parameters: Type.Object({
			aspect: Type.Optional(
				Type.String({
					description: "Aspect to query: tools, skills, errors, gaps, or overview (default)",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				const result = await capabilities.query(params.aspect);
				return {
					content: [{ type: "text" as const, text: result }],
					details: {},
				};
			} catch (e) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Capabilities query error: ${(e as Error).message}`,
						},
					],
					details: {},
				};
			}
		},
	});

	pi.registerTool({
		name: "scratchpad",
		label: "Scratchpad",
		description:
			"Manage working memory scratchpad: add items, mark as done, undo, list, or clear completed. Open items are auto-injected into context.",
		parameters: Type.Object({
			action: Type.String({
				description: "Action: add, done, undo, list, or clear_done",
			}),
			text: Type.Optional(Type.String({ description: "Text for add action" })),
			index: Type.Optional(Type.Number({ description: "Item index (1-based) for done/undo" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				let result: string;
				switch (params.action) {
					case "add":
						if (!params.text) throw new Error("Text required for add");
						result = await scratchpad.add(params.text);
						break;
					case "done":
						result = await scratchpad.done(params.index);
						break;
					case "undo":
						result = await scratchpad.undo(params.index);
						break;
					case "list":
						result = await scratchpad.list();
						break;
					case "clear_done":
						result = await scratchpad.clearDone();
						break;
					default:
						result = "Usage: scratchpad(action: 'add' | 'done' | 'undo' | 'list' | 'clear_done')";
				}
				return {
					content: [{ type: "text" as const, text: result }],
					details: {},
				};
			} catch (e) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Scratchpad error: ${(e as Error).message}`,
						},
					],
					details: {},
				};
			}
		},
	});

	// ── New Tools: Self-Extension Loop ───────────────────────────────

	pi.registerTool({
		name: "create_extension",
		label: "Create Extension",
		description:
			"Create a new pi extension from a template. Generates a TypeScript extension file in ~/.pi/agent/extensions/ with safety guardrails. Templates: tool, context-injector, command, event-logger. Auto-reloads after creation.",
		parameters: Type.Object({
			name: Type.String({ description: "Extension name (kebab-case, e.g. 'my-tool')" }),
			template: Type.String({
				description: "Template type: 'tool' (LLM-callable tool), 'context-injector' (system prompt injection), 'command' (/slash command), 'event-logger' (lifecycle event logging)",
			}),
			description: Type.String({ description: "What this extension does" }),
			config: Type.String({
				description: "JSON config for the template. Tool: {toolName, toolDescription, parameters: [{name, type, description, required?}], executeLogic}. Context-injector: {contextContent, condition?}. Command: {commandName, commandDescription, handlerLogic}. Event-logger: {events: [...], logTarget: 'console'|'file'|'notify'}",
			}),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				// Parse config JSON
				let config: unknown;
				try {
					config = JSON.parse(params.config);
				} catch {
					return {
						content: [{ type: "text" as const, text: "Error: config must be valid JSON" }],
						details: {},
					};
				}

				const result = await extensionCreator.createExtension({
					name: params.name,
					template: params.template as extensionCreator.ExtensionTemplate,
					description: params.description,
					config: config as any,
				});

				const status = result.alreadyExisted ? "Updated" : "Created";
				let response = `${status} extension "${params.name}" (${result.template}) at ${result.extensionPath}`;

				// Auto-reload
				let reloaded = false;
				if (reloadFn) {
					try {
						await reloadFn();
						reloaded = true;
					} catch (e) {
						console.error(`[cortex] Auto-reload failed: ${(e as Error).message}`);
					}
				}

				response += reloaded
					? "\n✓ Auto-reloaded — extension is now active."
					: "\nRun /reload to activate.";

				return {
					content: [{ type: "text" as const, text: response }],
					details: { template: result.template },
				};
			} catch (e) {
				return {
					content: [{ type: "text" as const, text: `Extension creation error: ${(e as Error).message}` }],
					details: {},
				};
			}
		},
	});

	pi.registerTool({
		name: "audit_skill",
		label: "Audit Skill",
		description:
			"Run quality audit on a skill. Validates name, description, structure, body size, and actionability. Returns score (0-100%) with specific improvement suggestions.",
		parameters: Type.Object({
			name: Type.String({ description: "Skill name to audit (must exist in ~/.pi/skills/)" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				const skillDir = joinPath(getHome(), ".pi", "skills", params.name);
				const skillMd = joinPath(skillDir, "SKILL.md");

				if (!existsFn(skillMd)) {
					return {
						content: [{ type: "text" as const, text: `Skill "${params.name}" not found at ${skillMd}` }],
						details: {},
					};
				}

				const content = await readFileFn(skillMd, "utf-8");

				// Parse frontmatter
				const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
				let description = "";
				let name = params.name;
				if (fmMatch) {
					const descMatch = fmMatch[1].match(/description:\s*["']?(.*?)["']?\s*$/m);
					if (descMatch) description = descMatch[1];
					const nameMatch = fmMatch[1].match(/name:\s*(\S+)/);
					if (nameMatch) name = nameMatch[1];
				}

				// Extract body (after frontmatter)
				const body = fmMatch ? content.slice(fmMatch[0].length).trim() : content;

				// Run quality validation
				const report = crystallizer.validateSkill({
					name,
					description,
					workflow: body,
				});

				// Check for references directory
				const refsDir = joinPath(skillDir, "references");
				const hasRefs = existsFn(refsDir);

				// Build audit response
				const lines: string[] = [];
				lines.push(`## Audit: ${params.name}`);
				lines.push(`**Score: ${report.score}%** ${report.score >= 80 ? "✅ Production-ready" : report.score >= 60 ? "⚠️ Needs work" : "❌ Rewrite recommended"}`);
				lines.push("");

				if (report.errors.length > 0) {
					lines.push("### Errors (blocking)");
					for (const e of report.errors) lines.push(`- ✗ ${e}`);
					lines.push("");
				}

				if (report.warnings.length > 0) {
					lines.push("### Warnings");
					for (const w of report.warnings) lines.push(`- ⚠ ${w}`);
					lines.push("");
				}

				const bodyLines = body.split("\n").length;
				const bodyWords = body.split(/\s+/).length;
				lines.push("### Stats");
				lines.push(`- Lines: ${bodyLines} ${bodyLines > 500 ? "(⚠ over limit)" : "✓"}`);
				lines.push(`- Words: ${bodyWords} ${bodyWords > 5000 ? "(⚠ over limit)" : "✓"}`);
				lines.push(`- References: ${hasRefs ? "✓" : "none"}`);
				lines.push(`- Description length: ${description.length} chars`);

				// Usage tracking
				const lastUsed = await skillTracker.getLastUsed(params.name);
				if (lastUsed) {
					const daysAgo = Math.floor((Date.now() - lastUsed.getTime()) / (24 * 60 * 60 * 1000));
					lines.push(`- Last loaded: ${daysAgo}d ago`);
				} else {
					lines.push(`- Last loaded: never tracked`);
				}

				return {
					content: [{ type: "text" as const, text: lines.join("\n") }],
					details: { score: report.score, errors: report.errors.length, warnings: report.warnings.length },
				};
			} catch (e) {
				return {
					content: [{ type: "text" as const, text: `Audit error: ${(e as Error).message}` }],
					details: {},
				};
			}
		},
	});

	// ── Slash Commands ───────────────────────────────────────────────

	pi.registerCommand("memory", {
		description: "Search or manage memory (search <query> | add <text> | reindex | status)",
		handler: async (args, ctx) => {
			captureReload(ctx);
			try {
				if (!args || args.trim() === "") {
					emitCommandFeedback(ctx, "/memory search <query> | add <text> | reindex | status", "info");
					return;
				}

				const parts = args.trim().split(/\s+/);
				const subcmd = parts[0];
				const rest = parts.slice(1).join(" ");

				if (subcmd === "search" && rest) {
					const useRerank = args?.includes("--rerank");
					const results = await memory.search(rest, 5, { rerank: useRerank });
					if (results.length === 0) {
						emitCommandFeedback(ctx, "No relevant memories found.", "info");
					} else {
						const text = results
							.map((r) => {
								const scoreInfo = r.rerankScore !== undefined
									? `vector:${r.score.toFixed(2)} rerank:${r.rerankScore.toFixed(2)}`
									: `${r.score.toFixed(2)}`;
								return `[${r.source}] (${scoreInfo}) ${r.text.slice(0, 100)}...`;
							})
							.join("\n");
						emitCommandFeedback(ctx, text, "info");
					}
				} else if (subcmd === "add" && rest) {
					const result = await memory.store(rest);
					emitCommandFeedback(ctx, result, "info");
				} else if (subcmd === "reindex") {
					emitCommandFeedback(ctx, "Reindexing memory...", "info");
					const result = await memory.reindex();
					emitCommandFeedback(
						ctx,
						`Reindexed ${result.totalChunks} chunks from ${result.files.length} files`,
						"info",
					);
				} else if (subcmd === "status") {
					const s = await memory.status();
					emitCommandFeedback(
						ctx,
						`Embeddings: ${s.embeddingModel} | Index: ${s.hasIndex ? "✓" : "✗"} | ${s.coreFiles} core, ${s.dailyFiles} daily`,
						"info",
					);
				} else {
					emitCommandFeedback(ctx, "/memory search <query> | add <text> | reindex | status", "info");
				}
			} catch (e) {
				emitCommandFeedback(ctx, `Memory command error: ${(e as Error).message}`, "error");
			}
		},
	});

	pi.registerCommand("crystallize", {
		description: "Create a skill from a workflow pattern (interactive)",
		handler: async (args, ctx) => {
			captureReload(ctx);
			if (!args || args.trim() === "") {
				ctx.ui.notify(
					"/crystallize <name> — interactive skill creation. Or let the LLM use crystallize_skill tool.",
					"info",
				);
				return;
			}

			const name = args.trim().split(/\s+/)[0];

			const description = await ctx.ui.input("Skill description (starts with 'Use when...'):");
			if (!description) return;

			const workflow = await ctx.ui.input("Core workflow (brief — you can edit SKILL.md after):");
			if (!workflow) return;

			try {
				const result = await crystallizer.crystallize({ name, description, workflow });
				ctx.ui.notify(
					`${result.alreadyExisted ? "Updated" : "Created"} skill "${name}" — ${result.files.length} files. Reloading...`,
					"info",
				);
				await ctx.reload();
				ctx.ui.notify(`Skill "${name}" is now available.`, "info");
			} catch (e) {
				ctx.ui.notify(`Error: ${(e as Error).message}`, "error");
			}
		},
	});

	pi.registerCommand("capabilities", {
		description: "Show capability inventory (tools, skills, errors)",
		handler: async (args, ctx) => {
			captureReload(ctx);
			const result = await capabilities.query(args?.trim() || undefined);
			ctx.ui.notify(result, "info");
		},
	});

	pi.registerCommand("scratchpad", {
		description: "Manage working memory scratchpad (add <text> | done [n] | undo [n] | list | clear)",
		handler: async (args, ctx) => {
			captureReload(ctx);
			try {
				if (!args || args.trim() === "") {
					const list = await scratchpad.list();
					emitCommandFeedback(ctx, list, "info");
					return;
				}

				const parts = args.trim().split(/\s+/);
				const subcmd = parts[0];
				const rest = parts.slice(1).join(" ");

				if (subcmd === "add" && rest) {
					const result = await scratchpad.add(rest);
					emitCommandFeedback(ctx, result, "info");
				} else if (subcmd === "done") {
					const idx = parts[1] ? parseInt(parts[1], 10) : undefined;
					const result = await scratchpad.done(idx);
					emitCommandFeedback(ctx, result, "info");
				} else if (subcmd === "undo") {
					const idx = parts[1] ? parseInt(parts[1], 10) : undefined;
					const result = await scratchpad.undo(idx);
					emitCommandFeedback(ctx, result, "info");
				} else if (subcmd === "list" || subcmd === "ls") {
					const result = await scratchpad.list();
					emitCommandFeedback(ctx, result, "info");
				} else if (subcmd === "clear" || subcmd === "clear_done") {
					const result = await scratchpad.clearDone();
					emitCommandFeedback(ctx, result, "info");
				} else {
					emitCommandFeedback(ctx, "/scratchpad add <text> | done [n] | undo [n] | list | clear", "info");
				}
			} catch (e) {
				emitCommandFeedback(ctx, `Scratchpad error: ${(e as Error).message}`, "error");
			}
		},
	});

	pi.registerCommand("patterns", {
		description: "Show detected workflow patterns and crystallization candidates",
		handler: async (_args, ctx) => {
			captureReload(ctx);
			const stats = await patterns.getStats();
			const candidates = await patterns.getCrystallizationCandidates();

			let text = `Sessions: ${stats.totalSessions} | Patterns: ${stats.totalPatterns} | Candidates: ${stats.crystallizationCandidates}`;

			if (stats.topPatterns.length > 0) {
				text += "\n\nTop patterns:";
				for (const p of stats.topPatterns) {
					text += `\n  ${p.signature} (×${p.count})`;
				}
			}

			if (candidates.length > 0) {
				text += "\n\n⚡ Ready to crystallize:";
				for (const c of candidates) {
					text += `\n  ${c.signature} (×${c.count}) — "${c.examplePrompt.slice(0, 60)}"`;
				}
			}

			ctx.ui.notify(text, "info");
		},
	});

	pi.registerCommand("learn", {
		description: "Save a correction-learning rule (use after the agent did the wrong thing)",
		handler: async (args, ctx) => {
			captureReload(ctx);
			try {
				const trimmed = (args ?? "").trim();
				if (trimmed === "") {
					emitCommandFeedback(
						ctx,
						"/learn <rule> | --global <rule> | list | forget <n> | forget --global <n>",
						"info",
					);
					return;
				}

				const parts = trimmed.split(/\s+/);
				const sub = parts[0];

				if (sub === "list") {
					const [globalRules, projectRules] = await Promise.all([
						rules.listRules("global", ctx.cwd),
						rules.listRules("project", ctx.cwd),
					]);
					const lines: string[] = [];
					if (globalRules.length > 0) {
						lines.push("Global rules:");
						for (const r of globalRules) lines.push(`  ${r.index}. ${r.text}`);
					}
					if (projectRules.length > 0) {
						if (lines.length > 0) lines.push("");
						lines.push("Project rules:");
						for (const r of projectRules) lines.push(`  ${r.index}. ${r.text}`);
					}
					emitCommandFeedback(ctx, lines.length > 0 ? lines.join("\n") : "(no rules saved)", "info");
					return;
				}

				if (sub === "forget") {
					let scope: rules.RuleScope = "project";
					let idxArg = parts[1];
					if (idxArg === "--global") {
						scope = "global";
						idxArg = parts[2];
					}
					const idx = idxArg ? parseInt(idxArg, 10) : NaN;
					if (!Number.isInteger(idx)) {
						emitCommandFeedback(ctx, "/learn forget <n> | forget --global <n>", "warning");
						return;
					}
					const removed = await rules.removeRule(idx, scope, ctx.cwd);
					if (!removed) {
						emitCommandFeedback(ctx, `No rule at index ${idx} in ${scope} scope`, "warning");
						return;
					}
					emitCommandFeedback(ctx, `Forgot ${scope} rule #${idx}: ${removed.text}`, "info");
					return;
				}

				let scope: rules.RuleScope = "project";
				let textParts = parts;
				if (parts[0] === "--global") {
					scope = "global";
					textParts = parts.slice(1);
				}
				const text = textParts.join(" ").trim();
				if (text.length === 0) {
					emitCommandFeedback(ctx, "/learn <rule text>", "warning");
					return;
				}
				await rules.addRule(text, scope, ctx.cwd);
				emitCommandFeedback(ctx, `Saved ${scope} rule: ${text}`, "info");
			} catch (e) {
				emitCommandFeedback(ctx, `Learn error: ${(e as Error).message}`, "error");
			}
		},
	});

	pi.registerCommand("sessionlog", {
		description: "Show current session-log stats or flush to daily log (status | flush)",
		handler: async (args, ctx) => {
			captureReload(ctx);
			try {
				const cmd = args?.trim().split(/\s+/)[0] || "status";

				if (cmd === "flush") {
					const summary = await session.flushSession();
					if (summary) {
						emitCommandFeedback(ctx, `Session flushed: ${summary}`, "info");
					} else {
						emitCommandFeedback(ctx, "No session to flush", "info");
					}
				} else {
					const stats = await session.getStats();
					if (stats) {
						emitCommandFeedback(
							ctx,
							`Session: ${stats.activityCount} activities | ${stats.filesTouched} files | ${stats.skillsUsed} skills | ${stats.toolsUsed} tools | ${stats.duration}m | density: ${stats.density.toFixed(1)}/min`,
							"info",
						);
					} else {
						emitCommandFeedback(ctx, "No active session", "info");
					}
				}
			} catch (e) {
				emitCommandFeedback(ctx, `Session command error: ${(e as Error).message}`, "error");
			}
		},
	});

	console.log("[cortex] Extension loaded — Phase 10 (sub-sequence mining + token budget + graph maintenance)");
}
