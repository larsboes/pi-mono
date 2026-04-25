/**
 * Deliberation loop — orchestrates multi-round council debates
 *
 * Flow:
 * 1. Chair frames the question
 * 2. N rounds of board debate (all members respond to growing transcript)
 * 3. Final statements (contrarian goes last)
 * 4. Chair synthesizes into memo
 */

import type { Api, AssistantMessage, Context, Message, Model, UserMessage } from "@mariozechner/pi-ai";
import { complete } from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { AgentPersona } from "./agents.js";
import type { CouncilConfig } from "./config.js";

export interface MemberStats {
	name: string;
	color: string;
	turns: number;
	inputTokens: number;
	outputTokens: number;
	cost: number;
	contextTokens: number;
	status: "idle" | "active" | "done";
	lastResponse: string;
}

export interface DeliberationResult {
	sessionId: string;
	brief: BriefContent;
	transcript: TranscriptEntry[];
	stats: Record<string, MemberStats>;
	synthesis: string;
	startTime: number;
	endTime: number;
	totalCost: number;
}

export interface TranscriptEntry {
	round: number;
	phase: string;
	member: string;
	content: string;
	timestamp: number;
}

export interface BriefContent {
	title: string;
	preamble: string;
	situation: string;
	stakes: string;
	constraints: string;
	keyQuestion: string;
	contextFiles: string;
	raw: string;
}

function generateSessionId(): string {
	return Math.random().toString(36).slice(2, 8);
}

export function parseBrief(raw: string): BriefContent {
	const sections: Record<string, string> = {};
	let currentSection = "";
	let title = "";
	let preamble = "";

	for (const line of raw.split("\n")) {
		if (line.startsWith("## ")) {
			currentSection = line.slice(3).trim().toLowerCase();
			sections[currentSection] = "";
		} else if (line.startsWith("# ")) {
			title = line.slice(2).trim();
		} else if (currentSection) {
			sections[currentSection] += line + "\n";
		} else {
			// Content between # Title and first ## Section
			preamble += line + "\n";
		}
	}

	// Also try frontmatter for title
	const fmMatch = raw.match(/^---\n[\s\S]*?title:\s*"?([^"\n]+)"?\n[\s\S]*?---/);
	if (fmMatch) title = fmMatch[1];

	return {
		title: title || "Untitled Brief",
		preamble: preamble.trim(),
		situation: (sections["situation"] || "").trim(),
		stakes: (sections["stakes"] || "").trim(),
		constraints: (sections["constraints"] || "").trim(),
		keyQuestion: (sections["key question"] || "").trim(),
		contextFiles: (sections["context files"] || "").trim(),
		raw,
	};
}

interface CallMemberOptions {
	phase: string;
	round: number;
	finalStatement?: boolean;
	writeMemo?: boolean;
}

