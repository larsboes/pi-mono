import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as memory from "./src/memory.js";
import * as context from "./src/context.js";
import * as scratchpad from "./src/scratchpad.js";
import * as patterns from "./src/patterns.js";
import * as crystallizer from "./src/crystallizer.js";
import * as capabilities from "./src/capabilities.js";
import * as session from "./src/session.js";

/**
 * Cortex — Self-extending agent extension
 *
 * Phase 6: Full Cortex — memory, context, patterns, crystallization, capabilities.
 * See PRD.md for the full build plan.
 */
export default function cortex(pi: ExtensionAPI) {
	// Capture reload function from command context (available in commands but not tools)
	let reloadFn: (() => Promise<void>) | null = null;

	// ── Lifecycle Hooks ──────────────────────────────────────────────

	pi.on("session_start", async (_event, _ctx) => {
		const { hasKey, hasIndex } = await memory.init();
		const s = await memory.status();
		console.log(`[cortex] Memory initialized — embeddings: ${s.embeddingModel}, index: ${hasIndex ? "✓" : "✗"}`);

		// Auto-reindex on first boot or if index is missing
		if (hasKey && !hasIndex) {
			console.log("[cortex] No vector index found — auto-reindexing...");
			try {
				const result = await memory.reindex();
				console.log(`[cortex] Auto-reindexed ${result.totalChunks} chunks from ${result.files.length} files`);
			} catch (e) {
				console.error(`[cortex] Auto-reindex failed: ${(e as Error).message}`);
			}
		}

		// Refresh skills inventory
		const skills = await capabilities.refreshSkills();
		console.log(`[cortex] Skills inventory: ${skills.length} skills`);

		// Initialize session tracking
		await session.initSession();
		console.log(`[cortex] Session tracking initialized`);
	});

	pi.on("before_agent_start", async (event, _ctx) => {
		// Phase 3: Full context injection — hot context (pi-mem style) + semantic search
		// This replaces memory-bootstrap.ts functionality (Phase 7 prep)
		try {
			const [semanticResults, hotCtx] = await Promise.all([
				memory.search(event.prompt, 3),
				context.loadHotContext(),
			]);

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

			if (!hotBlock && !semanticBlock) return {};

			return {
				systemPrompt: event.systemPrompt + (hotBlock || "") + semanticBlock,
			};
		} catch (e) {
			console.error(`[cortex] Context injection failed: ${(e as Error).message}`);
			return {};
		}
	});

	pi.on("agent_end", async (event, _ctx) => {
		// Record per-agent-loop usage and patterns.
		// This keeps signatures focused and avoids giant whole-session chains.
		try {
			await capabilities.recordUsage(event.messages);
			const patternResult = await patterns.recordSession(event.messages);
			if (patternResult) {
				console.log(`[cortex] Turn pattern: ${patternResult.signature} (count: ${patternResult.count})`);
				if (patternResult.count === 3) {
					console.log(`[cortex] ⚡ Pattern "${patternResult.signature}" hit 3 occurrences — crystallization candidate`);
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

	pi.on("session_before_switch", async (_event, _ctx) => {
		// Flush session tracking before switching to new context
		try {
			const summary = await session.flushSession();
			if (summary) {
				console.log(`[cortex] Session flushed to daily log: ${summary.slice(0, 100)}...`);
			}
		} catch (e) {
			console.error(`[cortex] Session flush failed: ${(e as Error).message}`);
		}
	});

	pi.on("session_shutdown", async (_event, _ctx) => {
		// Flush session tracking on shutdown
		try {
			const summary = await session.flushSession();
			if (summary) {
				console.log(`[cortex] Session flushed to daily log: ${summary.slice(0, 100)}...`);
			} else {
				console.log(`[cortex] Session shutdown: nothing to flush`);
			}
		} catch (e) {
			console.error(`[cortex] Session flush failed: ${(e as Error).message}`);
		}
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
			"Search long-term memory for relevant past context, learnings, and decisions. Uses semantic vector search (Gemini embeddings) with keyword fallback. Optional cross-encoder reranking for higher precision.",
		parameters: Type.Object({
			query: Type.String({ description: "Search query — natural language or keywords" }),
			limit: Type.Optional(Type.Number({ description: "Max results (default: 5)", default: 5 })),
			rerank: Type.Optional(Type.Boolean({
				description: "Use local cross-encoder to rerank results for higher precision (slower but more accurate)",
				default: false,
			})),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				const results = await memory.search(params.query, params.limit ?? 5, { rerank: params.rerank ?? false });
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
							return `${i + 1}. [${r.source}] (score: ${r.score.toFixed(2)}${rerankInfo}, ${r.method})\n${r.text}`;
						},
					)
					.join("\n\n");
				return {
					content: [{ type: "text" as const, text: formatted }],
					details: { resultCount: results.length },
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

				return {
					content: [
						{
							type: "text" as const,
							text: `${status} skill "${params.name}" at ${result.skillDir}\nFiles: ${result.files.join(", ")}${reloaded ? "\n✓ Auto-reloaded — skill is now available." : "\nRun /reload to make it available."}`,
						},
					],
					details: {},
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
							`Session: ${stats.activityCount} activities | ${stats.filesTouched} files | ${stats.skillsUsed} skills | ${stats.duration}m`,
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

	console.log("[cortex] Extension loaded — Phase 6+ (with auto-session-logging)");
}
