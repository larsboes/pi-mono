import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Paths ──────────────────────────────────────────────────────────────────

const HOME = homedir();
const CORTEX_DIR = join(HOME, ".pi", "memory", "cortex");
const CAPABILITIES_FILE = join(CORTEX_DIR, "CAPABILITIES.md");
const SKILLS_DIR = join(HOME, ".pi", "skills");

// ── Types ──────────────────────────────────────────────────────────────────

interface ToolUsage {
	count: number;
	lastUsed: string;
}

interface CapabilityData {
	toolUsage: Record<string, ToolUsage>;
	skillsAvailable: string[];
	domainsEncountered: string[];
	errorsObserved: Array<{ tool: string; error: string; timestamp: string }>;
	lastUpdated: string;
}

// ── State ──────────────────────────────────────────────────────────────────

const CAPABILITY_JSON = join(CORTEX_DIR, "capabilities.json");

async function loadData(): Promise<CapabilityData> {
	if (!existsSync(CORTEX_DIR)) await mkdir(CORTEX_DIR, { recursive: true });

	if (existsSync(CAPABILITY_JSON)) {
		try {
			return JSON.parse(await readFile(CAPABILITY_JSON, "utf-8")) as CapabilityData;
		} catch {
			// Corrupt — reset
		}
	}

	return {
		toolUsage: {},
		skillsAvailable: [],
		domainsEncountered: [],
		errorsObserved: [],
		lastUpdated: new Date().toISOString(),
	};
}