async function callMember(
	persona: AgentPersona,
	brief: BriefContent,
	transcript: TranscriptEntry[],
	model: Model<Api>,
	apiKey: string | undefined,
	headers: Record<string, string> | undefined,
	signal: AbortSignal | undefined,
	options: CallMemberOptions,
): Promise<{ response: string; message: AssistantMessage }> {
	// Build the transcript context
	const transcriptText = transcript
		.map((t) => `**${t.member}** (Round ${t.round}, ${t.phase}):\n${t.content}`)
		.join("\n\n---\n\n");

	let userPrompt: string;

	if (options.writeMemo) {
		userPrompt = `## Brief\n\n${brief.raw}\n\n## Full Deliberation Transcript\n\n${transcriptText}\n\n## Your Task\n\nAs Chair, synthesize the entire deliberation into a structured decision memo. Include:\n1. **Final Decision** — clear recommendation (2-4 sentences)\n2. **Decision Map** — options considered\n3. **Top Recommendations** — ranked with reasoning\n4. **Council Stances** — each member's final position\n5. **Dissent & Tensions** — unresolved disagreements\n6. **Trade-offs Table** — what you gain/lose per option\n7. **Next Actions** — concrete steps\n8. **Deliberation Summary** — how the conversation unfolded\n\nBe decisive. The point of the council is to reach a decision, not to list options.`;
	} else if (options.finalStatement) {
		userPrompt = `## Brief\n\n${brief.raw}\n\n## Deliberation So Far\n\n${transcriptText}\n\n## Your Task\n\nGive your FINAL STATEMENT. This is your last chance to influence the decision.\n- Where does the council agree?\n- Where do you still disagree?\n- What is your final recommendation?\n- 50-150 words. Be direct.`;
	} else if (options.round === 1) {
		userPrompt = `## Brief\n\n${brief.raw}\n\n## Your Task (Round 1: Initial Positions)\n\nGive your initial position on this topic from your specialized perspective.\n- Be specific and substantive (50-150 words)\n- State your key concern, recommendation, or insight\n- You'll respond to other council members in the next round`;
	} else {
		userPrompt = `## Brief\n\n${brief.raw}\n\n## Deliberation So Far\n\n${transcriptText}\n\n## Your Task (Round ${options.round}: Responses & Challenges)\n\nRespond to the other council members:\n- Reference specific points they made\n- Challenge assumptions or add nuance\n- Build on points you agree with\n- 50-150 words. Engage with their actual arguments.`;
	}

	const messages: Message[] = [
		{
			role: "user",
			content: [{ type: "text", text: userPrompt }],
		} as UserMessage,
	];

	const context: Context = {
		systemPrompt: persona.systemPrompt,
		messages,
	};

	const result = await complete(model, context, {
		apiKey,
		headers,
		signal,
		maxTokens: options.writeMemo ? 4096 : 1024,
		temperature: 0.7,
	});

	const responseText = result.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n");

	return { response: responseText, message: result };
}

export type OnStatusUpdate = (memberName: string, status: "active" | "done", stats: MemberStats) => void;

