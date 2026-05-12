/**
 * Phase 9.5: Weekly Compaction
 *
 * Synthesizes daily logs into weekly summaries for long-term memory management.
 * Prevents unbounded growth of the vector index while preserving key information.
 *
 * Strategy:
 * - Daily logs older than 14 days get compacted into weekly summaries
 * - Weekly summaries preserve: projects worked on, key decisions, tools/skills used
 * - Original daily files are NOT deleted (just not re-indexed)
 * - Weekly summaries are stored in ~/.pi/memory/weekly/
 * - Compaction runs at session start (max once per day)
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Paths ──────────────────────────────────────────────────────────────────

const MEMORY_DIR = join(homedir(), ".pi", "memory");
const DAILY_DIR = join(MEMORY_DIR, "daily");
const WEEKLY_DIR = join(MEMORY_DIR, "weekly");
const COMPACTION_STATE_FILE = join(MEMORY_DIR, "cortex", "compaction-state.json");

// ── Types ──────────────────────────────────────────────────────────────────

interface CompactionState {
	lastRun: string;
	weeksCompacted: string[];
}

interface DailyEntry {
	date: string;
	content: string;
}

interface WeeklySummary {
	weekStart: string;
	weekEnd: string;
	days: number;
	projects: string[];
	totalActivities: { reads: number; edits: number; writes: number; commands: number; tools: number };
	topFiles: string[];
	sessionCount: number;
	totalMinutes: number;
}

// ── State ──────────────────────────────────────────────────────────────────

async function loadState(): Promise<CompactionState> {
	if (!existsSync(COMPACTION_STATE_FILE)) {
		return { lastRun: "", weeksCompacted: [] };
	}
	try {
		return JSON.parse(await readFile(COMPACTION_STATE_FILE, "utf-8"));
	} catch {
		return { lastRun: "", weeksCompacted: [] };
	}
}

async function saveState(state: CompactionState): Promise<void> {
	await writeFile(COMPACTION_STATE_FILE, JSON.stringify(state, null, 2));
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getWeekId(date: string): string {
	// Week ID = ISO week start (Monday) date
	const d = new Date(date + "T00:00:00");
	const day = d.getDay();
	const diff = day === 0 ? 6 : day - 1;
	d.setDate(d.getDate() - diff);
	return d.toISOString().slice(0, 10);
}

function parseSessionLine(line: string): {
	duration: number;
	reads: number;
	edits: number;
	writes: number;
	commands: number;
	tools: number;
	files: string[];
} | null {
	const durationMatch = line.match(/\((\d+)m\)/);
	const duration = durationMatch ? parseInt(durationMatch[1], 10) : 0;

	const reads = parseInt(line.match(/(\d+) reads?/)?.[1] || "0", 10);
	const edits = parseInt(line.match(/(\d+) edits?/)?.[1] || "0", 10);
	const writes = parseInt(line.match(/(\d+) writes?/)?.[1] || "0", 10);
	const commands = parseInt(line.match(/(\d+) commands?/)?.[1] || "0", 10);
	const tools = parseInt(line.match(/(\d+) tools?/)?.[1] || "0", 10);

	const filesMatch = line.match(/Files:\s*(.+?)(?:\.\.\.|$)/);
	const files = filesMatch
		? filesMatch[1].split(",").map((f) => f.trim()).filter(Boolean)
		: [];

	return { duration, reads, edits, writes, commands, tools, files };
}

function synthesizeWeek(entries: DailyEntry[]): WeeklySummary {
	const dates = entries.map((e) => e.date).sort();
	const weekStart = dates[0];
	const weekEnd = dates[dates.length - 1];

	const totals = { reads: 0, edits: 0, writes: 0, commands: 0, tools: 0 };
	const allFiles: string[] = [];
	let sessionCount = 0;
	let totalMinutes = 0;

	for (const entry of entries) {
		const lines = entry.content.split("\n");
		for (const line of lines) {
			if (line.includes("Session:") && line.includes("Activity:")) {
				sessionCount++;
				const parsed = parseSessionLine(line);
				if (parsed) {
					totals.reads += parsed.reads;
					totals.edits += parsed.edits;
					totals.writes += parsed.writes;
					totals.commands += parsed.commands;
					totals.tools += parsed.tools;
					totalMinutes += parsed.duration;
					allFiles.push(...parsed.files);
				}
			}
		}
	}

	// Top files by frequency
	const fileCounts = new Map<string, number>();
	for (const f of allFiles) {
		fileCounts.set(f, (fileCounts.get(f) || 0) + 1);
	}
	const topFiles = Array.from(fileCounts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)
		.map(([f]) => f);

	// Extract project directories (from file paths)
	const projects = [...new Set(
		allFiles
			.filter((f) => f.includes("/"))
			.map((f) => f.split("/")[0])
			.filter(Boolean)
	)].slice(0, 8);

	return {
		weekStart,
		weekEnd,
		days: entries.length,
		projects,
		totalActivities: totals,
		topFiles,
		sessionCount,
		totalMinutes,
	};
}

function formatWeeklySummary(summary: WeeklySummary): string {
	const lines: string[] = [];
	lines.push(`# Week ${summary.weekStart} → ${summary.weekEnd}`);
	lines.push("");
	lines.push(`**${summary.days} active days | ${summary.sessionCount} sessions | ${summary.totalMinutes}m total**`);
	lines.push("");

	if (summary.projects.length > 0) {
		lines.push(`## Projects: ${summary.projects.join(", ")}`);
		lines.push("");
	}

	const a = summary.totalActivities;
	lines.push(`## Activity: ${a.reads} reads, ${a.edits} edits, ${a.writes} writes, ${a.commands} commands, ${a.tools} tools`);
	lines.push("");

	if (summary.topFiles.length > 0) {
		lines.push(`## Top Files: ${summary.topFiles.join(", ")}`);
	}

	return lines.join("\n");
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Run weekly compaction. Call at session start.
 * Returns number of weeks compacted (0 if nothing to do or already ran today).
 */
