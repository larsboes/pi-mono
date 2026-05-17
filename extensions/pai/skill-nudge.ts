// PAI Skill Nudge — BM25-ranked skill index injected before every turn.
//
// Why this exists
//   The flat dump ("here are 84 skills, good luck") was decorative — the model
//   could see names but not relevance. This version indexes every SKILL.md
//   description (which already contains the curated `USE WHEN ...` triggers)
//   and ranks the top N skills against the current user prompt via BM25 —
//   the same engine search-tools.ts uses for tool discovery.
//
// What the model sees
//   1. A short "closed-enumeration ↔ deployed skill" table — every PAI
//      Algorithm thinking capability that has a backing SKILL.md gets the
//      exact `pai_skill name="..."` invocation pattern. This closes the gap
//      between "doctrine names a capability" and "model knows how to call it".
//   2. The top-N most prompt-relevant skills, with one-line descriptions.
//
// Falls back gracefully: if no prompt is available (rare), surfaces a small
// curated set instead of dumping everything.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const SOURCES_CONF = join(homedir(), ".pai", "sources.conf");
const DEPLOYED_SKILLS = join(homedir(), ".pi", "agent", "skills");

interface SkillEntry {
	name: string;
	pack: string;
	description: string;        // raw `description:` from frontmatter (USE WHEN ... included)
	path: string;
	useWhen: string;            // extracted "USE WHEN ..." segment, if present
}

let cache: SkillEntry[] | null = null;

// ── Discovery ────────────────────────────────────────────────────────────────

function expandPath(p: string): string {
	if (p === "~") return homedir();
	if (p.startsWith("~/")) return join(homedir(), p.slice(2));
	return p;
}

function readSkillFrontmatter(skillMd: string): { name: string | null; description: string } {
	try {
		const content = readFileSync(skillMd, "utf-8");
		const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
		const fm = fmMatch ? fmMatch[1] : "";
		const nameMatch = fm.match(/^name:\s*["']?([^"'\n]+)["']?/m);
		// description may span multiple lines after a `description: |` or simple form
		const descMatch = fm.match(/^description:\s*(.+(?:\n\s+.+)*)/m);
		let description = "";
		if (descMatch) {
			description = descMatch[1]
				.replace(/^["']|["']$/g, "")
				.replace(/\n\s+/g, " ")
				.trim();
		}
		return {
			name: nameMatch ? nameMatch[1].trim() : null,
			description,
		};
	} catch {
		return { name: null, description: "" };
	}
}

function extractUseWhen(description: string): string {
	const m = description.match(/\bUSE\s+WHEN\b\s+([^.]+(?:\.[^.]+)*)/i);
	if (!m) return "";
	return m[1].trim();
}

function findSkillEntries(root: string): SkillEntry[] {
	const results: SkillEntry[] = [];
	const resolved = resolve(expandPath(root));

	function walk(dir: string, depth: number): void {
		if (depth > 5) return;
		let entries: Dirent[];
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}

		const skillMd = entries.find((e) => e.isFile() && e.name === "SKILL.md");
		if (skillMd) {
			const skillPath = join(dir, "SKILL.md");
			const fm = readSkillFrontmatter(skillPath);
			const name = fm.name ?? dir.split("/").pop() ?? "unknown";
			const pack = extractPackName(resolved, dir);
			results.push({
				name,
				pack,
				description: fm.description,
				path: skillPath,
				useWhen: extractUseWhen(fm.description),
			});
		}

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			walk(join(dir, entry.name), depth + 1);
		}
	}

	const packsDir = join(resolved, "Packs");
	if (existsSync(packsDir)) walk(packsDir, 0);
	return results;
}

function extractPackName(repoRoot: string, skillDir: string): string {
	const packsPrefix = join(repoRoot, "Packs") + "/";
	const rel = skillDir.startsWith(packsPrefix) ? skillDir.slice(packsPrefix.length) : skillDir;
	return rel.split("/")[0] ?? "Other";
}

function findDeployedSkills(skillsDir: string): SkillEntry[] {
	if (!existsSync(skillsDir)) return [];
	const results: SkillEntry[] = [];
	try {
		for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
			if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
			const subdir = join(skillsDir, entry.name);
			let isDir = entry.isDirectory();
			if (entry.isSymbolicLink()) {
				try { isDir = statSync(subdir).isDirectory(); } catch {}
			}
			if (!isDir) continue;
			const skillMd = join(subdir, "SKILL.md");
			if (existsSync(skillMd)) {
				const fm = readSkillFrontmatter(skillMd);
				results.push({
					name: fm.name ?? entry.name,
					pack: "Other",
					description: fm.description,
					path: skillMd,
					useWhen: extractUseWhen(fm.description),
				});
				continue;
			}
			// Meta-pack: enumerate one level down
			try {
				for (const sub of readdirSync(subdir, { withFileTypes: true })) {
					if (!sub.isDirectory() && !sub.isSymbolicLink()) continue;
					const innerMd = join(subdir, sub.name, "SKILL.md");
					if (!existsSync(innerMd)) continue;
					const fm = readSkillFrontmatter(innerMd);
					results.push({
						name: fm.name ?? sub.name,
						pack: entry.name,
						description: fm.description,
						path: innerMd,
						useWhen: extractUseWhen(fm.description),
					});
				}
			} catch {}
		}
	} catch {}
	return results;
}

