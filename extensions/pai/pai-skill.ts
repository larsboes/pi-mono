/**
 * PAI Skill — first-class Skill primitive for pi.
 *
 * Equivalent to Claude Code's Skill tool. The model invokes pai_skill with a
 * skill name; the tool resolves the skill directory under ~/.pi/agent/skills/,
 * reads its SKILL.md, and returns the full content as the tool result so the
 * model can continue the work with full skill context.
 *
 * Resolution order (handles flat packs, meta-packs, and Pack/Sub form):
 *   1. ~/.pi/agent/skills/<name>/SKILL.md                  (exact match)
 *   2. If name has "/": ~/.pi/agent/skills/<basename>/SKILL.md
 *   3. Otherwise: scan ~/.pi/agent/skills/<X>/<name>/SKILL.md for any X
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";

const SKILLS_DIR = join(homedir(), ".pi", "agent", "skills");

interface ResolvedSkill {
	path: string;
	skillName: string;
	resolvedFrom: "exact" | "basename" | "nested";
}

interface SkillNotFound {
	suggestions: string[];
}

function isUnsafeName(name: string): string | null {
	if (!name || typeof name !== "string") return "name must be a non-empty string";
	if (name.includes("..")) return "name must not contain '..'";
	if (name.startsWith("/")) return "name must not start with '/'";
	if (name.includes("\0")) return "name must not contain null bytes";
	return null;
}

function listImmediateSkillDirs(root: string): string[] {
	if (!existsSync(root)) return [];
	try {
		return readdirSync(root, { withFileTypes: true })
			.filter((entry) => {
				if (entry.isDirectory()) return true;
				if (entry.isSymbolicLink()) {
					try {
						return statSync(join(root, entry.name)).isDirectory();
					} catch {
						return false;
					}
				}
				return false;
			})
			.map((entry) => entry.name);
	} catch {
		return [];
	}
}

function tryDirect(name: string): ResolvedSkill | null {
	const path = join(SKILLS_DIR, name, "SKILL.md");
	if (existsSync(path)) {
		return { path, skillName: name, resolvedFrom: "exact" };
	}
	return null;
}

function tryBasename(name: string): ResolvedSkill | null {
	if (!name.includes("/")) return null;
	const base = basename(name);
	if (!base || base === name) return null;
	const path = join(SKILLS_DIR, base, "SKILL.md");
	if (existsSync(path)) {
		return { path, skillName: base, resolvedFrom: "basename" };
	}
	return null;
}

function tryNested(name: string): ResolvedSkill | null {
	if (name.includes("/")) return null;
	const dirs = listImmediateSkillDirs(SKILLS_DIR);
	for (const dir of dirs) {
		const path = join(SKILLS_DIR, dir, name, "SKILL.md");
		if (existsSync(path)) {
			return { path, skillName: `${dir}/${name}`, resolvedFrom: "nested" };
		}
	}
	return null;
}

function resolveSkill(name: string): ResolvedSkill | null {
	return tryDirect(name) ?? tryBasename(name) ?? tryNested(name);
}

function levenshtein(a: string, b: string): number {
	const m = a.length;
	const n = b.length;
	if (m === 0) return n;
	if (n === 0) return m;
	const prev = new Array<number>(n + 1);
	const cur = new Array<number>(n + 1);
	for (let j = 0; j <= n; j++) prev[j] = j;
	for (let i = 1; i <= m; i++) {
		cur[0] = i;
		for (let j = 1; j <= n; j++) {
			const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
			cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
		}
		for (let j = 0; j <= n; j++) prev[j] = cur[j];
	}
	return prev[n];
}

function listAllSkillNames(): string[] {
	const names: string[] = [];
	const top = listImmediateSkillDirs(SKILLS_DIR);
	for (const dir of top) {
		const skillMd = join(SKILLS_DIR, dir, "SKILL.md");
		if (existsSync(skillMd)) {
			names.push(dir);
		} else {
			// Meta-pack: enumerate subskills
			const subs = listImmediateSkillDirs(join(SKILLS_DIR, dir));
			for (const sub of subs) {
				if (existsSync(join(SKILLS_DIR, dir, sub, "SKILL.md"))) {
					names.push(`${dir}/${sub}`);
				}
			}
		}
	}
	return names;
}

function suggestionsFor(name: string, limit = 5): string[] {
	const all = listAllSkillNames();
	const lower = name.toLowerCase();
	const ranked = all
		.map((candidate) => {
			const cLower = candidate.toLowerCase();
			const substr = cLower.includes(lower) || lower.includes(cLower) ? 0 : 1;
			const dist = levenshtein(lower, cLower);
			return { name: candidate, score: substr * 100 + dist };
		})
		.sort((a, b) => a.score - b.score)
		.slice(0, limit)
		.map((entry) => entry.name);
	return ranked;
}

function buildResultText(resolved: ResolvedSkill, content: string, args?: string): string {
	const header = `# Skill: ${resolved.skillName}\n<path: ${resolved.path}>\n`;
	const footer = args && args.trim().length > 0 ? `\n\n---\nUser intent: ${args.trim()}\n` : "";
	return `${header}\n${content}${footer}`;
}

export interface SkillResolution {
	resolved: ResolvedSkill | SkillNotFound;
}

function tryResolve(name: string): SkillResolution {
	const found = resolveSkill(name);
	if (found) return { resolved: found };
	return { resolved: { suggestions: suggestionsFor(name) } };
}

export function registerPaiSkill(pi: ExtensionAPI) {
	pi.registerTool({
		name: "pai_skill",
		label: "PAI Skill",
		description:
			"Invoke a PAI skill by name. Resolves ~/.pi/agent/skills/<name>/SKILL.md and returns its content so you can continue the work with full skill context. Supports flat packs (e.g. 'Architecture'), Pack/Sub form (e.g. 'Personal/daily'), and meta-pack subskills.",
		parameters: Type.Object({
			name: Type.String({
				description:
					"Skill name. Examples: 'Architecture', 'DeepDebug', 'Personal/daily', 'daily'.",
			}),
			args: Type.Optional(
				Type.String({
					description:
						"Optional user intent / args. Appended after the SKILL.md content as 'User intent: ...'.",
				}),
			),
		}),
		async execute(_id, params) {
			const safetyError = isUnsafeName(params.name);
			if (safetyError) {
				const details: Record<string, unknown> = { error: true, reason: safetyError };
				return {
					content: [{ type: "text" as const, text: `pai_skill: ${safetyError}` }],
					details,
				};
			}

			const { resolved } = tryResolve(params.name);
			if (!("path" in resolved)) {
				const suggestions = resolved.suggestions;
				const text =
					`Skill not found: ${params.name}\n\n` +
					(suggestions.length
						? `Closest matches:\n${suggestions.map((s) => `  - ${s}`).join("\n")}\n`
						: "No close matches in ~/.pi/agent/skills/.\n");
				const details: Record<string, unknown> = { error: true, suggestions };
				return {
					content: [{ type: "text" as const, text }],
					details,
				};
			}

			let content: string;
			try {
				content = readFileSync(resolved.path, "utf-8");
			} catch (err) {
				const reason = (err as Error).message;
				const details: Record<string, unknown> = { error: true, path: resolved.path, reason };
				return {
					content: [{ type: "text" as const, text: `pai_skill: failed to read ${resolved.path}: ${reason}` }],
					details,
				};
			}

			let sizeBytes = 0;
			try {
				sizeBytes = statSync(resolved.path).size;
			} catch {}

			const text = buildResultText(resolved, content, params.args);
			const details: Record<string, unknown> = {
				path: resolved.path,
				skillName: resolved.skillName,
				resolvedFrom: resolved.resolvedFrom,
				sizeBytes,
			};
			return {
				content: [{ type: "text" as const, text }],
				details,
			};
		},
		promptSnippet:
			"pai_skill - Invoke a PAI skill by name; returns SKILL.md content for the model to use",
		promptGuidelines: [
			"Invoke at OBSERVE/THINK when a capability is selected from the closed enumeration in the doctrine block.",
			"The tool returns the SKILL.md content as text — you continue the work in this turn using that context.",
			"If a skill has subskills (Pack/Sub form like 'Personal/daily'), pass the explicit 'Pack/Sub' to disambiguate.",
			"On miss the tool returns a list of close matches — try one of those rather than asking the user.",
		],
	});
}

// ── CLI test harness ────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
	const name = process.argv[2];
	if (!name) {
		console.error("usage: bun pai-skill.ts <skill-name> [args...]");
		process.exit(2);
	}
	const args = process.argv.slice(3).join(" ") || undefined;
	const safetyError = isUnsafeName(name);
	if (safetyError) {
		console.log(JSON.stringify({ ok: false, error: safetyError }, null, 2));
		process.exit(1);
	}
	const { resolved } = tryResolve(name);
	if (!("path" in resolved)) {
		console.log(JSON.stringify({ ok: false, error: "not_found", suggestions: resolved.suggestions }, null, 2));
		process.exit(1);
	}
	let content = "";
	try {
		content = readFileSync(resolved.path, "utf-8");
	} catch (err) {
		console.log(JSON.stringify({ ok: false, error: (err as Error).message }, null, 2));
		process.exit(1);
	}
	const text = buildResultText(resolved, content, args);
	console.log(
		JSON.stringify(
			{
				ok: true,
				skillName: resolved.skillName,
				path: resolved.path,
				resolvedFrom: resolved.resolvedFrom,
				preview: text.slice(0, 400),
				totalChars: text.length,
			},
			null,
			2,
		),
	);
}
