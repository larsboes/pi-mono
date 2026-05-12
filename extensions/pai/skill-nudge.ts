// PAI Skill Nudge — injects a compact skill index before every turn.
// Reminds the model to check if a skill covers the task before reaching
// for generic tools (fetch_content, bash, web_search, etc.)

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const SOURCES_CONF = join(homedir(), ".pai", "sources.conf");

interface SkillEntry {
	name: string;
	pack: string; // e.g. "Tooling", "Thinking", "DTInternal"
}

let cache: SkillEntry[] | null = null;

// ─── Discovery ────────────────────────────────────────────────────────────────

function expandPath(p: string): string {
	if (p === "~") return homedir();
	if (p.startsWith("~/")) return join(homedir(), p.slice(2));
	return p;
}

function findSkillEntries(root: string): SkillEntry[] {
	const results: SkillEntry[] = [];

	function walk(dir: string, depth: number) {
		if (depth > 5) return;
		try {
			const entries = readdirSync(dir, { withFileTypes: true });

			if (entries.some(e => e.isFile() && e.name === "SKILL.md")) {
				const skillName = extractName(join(dir, "SKILL.md")) ?? dir.split("/").pop() ?? "unknown";
				const pack = extractPackName(root, dir);
				results.push({ name: skillName, pack });
			}

			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
				walk(join(dir, entry.name), depth + 1);
			}
		} catch {}
	}

	const packsDir = join(resolve(expandPath(root)), "Packs");
	if (existsSync(packsDir)) walk(packsDir, 0);
	return results;
}

/** Read the `name:` frontmatter field from a SKILL.md */
function extractName(skillMd: string): string | null {
	try {
		const content = readFileSync(skillMd, "utf-8");
		const m = content.match(/^name:\s*["']?([^"'\n]+)["']?/m);
		return m ? m[1].trim() : null;
	} catch {
		return null;
	}
}

/**
 * Extract pack name from path relative to repo root.
 * ~/Developer/PAI/Packs/Tooling/src/Docker → "Tooling"
 * ~/Developer/pai-work/Packs/DTInternal/src/dt-gitlab → "DTInternal"
 */
function extractPackName(repoRoot: string, skillDir: string): string {
	const resolved = resolve(expandPath(repoRoot));
	const packsPrefix = join(resolved, "Packs") + "/";
	const rel = skillDir.startsWith(packsPrefix) ? skillDir.slice(packsPrefix.length) : skillDir;
	return rel.split("/")[0] ?? "Other";
}

function loadSkills(): SkillEntry[] {
	if (cache) return cache;
	if (!existsSync(SOURCES_CONF)) return (cache = []);

	const entries: SkillEntry[] = [];
	for (const line of readFileSync(SOURCES_CONF, "utf-8").split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		entries.push(...findSkillEntries(trimmed));
	}

	// Deduplicate by name
	const seen = new Set<string>();
	cache = entries.filter(e => {
		if (seen.has(e.name)) return false;
		seen.add(e.name);
		return true;
	});

	return cache;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

const PACK_LABELS: Record<string, string> = {
	Thinking:   "Thinking",
	Tooling:    "Tooling",
	Media:      "Media",
	Writing:    "Writing",
	Research:   "Research",
	Security:   "Security",
	Finance:    "Finance",
	DTInternal: "DT",
};

function buildNudge(skills: SkillEntry[]): string {
	if (skills.length === 0) return "";

	// Group by pack
	const groups = new Map<string, string[]>();
	for (const s of skills) {
		const label = PACK_LABELS[s.pack] ?? s.pack;
		if (!groups.has(label)) groups.set(label, []);
		groups.get(label)!.push(s.name);
	}

	const lines = [`## Skills (${skills.length} loaded) — check before using generic tools`];
	for (const [label, names] of groups) {
		lines.push(`${label}: ${names.join(" · ")}`);
	}

	return lines.join("\n");
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerSkillNudge(pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event, _ctx) => {
		const skills = loadSkills();
		const nudge = buildNudge(skills);
		if (nudge) {
			event.systemPrompt += "\n\n" + nudge;
		}
	});
}
