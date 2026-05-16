/**
 * PAI Project ISA — Ideal State Artifact per project (v6.2.0 twelve-section format)
 *
 * The ISA is the system of record for the thing being articulated. It lives at
 * `.pi/ISA.md` in the project root. The Algorithm reads it at OBSERVE, edits it
 * across phases, and the LEARN phase routes Decisions/Changelog/Verification
 * through the dedicated tools so the canonical shape is preserved.
 *
 * Twelve fixed sections (order matters): Problem, Vision, Out of Scope,
 * Principles, Constraints, Goal, Criteria, Test Strategy, Features, Decisions,
 * Changelog, Verification.
 *
 * IDs never re-number on edit. Splits become ISC-N.M, drops become tombstones.
 * Mark/append helpers look up by ID, never reorder.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";

const ISA_FILENAME = "ISA.md";
const ISA_DIR = ".pi";

export type EffortTier = "e1" | "e2" | "e3" | "e4" | "e5";

const TWELVE_SECTIONS = [
	"Problem",
	"Vision",
	"Out of Scope",
	"Principles",
	"Constraints",
	"Goal",
	"Criteria",
	"Test Strategy",
	"Features",
	"Decisions",
	"Changelog",
	"Verification",
] as const;

type SectionName = (typeof TWELVE_SECTIONS)[number];

const TIER_REQUIREMENTS: Record<EffortTier, SectionName[]> = {
	e1: ["Goal", "Criteria"],
	e2: ["Problem", "Goal", "Criteria", "Test Strategy"],
	e3: ["Problem", "Vision", "Out of Scope", "Constraints", "Goal", "Criteria", "Features", "Test Strategy"],
	e4: [...TWELVE_SECTIONS],
	e5: [...TWELVE_SECTIONS],
};

function isaPath(cwd: string): string {
	return join(cwd, ISA_DIR, ISA_FILENAME);
}

function nowISO(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ── Frontmatter parsing ──────────────────────────────────────────────────────
// Hand-rolled to avoid a YAML dependency. Supports the flat key:value shape
// used by ISA frontmatter — quoted strings stripped, no nested objects, no
// arrays. Order is preserved via the keys array.

interface Frontmatter {
	keys: string[];
	values: Record<string, string>;
}

function parseFrontmatter(content: string): { frontmatter: Frontmatter | null; body: string } {
	if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
		return { frontmatter: null, body: content };
	}
	const after = content.slice(content.indexOf("\n") + 1);
	const closeIdx = after.indexOf("\n---");
	if (closeIdx === -1) return { frontmatter: null, body: content };

	const block = after.slice(0, closeIdx);
	const rest = after.slice(closeIdx + 4);
	const body = rest.startsWith("\n") ? rest.slice(1) : rest;

	const fm: Frontmatter = { keys: [], values: {} };
	for (const rawLine of block.split("\n")) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const colon = line.indexOf(":");
		if (colon === -1) continue;
		const key = line.slice(0, colon).trim();
		let value = line.slice(colon + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		if (!fm.values[key]) fm.keys.push(key);
		fm.values[key] = value;
	}
	return { frontmatter: fm, body };
}

function stringifyFrontmatter(fm: Frontmatter): string {
	const lines = fm.keys.map((k) => `${k}: ${fm.values[k] ?? ""}`);
	return `---\n${lines.join("\n")}\n---\n`;
}

// ── Section parsing ──────────────────────────────────────────────────────────

interface Section {
	name: string;
	headerLine: string;
	startLine: number;
	endLine: number;
}

function parseSections(body: string): { lines: string[]; sections: Section[] } {
	const lines = body.split("\n");
	const sections: Section[] = [];
	let current: Section | null = null;
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(/^##\s+(.+?)\s*$/);
		if (m) {
			if (current) {
				current.endLine = i - 1;
				sections.push(current);
			}
			current = { name: m[1].trim(), headerLine: lines[i], startLine: i, endLine: lines.length - 1 };
		}
	}
	if (current) sections.push(current);
	return { lines, sections };
}

function sectionContent(lines: string[], section: Section): string {
	return lines.slice(section.startLine + 1, section.endLine + 1).join("\n");
}

function findSection(sections: Section[], name: SectionName | string): Section | null {
	return sections.find((s) => s.name === name) ?? null;
}

function hasNonCommentContent(content: string): boolean {
	for (const rawLine of content.split("\n")) {
		const line = rawLine.trim();
		if (!line) continue;
		if (line.startsWith("<!--") || line.startsWith("-->")) continue;
		if (line.startsWith("<!--") && line.endsWith("-->")) continue;
		if (/^<!--.*-->$/.test(line)) continue;
		return true;
	}
	return false;
}

// ── Public reads ─────────────────────────────────────────────────────────────

export function loadProjectISA(cwd: string): string | null {
	const path = isaPath(cwd);
	if (!existsSync(path)) return null;
	try {
		return readFileSync(path, "utf-8").trim();
	} catch {
		return null;
	}
}

export function buildISAContext(cwd: string): string | null {
	const content = loadProjectISA(cwd);
	if (!content) return null;
	return `
<project-isa path="${isaPath(cwd)}">
${content}
</project-isa>

The above is this project's Ideal State Artifact (ISA, v6.2.0 twelve-section format). During OBSERVE, check work against the Criteria. During EXECUTE, mark ISCs passed via the \`isa_mark_isc\` tool — never re-number IDs. During LEARN, append Decisions/Changelog/Verification via the dedicated tools so canonical shape is preserved.
`;
}

// ── Scaffold ─────────────────────────────────────────────────────────────────

export interface ScaffoldOptions {
	task?: string;
	slug?: string;
	effort?: EffortTier;
	projectName?: string;
}

export function scaffoldISA(cwd: string, opts: ScaffoldOptions = {}): string {
	const projectName = opts.projectName || basename(cwd);
	const task = opts.task || `${projectName} — initial articulation`;
	const slug = opts.slug || projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
	const effort: EffortTier = opts.effort || "e3";
	const now = nowISO();

	const fm: Frontmatter = {
		keys: ["task", "slug", "effort", "phase", "progress", "mode", "started", "updated", "project"],
		values: {
			task,
			slug,
			effort,
			phase: "observe",
			progress: "0/0",
			mode: "algorithm",
			started: now,
			updated: now,
			project: projectName,
		},
	};

	const body = `# ${projectName} — Ideal State Artifact

## Problem

<!-- What is broken or missing right now? Concrete, observable. -->


## Vision

<!-- What does euphoric surprise look like when this lands? -->


## Out of Scope

<!-- Anti-vision in prose: what is explicitly NOT included. -->


## Principles

<!-- Substrate-independent truths the work must respect. -->


## Constraints

<!-- Immovable architectural mandates. -->


## Goal

<!-- Hard-to-vary spine. 1-3 sentences naming verifiable done. -->


## Criteria

<!-- Atomic ISCs (one binary tool probe each). Format: - [ ] ISC-N: criterion text -->
<!-- Anti-criteria required: - [ ] ISC-N: Anti: <what must NOT happen> -->

- [ ] ISC-1:
- [ ] ISC-2:
- [ ] ISC-3: Anti:

## Test Strategy

<!-- Per-ISC verification. Columns: isc | type | check | threshold | tool -->

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|

## Features

<!-- Work breakdown. Columns: name | satisfies | depends_on | parallelizable -->

| name | satisfies | depends_on | parallelizable |
|------|-----------|------------|----------------|

## Decisions

<!-- Timestamped log incl. dead ends. \`refined:\` prefix for ISA refinements. -->

- ${now} — ISA scaffolded at tier ${effort}

## Changelog

<!-- Conjecture/refuted/learned/criterion-now blocks. Written at LEARN. -->

## Verification

<!-- Evidence per ISC. Format: ISC-N: [probe-type] — [evidence] -->

`;

	const dir = join(cwd, ISA_DIR);
	mkdirSync(dir, { recursive: true });
	const path = isaPath(cwd);
	writeFileSync(path, stringifyFrontmatter(fm) + body);
	return path;
}

// ── Frontmatter writes ───────────────────────────────────────────────────────

export function updateFrontmatter(
	isaPath: string,
	updates: Partial<Record<string, string>>,
): void {
	if (!existsSync(isaPath)) throw new Error(`ISA not found: ${isaPath}`);
	const content = readFileSync(isaPath, "utf-8");
	const { frontmatter, body } = parseFrontmatter(content);
	if (!frontmatter) throw new Error(`ISA missing frontmatter: ${isaPath}`);

	for (const [key, value] of Object.entries(updates)) {
		if (value === undefined) continue;
		if (!frontmatter.values[key]) frontmatter.keys.push(key);
		frontmatter.values[key] = String(value);
	}
	if (!updates.updated) {
		if (!frontmatter.values.updated) frontmatter.keys.push("updated");
		frontmatter.values.updated = nowISO();
	}

	writeFileSync(isaPath, stringifyFrontmatter(frontmatter) + body);
}

function refreshProgress(isaPath: string): void {
	const content = readFileSync(isaPath, "utf-8");
	const { frontmatter, body } = parseFrontmatter(content);
	if (!frontmatter) return;

	const { lines, sections } = parseSections(body);
	const criteria = findSection(sections, "Criteria");
	if (!criteria) return;

	let total = 0;
	let passed = 0;
	for (let i = criteria.startLine + 1; i <= criteria.endLine; i++) {
		const line = lines[i];
		if (/^- \[[ x]\]/.test(line)) {
			total++;
			if (/^- \[x\]/.test(line)) passed++;
		}
	}
	frontmatter.values.progress = `${passed}/${total}`;
	frontmatter.values.updated = nowISO();
	writeFileSync(isaPath, stringifyFrontmatter(frontmatter) + body);
}

// ── Section append helpers ───────────────────────────────────────────────────

function appendToSection(isaPath: string, sectionName: SectionName, blockLines: string[]): void {
	if (!existsSync(isaPath)) throw new Error(`ISA not found: ${isaPath}`);
	const content = readFileSync(isaPath, "utf-8");
	const { frontmatter, body } = parseFrontmatter(content);
	const { lines, sections } = parseSections(body);
	const section = findSection(sections, sectionName);
	if (!section) throw new Error(`Section not found: ${sectionName}`);

	const insertAt = section.endLine + 1;
	let trailingBlank = 0;
	for (let i = section.endLine; i > section.startLine; i--) {
		if (lines[i].trim() === "") trailingBlank++;
		else break;
	}
	const insertIdx = insertAt - trailingBlank;
	const newLines = [...lines.slice(0, insertIdx), ...blockLines, ...lines.slice(insertIdx)];
	const newBody = newLines.join("\n");

	if (frontmatter) {
		frontmatter.values.updated = nowISO();
		writeFileSync(isaPath, stringifyFrontmatter(frontmatter) + newBody);
	} else {
		writeFileSync(isaPath, newBody);
	}
}

export function appendDecision(
	isaPath: string,
	content: string,
	opts: { refined?: boolean } = {},
): void {
	const ts = nowISO();
	const prefix = opts.refined ? "refined: " : "";
	appendToSection(isaPath, "Decisions", [`- ${ts} — ${prefix}${content}`]);
}

export interface ChangelogEntry {
	conjectured: string;
	refuted_by: string;
	learned: string;
	criterion_now: string;
}

export function appendChangelogEntry(isaPath: string, entry: ChangelogEntry): void {
	for (const k of ["conjectured", "refuted_by", "learned", "criterion_now"] as const) {
		if (!entry[k] || !entry[k].trim()) {
			throw new Error(`Changelog entry refused: missing or empty '${k}'`);
		}
	}
	const ts = nowISO();
	const block = [
		`### ${ts}`,
		`- conjectured: ${entry.conjectured}`,
		`- refuted_by: ${entry.refuted_by}`,
		`- learned: ${entry.learned}`,
		`- criterion_now: ${entry.criterion_now}`,
		"",
	];
	appendToSection(isaPath, "Changelog", block);
}

export interface VerificationEntry {
	iscId: string;
	probeType: string;
	evidence: string;
}

export function appendVerification(isaPath: string, entry: VerificationEntry): void {
	const id = normalizeIscId(entry.iscId);
	const content = readFileSync(isaPath, "utf-8");
	const { body } = parseFrontmatter(content);
	const { lines, sections } = parseSections(body);
	const section = findSection(sections, "Verification");
	if (section) {
		for (let i = section.startLine + 1; i <= section.endLine; i++) {
			if (lines[i].startsWith(`${id}:`)) return;
		}
	}
	appendToSection(isaPath, "Verification", [`${id}: [${entry.probeType}] — ${entry.evidence}`]);
}

// ── ISC mark ─────────────────────────────────────────────────────────────────

function normalizeIscId(raw: string): string {
	const trimmed = raw.trim();
	if (/^ISC-/.test(trimmed)) return trimmed;
	if (/^\d/.test(trimmed)) return `ISC-${trimmed}`;
	return trimmed;
}

export function markISCPassed(isaPath: string, iscId: string, evidence?: string): void {
	if (!existsSync(isaPath)) throw new Error(`ISA not found: ${isaPath}`);
	const id = normalizeIscId(iscId);
	const content = readFileSync(isaPath, "utf-8");
	const { frontmatter, body } = parseFrontmatter(content);
	const { lines, sections } = parseSections(body);
	const criteria = findSection(sections, "Criteria");
	if (!criteria) throw new Error("ISA has no Criteria section");

	let found = false;
	let alreadyPassed = false;
	const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pendingRe = new RegExp(`^- \\[ \\] ${escapedId}:`);
	const passedRe = new RegExp(`^- \\[x\\] ${escapedId}:`);

	for (let i = criteria.startLine + 1; i <= criteria.endLine; i++) {
		if (pendingRe.test(lines[i])) {
			lines[i] = lines[i].replace(/^- \[ \]/, "- [x]");
			found = true;
			break;
		}
		if (passedRe.test(lines[i])) {
			alreadyPassed = true;
			break;
		}
	}

	if (!found && !alreadyPassed) {
		throw new Error(`ISC not found in Criteria: ${id}`);
	}

	if (found) {
		const newBody = lines.join("\n");
		if (frontmatter) {
			frontmatter.values.updated = nowISO();
			writeFileSync(isaPath, stringifyFrontmatter(frontmatter) + newBody);
		} else {
			writeFileSync(isaPath, newBody);
		}
	}

	if (evidence) {
		appendVerification(isaPath, { iscId: id, probeType: "tool-evidence", evidence });
	}

	refreshProgress(isaPath);
}

// ── Completeness check ───────────────────────────────────────────────────────

export interface CompletenessResult {
	passed: boolean;
	missing: string[];
}

const TIER_ISC_FLOOR: Record<EffortTier, number> = {
	e1: 0,
	e2: 16,
	e3: 32,
	e4: 128,
	e5: 256,
};

interface ISCStats {
	total: number;
	antiCount: number;
	antecedentCount: number;
}

function collectISCStats(content: string): ISCStats {
	const all = content.match(/^-\s*\[[ x]\]\s*ISC-[\w.]+:\s*(.+)$/gm) || [];
	let antiCount = 0;
	let antecedentCount = 0;
	for (const line of all) {
		const text = line.replace(/^-\s*\[[ x]\]\s*ISC-[\w.]+:\s*/, "");
		if (/^Anti:/i.test(text)) antiCount++;
		else if (/^Antecedent:/i.test(text)) antecedentCount++;
	}
	return { total: all.length, antiCount, antecedentCount };
}

