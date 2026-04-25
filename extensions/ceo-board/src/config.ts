/**
 * Config — loads and validates config.yaml
 */
import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";

export interface BoardMemberConfig {
	name: string;
	path: string;
	model: string;
	color: string;
	expertise?: string;
	skills?: string[];
}

export interface CeoConfig {
	name: string;
	path: string;
	model: string;
	color: string;
	expertise?: string;
	skills?: string[];
}

export interface Config {
	meeting: {
		constraints: {
			max_time_minutes: number;
			max_budget: number;
			rounds_hint: number;
		};
		editor: string;
		brief_required_sections: string[];
	};
	paths: {
		briefs: string;
		deliberations: string;
		memos: string;
		agents: string;
		expertise: string;
		skills: string;
	};
	ceo: CeoConfig;
	board: BoardMemberConfig[];
}

function parseBudget(val: unknown): number {
	if (typeof val === "number") return val;
	if (typeof val === "string") return parseFloat(val.replace(/[$€]/g, "")) || 5;
	return 5;
}

export function loadConfig(baseDir: string): Config {
	const configPath = path.join(baseDir, "config.yaml");
	if (!fs.existsSync(configPath)) throw new Error(`Config not found: ${configPath}`);

	const raw = fs.readFileSync(configPath, "utf-8");
	const p = yaml.load(raw) as Record<string, any>;
	if (!p || typeof p !== "object") throw new Error("Invalid config.yaml");

	const meeting = p.meeting ?? {};
	const constraints = meeting.constraints ?? {};

	return {
		meeting: {
			constraints: {
				max_time_minutes: constraints.max_time_minutes ?? 5,
				max_budget: parseBudget(constraints.max_budget ?? 5),
				rounds_hint: constraints.rounds_hint ?? 3,
			},
			editor: meeting.editor ?? "code",
			brief_required_sections: meeting.brief_required_sections ?? ["situation", "stakes", "constraints", "key question"],
		},
		paths: {
			briefs: p.paths?.briefs ?? ".pi/ceo-board/briefs/",
			deliberations: p.paths?.deliberations ?? ".pi/ceo-board/deliberations/",
			memos: p.paths?.memos ?? ".pi/ceo-board/memos/",
			agents: p.paths?.agents ?? ".pi/ceo-board/agents/",
			expertise: p.paths?.expertise ?? ".pi/ceo-board/expertise/",
			skills: p.paths?.skills ?? ".pi/ceo-board/skills/",
		},
		ceo: p.ceo,
		board: p.board ?? [],
	};
}

export function resolvePath(baseDir: string, p: string): string {
	return path.isAbsolute(p) ? p : path.join(baseDir, p);
}
