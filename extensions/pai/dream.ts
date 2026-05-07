/**
 * PAI Dream — Periodic self-improvement through execution analysis.
 *
 * Part of the PAI Algorithm's learning loop:
 *   Classify → Execute → Measure → DREAM → Improve → Classify (better)
 *
 * Analyzes:
 * - Algorithm feedback data (tier accuracy, execution costs)
 * - Tool-use patterns (repeated workflows)
 * - Daily session logs (friction, corrections)
 * - Memory entries (accumulated knowledge)
 *
 * Produces actionable improvements:
 * - Skill crystallization (from repeated patterns)
 * - ISA updates (project-specific instructions)
 * - Algorithm tuning (fix misclassifications)
 * - Knowledge storage (fill gaps)
 *
 * Triggered via /dream or automatically after N sessions.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Paths ────────────────────────────────────────────────────────────────────

const MEMORY_DIR = join(homedir(), ".pi", "memory");
const CORTEX_DIR = join(MEMORY_DIR, "cortex");
const DAILY_DIR = join(MEMORY_DIR, "daily");
const DREAM_DIR = join(homedir(), ".pi", "dreams");
const PATTERNS_FILE = join(CORTEX_DIR, "patterns.json");
const FEEDBACK_FILE = join(homedir(), ".pai", "data", "algo-feedback.jsonl");
const DREAM_STATE_FILE = join(DREAM_DIR, "state.json");

// ── Types ────────────────────────────────────────────────────────────────────

interface DreamProposal {
	id: string;
	type: "skill" | "isa" | "algo-tune" | "knowledge" | "extension" | "config";
	title: string;
	description: string;
	evidence: string[];
	effort: "trivial" | "small" | "medium" | "large";
	priority: "high" | "medium" | "low";
	action?: string;
}

interface DreamReport {
	timestamp: string;
	sessionsSinceLast: number;
	dataGathered: {
		feedbackRecords: number;
		patternsAnalyzed: number;
		dailyLogsScanned: number;
		memoriesReviewed: number;
	};
	proposals: DreamProposal[];
	applied: string[]; // IDs of proposals that were auto-applied
}

interface DreamState {
	lastDreamTimestamp: string | null;
	sessionsCount: number;
	rejectedProposalIds: string[];
	appliedProposalIds: string[];
}

// ── State ────────────────────────────────────────────────────────────────────

let dreamState: DreamState = {
	lastDreamTimestamp: null,
	sessionsCount: 0,
	rejectedProposalIds: [],
	appliedProposalIds: [],
};

function loadDreamState(): void {
	if (existsSync(DREAM_STATE_FILE)) {
		try {
			dreamState = JSON.parse(readFileSync(DREAM_STATE_FILE, "utf-8"));
		} catch { /* fresh state */ }
	}
}

function saveDreamState(): void {
	if (!existsSync(DREAM_DIR)) mkdirSync(DREAM_DIR, { recursive: true });
	writeFileSync(DREAM_STATE_FILE, JSON.stringify(dreamState, null, 2));
}

// ── Data Gathering ───────────────────────────────────────────────────────────

