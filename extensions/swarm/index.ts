/**
 * Swarm Extension — Multi-agent pipeline orchestration from YAML definitions.
 *
 * Registers:
 * - /swarm run <file.yaml>    Execute a swarm pipeline
 * - /swarm status [name]      Show current pipeline status
 * - /swarm help               Show usage
 *
 * Ported from can1357/oh-my-pi packages/swarm-extension.
 * Adapter: uses complete() from @mariozechner/pi-ai instead of runSubprocess.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { buildDependencyGraph, buildExecutionWaves, detectCycles } from "./src/dag.js";
import { PipelineController } from "./src/pipeline.js";
import { renderSwarmProgress } from "./src/render.js";
import { parseSwarmYaml, type SwarmDefinition, validateSwarmDefinition } from "./src/schema.js";
import { StateTracker } from "./src/state.js";

function fmt(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

export default function swarmExtension(pi: ExtensionAPI): void {
	pi.registerCommand("swarm", {
		description: "Run a multi-agent swarm pipeline from YAML",
		handler: async (args: string, ctx: ExtensionContext) => {
			const parts = args.trim().split(/\s+/);
			const subcommand = parts[0] ?? "help";

			switch (subcommand) {
				case "run": {
					const yamlPath = parts[1];
					if (!yamlPath) {
						ctx.ui.notify("Usage: /swarm run <path/to/pipeline.yaml>", "error");
						return;
					}
					await handleRun(yamlPath, ctx);
					return;
				}
				case "status": {
					await handleStatus(parts[1], ctx);
					return;
				}
				default:
					ctx.ui.notify(
						[
							"Swarm — multi-agent pipeline orchestrator",
							"",
							"  /swarm run <file.yaml>     Run a pipeline",
							"  /swarm status [name]       Show pipeline status",
							"  /swarm help                Show this help",
						].join("\n"),
					);
			}
		},
	});
}

async function handleRun(yamlPath: string, ctx: ExtensionContext): Promise<void> {
	const cwd = (ctx as any).cwd ?? process.cwd();
	const resolvedPath = path.isAbsolute(yamlPath) ? yamlPath : path.resolve(cwd, yamlPath);

	let content: string;
	try {
		content = await fs.readFile(resolvedPath, "utf-8");
	} catch {
		ctx.ui.notify(`Cannot read file: ${resolvedPath}`, "error");
		return;
	}

	let def: SwarmDefinition;
	try {
		def = await parseSwarmYaml(content);
	} catch (err) {
		ctx.ui.notify(`YAML error: ${err instanceof Error ? err.message : String(err)}`, "error");
		return;
	}

	const validationErrors = validateSwarmDefinition(def);
	if (validationErrors.length > 0) {
		ctx.ui.notify(`Validation errors:\n${validationErrors.map((e: string) => `  - ${e}`).join("\n")}`, "error");
		return;
	}

	const deps = buildDependencyGraph(def);
	const cycleNodes = detectCycles(deps);
	if (cycleNodes) {
		ctx.ui.notify(`Cycle detected: [${cycleNodes.join(", ")}]`, "error");
		return;
	}
	const waves = buildExecutionWaves(deps);

	const workspace = path.isAbsolute(def.workspace)
		? def.workspace
		: path.resolve(path.dirname(resolvedPath), def.workspace);
	await fs.mkdir(workspace, { recursive: true });

	const stateTracker = new StateTracker(workspace, def.name);
	await stateTracker.init([...def.agents.keys()], def.targetCount, def.mode);

	ctx.ui.notify(
		`Starting swarm '${def.name}': ${def.agents.size} agents, ${waves.length} waves, ${def.targetCount} iteration(s)`,
	);

	const controller = new PipelineController(def, waves, stateTracker);
	const result = await controller.run({
		workspace,
		onProgress: () => {
			const lines = renderSwarmProgress(stateTracker.state);
			ctx.ui.setWidget("swarm", lines, { placement: "belowEditor" });
		},
		ctx: { piCtx: ctx },
	});

	ctx.ui.setWidget("swarm", undefined);

	const elapsed = stateTracker.state.completedAt
		? fmt(stateTracker.state.completedAt - stateTracker.state.startedAt)
		: "?";

	const summary = [
		`Swarm '${def.name}' ${result.status}`,
		`${result.iterations}/${def.targetCount} iterations`,
		`elapsed: ${elapsed}`,
		...(result.errors.length > 0 ? [`${result.errors.length} error(s)`] : []),
	].join(" | ");

	ctx.ui.notify(summary, result.status === "completed" ? "info" : "error");
}

async function handleStatus(name: string | undefined, ctx: ExtensionContext): Promise<void> {
	if (!name) {
		ctx.ui.notify("Usage: /swarm status <name>", "info");
		return;
	}
	const cwd = (ctx as any).cwd ?? process.cwd();
	const stateTracker = new StateTracker(cwd, name);
	const state = await stateTracker.load();
	if (!state) {
		ctx.ui.notify(`No state found for swarm '${name}'`, "error");
		return;
	}
	ctx.ui.notify(renderSwarmProgress(state).join("\n"));
}
