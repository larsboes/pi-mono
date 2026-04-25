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
		const t = line.trimStart();
		if (t.startsWith("## ")) { currentSection = t.slice(3).trim().toLowerCase(); sections[currentSection] = ""; }
		else if (t.startsWith("# ") && !t.startsWith("## ")) { title = t.slice(2).trim(); }
		else if (currentSection) { sections[currentSection] += line + "\n"; }
	}
	const fm = raw.match(/^---\n[\s\S]*?title:\s*"?([^"\n]+)"?\n[\s\S]*?---/);
	if (fm) title = fm[1];
	return { title: title || "Untitled Brief", sections };
}

export function validateBrief(raw: string, requiredSections: string[]): string[] {
	const { sections } = parseBrief(raw);
	return requiredSections.filter(req => !Object.keys(sections).some(k => k.includes(req.toLowerCase())));
}

export function loadBrief(briefDir: string): Brief {
	const briefPath = path.join(briefDir, "brief.md");
	if (!fs.existsSync(briefPath)) throw new Error(`No brief.md in ${briefDir}`);
	const raw = fs.readFileSync(briefPath, "utf-8");
	const { title } = parseBrief(raw);
	const contextFiles: string[] = [];
	const contextDir = path.join(briefDir, "context");
	if (fs.existsSync(contextDir)) {
		for (const f of fs.readdirSync(contextDir)) contextFiles.push(fs.readFileSync(path.join(contextDir, f), "utf-8"));
	}
	return { title, raw, contextFiles, dir: briefDir };
}

export function listBriefs(briefsDir: string): Array<{ name: string; path: string }> {
	if (!fs.existsSync(briefsDir)) return [];
	return fs.readdirSync(briefsDir)
		.filter(d => fs.existsSync(path.join(briefsDir, d, "brief.md")))
		.sort().reverse()
		.map(d => ({ name: d, path: path.join(briefsDir, d) }));
}

export function saveBrief(briefsDir: string, title: string, content: string): string {
	const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
	const dir = path.join(briefsDir, `${new Date().toISOString().split("T")[0]}-${slug}`);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "brief.md"), content);
	return dir;
}
