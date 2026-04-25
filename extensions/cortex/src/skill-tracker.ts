/**
 * Skill Usage Tracker
 *
 * Tracks which skills the LLM loads (via read tool on SKILL.md files),
 * how often, and when last used. This feeds into:
 * - Stale skill detection (unused >30 days)
 * - Most-used skill surfacing
 * - Self-extension status in system prompt
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Paths ──────────────────────────────────────────────────────────────────

const CORTEX_DIR = join(homedir(), ".pi", "memory", "cortex");
const TRACKER_FILE = join(CORTEX_DIR, "skill-usage.json");

// ── Types ──────────────────────────────────────────────────────────────────

interface SkillUsageEntry {
	/** Total times this skill was loaded */
	loadCount: number;
	/** Last time it was loaded */
	lastUsed: string;
	/** First time it was recorded */
	firstSeen: string;
}

interface SkillUsageData {
	skills: Record<string, SkillUsageEntry>;
	lastUpdated: string;
}

// ── State ──────────────────────────────────────────────────────────────────

let data: SkillUsageData | null = null;

// ── Persistence ────────────────────────────────────────────────────────────

async function load(): Promise<SkillUsageData> {
	if (data) return data;

	if (!existsSync(CORTEX_DIR)) await mkdir(CORTEX_DIR, { recursive: true });

	if (existsSync(TRACKER_FILE)) {
		try {
			const raw = await readFile(TRACKER_FILE, "utf-8");
			data = JSON.parse(raw) as SkillUsageData;
			return data;
		} catch {
			// Corrupt — reset
		}
	}

	data = { skills: {}, lastUpdated: new Date().toISOString() };
	return data;
}

async function save(): Promise<void> {
	if (!data) return;
	data.lastUpdated = new Date().toISOString();
	await writeFile(TRACKER_FILE, JSON.stringify(data, null, 2));
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Record that a skill was loaded (its SKILL.md was read).
 * Call this when detecting a read tool call on a SKILL.md path.
 */
export async function recordSkillLoad(skillName: string): Promise<void> {
	const d = await load();
	const now = new Date().toISOString();

	if (d.skills[skillName]) {
		d.skills[skillName].loadCount++;
		d.skills[skillName].lastUsed = now;
	} else {
		d.skills[skillName] = {
			loadCount: 1,
			lastUsed: now,
			firstSeen: now,
		};
	}

	await save();
}

/**
 * Check if a path is a SKILL.md read and extract the skill name.
 * Returns the skill name if it matches, null otherwise.
 */
export function extractSkillName(readPath: string): string | null {
	// Match patterns like:
	// ~/.pi/skills/<name>/SKILL.md
	// /home/user/.pi/skills/<name>/SKILL.md
	// .pi/skills/<name>/SKILL.md
	const patterns = [
		/\.pi\/skills\/([a-z0-9-]+)\/SKILL\.md$/i,
		/\.pi\/agent\/skills\/([a-z0-9-]+)\/SKILL\.md$/i,
	];

	for (const pattern of patterns) {
		const match = readPath.match(pattern);
		if (match) return match[1];
	}

	return null;
}

/**
 * Get the last-used date for a skill.
 */
export async function getLastUsed(skillName: string): Promise<Date | null> {
	const d = await load();
	const entry = d.skills[skillName];
	if (!entry) return null;
	return new Date(entry.lastUsed);
}

/**
 * Get usage stats for system prompt injection.
 */
export async function getUsageStats(): Promise<{
	totalTracked: number;
	topSkills: Array<{ name: string; loadCount: number; lastUsed: string }>;
	neverUsed: string[];
}> {
	const d = await load();

	const entries = Object.entries(d.skills)
		.sort(([, a], [, b]) => b.loadCount - a.loadCount);

	return {
		totalTracked: entries.length,
		topSkills: entries.slice(0, 10).map(([name, entry]) => ({
			name,
			loadCount: entry.loadCount,
			lastUsed: entry.lastUsed.split("T")[0],
		})),
		neverUsed: [], // Populated by cross-referencing with installed skills
	};
}

/**
 * Get all tracked skill names for cross-referencing.
 */
export async function getTrackedSkills(): Promise<Set<string>> {
	const d = await load();
	return new Set(Object.keys(d.skills));
}
