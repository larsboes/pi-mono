/**
 * PAI Session Learning — Capture learnings from completed agent sessions
 *
 * After each agent_end, analyzes what happened and records:
 * - What tools were used (patterns)
 * - Duration and complexity metrics
 * - Skills invoked
 * - Files modified
 *
 * Stored at ~/.pai/data/session-learnings.jsonl
 * Used by the algorithm to improve future tier detection and skill routing.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const DATA_DIR = join(homedir(), ".pai", "data");
const LEARNINGS_FILE = join(DATA_DIR, "session-learnings.jsonl");
const MAX_ENTRIES = 1000;

interface SessionLearning {
	ts: number;
	cwd: string;
	turns: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCost: number;
	durationMs: number;
	toolsUsed: Record<string, number>;  // tool name → count
	skillsRead: string[];               // skill paths that were read
	filesModified: string[];            // files written/edited
	model: string;
}

/**
 * Extract learnings from an agent_end event.
 */
function extractLearnings(messages: any[], startTime: number, cwd: string): SessionLearning {
	const toolsUsed: Record<string, number> = {};
	const skillsRead: string[] = [];
	const filesModified: string[] = [];
	let totalInput = 0;
	let totalOutput = 0;
	let totalCost = 0;
	let model = "";
	let turns = 0;

	for (const msg of messages) {
		if (msg.role === "assistant") {
			turns++;
			totalInput += msg.usage?.input || 0;
			totalOutput += msg.usage?.output || 0;
			totalCost += msg.usage?.cost?.total || 0;
			if (!model && msg.model) model = msg.model;

			// Check for tool calls in content
			if (Array.isArray(msg.content)) {
				for (const item of msg.content) {
					if (item.type === "tool_call" || item.type === "toolCall") {
						const name = item.toolName || item.name || "unknown";
						toolsUsed[name] = (toolsUsed[name] || 0) + 1;

						// Track files modified by write/edit
						if (name === "write" || name === "edit") {
							const path = item.input?.path || item.arguments?.path;
							if (path && !filesModified.includes(path)) {
								filesModified.push(path);
							}
						}

						// Track skills read
						if (name === "read") {
							const path = item.input?.path || item.arguments?.path || "";
							if (path.includes("SKILL.md")) {
								skillsRead.push(path);
							}
						}
					}
				}
			}
		}

		if (msg.role === "toolResult") {
			const name = msg.toolName || "unknown";
			toolsUsed[name] = (toolsUsed[name] || 0) + 1;
		}
	}

	return {
		ts: Date.now(),
		cwd,
		turns,
		totalInputTokens: totalInput,
		totalOutputTokens: totalOutput,
		totalCost,
		durationMs: Date.now() - startTime,
		toolsUsed,
		skillsRead,
		filesModified: filesModified.slice(0, 20), // Cap to prevent huge entries
		model,
	};
}

/**
 * Append a learning record. Trims file if over MAX_ENTRIES.
 */
function appendLearning(learning: SessionLearning) {
	try {
		mkdirSync(DATA_DIR, { recursive: true });
		appendFileSync(LEARNINGS_FILE, JSON.stringify(learning) + "\n");

		// Trim if too large
		if (existsSync(LEARNINGS_FILE)) {
			const lines = readFileSync(LEARNINGS_FILE, "utf-8").split("\n").filter(l => l.startsWith("{"));
			if (lines.length > MAX_ENTRIES) {
				writeFileSync(LEARNINGS_FILE, lines.slice(-MAX_ENTRIES).join("\n") + "\n");
			}
		}
	} catch {}
}

/**
 * Get summary stats from learning history.
 */
export function getLearningStats(): {
	totalSessions: number;
	avgTurns: number;
	avgCost: number;
	topTools: [string, number][];
	topSkills: [string, number][];
} | null {
	try {
		if (!existsSync(LEARNINGS_FILE)) return null;
		const lines = readFileSync(LEARNINGS_FILE, "utf-8").split("\n").filter(l => l.startsWith("{"));
		if (lines.length === 0) return null;

		const records: SessionLearning[] = lines.map(l => JSON.parse(l));
		const total = records.length;

		const avgTurns = records.reduce((s, r) => s + r.turns, 0) / total;
		const avgCost = records.reduce((s, r) => s + r.totalCost, 0) / total;

		// Aggregate tool usage
		const toolCounts: Record<string, number> = {};
		const skillCounts: Record<string, number> = {};

		for (const r of records) {
			for (const [tool, count] of Object.entries(r.toolsUsed)) {
				toolCounts[tool] = (toolCounts[tool] || 0) + count;
			}
			for (const skill of r.skillsRead) {
				const name = skill.split("/").filter(s => s !== "SKILL.md").pop() || skill;
				skillCounts[name] = (skillCounts[name] || 0) + 1;
			}
		}

		const topTools = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
		const topSkills = Object.entries(skillCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

		return { totalSessions: total, avgTurns, avgCost, topTools, topSkills };
	} catch {
		return null;
	}
}

/**
 * Register session learning capture.
 */
export function registerSessionLearning(pi: ExtensionAPI) {
	let sessionStartTime = Date.now();

	pi.on("session_start", async () => {
		sessionStartTime = Date.now();
	});

	pi.on("agent_end", async (event, ctx) => {
		const messages = event.messages || [];
		if (messages.length < 2) return; // Skip trivial interactions

		const learning = extractLearnings(messages, sessionStartTime, ctx.cwd);

		// Only record non-trivial sessions (at least 1 tool used)
		const totalTools = Object.values(learning.toolsUsed).reduce((s, n) => s + n, 0);
		if (totalTools > 0) {
			appendLearning(learning);
		}

		// Reset timer for next agent run
		sessionStartTime = Date.now();
	});

	// /learnings command
	pi.registerCommand("learnings", {
		description: "Show PAI session learning statistics",
		handler: async (_args, ctx) => {
			const stats = getLearningStats();
			if (!stats) {
				ctx.ui.notify("No session learnings yet. Use pi normally and data accumulates.", "info");
				return;
			}

			const toolsStr = stats.topTools.slice(0, 5).map(([t, n]) => `${t}:${n}`).join(", ");
			const skillsStr = stats.topSkills.slice(0, 5).map(([s, n]) => `${s}:${n}`).join(", ");

			ctx.ui.notify(
				`Sessions: ${stats.totalSessions} | Avg turns: ${stats.avgTurns.toFixed(1)} | Avg cost: $${stats.avgCost.toFixed(3)} | Top tools: ${toolsStr} | Top skills: ${skillsStr}`,
				"info"
			);
		},
	});
}