async function gatherFeedback(): Promise<string> {
	if (!existsSync(FEEDBACK_FILE)) return "No algorithm feedback data yet.";

	try {
		const raw = await readFile(FEEDBACK_FILE, "utf-8");
		const lines = raw.trim().split("\n").filter(Boolean);
		if (lines.length === 0) return "No feedback records.";

		const records = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

		// Analyze tier accuracy
		let accurate = 0, underestimated = 0, overestimated = 0;
		const tierCosts: Record<string, { totalTokens: number; count: number }> = {};

		for (const r of records) {
			if (r.detectedTier === r.idealTier) accurate++;
			else if (tierNum(r.idealTier) > tierNum(r.detectedTier)) underestimated++;
			else overestimated++;

			if (!tierCosts[r.detectedTier]) tierCosts[r.detectedTier] = { totalTokens: 0, count: 0 };
			tierCosts[r.detectedTier].totalTokens += r.actualTokens || 0;
			tierCosts[r.detectedTier].count++;
		}

		let output = `## Algorithm Feedback (${records.length} executions)\n\n`;
		output += `Tier accuracy: ${Math.round(accurate / records.length * 100)}% | Under-estimated: ${underestimated} | Over-estimated: ${overestimated}\n\n`;
		output += "| Tier | Executions | Avg Tokens | Avg Turns | Avg Tools |\n|---|---|---|---|---|\n";

		for (const [tier, data] of Object.entries(tierCosts).sort()) {
			const avgTokens = Math.round(data.totalTokens / data.count);
			const tierRecords = records.filter((r: any) => r.detectedTier === tier);
			const avgTurns = Math.round(tierRecords.reduce((s: number, r: any) => s + r.actualTurns, 0) / data.count);
			const avgTools = Math.round(tierRecords.reduce((s: number, r: any) => s + r.actualTools, 0) / data.count);
			output += `| ${tier.toUpperCase()} | ${data.count} | ${avgTokens} | ${avgTurns} | ${avgTools} |\n`;
		}

		// Show misclassification examples
		const misclassified = records.filter((r: any) => r.detectedTier !== r.idealTier).slice(-5);
		if (misclassified.length > 0) {
			output += "\n### Recent Misclassifications\n";
			for (const r of misclassified) {
				output += `- Detected ${r.detectedTier} but needed ${r.idealTier} (${r.actualTurns} turns, ${r.actualTokens} tokens)\n`;
			}
		}

		return output;
	} catch {
		return "Failed to read feedback data.";
	}
}

async function gatherPatterns(): Promise<string> {
	if (!existsSync(PATTERNS_FILE)) return "No patterns recorded yet.";

	try {
		const raw = await readFile(PATTERNS_FILE, "utf-8");
		const data = JSON.parse(raw);
		const patterns = Object.entries(data.sequences || {})
			.sort(([_, a]: any, [__, b]: any) => b.count - a.count)
			.slice(0, 20);

		if (patterns.length === 0) return "No patterns recorded.";

		let output = `## Tool-Use Patterns (${data.sessionsAnalyzed} sessions)\n\n`;
		output += "| Count | Pattern | Example |\n|---|---|---|\n";
		for (const [sig, p] of patterns as [string, any][]) {
			output += `| ${p.count}x | ${sig} | ${p.examplePrompt?.slice(0, 50) || "?"} |\n`;
		}

		// Crystallization candidates (5+ occurrences)
		const candidates = patterns.filter(([_, p]: any) => p.count >= 5);
		if (candidates.length > 0) {
			output += `\n### Crystallization Candidates (${candidates.length} patterns with 5+ occurrences)\n`;
			for (const [sig, p] of candidates as [string, any][]) {
				output += `- **${sig}** (${p.count}x) — "${p.examplePrompt?.slice(0, 80)}"\n`;
			}
		}

		return output;
	} catch {
		return "Failed to read patterns.";
	}
}

async function gatherDailyLogs(days = 7): Promise<string> {
	if (!existsSync(DAILY_DIR)) return "";

	try {
		const files = (await readdir(DAILY_DIR))
			.filter((f) => f.endsWith(".md"))
			.sort()
			.slice(-days);

		if (files.length === 0) return "";

		let output = `## Recent Activity (${files.length} days)\n\n`;
		for (const f of files) {
			const content = await readFile(join(DAILY_DIR, f), "utf-8");
			output += `### ${f.replace(".md", "")}\n${content.slice(0, 1500)}\n\n`;
		}
		return output;
	} catch {
		return "";
	}
}

async function gatherMemory(): Promise<string> {
	const memFile = join(MEMORY_DIR, "MEMORY.md");
	if (!existsSync(memFile)) return "";

	try {
		const raw = await readFile(memFile, "utf-8");
		// Return the last 2000 chars (most recent entries)
		return `## Long-term Memory (excerpt)\n\n${raw.slice(-2000)}`;
	} catch {
		return "";
	}
}

// ── Analysis Prompt ──────────────────────────────────────────────────────────

