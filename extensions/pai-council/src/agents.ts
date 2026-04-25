/**
 * Agent persona loading — reads .md files with frontmatter for council members
 */

import * as fs from "node:fs";

export interface AgentPersona {
	name: string;
	description: string;
	model: string;
	color: string;
	systemPrompt: string;
}

/**
 * Parse simple YAML frontmatter from markdown. Returns { meta, body }.
 */
function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
	const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return { meta: {}, body: content };

	const meta: Record<string, string> = {};
	for (const line of match[1].split("\n")) {
		const colonIdx = line.indexOf(":");
		if (colonIdx > 0) {
			const key = line.slice(0, colonIdx).trim();
			const val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
			meta[key] = val;
		}
	}
	return { meta, body: match[2] };
}

export function loadAgentPersona(filePath: string, fallbackName: string, fallbackColor: string): AgentPersona {
	if (!fs.existsSync(filePath)) {
		return {
			name: fallbackName,
			description: `${fallbackName} council member`,
			model: "anthropic/claude-sonnet-4-20250514",
			color: fallbackColor,
			systemPrompt: `You are ${fallbackName}, a council member providing your expert perspective.`,
		};
	}

	const content = fs.readFileSync(filePath, "utf-8");
	const { meta, body } = parseFrontmatter(content);

	return {
		name: meta.name || fallbackName,
		description: meta.description || `${fallbackName} council member`,
		model: meta.model || "anthropic/claude-sonnet-4-20250514",
		color: meta.color || fallbackColor,
		systemPrompt: body.trim(),
	};
}