export function checkCompleteness(isaPath: string, tier: EffortTier): CompletenessResult {
	if (!existsSync(isaPath)) {
		return { passed: false, missing: [`ISA file missing: ${isaPath}`] };
	}
	const content = readFileSync(isaPath, "utf-8");
	const { body } = parseFrontmatter(content);
	const { lines, sections } = parseSections(body);

	const required = TIER_REQUIREMENTS[tier];
	const missing: string[] = [];
	for (const name of required) {
		const section = findSection(sections, name);
		if (!section) {
			missing.push(`missing section: ${name}`);
			continue;
		}
		const sectionText = sectionContent(lines, section);
		if (!hasNonCommentContent(sectionText)) {
			missing.push(`empty section: ${name}`);
		}
	}

	const stats = collectISCStats(body);
	const floor = TIER_ISC_FLOOR[tier];
	if (floor > 0 && stats.total < floor) {
		missing.push(
			`ISC count below tier floor: ${stats.total}/${floor} (${tier.toUpperCase()})`,
		);
	}
	if (tier !== "e1" && stats.antiCount === 0) {
		missing.push("no anti-criterion present (≥1 Anti: ISC required at E2+)");
	}

	return { passed: missing.length === 0, missing };
}

// ── Pi tool registrations ────────────────────────────────────────────────────