function buildDreamPrompt(
	feedback: string,
	patterns: string,
	logs: string,
	memory: string,
	state: DreamState,
): string {
	const rejectedContext = state.rejectedProposalIds.length > 0
		? `\n\n## Previously Rejected (DO NOT re-propose)\nIDs: ${state.rejectedProposalIds.join(", ")}\n`
		: "";

	return `You are the self-improvement subsystem of a coding agent (pi). Your job is to analyze execution history and propose concrete improvements to make the agent better.

## Context
- Sessions since last dream: ${state.sessionsCount}
- Last dream: ${state.lastDreamTimestamp || "never"}
${rejectedContext}

${feedback}

${patterns}

${logs}

${memory}

## Analysis Required

Based on this data, identify improvements in these categories:

### 1. Algorithm Tuning (\`algo-tune\`)
- Are there systematic tier misclassifications?
- Should certain prompt patterns get higher/lower tiers?
- Are there task types where the algorithm adds overhead without benefit?

### 2. Skill Crystallization (\`skill\`)
- Which tool patterns (5+ occurrences) should become skills?
- What workflow would the skill shortcut?
- What would the skill's trigger and output be?

### 3. Project ISA Updates (\`isa\`)
- Are there project-specific rules the agent keeps learning the hard way?
- What instructions should be injected for specific working directories?

### 4. Knowledge Gaps (\`knowledge\`)
- What does the agent keep re-discovering?
- What should be permanently stored in memory?

### 5. Configuration/Extension Improvements (\`config\` or \`extension\`)
- Are there repetitive setup patterns that should be automated?
- Are tools being used in unexpected ways that suggest a new tool?

## Output Format

Respond with a JSON array of proposals. ONLY propose things with CLEAR evidence from the data above. Each proposal must cite specific patterns, metrics, or logs.

\`\`\`json
[
  {
    "type": "skill|isa|algo-tune|knowledge|extension|config",
    "title": "Short descriptive title",
    "description": "What this improves and why, based on the evidence",
    "evidence": ["Pattern X used 15 times", "Tier accuracy only 60% for multi-file tasks"],
    "effort": "trivial|small|medium|large",
    "priority": "high|medium|low",
    "action": "Concrete implementation: skill definition, ISA content, config change, etc."
  }
]
\`\`\`

Be specific and actionable. "Improve error handling" is bad. "Add ISA rule for ~/Developer/pi-mono: always run tsgo --noEmit after edits" is good.

Respond ONLY with the JSON array.`;
}

// ── Tier Helper ──────────────────────────────────────────────────────────────

