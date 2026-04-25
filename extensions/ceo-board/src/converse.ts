/**
 * converse() tool — CEO broadcasts to board, members respond via complete()
 *
 * This is the heart of the CEO & Board system. The CEO calls converse()
 * with a message, and all (or specific) board members respond in parallel.
 */
import type { Api, AssistantMessage, Context, Message, Model, UserMessage } from "@mariozechner/pi-ai";
import { complete } from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import type { BoardMemberConfig, Config } from "./config.js";
import { loadExpertise, loadPersona, loadSkills } from "./agents.js";

export interface TranscriptEntry {
	from: string;
	to: string;
	content: string;
	timestamp: number;
	round: number;
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

export interface ConverseResult {
	responses: MemberResponse[];
	totalCost: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	abortedCount: number;
}

// In-memory state managed by the extension
let conversationLog: TranscriptEntry[] = [];
let roundCounter = 0;
let totalBoardCost = 0;

export function getConversationLog(): TranscriptEntry[] {
	return conversationLog;
}

export function getTotalBoardCost(): number {
	return totalBoardCost;
}

export function getRoundCounter(): number {
	return roundCounter;
}

export function resetState(): void {
	conversationLog = [];
	roundCounter = 0;
	totalBoardCost = 0;
}

function extractMentalModelUpdate(response: string): string | null {
	const xmlMatch = response.match(/<mental_model_update>([\s\S]*?)<\/mental_model_update>/i);
	if (xmlMatch) return xmlMatch[1].trim();
	const mdMatch = response.match(/## Mental Model Update\n([\s\S]*?)(?=\n## |$)/i);
	if (mdMatch) return mdMatch[1].trim();
	return null;
}

function buildConversationContext(log: TranscriptEntry[]): string {
	if (log.length === 0) return "";
	return log
		.map((e) => `**${e.from}** → ${e.to} (Round ${e.round}):\n${e.content}`)
		.join("\n\n---\n\n");
}

export function resolveModel(
	modelStr: string,
	ctx: ExtensionContext,
): Model<Api> {
	if (modelStr === "$default" || modelStr === "$session") {
		return ctx.model as Model<Api>;
	}

	if (modelStr.includes("/")) {
		const [provider, modelId] = modelStr.split("/", 2);
		const found = ctx.modelRegistry.find(provider, modelId);
		if (found) return found as Model<Api>;
	}

	const all = ctx.modelRegistry.getAll();
	const byId = all.find((m) => m.id === modelStr);
	if (byId) return byId as Model<Api>;

	return ctx.model as Model<Api>;
}

async function callMember(
	memberConfig: BoardMemberConfig,
	ceoMessage: string,
	conversationContext: string,
	briefContent: string,
	isFinalRound: boolean,
	config: Config,
	baseDir: string,
	ctx: ExtensionContext,
	signal: AbortSignal | undefined,
): Promise<MemberResponse> {
	// Load persona
	const persona = loadPersona(
		memberConfig.path.startsWith("/") ? memberConfig.path : `${baseDir}/${memberConfig.path}`,
		memberConfig.name,
		memberConfig.color,
	);

	// Load expertise
	const expertise = loadExpertise(memberConfig.expertise, baseDir);

	// Load skills
	const skills = loadSkills(memberConfig.skills, baseDir);

	// Build system prompt with injections
	let systemPrompt = persona.systemPrompt;
	if (expertise) {
		systemPrompt += `\n\n## Your Expertise (accumulated from past sessions)\n\n${expertise}`;
	}
	if (skills) {
		systemPrompt += `\n\n## Skills\n\n${skills}`;
	}

	// Build the user prompt
	let userPrompt = `## Brief\n\n${briefContent}\n\n`;

	if (conversationContext) {
		userPrompt += `## Deliberation So Far\n\n${conversationContext}\n\n`;
	}

	userPrompt += `## CEO's Message\n\n${ceoMessage}\n\n`;

	if (isFinalRound) {
		userPrompt += `## Instructions\n\nThis is the FINAL ROUND. Give your final statement:\n- Where does the board agree?\n- Where do you still disagree?\n- What is your final recommendation?\n- 50-150 words. Be direct and decisive.\n`;
	} else {
		userPrompt += `## Instructions\n\nRespond to the CEO's message from your specialized perspective.\n- Be specific and substantive (50-150 words)\n- Reference other board members' points if relevant\n- State your key concern, recommendation, or insight\n- Include a <mental_model_update> block at the end with 3-5 bullet points of patterns you noticed (this is for your own future reference)\n`;
	}

	const messages: Message[] = [
		{ role: "user", content: [{ type: "text", text: userPrompt }] } as UserMessage,
	];

	const context: Context = { systemPrompt, messages };

	// Resolve model
	const model = resolveModel(memberConfig.model, ctx);
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) throw new Error(`Auth failed for ${memberConfig.name}: ${auth.error}`);

	const result = await complete(model, context, {
		apiKey: auth.apiKey,
		headers: auth.headers,
		signal,
		maxTokens: isFinalRound ? 512 : 1024,
		temperature: 0.7,
	});

	const responseText = result.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n");

	const mentalModelUpdate = extractMentalModelUpdate(responseText);

	return {
		name: memberConfig.name,
		color: memberConfig.color,
		response: responseText,
		cost: result.usage?.cost?.total ?? 0,
		inputTokens: result.usage?.input ?? 0,
		outputTokens: result.usage?.output ?? 0,
		mentalModelUpdate,
	};
}

function appendExpertise(filePath: string, baseDir: string, update: string): void {
	const resolved = filePath.startsWith("/") ? filePath : `${baseDir}/${filePath}`;
	const dir = resolved.substring(0, resolved.lastIndexOf("/"));
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

	const timestamp = new Date().toISOString().split("T")[0];
	const existing = fs.existsSync(resolved) ? fs.readFileSync(resolved, "utf-8") : "";
	const entry = `\n\n### ${timestamp}\n\n${update}`;
	fs.writeFileSync(resolved, existing + entry);
}

export async function converse(
	ceoMessage: string,
	targetMembers: string[] | undefined,
	isFinalRound: boolean,
	briefContent: string,
	config: Config,
	baseDir: string,
	ctx: ExtensionContext,
	signal: AbortSignal | undefined,
): Promise<ConverseResult> {
	roundCounter++;

	// Determine which members to call
	const members = targetMembers
		? config.board.filter((m) => targetMembers.some((t) => m.name.toLowerCase().includes(t.toLowerCase())))
		: config.board;

	if (members.length === 0) {
		return { responses: [], totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, abortedCount: 0 };
	}

	// Add CEO's message to the log
	const toNames = members.map((m) => m.name).join(", ");
	conversationLog.push({
		from: "CEO",
		to: toNames,
		content: ceoMessage,
		timestamp: Date.now(),
		round: roundCounter,
	});

	const conversationContext = buildConversationContext(conversationLog);

	// Call all members in parallel with allSettled for partial results on abort
	const results = await Promise.allSettled(
		members.map((m) =>
			callMember(m, ceoMessage, conversationContext, briefContent, isFinalRound, config, baseDir, ctx, signal),
		),
	);

	const responses: MemberResponse[] = [];
	let abortedCount = 0;

	for (let i = 0; i < results.length; i++) {
		const r = results[i];
		if (r.status === "fulfilled") {
			responses.push(r.value);

			// Add to conversation log
			conversationLog.push({
				from: r.value.name,
				to: "CEO",
				content: r.value.response,
				timestamp: Date.now(),
				round: roundCounter,
			});

			// Persist expertise update if available
			if (r.value.mentalModelUpdate && members[i].expertise) {
				try {
					appendExpertise(members[i].expertise!, baseDir, r.value.mentalModelUpdate);
				} catch {
					// Non-fatal — don't crash if expertise write fails
				}
			}
		} else {
			abortedCount++;
		}
	}

	const totalCost = responses.reduce((s, r) => s + r.cost, 0);
	totalBoardCost += totalCost;

	return {
		responses,
		totalCost,
		totalInputTokens: responses.reduce((s, r) => s + r.inputTokens, 0),
		totalOutputTokens: responses.reduce((s, r) => s + r.outputTokens, 0),
		abortedCount,
	};
}

export interface QuickRoundResult {
	responses: MemberResponse[];
	totalCost: number;
}

export async function quickRound(
	topic: string,
	config: Config,
	baseDir: string,
	ctx: ExtensionContext,
	signal: AbortSignal | undefined,
): Promise<QuickRoundResult> {
	const results = await Promise.allSettled(
		config.board.map((m) =>
			callMember(m, topic, "", `Topic: ${topic}`, false, config, baseDir, ctx, signal),
		),
	);

	const responses: MemberResponse[] = [];
	for (const r of results) {
		if (r.status === "fulfilled") responses.push(r.value);
	}

	return {
		responses,
		totalCost: responses.reduce((s, r) => s + r.cost, 0),
	};
}