function ok(text: string, details: Record<string, unknown> = {}) {
	return { content: [{ type: "text" as const, text }], details };
}

function err(text: string) {
	return { content: [{ type: "text" as const, text }], details: { error: true } };
}

export function registerISA(pi: ExtensionAPI) {
	pi.registerTool({
		name: "isa_scaffold",
		label: "ISA Scaffold",
		description: "Scaffold a twelve-section ISA at <cwd>/.pi/ISA.md (v6.2.0 format)",
		parameters: Type.Object({
			cwd: Type.String({ description: "Project root (absolute path)" }),
			task: Type.Optional(Type.String({ description: "8-word task description" })),
			slug: Type.Optional(Type.String({ description: "kebab-case slug" })),
			effort: Type.Optional(Type.String({ description: "e1|e2|e3|e4|e5 (default e3)" })),
			projectName: Type.Optional(Type.String({ description: "Display name (default: basename of cwd)" })),
		}),
		async execute(_id, params) {
			try {
				if (existsSync(isaPath(params.cwd))) {
					return err(`ISA already exists: ${isaPath(params.cwd)}`);
				}
				const path = scaffoldISA(params.cwd, {
					task: params.task,
					slug: params.slug,
					effort: params.effort as EffortTier | undefined,
					projectName: params.projectName,
				});
				return ok(`ISA scaffolded: ${path}`, { path });
			} catch (e) {
				return err(`isa_scaffold failed: ${(e as Error).message}`);
			}
		},
		promptSnippet: "isa_scaffold - Create twelve-section ISA at .pi/ISA.md",
		promptGuidelines: [
			"At OBSERVE for E2+ tasks, scaffold the ISA before defining ISCs. Pass effort tier explicitly. The scaffold writes frontmatter and all twelve section headers — fill them via direct Edit through the phases.",
		],
	});

	pi.registerTool({
		name: "isa_append_decision",
		label: "ISA Decision",
		description: "Append a timestamped entry to the ISA Decisions section",
		parameters: Type.Object({
			isa_path: Type.String({ description: "Absolute path to the ISA file" }),
			content: Type.String({ description: "Decision text" }),
			refined: Type.Optional(Type.Boolean({ description: "True if this is an ISA refinement (adds 'refined:' prefix)" })),
		}),
		async execute(_id, params) {
			try {
				appendDecision(params.isa_path, params.content, { refined: params.refined });
				return ok(`Decision appended to ${params.isa_path}`);
			} catch (e) {
				return err(`isa_append_decision failed: ${(e as Error).message}`);
			}
		},
		promptSnippet: "isa_append_decision - Append timestamped decision to ISA",
		promptGuidelines: [
			"Use at any phase to log significant decisions, dead ends, or ISA refinements. Set refined=true when the decision is a refinement of the ISA itself (e.g. an ISC was split). The tool writes a canonical timestamped entry — never edit the Decisions section manually.",
		],
	});

	pi.registerTool({
		name: "isa_append_changelog",
		label: "ISA Changelog",
		description: "Append a Deutsch conjecture/refutation/learning entry to the Changelog (LEARN phase)",
		parameters: Type.Object({
			isa_path: Type.String({ description: "Absolute path to the ISA file" }),
			conjectured: Type.String({ description: "What we initially believed" }),
			refuted_by: Type.String({ description: "What evidence/probe refuted it" }),
			learned: Type.String({ description: "Crystallized learning" }),
			criterion_now: Type.String({ description: "How the criterion or ISA state changes as a result" }),
		}),
		async execute(_id, params) {
			try {
				appendChangelogEntry(params.isa_path, {
					conjectured: params.conjectured,
					refuted_by: params.refuted_by,
					learned: params.learned,
					criterion_now: params.criterion_now,
				});
				return ok(`Changelog entry appended to ${params.isa_path}`);
			} catch (e) {
				return err(`isa_append_changelog failed: ${(e as Error).message}`);
			}
		},
		promptSnippet: "isa_append_changelog - Append C/R/L block to ISA Changelog",
		promptGuidelines: [
			"Use at LEARN when structural understanding evolved during the run. All four fields are required; partial entries are refused. The format is the canonical Deutsch conjecture/refutation/learning shape — preserves the trail across runs.",
		],
	});

	pi.registerTool({
		name: "isa_mark_isc",
		label: "ISA Mark ISC",
		description: "Toggle an ISC from [ ] to [x] in Criteria. Optionally append Verification evidence and refresh progress.",
		parameters: Type.Object({
			isa_path: Type.String({ description: "Absolute path to the ISA file" }),
			isc_id: Type.String({ description: "ISC identifier — 'ISC-3', 'ISC-3.1', or just '3'" }),
			evidence: Type.Optional(Type.String({ description: "One-line evidence for Verification section" })),
		}),
		async execute(_id, params) {
			try {
				markISCPassed(params.isa_path, params.isc_id, params.evidence);
				return ok(`Marked ${normalizeIscId(params.isc_id)} passed in ${params.isa_path}`);
			} catch (e) {
				return err(`isa_mark_isc failed: ${(e as Error).message}`);
			}
		},
		promptSnippet: "isa_mark_isc - Mark an ISC passed and record verification evidence",
		promptGuidelines: [
			"Call this at EXECUTE the moment a criterion is verified — same or immediately following tool block as the verification probe. Pass evidence (1-line summary of probe output) so the Verification section stays in sync. Idempotent: calling twice on the same ID is a no-op.",
		],
	});

	pi.registerTool({
		name: "isa_check_completeness",
		label: "ISA Completeness",
		description: "Report missing or empty required sections per tier (E1: Goal+Criteria; E3: 8 sections; E4/E5: all twelve)",
		parameters: Type.Object({
			isa_path: Type.String({ description: "Absolute path to the ISA file" }),
			tier: Type.String({ description: "e1|e2|e3|e4|e5" }),
		}),
		async execute(_id, params) {
			try {
				const result = checkCompleteness(params.isa_path, params.tier as EffortTier);
				const text = result.passed
					? `Completeness PASS at ${params.tier} — all required sections populated`
					: `Completeness FAIL at ${params.tier}:\n  - ${result.missing.join("\n  - ")}`;
				return ok(text, { ...result });
			} catch (e) {
				return err(`isa_check_completeness failed: ${(e as Error).message}`);
			}
		},
		promptSnippet: "isa_check_completeness - Verify required ISA sections per tier",
		promptGuidelines: [
			"Call at OBSERVE end and again before declaring phase: complete. Blocks completion if any required section is missing or empty. A section counts as present iff it has at least one non-comment, non-blank line.",
		],
	});

	pi.registerTool({
		name: "isa_update_frontmatter",
		label: "ISA Frontmatter",
		description: "Surgical update of ISA frontmatter (phase, progress, etc.) — preserves key order",
		parameters: Type.Object({
			isa_path: Type.String({ description: "Absolute path to the ISA file" }),
			updates: Type.Record(Type.String(), Type.String(), {
				description: "Key-value pairs to write (phase, progress, mode, ...)",
			}),
		}),
		async execute(_id, params) {
			try {
				updateFrontmatter(params.isa_path, params.updates);
				return ok(`Frontmatter updated in ${params.isa_path}`);
			} catch (e) {
				return err(`isa_update_frontmatter failed: ${(e as Error).message}`);
			}
		},
		promptSnippet: "isa_update_frontmatter - Update ISA frontmatter fields",
		promptGuidelines: [
			"Use to drive phase transitions (phase: observe → think → plan → ...) and progress updates. Only touches the frontmatter; body sections stay intact. Set updated automatically when called.",
		],
	});

	pi.registerCommand("isa", {
		description: "Project ISA — scaffold, view, check, manage Ideal State Artifact",
		handler: async (args, ctx) => {
			const raw = (args || "").trim();
			const [verb, ...rest] = raw.split(/\s+/);
			const sub = (verb || "").toLowerCase();
			const cwd = ctx.cwd;
			const path = isaPath(cwd);

			if (!sub || sub === "view" || sub === "show") {
				const content = loadProjectISA(cwd);
				if (!content) {
					ctx.ui.notify("No ISA found. Run /isa init to create one.", "warning");
				} else {
					ctx.ui.notify(`ISA: ${path} (${content.split("\n").length} lines)`, "info");
				}
				return;
			}

			if (sub === "init" || sub === "scaffold") {
				if (existsSync(path)) {
					ctx.ui.notify("ISA already exists. Delete .pi/ISA.md first to re-scaffold.", "warning");
					return;
				}
				const slug = rest[0];
				const created = scaffoldISA(cwd, { slug });
				ctx.ui.notify(`ISA created at ${created}`, "info");
				return;
			}

			if (sub === "path") {
				ctx.ui.notify(path, "info");
				return;
			}

			if (sub === "check") {
				if (!existsSync(path)) {
					ctx.ui.notify("No ISA found. Run /isa init first.", "warning");
					return;
				}
				const tier = (rest[0] || "e3").toLowerCase() as EffortTier;
				if (!["e1", "e2", "e3", "e4", "e5"].includes(tier)) {
					ctx.ui.notify(`Invalid tier: ${tier}. Use e1|e2|e3|e4|e5.`, "warning");
					return;
				}
				const result = checkCompleteness(path, tier);
				if (result.passed) {
					ctx.ui.notify(`ISA completeness PASS at ${tier.toUpperCase()}`, "info");
				} else {
					ctx.ui.notify(
						`ISA completeness FAIL at ${tier.toUpperCase()}: ${result.missing.join("; ")}`,
						"warning",
					);
				}
				return;
			}

			if (sub === "phase") {
				if (!existsSync(path)) {
					ctx.ui.notify("No ISA found. Run /isa init first.", "warning");
					return;
				}
				const phase = rest[0];
				const allowed = ["observe", "think", "plan", "build", "execute", "verify", "learn", "complete"];
				if (!phase || !allowed.includes(phase)) {
					ctx.ui.notify(`Usage: /isa phase <${allowed.join("|")}>`, "warning");
					return;
				}
				updateFrontmatter(path, { phase });
				ctx.ui.notify(`ISA phase → ${phase}`, "info");
				return;
			}

			ctx.ui.notify(
				"Usage: /isa [view|init [slug]|path|check [tier]|phase <new>]",
				"warning",
			);
		},
	});
}
