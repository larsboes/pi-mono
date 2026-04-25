import type { Api, Context, Model, UserMessage } from "@mariozechner/pi-ai";
import { complete } from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { SwarmAgent } from "./schema.js";
import type { ExecutionContext } from "./executor.js";
import type { StateTracker } from "./state.js";
import type { TranscriptEntry } from "./memo.js";

export interface DialogueResult {
	transcript: TranscriptEntry[];
	totalCost: number;
	totalInputTokens: number;
	totalOutputTokens: number;
}

export interface MemberResponse {
	name: string;
	color: string;
	response: string;
	cost: number;
	inputTokens: number;
	outputTokens: number;
	mentalModelUpdate: string | null;
}

export interface DialogueOptions {
	agents: SwarmAgent[];
	maxRounds: number;
	briefContent?: string;
	modelOverride?: string;
	signal?: AbortSignal;
	ctx: ExecutionContext;
	stateTracker: StateTracker;
	onRound?: (round: number, responses: MemberResponse[]) => void;
}

export async function executeDialogue(options: DialogueOptions): Promise<DialogueResult> {
	const { agents, maxRounds, briefContent, modelOverride, signal, ctx, stateTracker, onRound } = options;
	const transcript: TranscriptEntry[] = [];
	let totalCost = 0, totalInput = 0, totalOutput = 0;

	for (let round = 1; round <= maxRounds; round++) {
		if (signal?.aborted) break;

		await stateTracker.appendOrchestratorLog(`Dialogue round ${round}/${maxRounds}`);

		const conversationContext = buildConversationContext(transcript);
		const roundResponses: MemberResponse[] = [];

		const results = await Promise.allSettled(
			agents.map(agent => callAgent(agent, round, conversationContext, briefContent, modelOverride, ctx, signal)),
		);

		for (let i = 0; i < agents.length; i++) {
			const agent = agents[i];
			const result = results[i];

			if (result.status === "fulfilled") {
				const r = result.value;
				roundResponses.push(r);
				transcript.push({ from: agent.name, to: "all", content: r.response, timestamp: Date.now(), round });
				totalCost += r.cost;
				totalInput += r.inputTokens;
				totalOutput += r.outputTokens;
				await stateTracker.updateAgent(agent.name, { status: "completed", completedAt: Date.now() });
			} else {
				const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
				await stateTracker.updateAgent(agent.name, { status: "failed", error, completedAt: Date.now() });
				await stateTracker.appendLog(agent.name, `Round ${round} error: ${error}`);
			}
		}

		onRound?.(round, roundResponses);
	}

	return { transcript, totalCost, totalInputTokens: totalInput, totalOutputTokens: totalOutput };
}

export async function quickRound(
	topic: string,
	agents: SwarmAgent[],
	modelOverride: string | undefined,
	ctx: ExecutionContext,
	signal?: AbortSignal,
): Promise<{ responses: MemberResponse[]; totalCost: number }> {
	const responses: MemberResponse[] = [];
	let totalCost = 0;

	const results = await Promise.allSettled(
		agents.map(agent => callAgent(agent, 1, "", topic, modelOverride, ctx, signal)),
	);

	for (const result of results) {
		if (result.status === "fulfilled") {
			responses.push(result.value);
			totalCost += result.value.cost;
		}
	}

	return { responses, totalCost };
}

async function callAgent(
	agent: SwarmAgent,
	round: number,
	conversationContext: string,
	briefContent: string | undefined,
	modelOverride: string | undefined,
	ctx: ExecutionContext,
	signal?: AbortSignal,
): Promise<MemberResponse> {
	const piCtx = ctx.piCtx;
	const model = resolveModel(piCtx, modelOverride ?? agent.model);

	const systemParts = [`You are ${agent.role}.`];
	if (agent.extraContext) systemParts.push(agent.extraContext);

	let userPrompt = "";
	if (briefContent && round === 1) userPrompt += `## Brief\n\n${briefContent}\n\n`;
	if (conversationContext) userPrompt += `## Deliberation So Far\n\n${conversationContext}\n\n`;
	userPrompt += `Respond with your expert analysis as ${agent.role}. Be direct and specific.`;
	if (round > 1) userPrompt += " Build on or challenge what others have said.";

	const messages: UserMessage[] = [{ role: "user", content: [{ type: "text", text: userPrompt }], timestamp: Date.now() }];
	const context: Context = { systemPrompt: systemParts.join("\n\n"), messages };
	const auth = await piCtx.modelRegistry.getApiKeyAndHeaders(model);
	const response = await complete(model, context, { signal });

	const outputText = response.content.filter(b => b.type === "text").map(b => (b as any).text).join("\n");

	const mmMatch = outputText.match(/<mental_model_update>([\s\S]*?)<\/mental_model_update>/i);

	return {
		name: agent.name,
		color: (agent as any).color ?? "#ffffff",
		response: outputText,
		cost: response.usage?.cost?.total ?? 0,
		inputTokens: response.usage?.input ?? 0,
		outputTokens: response.usage?.output ?? 0,
		mentalModelUpdate: mmMatch?.[1]?.trim() ?? null,
	};
}

function resolveModel(ctx: ExtensionContext, modelOverride?: string): Model<Api> {
	if (modelOverride) {
		const parts = modelOverride.split("/");
		if (parts.length === 2) {
			const found = ctx.modelRegistry.find(parts[0], parts[1]);
			if (found) return found as Model<Api>;
		}
		const all = ctx.modelRegistry.getAll();
		const byId = all.find(m => m.id === modelOverride);
		if (byId) return byId as Model<Api>;
	}
	return ctx.model as Model<Api>;
}

function buildConversationContext(transcript: TranscriptEntry[]): string {
	if (transcript.length === 0) return "";
	const lines: string[] = [];
	let currentRound = -1;
	for (const entry of transcript) {
		if (entry.round !== currentRound) { currentRound = entry.round; lines.push(`### Round ${currentRound}`); }
		const cleaned = entry.content.replace(/<mental_model_update>[\s\S]*?<\/mental_model_update>/gi, "").trim();
		lines.push(`**${entry.from}:** ${cleaned}`, "");
	}
	return lines.join("\n");
}
