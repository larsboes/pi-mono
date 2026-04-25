/**
 * Brief — parsing, validation, selection
 */
import * as fs from "node:fs";
import * as path from "node:path";

export interface Brief {
	title: string;
	raw: string;
	contextFiles: string[];
	dir: string;
}

export function parseBrief(raw: string): { title: string; sections: Record<string, string> } {
	const sections: Record<string, string> = {};
	let currentSection = "";
	let title = "";

	for (const line of raw.split("\n")) {
		const trimmed = line.trimStart();
		if (trimmed.startsWith("## ")) {
			currentSection = trimmed.slice(3).trim().toLowerCase();
			sections[currentSection] = "";
		} else if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
			title = trimmed.slice(2).trim();
		} else if (currentSection) {
			sections[currentSection] += line + "\n";
		}
	}

	const fmMatch = raw.match(/^---\n[\s\S]*?title:\s*"?([^"\n]+)"?\n[\s\S]*?---/);
	if (fmMatch) title = fmMatch[1];

	return { title: title || "Untitled Brief", sections };
}

export function validateBrief(raw: string, requiredSections: string[]): string[] {
	const { sections } = parseBrief(raw);
	const missing: string[] = [];
	for (const req of requiredSections) {
		const found = Object.keys(sections).some((k) => k.includes(req.toLowerCase()));
		if (!found) missing.push(req);
	}
	return missing;
}

export function loadBrief(briefDir: string): Brief {
	const briefPath = path.join(briefDir, "brief.md");
	if (!fs.existsSync(briefPath)) throw new Error(`No brief.md in ${briefDir}`);

	const raw = fs.readFileSync(briefPath, "utf-8");
	const { title } = parseBrief(raw);

	// Load context files (everything in the dir except brief.md)
	const contextFiles: string[] = [];
	const contextDir = path.join(briefDir, "context");
	if (fs.existsSync(contextDir)) {
		for (const f of fs.readdirSync(contextDir)) {
			contextFiles.push(fs.readFileSync(path.join(contextDir, f), "utf-8"));
		}
	}

	return { title, raw, contextFiles, dir: briefDir };
}

export function listBriefs(briefsDir: string): Array<{ name: string; path: string }> {
	if (!fs.existsSync(briefsDir)) return [];
	return fs
		.readdirSync(briefsDir)
		.filter((d) => fs.existsSync(path.join(briefsDir, d, "brief.md")))
		.sort()
		.reverse()
		.map((d) => ({ name: d, path: path.join(briefsDir, d) }));
}

export function saveBrief(briefsDir: string, title: string, content: string): string {
	const datePrefix = new Date().toISOString().split("T")[0];
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.slice(0, 40);
	const dir = path.join(briefsDir, `${datePrefix}-${slug}`);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "brief.md"), content);
	return dir;
}