export async function runCompaction(): Promise<{ weeksCompacted: number; newFiles: string[] }> {
	const state = await loadState();
	const today = new Date().toISOString().slice(0, 10);

	// Only run once per day
	if (state.lastRun === today) {
		return { weeksCompacted: 0, newFiles: [] };
	}

	if (!existsSync(DAILY_DIR)) {
		return { weeksCompacted: 0, newFiles: [] };
	}

	// Find daily logs older than 14 days
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - 14);
	const cutoffStr = cutoff.toISOString().slice(0, 10);

	const files = await readdir(DAILY_DIR);
	const oldEntries: DailyEntry[] = [];

	for (const file of files) {
		if (!file.endsWith(".md")) continue;
		const date = file.replace(".md", "");
		if (date >= cutoffStr) continue; // Too recent

		const content = await readFile(join(DAILY_DIR, file), "utf-8");
		oldEntries.push({ date, content });
	}

	if (oldEntries.length === 0) {
		state.lastRun = today;
		await saveState(state);
		return { weeksCompacted: 0, newFiles: [] };
	}

	// Group by week
	const weekGroups = new Map<string, DailyEntry[]>();
	for (const entry of oldEntries) {
		const weekId = getWeekId(entry.date);
		if (!weekGroups.has(weekId)) weekGroups.set(weekId, []);
		weekGroups.get(weekId)!.push(entry);
	}

	// Compact each week that hasn't been compacted yet
	if (!existsSync(WEEKLY_DIR)) await mkdir(WEEKLY_DIR, { recursive: true });

	const newFiles: string[] = [];
	let compactedCount = 0;

	for (const [weekId, entries] of weekGroups) {
		if (state.weeksCompacted.includes(weekId)) continue;

		const summary = synthesizeWeek(entries);
		const formatted = formatWeeklySummary(summary);
		const filename = `week-${weekId}.md`;
		const filepath = join(WEEKLY_DIR, filename);

		await writeFile(filepath, formatted);
		state.weeksCompacted.push(weekId);
		newFiles.push(filename);
		compactedCount++;
	}

	state.lastRun = today;
	await saveState(state);

	return { weeksCompacted: compactedCount, newFiles };
}

/**
 * Get all weekly summaries (for context injection or querying).
 */
export async function getWeeklySummaries(): Promise<string[]> {
	if (!existsSync(WEEKLY_DIR)) return [];

	const files = await readdir(WEEKLY_DIR);
	const summaries: string[] = [];

	for (const file of files.sort().reverse().slice(0, 4)) { // Last 4 weeks
		if (!file.endsWith(".md")) continue;
		const content = await readFile(join(WEEKLY_DIR, file), "utf-8");
		summaries.push(content);
	}

	return summaries;
}