function loadSkills(): SkillEntry[] {
	if (cache) return cache;
	const entries: SkillEntry[] = [];

	if (existsSync(SOURCES_CONF)) {
		for (const line of readFileSync(SOURCES_CONF, "utf-8").split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			entries.push(...findSkillEntries(trimmed));
		}
	}

	entries.push(...findDeployedSkills(DEPLOYED_SKILLS));

	const seen = new Set<string>();
	cache = entries.filter((e) => {
		if (seen.has(e.name)) return false;
		seen.add(e.name);
		return true;
	});
	return cache;
}

export function clearSkillCache(): void {
	cache = null;
}

// ── BM25 ranking ─────────────────────────────────────────────────────────────
// Mirror tool-discovery.ts but tuned for skill descriptions which are longer
// than tool descriptions. Field weights bias toward `useWhen` (the curated
// trigger phrase) since that's what the SKILL.md author actually thought
// about when answering "what queries should match".

const BM25_K1 = 1.2;
const BM25_B = 0.75;

const FIELD_WEIGHTS = {
	name: 5,
	useWhen: 4,
	description: 2,
} as const;

function tokenize(text: string): string[] {
	return text
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[^a-zA-Z0-9]+/g, " ")
		.toLowerCase()
		.trim()
		.split(/\s+/)
		.filter((t) => t.length > 1);
}

interface SkillDoc {
	skill: SkillEntry;
	tf: Map<string, number>;
	length: number;
}

interface SkillIndex {
	docs: SkillDoc[];
	avgLength: number;
	df: Map<string, number>;
}

function buildSkillIndex(skills: SkillEntry[]): SkillIndex {
	const docs: SkillDoc[] = [];
	const df = new Map<string, number>();

	for (const skill of skills) {
		const tf = new Map<string, number>();
		let length = 0;

		const ingest = (text: string, weight: number): void => {
			for (const tok of tokenize(text)) {
				tf.set(tok, (tf.get(tok) || 0) + weight);
				length += weight;
			}
		};

		ingest(skill.name, FIELD_WEIGHTS.name);
		ingest(skill.useWhen, FIELD_WEIGHTS.useWhen);
		ingest(skill.description, FIELD_WEIGHTS.description);

		docs.push({ skill, tf, length });
		for (const term of tf.keys()) {
			df.set(term, (df.get(term) || 0) + 1);
		}
	}

	const avgLength = docs.length > 0 ? docs.reduce((s, d) => s + d.length, 0) / docs.length : 0;
	return { docs, avgLength, df };
}

interface RankedSkill {
	skill: SkillEntry;
	score: number;
}

export function rankSkills(index: SkillIndex, query: string, limit: number): RankedSkill[] {
	const tokens = tokenize(query);
	if (tokens.length === 0) return [];
	const N = index.docs.length;
	const results: RankedSkill[] = [];

	for (const doc of index.docs) {
		let score = 0;
		for (const tok of tokens) {
			const tf = doc.tf.get(tok) || 0;
			if (tf === 0) continue;
			const df = index.df.get(tok) || 0;
			const idf = Math.max(0, Math.log((N - df + 0.5) / (df + 0.5) + 1));
			const tfNorm = (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * (doc.length / index.avgLength)));
			score += idf * tfNorm;
		}
		if (score > 0) results.push({ skill: doc.skill, score });
	}

	results.sort((a, b) => b.score - a.score);
	return results.slice(0, limit);
}

// ── Closed enumeration ↔ deployed skill mapping ──────────────────────────────
// PAI Algorithm v6.3.0 closed thinking-capability enumeration. Capabilities
// that have a backing PAI skill get the exact pai_skill invocation hint;
// those that map to dedicated tools (advisor_check, cato_audit, forge_code)
// get those instead. Doctrine-only entries (ReReadCheck, FeedbackMemoryConsult)
// have no callable surface — they're behaviors the model performs.

interface EnumerationEntry {
	name: string;        // verbatim doctrine name
	how: string;         // how to invoke
}