export async function deliberate(
	config: CouncilConfig,
	brief: BriefContent,
	chairPersona: AgentPersona,
	memberPersonas: AgentPersona[],
	ctx: ExtensionContext,
	onStatusUpdate?: OnStatusUpdate,
): Promise<DeliberationResult> {
	const sessionId = generateSessionId();
	const startTime = Date.now();
	const transcript: TranscriptEntry[] = [];
	const stats: Record<string, MemberStats> = {};

	// Initialize stats
	const allMembers = [chairPersona, ...memberPersonas];
	for (const persona of allMembers) {
		stats[persona.name] = {
			name: persona.name,
			color: persona.color,
			turns: 0,
			inputTokens: 0,
			outputTokens: 0,
			cost: 0,
			contextTokens: 0,
			status: "idle",
			lastResponse: "",
		};
	}

	// Resolve models and auth
	const resolveModel = (persona: AgentPersona): Model<Api> => {
		const [provider, modelId] = persona.model.includes("/")
			? persona.model.split("/", 2)
			: ["anthropic", persona.model];
		const found = ctx.modelRegistry.find(provider, modelId);
		if (found) return found;

		// Fallback: try to find any sonnet model
		const fallback = ctx.modelRegistry.find("anthropic", "claude-sonnet-4-20250514");
		if (fallback) return fallback;

		throw new Error(`No model found for ${persona.model} and no fallback available`);
	};

	const getAuth = async (model: Model<Api>): Promise<{ apiKey?: string; headers?: Record<string, string> }> => {
		const result = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!result.ok) {
			throw new Error(`Auth failed for model ${model.id}: ${result.error}`);
		}
		return { apiKey: result.apiKey, headers: result.headers };
	};

	// Helper to update member stats after a call
	const updateStats = (persona: AgentPersona, msg: AssistantMessage, response: string, status: "active" | "done") => {
		const s = stats[persona.name];
		s.turns++;
		s.inputTokens += msg.usage?.input ?? 0;
		s.outputTokens += msg.usage?.output ?? 0;
		s.cost += msg.usage?.cost?.total ?? 0;
		s.contextTokens = msg.usage?.totalTokens ?? 0;
		s.status = status;
		s.lastResponse = response;
		onStatusUpdate?.(persona.name, status, s);
	};

	// Helper for budget/time checks
	const getTotalCost = () => Object.values(stats).reduce((sum, s) => sum + s.cost, 0);
	const isOverBudget = () => getTotalCost() >= config.meeting.constraints.max_budget;
	const isOverTime = () => (Date.now() - startTime) / 60000 >= config.meeting.constraints.max_time_minutes;

	// ── Phase 1: Chair Frames ────────────────────────────────────
	ctx.ui.notify("Chair — Framing the decision...", "info");
	stats[chairPersona.name].status = "active";
	onStatusUpdate?.(chairPersona.name, "active", stats[chairPersona.name]);

	const chairModel = resolveModel(chairPersona);
	const chairAuth = await getAuth(chairModel);

	const chairResult = await callMember(
		chairPersona,
		brief,
		[],
		chairModel,
		chairAuth.apiKey,
		chairAuth.headers,
		ctx.signal,
		{ phase: "framing", round: 0 },
	);

	transcript.push({
		round: 0,
		phase: "framing",
		member: chairPersona.name,
		content: chairResult.response,
		timestamp: Date.now(),
	});
	updateStats(chairPersona, chairResult.message, chairResult.response, "done");

	// ── Phase 2: Board Debates (N rounds) ────────────────────────
	const rounds = config.meeting.constraints.rounds;
	for (let round = 1; round <= rounds; round++) {
		if (isOverBudget() || isOverTime()) {
			ctx.ui.notify(`⚠️ Constraint hit — stopping at round ${round}`, "warning");
			break;
		}

		ctx.ui.notify(`Board Debates — Round ${round}/${rounds}`, "info");

		if (round === 1) {
			// Round 1: parallel — no cross-member dependencies
			for (const p of memberPersonas) {
				stats[p.name].status = "active";
				onStatusUpdate?.(p.name, "active", stats[p.name]);
			}

			const r1Results = await Promise.all(
				memberPersonas.map(async (persona) => {
					const model = resolveModel(persona);
					const auth = await getAuth(model);
					return {
						persona,
						...(await callMember(persona, brief, transcript, model, auth.apiKey, auth.headers, ctx.signal, {
							phase: `debate-round-1`,
							round: 1,
						})),
					};
				}),
			);

			// Push results in deterministic order
			for (const r of r1Results) {
				transcript.push({
					round: 1,
					phase: "debate",
					member: r.persona.name,
					content: r.response,
					timestamp: Date.now(),
				});
				updateStats(r.persona, r.message, r.response, "done");
			}
		} else {
			// Round 2+: sequential — members respond to transcript
			for (const persona of memberPersonas) {
				if (isOverBudget() || isOverTime()) break;

				stats[persona.name].status = "active";
				onStatusUpdate?.(persona.name, "active", stats[persona.name]);

				const model = resolveModel(persona);
				const auth = await getAuth(model);

				const result = await callMember(persona, brief, transcript, model, auth.apiKey, auth.headers, ctx.signal, {
					phase: `debate-round-${round}`,
					round,
				});

				transcript.push({
					round,
					phase: "debate",
					member: persona.name,
					content: result.response,
					timestamp: Date.now(),
				});
				updateStats(persona, result.message, result.response, "done");
			}
		}
	}

	// ── Phase 3: Final Statements (contrarian last) ──────────────
	if (!isOverBudget() && !isOverTime()) {
		ctx.ui.notify("Final Statements...", "info");

		// Contrarian goes last
		const contrarian = memberPersonas.find((p) => p.name.toLowerCase().includes("contrarian"));
		const orderedMembers = contrarian
			? [...memberPersonas.filter((p) => p !== contrarian), contrarian]
			: memberPersonas;

		for (const persona of orderedMembers) {
			if (isOverBudget() || isOverTime()) break;

			stats[persona.name].status = "active";
			onStatusUpdate?.(persona.name, "active", stats[persona.name]);

			const model = resolveModel(persona);
			const auth = await getAuth(model);

			const result = await callMember(persona, brief, transcript, model, auth.apiKey, auth.headers, ctx.signal, {
				phase: "final-statement",
				round: rounds + 1,
				finalStatement: true,
			});

			transcript.push({
				round: rounds + 1,
				phase: "final-statement",
				member: persona.name,
				content: result.response,
				timestamp: Date.now(),
			});
			updateStats(persona, result.message, result.response, "done");
		}
	}

	// ── Phase 4: Chair Synthesizes into Memo ─────────────────────
	ctx.ui.notify("Chair — Writing the memo...", "info");
	stats[chairPersona.name].status = "active";
	onStatusUpdate?.(chairPersona.name, "active", stats[chairPersona.name]);

	const synthModel = resolveModel(chairPersona);
	const synthAuth = await getAuth(synthModel);

	const synthResult = await callMember(
		chairPersona,
		brief,
		transcript,
		synthModel,
		synthAuth.apiKey,
		synthAuth.headers,
		ctx.signal,
		{ phase: "synthesis", round: rounds + 2, writeMemo: true },
	);

	transcript.push({
		round: rounds + 2,
		phase: "synthesis",
		member: chairPersona.name,
		content: synthResult.response,
		timestamp: Date.now(),
	});
	updateStats(chairPersona, synthResult.message, synthResult.response, "done");

	const endTime = Date.now();

	return {
		sessionId,
		brief,
		transcript,
		stats,
		synthesis: synthResult.response,
		startTime,
		endTime,
		totalCost: getTotalCost(),
	};
}

