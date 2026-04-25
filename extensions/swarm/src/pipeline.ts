/**
 * Pipeline controller for swarm execution.
 *
 * Orchestrates execution waves within each iteration:
 * - Agents in the same wave execute in parallel
 * - Waves execute sequentially (wave N+1 starts after wave N completes)
 * - For pipeline mode, iterations repeat the full DAG execution
 */
import type { AgentResult, ExecutionContext } from "./executor.js";
import { executeSwarmAgent } from "./executor.js";
import type { SwarmDefinition } from "./schema.js";
import type { StateTracker } from "./state.js";

export interface PipelineOptions {
	workspace: string;
	signal?: AbortSignal;
	onProgress?: (state: PipelineProgress) => void;
	ctx: ExecutionContext;
}

export interface PipelineProgress {
	iteration: number;
	targetCount: number;
	currentWave: number;
	totalWaves: number;
	agents: Record<string, { status: string; iteration: number }>;
}

export interface PipelineResult {
	status: "completed" | "failed" | "aborted";
	iterations: number;
	agentResults: Map<string, AgentResult[]>;
	errors: string[];
}

export class PipelineController {
	#def: SwarmDefinition;
	#waves: string[][];
	#stateTracker: StateTracker;

	constructor(def: SwarmDefinition, waves: string[][], stateTracker: StateTracker) {
		this.#def = def;
		this.#waves = waves;
		this.#stateTracker = stateTracker;
	}

	async run(options: PipelineOptions): Promise<PipelineResult> {
		const { workspace, signal, onProgress, ctx } = options;
		const allResults = new Map<string, AgentResult[]>();
		const errors: string[] = [];

		for (const name of this.#def.agents.keys()) {
			allResults.set(name, []);
		}

		const targetCount = this.#def.targetCount;

		await this.#stateTracker.appendOrchestratorLog(
			`Pipeline '${this.#def.name}' starting: mode=${this.#def.mode} iterations=${targetCount} waves=${this.#waves.length} agents=${this.#def.agents.size}`,
		);

		try {
			for (let iteration = 0; iteration < targetCount; iteration++) {
				if (signal?.aborted) {
					await this.#stateTracker.updatePipeline({ status: "aborted" });
					return { status: "aborted", iterations: iteration, agentResults: allResults, errors };
				}

				await this.#stateTracker.updatePipeline({ iteration });
				await this.#stateTracker.appendOrchestratorLog(`--- Iteration ${iteration + 1}/${targetCount} ---`);

				const emitProgress = (currentWave: number) => {
					onProgress?.({
						iteration,
						targetCount,
						currentWave,
						totalWaves: this.#waves.length,
						agents: this.#buildProgressSnapshot(),
					});
				};

				const iterationResults = await this.#runIteration(iteration, {
					workspace,
					signal,
					emitProgress,
					ctx,
				});

				for (const [agentName, result] of iterationResults) {
					allResults.get(agentName)!.push(result);
					if (!result.ok) {
						errors.push(`${agentName} (iteration ${iteration + 1}): ${result.error ?? "failed"}`);
					}
				}
			}

			const status = errors.length > 0 ? ("failed" as const) : ("completed" as const);
			await this.#stateTracker.updatePipeline({ status, completedAt: Date.now() });
			await this.#stateTracker.appendOrchestratorLog(`Pipeline ${status} (${errors.length} errors)`);
			return { status, iterations: targetCount, agentResults: allResults, errors };
		} catch (err) {
			const error = err instanceof Error ? err.message : String(err);
			await this.#stateTracker.updatePipeline({ status: "failed", completedAt: Date.now() });
			await this.#stateTracker.appendOrchestratorLog(`Pipeline fatal error: ${error}`);
			errors.push(error);
			return { status: "failed", iterations: 0, agentResults: allResults, errors };
		}
	}

	async #runIteration(
		iteration: number,
		options: {
			workspace: string;
			signal?: AbortSignal;
			emitProgress: (currentWave: number) => void;
			ctx: ExecutionContext;
		},
	): Promise<Map<string, AgentResult>> {
		const results = new Map<string, AgentResult>();

		for (let waveIdx = 0; waveIdx < this.#waves.length; waveIdx++) {
			const wave = this.#waves[waveIdx];
			if (options.signal?.aborted) break;

			await this.#stateTracker.appendOrchestratorLog(
				`Wave ${waveIdx + 1}/${this.#waves.length}: [${wave.join(", ")}]`,
			);

			for (const agentName of wave) {
				await this.#stateTracker.updateAgent(agentName, { status: "waiting", iteration, wave: waveIdx });
			}
			options.emitProgress(waveIdx);

			const waveResults = await Promise.all(
				wave.map(async agentName => {
					const agent = this.#def.agents.get(agentName)!;
					try {
						const result = await executeSwarmAgent(agent, {
							workspace: options.workspace,
							swarmName: this.#def.name,
							iteration,
							modelOverride: agent.model ?? this.#def.model,
							signal: options.signal,
							stateTracker: this.#stateTracker,
							ctx: options.ctx,
						});
						return { agentName, result };
					} catch (err) {
						const error = err instanceof Error ? err.message : String(err);
						return { agentName, result: { ok: false as const, output: "", error } };
					}
				}),
			);

			for (const { agentName, result } of waveResults) {
				results.set(agentName, result);
			}
			options.emitProgress(waveIdx);
		}

		return results;
	}

	#buildProgressSnapshot(): Record<string, { status: string; iteration: number }> {
		const snapshot: Record<string, { status: string; iteration: number }> = {};
		for (const [name, agent] of Object.entries(this.#stateTracker.state.agents)) {
			snapshot[name] = { status: agent.status, iteration: agent.iteration };
		}
		return snapshot;
	}
}
