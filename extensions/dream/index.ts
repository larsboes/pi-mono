/**
 * dream — Autonomous self-improvement for pi.
 *
 * Scans recent sessions, daily logs, and patterns to identify:
 * - Repeated workflows → propose skills
 * - Friction points → propose fixes
 * - Missing capabilities → propose extensions
 * - Configuration improvements → propose config changes
 *
 * Triggered via `/dream` command. Presents proposals for review.
 *
 * The dream process:
 * 1. GATHER — Collect data from cortex (patterns, logs, memory)
 * 2. ANALYZE — Feed to model, identify improvement opportunities
 * 3. PROPOSE — Generate concrete proposals with evidence
 * 4. REVIEW — User accepts/rejects each proposal
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Paths ────────────────────────────────────────────────────────────────────

const MEMORY_DIR = join(homedir(), ".pi", "memory");
const CORTEX_DIR = join(MEMORY_DIR, "cortex");
const DAILY_DIR = join(MEMORY_DIR, "daily");
const DREAM_DIR = join(homedir(), ".pi", "dreams");
const PATTERNS_FILE = join(CORTEX_DIR, "patterns.json");

// ── Types ────────────────────────────────────────────────────────────────────

interface DreamProposal {
	id: string;
	type: "skill" | "extension" | "config" | "workflow" | "fix";
	title: string;
	description: string;
	evidence: string[];
	effort: "trivial" | "small" | "medium" | "large";
	priority: "high" | "medium" | "low";
	action?: string;
}

interface DreamReport {
	timestamp: string;
	dataGathered: {
		patternsAnalyzed: number;
		dailyLogsScanned: number;
		memoriesReviewed: number;
	};
	proposals: DreamProposal[];
}

// ── Data Gathering ───────────────────────────────────────────────────────────

async function gatherPatterns(): Promise<string> {
	if (!existsSync(PATTERNS_FILE)) return "No patterns recorded yet.";

	try {
		const raw = await readFile(PATTERNS_FILE, "utf-8");
		const data = JSON.parse(raw);
		const patterns = Object.entries(data.sequences || {})
			.sort(([_, a]: any, [__, b]: any) => b.count - a.count)
			.slice(0, 20);

		if (patterns.length === 0) return "No patterns recorded.";

		let output = `## Tool-Use Patterns (${data.sessionsAnalyzed} sessions analyzed)\n\n`;
		output += "| Count | Pattern | Example Prompt |\n|---|---|---|\n";
		for (const [sig, p] of patterns as [string, any][]) {
			output += `| ${p.count}x | ${sig} | ${p.examplePrompt?.slice(0, 60) || "?"} |\n`;
		}
		return output;
	} catch {
		return "Failed to read patterns.";
	}
}

async function gatherDailyLogs(days = 7): Promise<string> {
	if (!existsSync(DAILY_DIR)) return "No daily logs.";

	try {
		const files = (await readdir(DAILY_DIR))
			.filter((f) => f.endsWith(".md"))
			.sort()
			.slice(-days);

		if (files.length === 0) return "No recent daily logs.";

		let output = `## Recent Daily Logs (${files.length} days)\n\n`;
		for (const f of files) {
			const content = await readFile(join(DAILY_DIR, f), "utf-8");
			output += `### ${f.replace(".md", "")}\n${content.slice(0, 2000)}\n\n`;
		}
		return output;
	} catch {
		return "Failed to read daily logs.";
	}
}

async function gatherMemories(): Promise<string> {
	const memoryFile = join(MEMORY_DIR, "MEMORY.md");
	if (!existsSync(memoryFile)) return "No stored memories.";

	try {
		const raw = await readFile(memoryFile, "utf-8");
		const lines = raw.trim().split("\n").filter(Boolean);
		const recentContent = raw.slice(-3000);
		return `## Long-term Memory (${lines.length} lines, showing recent)\n\n${recentContent}`;
	} catch {
		return "Failed to read memories.";
	}
}

async function gatherEntityGraph(): Promise<string> {
	const graphFile = join(CORTEX_DIR, "graph.json");
	if (!existsSync(graphFile)) return "";

	try {
		const raw = await readFile(graphFile, "utf-8");
		const graph = JSON.parse(raw);
		const entities = Object.entries(graph.entities || {})
			.sort(([_, a]: any, [__, b]: any) => (b.weight || 0) - (a.weight || 0))
			.slice(0, 20);

		if (entities.length === 0) return "";

		let output = "## Top Entities (knowledge graph)\n\n";
		for (const [name, data] of entities as [string, any][]) {
			output += `- **${name}** (weight: ${data.weight?.toFixed(1) || "?"}, connections: ${Object.keys(data.edges || {}).length})\n`;
		}
		return output;
	} catch {
		return "";
	}
}

// ── Dream Analysis Prompt ────────────────────────────────────────────────────

function buildDreamPrompt(patterns: string, logs: string, memories: string, entities: string): string {
	return `You are analyzing an AI coding agent's usage history to identify self-improvement opportunities.

The agent (pi) is a terminal-based coding assistant with tools (read, edit, write, bash, outline, etc.), extensions, skills, and a memory system.

## Data Collected

${patterns}

${logs}

${memories}

${entities}

## Your Task

Analyze this data and identify concrete improvement proposals. Look for:

1. **Repeated Workflows** — Tool sequences used 5+ times that could become a dedicated skill or shortcut
2. **Friction Points** — Patterns suggesting the agent struggles (many retries, long sequences for simple tasks)
3. **Missing Capabilities** — Things frequently done via bash that should be tools
4. **Knowledge Gaps** — Topics the user keeps re-explaining that should be in memory
5. **Configuration Improvements** — Settings that could be optimized based on usage patterns

## Output Format

Respond with a JSON array of proposals:
\`\`\`json
[
  {
    "type": "skill|extension|config|workflow|fix",
    "title": "Short descriptive title",
    "description": "What this improvement does and why",
    "evidence": ["Pattern X used 15 times", "Daily log shows repeated file editing flow"],
    "effort": "trivial|small|medium|large",
    "priority": "high|medium|low",
    "action": "Concrete implementation suggestion or code snippet"
  }
]
\`\`\`

Only propose improvements that have CLEAR evidence from the data. Do not speculate or propose generic improvements. Each proposal must cite specific patterns, logs, or memories as evidence.

Respond ONLY with the JSON array, no other text.`;
}

// ── Extension Entry ──────────────────────────────────────────────────────────

export default function dream(pi: ExtensionAPI): void {
	pi.registerCommand("dream", {
		description: "Review recent sessions and propose self-improvements",
		async handler(_args, ctx) {
			ctx.notify("[dream] Gathering data from cortex...", "info");

			const [patterns, logs, memories, entities] = await Promise.all([
				gatherPatterns(),
				gatherDailyLogs(7),
				gatherMemories(),
				gatherEntityGraph(),
			]);

			const dataSize = patterns.length + logs.length + memories.length + entities.length;
			ctx.notify(`[dream] Gathered ${(dataSize / 1024).toFixed(1)}KB of context. Analyzing...`, "info");

			const prompt = buildDreamPrompt(patterns, logs, memories, entities);

			ctx.sendMessage(
				{
					customType: "dream_analysis",
					content: [{ type: "text", text: prompt }],
					display: {
						label: "dream",
						text: `Analyzing ${(dataSize / 1024).toFixed(1)}KB of usage data (patterns, logs, memories)...`,
					},
				},
				{ triggerTurn: true },
			);
		},
	});

	pi.registerCommand("dream-report", {
		description: "View the latest dream analysis report",
		async handler(_args, ctx) {
			const reportFile = join(DREAM_DIR, "latest.json");
			if (!existsSync(reportFile)) {
				ctx.notify("[dream] No dream reports yet. Run /dream first.", "info");
				return;
			}

			try {
				const raw = await readFile(reportFile, "utf-8");
				const report = JSON.parse(raw) as DreamReport;
				const summary = report.proposals
					.map((p, i) => `${i + 1}. [${p.type}] ${p.title} (${p.priority} priority, ${p.effort} effort)`)
					.join("\n");

				ctx.sendMessage(
					{
						customType: "dream_report",
						content: [{
							type: "text",
							text: `## Dream Report (${report.timestamp.slice(0, 10)})\n\n**Data:** ${report.dataGathered.patternsAnalyzed} patterns, ${report.dataGathered.dailyLogsScanned} daily logs, ${report.dataGathered.memoriesReviewed} memories\n\n**Proposals:**\n${summary}`,
						}],
						display: {
							label: "dream",
							text: `${report.proposals.length} proposals from ${report.timestamp.slice(0, 10)}`,
						},
					},
					{ triggerTurn: false },
				);
			} catch {
				ctx.notify("[dream] Failed to read dream report.", "error");
			}
		},
	});

	// After model responds to a dream analysis, save the report
	pi.on("message_end", async (event) => {
		const message = event.message;
		if (!message || message.role !== "assistant") return;

		const text = typeof message.content === "string"
			? message.content
			: Array.isArray(message.content)
				? message.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("")
				: "";

		const jsonMatch = text.match(/\[\s*\{[\s\S]*"type"\s*:\s*"(skill|extension|config|workflow|fix)"[\s\S]*\}\s*\]/);
		if (!jsonMatch) return;

		try {
			const proposals = JSON.parse(jsonMatch[0]) as DreamProposal[];
			if (!Array.isArray(proposals) || proposals.length === 0) return;

			if (!existsSync(DREAM_DIR)) await mkdir(DREAM_DIR, { recursive: true });
			const report: DreamReport = {
				timestamp: new Date().toISOString(),
				dataGathered: { patternsAnalyzed: 0, dailyLogsScanned: 0, memoriesReviewed: 0 },
				proposals: proposals.map((p, i) => ({ ...p, id: `dream-${Date.now()}-${i}` })),
			};
			const dateStr = new Date().toISOString().slice(0, 10);
			await Promise.all([
				writeFile(join(DREAM_DIR, "latest.json"), JSON.stringify(report, null, 2)),
				writeFile(join(DREAM_DIR, `${dateStr}.json`), JSON.stringify(report, null, 2)),
			]);
		} catch {
			// Not a dream response — ignore
		}
	});
}