async function saveData(data: CapabilityData): Promise<void> {
	data.lastUpdated = new Date().toISOString();
	await writeFile(CAPABILITY_JSON, JSON.stringify(data, null, 2));
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Record tool usage from a completed agent loop.
 * Extracts tool names and errors from messages.
 */
export async function recordUsage(messages: unknown[]): Promise<void> {
	const data = await loadData();
	const now = new Date().toISOString();

	for (const msg of messages) {
		const m = msg as { role?: string; content?: unknown[] };

		// Track tool calls from assistant messages
		// Pi uses { type: "toolCall", name: "..." } (not Anthropic's "tool_use")
		if (m.role === "assistant" && Array.isArray(m.content)) {
			for (const block of m.content) {
				const b = block as { type?: string; name?: string };
				if (b.type === "toolCall" && b.name) {
					if (!data.toolUsage[b.name]) {
						data.toolUsage[b.name] = { count: 0, lastUsed: now };
					}
					data.toolUsage[b.name].count++;
					data.toolUsage[b.name].lastUsed = now;
				}
			}
		}

		// Track errors from tool results
		// Pi uses role: "toolResult" with isError (not role: "tool" with is_error)
		if (m.role === "toolResult") {
			const tr = msg as { role: string; toolName?: string; isError?: boolean; content?: unknown[] };
			if (tr.isError && Array.isArray(tr.content)) {
				const errorText = tr.content
					.filter((b: any) => b.type === "text")
					.map((b: any) => b.text)
					.join("\n")
					.slice(0, 200);
				if (errorText) {
					data.errorsObserved.push({
						tool: tr.toolName ?? "unknown",
						error: errorText,
						timestamp: now,
					});
					// Keep only last 50 errors
					if (data.errorsObserved.length > 50) {
						data.errorsObserved = data.errorsObserved.slice(-50);
					}
				}
			}
		}
	}

	await saveData(data);
}

/**
 * Scan available skills and update the inventory.
 */
export async function refreshSkills(): Promise<string[]> {
	const data = await loadData();

	const skills: string[] = [];
	if (existsSync(SKILLS_DIR)) {
		for (const entry of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
			if (entry.isDirectory() && existsSync(join(SKILLS_DIR, entry.name, "SKILL.md"))) {
				skills.push(entry.name);
			}
		}
	}

	data.skillsAvailable = skills;
	await saveData(data);
	await generateMarkdown(data);

	return skills;
}

/**
 * Query capabilities by aspect.
 */
export async function query(
	aspect?: string,
): Promise<string> {
	const data = await loadData();

	// Refresh skills on every query
	if (existsSync(SKILLS_DIR)) {
		data.skillsAvailable = [];
		for (const entry of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
			if (entry.isDirectory() && existsSync(join(SKILLS_DIR, entry.name, "SKILL.md"))) {
				data.skillsAvailable.push(entry.name);
			}
		}
	}

	switch (aspect?.toLowerCase()) {
		case "tools": {
			const entries = Object.entries(data.toolUsage).sort(([, a], [, b]) => b.count - a.count);
			if (entries.length === 0) return "No tool usage recorded yet.";
			return entries
				.map(([name, usage]) => `${name}: ${usage.count}× (last: ${usage.lastUsed.split("T")[0]})`)
				.join("\n");
		}
		case "skills":
			if (data.skillsAvailable.length === 0) return "No skills found.";
			return `Available skills (${data.skillsAvailable.length}):\n${data.skillsAvailable.map((s) => `- ${s}`).join("\n")}`;

		case "errors":
		case "gaps": {
			if (data.errorsObserved.length === 0) return "No errors recorded.";
			const recent = data.errorsObserved.slice(-10);
			return `Recent errors (${recent.length}):\n${recent.map((e) => `- [${e.timestamp.split("T")[0]}] ${e.error.slice(0, 100)}`).join("\n")}`;
		}

		default: {
			// Overview
			const toolCount = Object.keys(data.toolUsage).length;
			const topTools = Object.entries(data.toolUsage)
				.sort(([, a], [, b]) => b.count - a.count)
				.slice(0, 5)
				.map(([name, u]) => `${name} (${u.count}×)`)
				.join(", ");

			const lines = [
				`## Capability Overview`,
				``,
				`**Tools used:** ${toolCount} unique${topTools ? ` — top: ${topTools}` : ""}`,
				`**Skills available:** ${data.skillsAvailable.length} (${data.skillsAvailable.join(", ")})`,
				`**Errors recorded:** ${data.errorsObserved.length}`,
				`**Last updated:** ${data.lastUpdated}`,
			];

			return lines.join("\n");
		}
	}
}

// ── Markdown Generation ────────────────────────────────────────────────────

async function generateMarkdown(data: CapabilityData): Promise<void> {
	const lines: string[] = [];
	lines.push("# Capabilities Inventory");
	lines.push("");
	lines.push(`*Auto-generated by Cortex — ${data.lastUpdated}*`);
	lines.push("");

	// Tools
	lines.push("## Tools Used");
	lines.push("");
	const toolEntries = Object.entries(data.toolUsage).sort(([, a], [, b]) => b.count - a.count);
	if (toolEntries.length > 0) {
		lines.push("| Tool | Count | Last Used |");
		lines.push("|------|-------|-----------|");
		for (const [name, usage] of toolEntries) {
			lines.push(`| ${name} | ${usage.count} | ${usage.lastUsed.split("T")[0]} |`);
		}
	} else {
		lines.push("No tool usage recorded yet.");
	}
	lines.push("");

	// Skills
	lines.push("## Skills Available");
	lines.push("");
	if (data.skillsAvailable.length > 0) {
		for (const s of data.skillsAvailable) {
			lines.push(`- ${s}`);
		}
	} else {
		lines.push("No skills found.");
	}
	lines.push("");

	// Recent Errors
	if (data.errorsObserved.length > 0) {
		lines.push("## Recent Errors");
		lines.push("");
		for (const e of data.errorsObserved.slice(-10)) {
			lines.push(`- [${e.timestamp.split("T")[0]}] ${e.error.slice(0, 100)}`);
		}
		lines.push("");
	}

	await writeFile(CAPABILITIES_FILE, lines.join("\n"));
}