/**
 * Quick deliberation — single parallel round, no chair, no memo.
 * Returns formatted perspectives + quick summary.
 */
export async function quickDeliberate(
	config: CouncilConfig,
	brief: BriefContent,
	memberPersonas: AgentPersona[],
	ctx: ExtensionContext,
): Promise<{ synthesis: string; totalCost: number }> {
	const stats: Record<string, MemberStats> = {};

	for (const persona of memberPersonas) {
		stats[persona.name] = {
			name: persona.name,
			color: persona.color,
			turns: 0,
			inputTokens: 0,
			outputTokens: 0,
			cost: 0,
			contextTokens: 0,
			status: "idle",
			lastResponse: "",
		};
	}

	const resolveModel = (persona: AgentPersona): Model<Api> => {
		const [provider, modelId] = persona.model.includes("/")
			? persona.model.split("/", 2)
			: ["anthropic", persona.model];
		const found = ctx.modelRegistry.find(provider, modelId);
		if (found) return found;
		const fallback = ctx.modelRegistry.find("anthropic", "claude-sonnet-4-20250514");
		if (fallback) return fallback;
		throw new Error(`No model found for ${persona.model}`);
	};

	const getAuth = async (model: Model<Api>): Promise<{ apiKey?: string; headers?: Record<string, string> }> => {
		const result = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!result.ok) throw new Error(`Auth failed for model ${model.id}: ${result.error}`);
		return { apiKey: result.apiKey, headers: result.headers };
	};

	// All members in parallel, single round
	const results = await Promise.all(
		memberPersonas.map(async (persona) => {
			const model = resolveModel(persona);
			const auth = await getAuth(model);
			const r = await callMember(persona, brief, [], model, auth.apiKey, auth.headers, ctx.signal, {
				phase: "quick",
				round: 1,
			});
			stats[persona.name].turns = 1;
			stats[persona.name].cost = r.message.usage?.cost?.total ?? 0;
			return { persona, response: r.response };
		}),
	);

	const totalCost = Object.values(stats).reduce((sum, s) => sum + s.cost, 0);

	// Format output
	const perspectives = results
		.map((r) => `### ${r.persona.name}\n\n${r.response}`)
		.join("\n\n");

	const synthesis = `## Quick Council: ${brief.title}\n\n${perspectives}\n\n---\n\n_Quick check \u2014 $${totalCost.toFixed(2)}. Run /council for a full deliberation._`;

	return { synthesis, totalCost };
}