function tierNum(tier: string): number {
	return parseInt(tier.replace("e", "")) || 0;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function incrementSessionCount(): void {
	dreamState.sessionsCount++;
	saveDreamState();
}

export function shouldAutoDream(): boolean {
	// Auto-dream every 20 sessions
	return dreamState.sessionsCount >= 20;
}

export function getLastReport(): DreamReport | null {
	const reportFile = join(DREAM_DIR, "latest.json");
	if (!existsSync(reportFile)) return null;
	try {
		return JSON.parse(readFileSync(reportFile, "utf-8"));
	} catch {
		return null;
	}
}

export function rejectProposal(id: string): void {
	if (!dreamState.rejectedProposalIds.includes(id)) {
		dreamState.rejectedProposalIds.push(id);
		saveDreamState();
	}
}

export function markApplied(id: string): void {
	if (!dreamState.appliedProposalIds.includes(id)) {
		dreamState.appliedProposalIds.push(id);
		saveDreamState();
	}
}

// ── Extension Registration ───────────────────────────────────────────────────

export function registerDream(pi: ExtensionAPI): void {
	loadDreamState();

	pi.registerCommand("dream", {
		description: "Analyze execution history and propose self-improvements",
		async handler(ctx) {
			ctx.ui.notify("[dream] Gathering execution data...", "info");

			const [feedback, patterns, logs, memory] = await Promise.all([
				gatherFeedback(),
				gatherPatterns(),
				gatherDailyLogs(7),
				gatherMemory(),
			]);

			const dataSize = feedback.length + patterns.length + logs.length + memory.length;
			ctx.ui.notify(
				`[dream] Gathered ${(dataSize / 1024).toFixed(1)}KB. Analyzing ${dreamState.sessionsCount} sessions since last dream...`,
				"info",
			);

			const prompt = buildDreamPrompt(feedback, patterns, logs, memory, dreamState);

			// Send analysis as a message — model responds with proposals
			ctx.sendMessage(
				{
					customType: "dream_analysis",
					content: [{ type: "text", text: prompt }],
					display: {
						label: "dream",
						text: `Analyzing ${dreamState.sessionsCount} sessions (${(dataSize / 1024).toFixed(1)}KB of execution data)...`,
					},
				},
				{ triggerTurn: true },
			);
		},
	});

	pi.registerCommand("dream-report", {
		description: "View latest dream analysis and proposals",
		async handler(ctx) {
			const report = getLastReport();
			if (!report) {
				ctx.ui.notify("[dream] No reports yet. Run /dream first.", "info");
				return;
			}

			const summary = report.proposals
				.map((p, i) => {
					const status = report.applied.includes(p.id) ? "✓" :
						dreamState.rejectedProposalIds.includes(p.id) ? "✗" : "○";
					return `${status} ${i + 1}. [${p.type}] **${p.title}** (${p.priority}, ${p.effort})\n   ${p.description.slice(0, 120)}`;
				})
				.join("\n");

			ctx.sendMessage(
				{
					customType: "dream_report",
					content: [{
						type: "text",
						text: `## Dream Report — ${report.timestamp.slice(0, 10)}\n\n` +
							`**Data:** ${report.dataGathered.feedbackRecords} feedback records, ` +
							`${report.dataGathered.patternsAnalyzed} patterns, ` +
							`${report.dataGathered.dailyLogsScanned} daily logs\n\n` +
							`**Sessions analyzed:** ${report.sessionsSinceLast}\n\n` +
							`### Proposals\n${summary}\n\n` +
							`_Legend: ○ pending, ✓ applied, ✗ rejected_`,
					}],
					display: {
						label: "dream",
						text: `${report.proposals.length} proposals (${report.applied.length} applied, ${report.timestamp.slice(0, 10)})`,
					},
				},
				{ triggerTurn: false },
			);
		},
	});

	// Parse model responses for dream proposals
	pi.on("message_end", async (event) => {
		const message = event.message;
		if (!message || message.role !== "assistant") return;

		const text = typeof message.content === "string"
			? message.content
			: Array.isArray(message.content)
				? message.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("")
				: "";

		// Detect dream proposal response (contains typed proposals)
		const jsonMatch = text.match(/\[\s*\{[\s\S]*"type"\s*:\s*"(skill|isa|algo-tune|knowledge|extension|config)"[\s\S]*\}\s*\]/);
		if (!jsonMatch) return;

		try {
			const proposals = JSON.parse(jsonMatch[0]) as DreamProposal[];
			if (!Array.isArray(proposals) || proposals.length === 0) return;

			// Filter out previously rejected proposals (by title similarity)
			const filtered = proposals.filter((p) => {
				const id = `dream-${p.type}-${p.title.toLowerCase().replace(/\s+/g, "-").slice(0, 30)}`;
				p.id = id;
				return !dreamState.rejectedProposalIds.includes(id);
			});

			// Save report
			if (!existsSync(DREAM_DIR)) await mkdir(DREAM_DIR, { recursive: true });
			const report: DreamReport = {
				timestamp: new Date().toISOString(),
				sessionsSinceLast: dreamState.sessionsCount,
				dataGathered: {
					feedbackRecords: existsSync(FEEDBACK_FILE)
						? (await readFile(FEEDBACK_FILE, "utf-8")).trim().split("\n").length
						: 0,
					patternsAnalyzed: existsSync(PATTERNS_FILE)
						? Object.keys(JSON.parse(await readFile(PATTERNS_FILE, "utf-8")).sequences || {}).length
						: 0,
					dailyLogsScanned: existsSync(DAILY_DIR)
						? (await readdir(DAILY_DIR)).filter((f) => f.endsWith(".md")).length
						: 0,
					memoriesReviewed: 0,
				},
				proposals: filtered,
				applied: [],
			};

			await writeFile(join(DREAM_DIR, "latest.json"), JSON.stringify(report, null, 2));
			await writeFile(
				join(DREAM_DIR, `${new Date().toISOString().slice(0, 10)}.json`),
				JSON.stringify(report, null, 2),
			);

			// Reset session counter
			dreamState.sessionsCount = 0;
			dreamState.lastDreamTimestamp = new Date().toISOString();
			saveDreamState();
		} catch {
			// Not a valid dream response — ignore
		}
	});

	// Track session count for auto-dream trigger
	pi.on("agent_end", async () => {
		dreamState.sessionsCount++;
		// Don't save on every session end — too frequent. Save every 5.
		if (dreamState.sessionsCount % 5 === 0) saveDreamState();
	});
}
