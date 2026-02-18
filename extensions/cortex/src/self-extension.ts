/**
 * Self-Extension Status — The Closed Feedback Loop
 *
 * Surfaces pattern detection, skill health, and crystallization suggestions
 * into the system prompt via before_agent_start.
 *
 * This is the missing piece: the agent sees its own patterns and gets nudged
 * to crystallize them into skills or extensions.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as patterns from "./patterns.js";
import * as skillTracker from "./skill-tracker.js";

const HOME = homedir();
const SKILLS_DIR = join(HOME, ".pi", "skills");
const EXTENSIONS_DIR = join(HOME, ".pi", "agent", "extensions");

// ── Types ──────────────────────────────────────────────────────────────────

export interface SelfExtensionStatus {
	/** Patterns seen 3+ times — crystallization candidates */
	crystallizationCandidates: Array<{ signature: string; count: number; example: string }>;
	/** Top 3 most frequent patterns (even below threshold) */
	topPatterns: Array<{ signature: string; count: number }>;
	/** Skills unused for 30+ days */
	staleSkills: string[];
	/** Recently created skills (last 7 days) */
	recentSkills: Array<{ name: string; daysAgo: number }>;
	/** Total skills and extensions count */
	skillCount: number;
	extensionCount: number;
	/** Most used skills (from tracker) */
	mostUsedSkills: Array<{ name: string; loadCount: number }>;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Build the full self-extension status for system prompt injection.
 * Returns null if there's nothing interesting to surface.
 */
export async function buildStatus(): Promise<SelfExtensionStatus> {
	const [patternStats, candidates, skillHealth, tracker] = await Promise.all([
		patterns.getStats(),
		patterns.getCrystallizationCandidates(3),
		getSkillHealth(),
		skillTracker.getUsageStats(),
	]);

	return {
		crystallizationCandidates: candidates.map(c => ({
			signature: c.signature,
			count: c.count,
			example: c.examplePrompt.slice(0, 80),
		})),
		topPatterns: patternStats.topPatterns.slice(0, 3),
		staleSkills: skillHealth.stale,
		recentSkills: skillHealth.recent,
		skillCount: skillHealth.totalSkills,
		extensionCount: skillHealth.totalExtensions,
		mostUsedSkills: tracker.topSkills.slice(0, 5),
	};
}

/**
 * Format status as a system prompt block.
 * Returns empty string if nothing interesting to surface.
 */
export function formatStatus(status: SelfExtensionStatus): string {
	const lines: string[] = [];

	// Only inject if there's something actionable
	const hasCandidate = status.crystallizationCandidates.length > 0;
	const hasStale = status.staleSkills.length > 0;

	if (!hasCandidate && !hasStale) return "";

	lines.push("\n\n## Self-Extension Status (auto-detected)");
	lines.push("");

	if (hasCandidate) {
		lines.push("**⚡ Crystallization candidates** (repeated patterns — consider making a skill):");
		for (const c of status.crystallizationCandidates) {
			lines.push(`- \`${c.signature}\` — seen ${c.count}× (e.g. "${c.example}")`);
		}
		lines.push("");
	}

	if (hasStale) {
		lines.push(`**🧹 Stale skills** (unused >30 days): ${status.staleSkills.join(", ")}`);
		lines.push("Consider auditing or retiring these.");
		lines.push("");
	}

	if (status.recentSkills.length > 0) {
		lines.push(`**✨ Recently created:** ${status.recentSkills.map(s => `${s.name} (${s.daysAgo}d ago)`).join(", ")}`);
		lines.push("");
	}

	return lines.join("\n");
}

// ── Skill Health ───────────────────────────────────────────────────────────

interface SkillHealth {
	totalSkills: number;
	totalExtensions: number;
	stale: string[];
	recent: Array<{ name: string; daysAgo: number }>;
}

async function getSkillHealth(): Promise<SkillHealth> {
	const result: SkillHealth = {
		totalSkills: 0,
		totalExtensions: 0,
		stale: [],
		recent: [],
	};

	const now = Date.now();
	const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
	const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

	// Count skills and check staleness
	if (existsSync(SKILLS_DIR)) {
		const entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const skillMd = join(SKILLS_DIR, entry.name, "SKILL.md");
			if (!existsSync(skillMd)) continue;

			result.totalSkills++;

			try {
				const stats = statSync(skillMd);
				const age = now - stats.mtimeMs;

				// Check usage tracker for last-used date
				const lastUsed = await skillTracker.getLastUsed(entry.name);

				if (lastUsed) {
					const lastUsedAge = now - lastUsed.getTime();
					if (lastUsedAge > THIRTY_DAYS) {
						result.stale.push(entry.name);
					}
				} else {
					// Never loaded by tracker — check file mtime
					if (age > THIRTY_DAYS) {
						result.stale.push(entry.name);
					}
				}

				// Recently created (by mtime)
				if (age < SEVEN_DAYS) {
					result.recent.push({
						name: entry.name,
						daysAgo: Math.floor(age / (24 * 60 * 60 * 1000)),
					});
				}
			} catch {
				// Skip unreadable
			}
		}
	}

	// Count extensions
	if (existsSync(EXTENSIONS_DIR)) {
		const entries = readdirSync(EXTENSIONS_DIR, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isDirectory() || entry.name.endsWith(".ts")) {
				result.totalExtensions++;
			}
		}
	}

	return result;
}