const CLOSED_ENUMERATION: EnumerationEntry[] = [
	{ name: "IterativeDepth", how: "pai_skill name=\"IterativeDepth\"" },
	{ name: "ApertureOscillation", how: "pai_skill name=\"ApertureOscillation\"" },
	{ name: "FeedbackMemoryConsult", how: "(in-context: grep ~/.claude/projects/-home-lars/memory/feedback_*.md)" },
	{ name: "Advisor", how: "advisor_check tool" },
	{ name: "ReReadCheck", how: "(in-context: re-read the user's last message verbatim before completing)" },
	{ name: "FirstPrinciples", how: "pai_skill name=\"FirstPrinciples\"" },
	{ name: "SystemsThinking", how: "pai_skill name=\"SystemsThinking\"" },
	{ name: "RootCauseAnalysis", how: "pai_skill name=\"RootCauseAnalysis\"" },
	{ name: "Council", how: "pai_skill name=\"Council\"" },
	{ name: "RedTeam", how: "pai_skill name=\"RedTeam\"" },
	{ name: "Science", how: "pai_skill name=\"Science\"" },
	{ name: "BeCreative", how: "pai_skill name=\"BeCreative\"" },
	{ name: "Ideate", how: "pai_skill name=\"Ideate\"" },
	{ name: "BitterPillEngineering", how: "pai_skill name=\"BitterPillEngineering\"" },
	{ name: "Evals", how: "pai_skill name=\"Evals\"" },
	{ name: "WorldThreatModel", how: "pai_skill name=\"WorldThreatModel\"" },
	{ name: "Fabric patterns", how: "pai_skill name=\"Fabric\" args=\"<pattern>\"" },
	{ name: "ContextSearch", how: "pai_skill name=\"ContextSearch\"" },
	{ name: "ISA", how: "isa_scaffold / isa_mark_isc / isa_append_decision / isa_append_changelog / isa_check_completeness Pi tools" },
];

const CLOSED_ENUMERATION_DELEGATION: EnumerationEntry[] = [
	{ name: "Forge", how: "forge_code tool — GPT-5.4 cross-vendor code producer" },
	{ name: "Cato", how: "cato_audit tool — cross-vendor read-only audit (E4/E5 mandatory)" },
	{ name: "Anvil", how: "(no Pi tool yet — Kimi K2.6 long-context coder)" },
];

function buildClosedEnumerationBlock(deployedNames: Set<string>): string {
	const lines: string[] = [
		"## PAI Algorithm capability invocation",
		"",
		"When you name a capability under `🏹 CAPABILITIES SELECTED`, invoke it via the matching tool. Naming without invoking is a phantom capability.",
		"",
		"### Thinking capabilities (closed enumeration)",
	];
	for (const e of CLOSED_ENUMERATION) {
		const marker = e.how.startsWith("pai_skill") ? (deployedNames.has(e.name) ? "✓" : "·") : "→";
		lines.push(`- ${marker} **${e.name}** — ${e.how}`);
	}
	lines.push("");
	lines.push("### Delegation capabilities");
	for (const e of CLOSED_ENUMERATION_DELEGATION) {
		lines.push(`- → **${e.name}** — ${e.how}`);
	}
	return lines.join("\n");
}

// ── Nudge builder ────────────────────────────────────────────────────────────

export function buildNudge(prompt: string, allSkills: SkillEntry[], topN = 8): string {
	if (allSkills.length === 0) return "";

	const deployedNames = new Set(allSkills.map((s) => s.name));
	const enumerationBlock = buildClosedEnumerationBlock(deployedNames);

	const trimmedPrompt = (prompt ?? "").trim();
	const out: string[] = [];
	out.push("<pai-skills>");
	out.push(`## Skills (${allSkills.length} loaded) — check before using generic tools`);
	out.push("");

	if (trimmedPrompt.length >= 4) {
		const index = buildSkillIndex(allSkills);
		const ranked = rankSkills(index, trimmedPrompt, topN);
		if (ranked.length > 0) {
			out.push(`### Most relevant to this prompt (top ${ranked.length})`);
			out.push("Invoke via `pai_skill name=\"<name>\"`. Each line: name — what it does (truncated).");
			out.push("");
			for (const { skill } of ranked) {
				const oneLine = (skill.useWhen || skill.description || "").slice(0, 220).replace(/\s+/g, " ");
				out.push(`- **${skill.name}** — ${oneLine}`);
			}
			out.push("");
		}
	}

	out.push(enumerationBlock);
	out.push("");

	// Compact pack-grouped fallback list — much smaller than the old flat dump
	// because we already surfaced the relevant ones above. This is just a
	// "what else exists" reference.
	const groups = new Map<string, string[]>();
	for (const s of allSkills) {
		const label = s.pack || "Other";
		if (!groups.has(label)) groups.set(label, []);
		groups.get(label)!.push(s.name);
	}
	out.push(`### Full index by pack (${allSkills.length})`);
	for (const [label, names] of groups) {
		out.push(`${label}: ${names.join(" · ")}`);
	}
	out.push("</pai-skills>");

	return out.join("\n");
}

// ── Registration ─────────────────────────────────────────────────────────────

export function registerSkillNudge(pi: ExtensionAPI): void {
	pi.on("before_agent_start", async (event, _ctx) => {
		const skills = loadSkills();
		const nudge = buildNudge(event.prompt ?? "", skills);
		if (nudge) {
			event.systemPrompt += "\n\n" + nudge;
		}
	});
}

// ── CLI test harness ────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
	const prompt = process.argv.slice(2).join(" ") || "review this code architecture";
	const skills = loadSkills();
	console.log(`Loaded ${skills.length} skills.`);
	const nudge = buildNudge(prompt, skills);
	console.log(nudge);
}
