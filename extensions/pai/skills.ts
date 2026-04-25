// PAI Skills - Load skills directly from PAI source repos via sources.conf
// Discovers Packs and flat skills from each repo. No sync needed.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readdirSync, readFileSync, mkdirSync, symlinkSync, lstatSync, readlinkSync, unlinkSync } from "node:fs";
import { join, resolve, basename } from "node:path";
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
 * Convert a name to kebab-case (matches pi-mono's skill loader normalization).
 */
function toKebabCase(name: string): string {
	return name
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
		.toLowerCase();
}

/**
 * For pack-level SKILL.md files that live at src/SKILL.md (parent dir = "src"),
 * create a symlinked wrapper directory with the correct kebab-case name
 * so pi's skill loader sees a matching parent directory.
 */
const SKILL_LINKS_DIR = join(homedir(), ".pi", "cache", "pai-skill-links");

function ensureSkillLink(srcDir: string, packName: string): string {
	const kebabName = toKebabCase(packName);
	const linkDir = join(SKILL_LINKS_DIR, kebabName);

	try {
		mkdirSync(SKILL_LINKS_DIR, { recursive: true });

		// Create or refresh symlink: linkDir → srcDir
		if (existsSync(linkDir)) {
			try {
				const stat = lstatSync(linkDir);
				if (stat.isSymbolicLink()) {
					if (readlinkSync(linkDir) === srcDir) return linkDir;
					unlinkSync(linkDir);
				} else {
					// Not a symlink, skip to avoid data loss
					return srcDir;
				}
			} catch { return srcDir; }
		}

		symlinkSync(srcDir, linkDir, "dir");
		return linkDir;
	} catch {
		return srcDir; // Fallback to original path
	}
}

/**
 * Discover all skill directories from a PAI source repo.
 * Returns absolute paths to directories containing SKILL.md files.
 */
function discoverSkillPaths(repoPath: string): string[] {
	const paths: string[] = [];
	const resolved = resolve(expandPath(repoPath));

	if (!existsSync(resolved)) return paths;

	// Flat skills: {repo}/skills/{name}/SKILL.md
	const skillsDir = join(resolved, "skills");
	if (existsSync(skillsDir)) {
		try {
			for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
				if (entry.isDirectory() && existsSync(join(skillsDir, entry.name, "SKILL.md"))) {
					paths.push(join(skillsDir, entry.name));
				}
			}
		} catch {}
	}

	// Packs: {repo}/Packs/{Pack}/src/{name}/SKILL.md
	// Each sub-skill is loaded individually. Pack router SKILL.md (src/SKILL.md)
	// is a Claude Code routing concept — pi loads each sub-skill directly.
	const packsDir = join(resolved, "Packs");
	if (existsSync(packsDir)) {
		try {
			for (const packEntry of readdirSync(packsDir, { withFileTypes: true })) {
				if (!packEntry.isDirectory()) continue;

				const srcDir = join(packsDir, packEntry.name, "src");
				if (!existsSync(srcDir)) continue;

				// Sub-skills: src/{name}/SKILL.md
				const skipList = loadSkipList();
				let hasSubSkills = false;
				for (const subEntry of readdirSync(srcDir, { withFileTypes: true })) {
					if (!subEntry.isDirectory()) continue;
					if (skipList.has(subEntry.name)) continue;
					if (existsSync(join(srcDir, subEntry.name, "SKILL.md"))) {
						paths.push(join(srcDir, subEntry.name));
						hasSubSkills = true;
					}
				}

				// Pack-level SKILL.md (router): only load if pack has no sub-skills.
				// Use a symlink wrapper so parent dir matches the skill name
				// (src/SKILL.md → ~/.pi/cache/pai-skill-links/{kebab-name}/SKILL.md)
				if (!hasSubSkills && existsSync(join(srcDir, "SKILL.md"))) {
					const packName = packEntry.name;
					if (!skipList.has(packName)) {
						const linkedDir = ensureSkillLink(srcDir, packName);
						paths.push(linkedDir);
					}
				}
			}
		} catch {}
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
			console.log(`[pai-skills] Discovered ${skillPaths.length} skill paths from ${SOURCES_CONF}`);
		}

		return { skillPaths };
	});
}
