// PAI Skills - Load skills directly from PAI source repos via sources.conf
// Discovers flat packs (Packs/{Skill}/SKILL.md) and nested packs from each repo.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const SOURCES_CONF = join(homedir(), ".pai", "sources.conf");
const SKIP_CONF = join(homedir(), ".pai", "skip-skills.conf");

/**
 * Load skip list from ~/.pai/skip-skills.conf
 * One skill name per line, # for comments.
 */
function loadSkipList(): Set<string> {
	if (!existsSync(SKIP_CONF)) return new Set();
	try {
		const content = readFileSync(SKIP_CONF, "utf-8");
		const names = content.split("\n")
			.map(l => l.trim())
			.filter(l => l && !l.startsWith("#"));
		return new Set(names);
	} catch {
		return new Set();
	}
}

function expandPath(p: string): string {
	if (p === "~") return homedir();
	if (p.startsWith("~/")) return join(homedir(), p.slice(2));
	return p;
}

/**
 * Recursively find all directories containing SKILL.md under a root.
 */
function findSkillDirs(root: string, skipList: Set<string>, maxDepth = 4): string[] {
	const results: string[] = [];

	function walk(dir: string, depth: number) {
		if (depth > maxDepth) return;
		try {
			const entries = readdirSync(dir, { withFileTypes: true });

			// Check if this dir has a SKILL.md
			if (entries.some(e => e.isFile() && e.name === "SKILL.md")) {
				const name = dir.split("/").pop() || "";
				if (!skipList.has(name)) {
					results.push(dir);
				}
			}

			// Recurse into subdirs
			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
				walk(join(dir, entry.name), depth + 1);
			}
		} catch {}
	}

	walk(root, 0);
	return results;
}

/**
 * Discover all skill directories from a PAI source repo.
 * Handles both flat (Packs/{Skill}/SKILL.md) and nested (Packs/{Group}/src/{Skill}/SKILL.md).
 */
function discoverSkillPaths(repoPath: string): string[] {
	const resolved = resolve(expandPath(repoPath));
	if (!existsSync(resolved)) return [];

	const skipList = loadSkipList();
	const paths: string[] = [];

	// Check for Packs/ directory
	const packsDir = join(resolved, "Packs");
	if (existsSync(packsDir)) {
		paths.push(...findSkillDirs(packsDir, skipList));
	}

	// Check for flat skills/ directory
	const skillsDir = join(resolved, "skills");
	if (existsSync(skillsDir)) {
		paths.push(...findSkillDirs(skillsDir, skipList, 2));
	}

	return paths;
}

/**
 * Read sources.conf and discover all skill paths from all PAI repos.
 */
function discoverAllSkillPaths(): string[] {
	if (!existsSync(SOURCES_CONF)) return [];

	const allPaths: string[] = [];
	const content = readFileSync(SOURCES_CONF, "utf-8");

	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		allPaths.push(...discoverSkillPaths(trimmed));
	}

	return allPaths;
}

export function registerSkills(pi: ExtensionAPI) {
	pi.on("resources_discover", async (_event) => {
		const skillPaths = discoverAllSkillPaths();

		if (skillPaths.length > 0 && process.env.DEBUG) {
			console.error(`[pai-skills] Discovered ${skillPaths.length} skill paths from ${SOURCES_CONF}`);
		}

		return { skillPaths };
	});
}
