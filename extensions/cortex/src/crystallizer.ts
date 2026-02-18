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
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Create a skill from a workflow pattern.
 * Writes SKILL.md (+ optional references/) to ~/.pi/skills/<name>/
 */
export async function crystallize(params: CrystallizeParams): Promise<CrystallizeResult> {
	const { name, description, workflow, references } = params;

	// Validate name
	if (!/^[a-z0-9-]+$/.test(name)) {
		throw new Error(`Skill name must be kebab-case: "${name}"`);
	}

	// Validate description
	if (!description.toLowerCase().startsWith("use when")) {
		throw new Error(`Skill description must start with "Use when...": "${description}"`);
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

	return { skillDir, files, alreadyExisted };
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
