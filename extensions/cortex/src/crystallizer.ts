import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Paths ──────────────────────────────────────────────────────────────────

const SKILLS_DIR = join(homedir(), ".pi", "skills");

// ── Types ──────────────────────────────────────────────────────────────────

export interface CrystallizeParams {
	name: string;
	description: string;
	workflow: string;
	references?: Array<{ filename: string; content: string }>;
}

export interface CrystallizeResult {
	skillDir: string;
	files: string[];
	alreadyExisted: boolean;
	qualityWarnings: string[];
}

export interface QualityReport {
	passed: boolean;
	errors: string[];
	warnings: string[];
	score: number;
}

// ── Quality Gates ──────────────────────────────────────────────────────────

/**
 * Validate a skill before writing. Returns errors (blocking) and warnings (advisory).
 */
export function validateSkill(params: CrystallizeParams): QualityReport {
	const errors: string[] = [];
	const warnings: string[] = [];

	// ── Name validation (blocking) ──
	if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(params.name)) {
		errors.push(`Name must be kebab-case (a-z, 0-9, hyphens, no leading/trailing/consecutive hyphens): "${params.name}"`);
	}
	if (params.name.length > 64) {
		errors.push(`Name exceeds 64 chars (${params.name.length})`);
	}

	// ── Description validation (blocking) ──
	if (!params.description.toLowerCase().startsWith("use when")) {
		errors.push(`Description must start with "Use when...": "${params.description.slice(0, 50)}"`);
	}
	if (params.description.length > 1024) {
		errors.push(`Description exceeds 1024 chars (${params.description.length})`);
	}
	if (params.description.length < 20) {
		errors.push(`Description too short (${params.description.length} chars) — be specific about triggers`);
	}

	// ── Workflow validation (warnings) ──
	const lines = params.workflow.split("\n");
	const wordCount = params.workflow.split(/\s+/).length;

	if (lines.length > 500) {
		warnings.push(`Body exceeds 500 lines (${lines.length}) — consider moving detail to references/`);
	}
	if (wordCount > 5000) {
		warnings.push(`Body exceeds 5000 words (${wordCount}) — too verbose for on-demand loading`);
	}
	if (wordCount < 20) {
		warnings.push(`Body very short (${wordCount} words) — may lack actionable guidance`);
	}

	// Check for structural elements
	const hasHeading = /^##?\s/.test(params.workflow) || /\n##?\s/.test(params.workflow);
	if (!hasHeading) {
		warnings.push("No headings found — add ## sections for scannability");
	}

	const hasWhenToUse = /when to use/i.test(params.workflow);
	if (!hasWhenToUse) {
		warnings.push('Missing "When to Use" section — helps LLM decide when to load this skill');
	}

	// Check for anti-patterns
	if (/^(here|this|the following)/im.test(params.workflow)) {
		warnings.push("Starts with narrative filler — use imperative voice (do X, then Y)");
	}
	if (/README|CHANGELOG|license/i.test(params.workflow)) {
		warnings.push("Contains README/CHANGELOG references — skills shouldn't include meta-docs");
	}

	// Check for red flags section
	const hasRedFlags = /red flag/i.test(params.workflow) || /common mistake/i.test(params.workflow);
	if (!hasRedFlags) {
		warnings.push('No "Red Flags" or "Common Mistakes" section — consider adding discipline checks');
	}

	// Score: 0-100
	let score = 100;
	score -= errors.length * 25;
	score -= warnings.length * 8;
	score = Math.max(0, Math.min(100, score));

	return {
		passed: errors.length === 0,
		errors,
		warnings,
		score,
	};
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Create a skill from a workflow pattern.
 * Runs quality gates before writing. Errors block creation; warnings are returned.
 * Writes SKILL.md (+ optional references/) to ~/.pi/skills/<name>/
 */
export async function crystallize(params: CrystallizeParams): Promise<CrystallizeResult> {
	const { name, description, workflow, references } = params;

	// Run quality gates
	const quality = validateSkill(params);

	if (!quality.passed) {
		const errorList = quality.errors.map(e => `  ✗ ${e}`).join("\n");
		throw new Error(`Quality gate failed (score: ${quality.score}%):\n${errorList}`);
	}

	const skillDir = join(SKILLS_DIR, name);
	const alreadyExisted = existsSync(skillDir);

	// Create directory
	await mkdir(skillDir, { recursive: true });

	const files: string[] = [];

	// Write SKILL.md
	const skillMd = buildSkillMd(name, description, workflow, references);
	const skillPath = join(skillDir, "SKILL.md");
	await writeFile(skillPath, skillMd);
	files.push("SKILL.md");

	// Write references if provided
	if (references && references.length > 0) {
		const refsDir = join(skillDir, "references");
		await mkdir(refsDir, { recursive: true });

		for (const ref of references) {
			const refPath = join(refsDir, ref.filename);
			await writeFile(refPath, ref.content);
			files.push(`references/${ref.filename}`);
		}
	}

	return { skillDir, files, alreadyExisted, qualityWarnings: quality.warnings };
}

// ── Template ───────────────────────────────────────────────────────────────

function buildSkillMd(
	name: string,
	description: string,
	workflow: string,
	references?: Array<{ filename: string; content: string }>,
): string {
	const parts: string[] = [];

	// Frontmatter
	parts.push(`---`);
	parts.push(`name: ${name}`);
	parts.push(`description: "${escapeYaml(description)}"`);
	parts.push(`---`);
	parts.push(``);

	// Title
	const title = name
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
	parts.push(`# ${title}`);
	parts.push(``);

	// Workflow
	parts.push(workflow);

	// References section
	if (references && references.length > 0) {
		parts.push(``);
		parts.push(`## References`);
		parts.push(``);
		for (const ref of references) {
			parts.push(`- [${ref.filename}](references/${ref.filename})`);
		}
	}

	// Auto-generated footer
	parts.push(``);
	parts.push(`---`);
	parts.push(`*Crystallized by Cortex on ${new Date().toISOString().split("T")[0]}*`);
	parts.push(``);

	return parts.join("\n");
}

function escapeYaml(s: string): string {
	return s.replace(/"/g, '\\"');
}
