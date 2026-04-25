/**
 * Agent persona loader — reads .md files with frontmatter
 */
import * as fs from "node:fs";

export interface AgentPersona {
	name: string;
	description: string;
	model: string;
	color: string;
	systemPrompt: string;
}

function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
	const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return { meta: {}, body: content };
	const meta: Record<string, string> = {};
	for (const line of match[1].split("\n")) {
		const i = line.indexOf(":");
		if (i > 0) {
			meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
		}
	}
	return { meta, body: match[2] };
}

export function loadPersona(filePath: string, fallbackName: string, fallbackColor: string): AgentPersona {
	if (!fs.existsSync(filePath)) {
		return {
			name: fallbackName,
			description: `${fallbackName} board member`,
			model: "anthropic/claude-sonnet-4-20250514",
			color: fallbackColor,
			systemPrompt: `You are ${fallbackName}, an advisory board member.`,
		};
	}
	const { meta, body } = parseFrontmatter(fs.readFileSync(filePath, "utf-8"));
	return {
		name: meta.name || fallbackName,
		description: meta.description || `${fallbackName} board member`,
		model: meta.model || "anthropic/claude-sonnet-4-20250514",
		color: meta.color || fallbackColor,
		systemPrompt: body.trim(),
	};
}

export function loadExpertise(filePath: string | undefined, baseDir: string): string {
	if (!filePath) return "";
	const resolved = filePath.startsWith("/") ? filePath : `${baseDir}/${filePath}`;
	if (!fs.existsSync(resolved)) return "";
	return fs.readFileSync(resolved, "utf-8");
}

export function loadSkills(skillPaths: string[] | undefined, baseDir: string): string {
	if (!skillPaths || skillPaths.length === 0) return "";
	const blocks: string[] = [];
	for (const sp of skillPaths) {
		const resolved = sp.startsWith("/") ? sp : `${baseDir}/${sp}`;
		if (fs.existsSync(resolved)) {
			const content = fs.readFileSync(resolved, "utf-8");
			// Strip frontmatter from skill
			const { body } = parseFrontmatter(content);
			blocks.push(body.trim());
		}
	}
	return blocks.length > 0 ? blocks.join("\n\n---\n\n") : "";
}
