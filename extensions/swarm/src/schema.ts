// ============================================================================
// Raw YAML shape (snake_case, optional fields)
// ============================================================================

interface RawSwarmAgentConfig {
	role?: string;
	task: string;
	extra_context?: string;
	reports_to?: string[];
	waits_for?: string[];
	model?: string;
	persona?: string;
	dialogue?: boolean;
	max_rounds?: number;
	color?: string;
}

interface RawSwarmConfig {
	name: string;
	workspace: string;
	mode?: string;
	target_count?: number;
	model?: string;
	interactive?: boolean;
	budget?: number | string;
	max_time_minutes?: number;
	brief_required_sections?: string[];
	agents_dir?: string;
	output_dir?: string;
	agents: Record<string, RawSwarmAgentConfig>;
}

// ============================================================================
// Normalized types (camelCase, defaults applied)
// ============================================================================

export type SwarmMode = "pipeline" | "parallel" | "sequential";

export interface SwarmAgent {
	name: string;
	role: string;
	task: string;
	extraContext?: string;
	reportsTo: string[];
	waitsFor: string[];
	model?: string;
	persona?: string;
	dialogue: boolean;
	maxRounds: number;
	color: string;
}

export interface SwarmDefinition {
	name: string;
	workspace: string;
	mode: SwarmMode;
	targetCount: number;
	model?: string;
	interactive: boolean;
	budget?: number;
	maxTimeMinutes?: number;
	briefRequiredSections: string[];
	agentsDir?: string;
	outputDir?: string;
	agents: Map<string, SwarmAgent>;
	agentOrder: string[];
}

// ============================================================================
// Parsing
// ============================================================================

const VALID_MODES = new Set<string>(["pipeline", "parallel", "sequential"]);
const VALID_SWARM_NAME = /^[a-zA-Z0-9._-]+$/;
const DEFAULT_COLORS = ["#ff7edb", "#7dcfff", "#e0af68", "#9ece6a", "#bb9af7", "#f7768e", "#73daca", "#ff9e64"];

function parseBudget(val: unknown): number | undefined {
	if (val === undefined || val === null) return undefined;
	if (typeof val === "number") return val;
	if (typeof val === "string") return parseFloat(val.replace(/[$€]/g, "")) || undefined;
	return undefined;
}

export async function parseSwarmYaml(content: string): Promise<SwarmDefinition> {
	const jsyaml = await import("js-yaml");
	const raw = jsyaml.load(content) as { swarm?: RawSwarmConfig } | null;
	if (!raw?.swarm) throw new Error("YAML must have a top-level 'swarm' key");
	const swarm = raw.swarm;

	if (!swarm.name || typeof swarm.name !== "string") throw new Error("swarm.name is required");
	if (!VALID_SWARM_NAME.test(swarm.name)) throw new Error("swarm.name may only contain letters, numbers, dot, underscore, dash");
	if (!swarm.workspace || typeof swarm.workspace !== "string") throw new Error("swarm.workspace is required");
	if (!swarm.agents || typeof swarm.agents !== "object" || Object.keys(swarm.agents).length === 0) throw new Error("swarm.agents must contain at least one agent");

	const mode = swarm.mode ?? "sequential";
	if (!VALID_MODES.has(mode)) throw new Error(`Invalid mode '${mode}'. Must be one of: ${[...VALID_MODES].join(", ")}`);

	const agentOrder: string[] = [];
	const agents = new Map<string, SwarmAgent>();

	let colorIdx = 0;
	for (const [name, config] of Object.entries(swarm.agents)) {
		if (!config.persona && (!config.role || typeof config.role !== "string")) {
			throw new Error(`Agent '${name}': 'role' or 'persona' is required`);
		}
		if (!config.task || typeof config.task !== "string") {
			throw new Error(`Agent '${name}': 'task' is required`);
		}

		agentOrder.push(name);
		agents.set(name, {
			name,
			role: config.role ?? name,
			task: config.task.trim(),
			extraContext: config.extra_context?.trim(),
			reportsTo: Array.isArray(config.reports_to) ? config.reports_to : [],
			waitsFor: Array.isArray(config.waits_for) ? config.waits_for : [],
			model: typeof config.model === "string" ? config.model.trim() : undefined,
			persona: typeof config.persona === "string" ? config.persona.trim() : undefined,
			dialogue: config.dialogue === true,
			maxRounds: config.max_rounds ?? 3,
			color: config.color ?? DEFAULT_COLORS[colorIdx++ % DEFAULT_COLORS.length],
		});
	}

	return {
		name: swarm.name,
		workspace: swarm.workspace,
		mode: mode as SwarmMode,
		targetCount: swarm.target_count ?? 1,
		model: typeof swarm.model === "string" ? swarm.model.trim() : undefined,
		interactive: swarm.interactive === true,
		budget: parseBudget(swarm.budget),
		maxTimeMinutes: typeof swarm.max_time_minutes === "number" ? swarm.max_time_minutes : undefined,
		briefRequiredSections: swarm.brief_required_sections ?? ["situation", "stakes", "constraints", "key question"],
		agentsDir: typeof swarm.agents_dir === "string" ? swarm.agents_dir : undefined,
		outputDir: typeof swarm.output_dir === "string" ? swarm.output_dir : undefined,
		agents,
		agentOrder,
	};
}

// ============================================================================
// Validation
// ============================================================================

export function validateSwarmDefinition(def: SwarmDefinition): string[] {
	const errors: string[] = [];
	const agentNames = new Set(def.agents.keys());

	if (def.model !== undefined && def.model.length === 0) errors.push("swarm.model must not be empty when provided");

	for (const [name, agent] of def.agents) {
		for (const dep of agent.waitsFor) {
			if (!agentNames.has(dep)) errors.push(`Agent '${name}' waits_for unknown agent '${dep}'`);
			if (dep === name) errors.push(`Agent '${name}' cannot wait for itself`);
		}
		for (const target of agent.reportsTo) {
			if (!agentNames.has(target)) errors.push(`Agent '${name}' reports_to unknown agent '${target}'`);
			if (target === name) errors.push(`Agent '${name}' cannot report to itself`);
		}
		if (agent.model !== undefined && agent.model.length === 0) errors.push(`Agent '${name}' model must not be empty when provided`);
	}

	if (def.targetCount < 1) errors.push("target_count must be at least 1");
	if (def.mode !== "pipeline" && def.targetCount !== 1) errors.push("target_count is only supported in pipeline mode");

	return errors;
}
