// PAI Skills - Load skills directly from PAI source repos via sources.conf
// Discovers Packs and flat skills from each repo. No sync needed.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const SOURCES_CONF = join(homedir(), ".pai", "sources.conf");

function expandPath(p: string): string {
	if (p === "~") return homedir();
	if (p.startsWith("~/")) return join(homedir(), p.slice(2));
	return p;
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

	// Packs: {repo}/Packs/{Pack}/src/...
	const packsDir = join(resolved, "Packs");
	if (existsSync(packsDir)) {
		try {
			for (const packEntry of readdirSync(packsDir, { withFileTypes: true })) {
				if (!packEntry.isDirectory()) continue;

				const srcDir = join(packsDir, packEntry.name, "src");
				if (!existsSync(srcDir)) continue;

				const hasRouter = existsSync(join(srcDir, "SKILL.md"));

				// Pack-level router: src/SKILL.md
				if (hasRouter) {
					paths.push(srcDir);
				}

				// Sub-skills: src/{name}/SKILL.md
				// Only add as standalone if there's NO router (otherwise they're nested inside the router)
				for (const subEntry of readdirSync(srcDir, { withFileTypes: true })) {
					if (!subEntry.isDirectory()) continue;
					if (existsSync(join(srcDir, subEntry.name, "SKILL.md"))) {
						if (!hasRouter) {
							// No router -> sub-skill is standalone
							paths.push(join(srcDir, subEntry.name));
						}
						// With router -> sub-skill is nested, already included via router's srcDir
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

export default function (pi: ExtensionAPI) {
	pi.on("resources_discover", async (_event) => {
		const skillPaths = discoverAllSkillPaths();

		if (skillPaths.length > 0 && process.env.DEBUG) {
			console.log(`[pai-skills] Discovered ${skillPaths.length} skill paths from ${SOURCES_CONF}`);
		}

		return { skillPaths };
	});
}
