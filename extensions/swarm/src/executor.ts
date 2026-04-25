/**
 * Swarm agent execution via pi-mono's LLM API.
 *
 * Uses complete() from @mariozechner/pi-ai — the same pattern as ceo-board.
 * Each agent is an independent LLM call with its own system prompt + task.
 *
 * Note: agents here are LLM-only (no bash/file tools). For tool-bearing agents,
 * see the ceo-board integration in index.ts which can run agents through pi's
 * converse() infrastructure instead.
 */
import type { Api, Context, Model, UserMessage } from "@mariozechner/pi-ai";
import { complete } from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { SwarmAgent } from "./schema.js";
import type { StateTracker } from "./state.js";

export interface AgentResult {
	ok: boolean;
	output: string;
	error?: string;
	inputTokens?: number;
	outputTokens?: number;
	cost?: number;
}

export interface ExecutionContext {
	piCtx: ExtensionContext;
}

export interface SwarmExecutorOptions {
	workspace: string;
	swarmName: string;
	iteration: number;
	modelOverride?: string;
	signal?: AbortSignal;
	stateTracker: StateTracker;
	ctx: ExecutionContext;
}

export async function executeSwarmAgent(
	agent: SwarmAgent,
	options: SwarmExecutorOptions,
): Promise<AgentResult> {
	const { swarmName, iteration, modelOverride, signal, stateTracker, ctx } = options;

	await stateTracker.updateAgent(agent.name, {
		status: "running",
		iteration,
		startedAt: Date.now(),
	});
	await stateTracker.appendLog(agent.name, `Starting iteration ${iteration}`);

	try {
		const model = resolveModel(ctx.piCtx, modelOverride);

		const systemPrompt = buildSystemPrompt(agent);
		const messages: UserMessage[] = [{
			role: "user",
			content: [{ type: "text", text: agent.task }],
			timestamp: Date.now(),
		}];
		const context: Context = { systemPrompt, messages };

		const auth = await ctx.piCtx.modelRegistry.getApiKeyAndHeaders(model);

		const response = await complete(model, context, { signal });

		const outputText = response.content
			.filter(b => b.type === "text")
			.map(b => (b as { type: "text"; text: string }).text)
			.join("\n");

		const ok = response.stopReason !== "error";
		const result: AgentResult = {
			ok,
			output: outputText,
			error: ok ? undefined : response.errorMessage,
			inputTokens: response.usage?.input,
			outputTokens: response.usage?.output,
			cost: response.usage?.cost?.total,
		};

		await stateTracker.updateAgent(agent.name, {
			status: ok ? "completed" : "failed",
			completedAt: Date.now(),
			error: result.error,
		});
		await stateTracker.appendLog(
			agent.name,
			`Iteration ${iteration} ${ok ? "completed" : "failed"}${result.error ? `: ${result.error}` : ""}`,
		);
		await stateTracker.appendLog(agent.name, `Output (${outputText.length} chars): ${outputText.slice(0, 200)}${outputText.length > 200 ? "..." : ""}`);

		return result;
	} catch (err) {
		const error = err instanceof Error ? err.message : String(err);
		await stateTracker.updateAgent(agent.name, {
			status: "failed",
			completedAt: Date.now(),
			error,
		});
		await stateTracker.appendLog(agent.name, `Iteration ${iteration} error: ${error}`);
		throw err;
	}
}

function resolveModel(ctx: ExtensionContext, modelOverride?: string): Model<Api> {
	if (modelOverride) {
		const parts = modelOverride.split(":");
		if (parts.length === 2) {
			const found = ctx.modelRegistry.find(parts[0], parts[1]);
			if (found) return found as Model<Api>;
		}
		// try as modelId across all providers
		const all = ctx.modelRegistry.getAll();
		const byId = all.find(m => m.id === modelOverride);
		if (byId) return byId as Model<Api>;
	}
	return ctx.model as Model<Api>;
}

function buildSystemPrompt(agent: SwarmAgent): string {
	const parts = [`You are a ${agent.role}.`];
	if (agent.extraContext) parts.push(agent.extraContext);
	parts.push("Write your response directly. Be concise and focused on your assigned task.");
	return parts.join("\n\n");
}
