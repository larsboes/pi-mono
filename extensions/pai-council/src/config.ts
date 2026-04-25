/**
 * Council configuration — loads and validates council-config.yaml
 */

import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";

export interface CouncilMemberConfig {
	name: string;
	path: string;
	color: string;
}

export interface CouncilConfig {
	meeting: {
		constraints: {
			max_time_minutes: number;
			max_budget: number;
			rounds: number;
		};
		editor: string;
	};
	paths: {
		briefs: string;
		deliberations: string;
		memos: string;
		agents: string;
	};
	chair: {
		name: string;
		path: string;
		color: string;
	};
	council: CouncilMemberConfig[];
}

const DEFAULT_CONFIG: CouncilConfig = {
	meeting: {
		constraints: {
			max_time_minutes: 5,
			max_budget: 3,
			rounds: 2,
		},
		editor: "code",
	},
	paths: {
		briefs: ".pi/council/briefs/",
		deliberations: ".pi/council/deliberations/",
		memos: ".pi/council/memos/",
		agents: ".pi/council/agents/",
	},
	chair: {
		name: "Chair",
		path: ".pi/council/agents/chair.md",
		color: "#7dcfff",
	},
	council: [
		{ name: "Tech Skeptic", path: ".pi/council/agents/tech-skeptic.md", color: "#ff6e96" },
		{ name: "Product Thinker", path: ".pi/council/agents/product-thinker.md", color: "#fede5d" },
		{ name: "Contrarian", path: ".pi/council/agents/contrarian.md", color: "#ff9e64" },
		{ name: "Synthesizer", path: ".pi/council/agents/synthesizer.md", color: "#72f1b8" },
	],
};

function parseBudget(val: unknown): number {
	if (typeof val === "number") return val;
	if (typeof val === "string") {
		const cleaned = val.replace(/[$€]/g, "").trim();
		const parsed = parseFloat(cleaned);
		return isNaN(parsed) ? 3 : parsed;
	}
	return 3;
}

export function loadConfig(baseDir: string): CouncilConfig {
	const configPath = path.join(baseDir, "council-config.yaml");
	if (!fs.existsSync(configPath)) {
		return DEFAULT_CONFIG;
	}

	const raw = fs.readFileSync(configPath, "utf-8");
	const parsed = yaml.load(raw) as Record<string, any>;
	if (!parsed || typeof parsed !== "object") {
		return DEFAULT_CONFIG;
	}

	const meeting = parsed.meeting ?? {};
	const constraints = meeting.constraints ?? {};
	const paths = parsed.paths ?? {};

	return {
		meeting: {
			constraints: {
				max_time_minutes: constraints.max_time_minutes ?? DEFAULT_CONFIG.meeting.constraints.max_time_minutes,
				max_budget: parseBudget(constraints.max_budget ?? DEFAULT_CONFIG.meeting.constraints.max_budget),
				rounds: constraints.rounds ?? DEFAULT_CONFIG.meeting.constraints.rounds,
			},
			editor: meeting.editor ?? DEFAULT_CONFIG.meeting.editor,
		},
		paths: {
			briefs: paths.briefs ?? DEFAULT_CONFIG.paths.briefs,
			deliberations: paths.deliberations ?? DEFAULT_CONFIG.paths.deliberations,
			memos: paths.memos ?? DEFAULT_CONFIG.paths.memos,
			agents: paths.agents ?? DEFAULT_CONFIG.paths.agents,
		},
		chair: parsed.chair ?? DEFAULT_CONFIG.chair,
		council: parsed.council ?? DEFAULT_CONFIG.council,
	};
}

export function resolveAgentPath(baseDir: string, agentPath: string): string {
	if (path.isAbsolute(agentPath)) return agentPath;
	return path.join(baseDir, agentPath);
}
