/**
 * advisor.ts — Commitment-boundary second-opinion via subprocess model call.
 *
 * Mirrors the CC PAI Algorithm v6.3.0 § Verification Doctrine Rule 2:
 * call the advisor at three commitment boundaries on Extended+ ISAs —
 *   1. Before committing to an approach (after PLAN, before BUILD).
 *   2. When stuck or diverging (same problem resists two distinct attempts).
 *   3. Once after a durable deliverable, before phase: complete in LEARN.
 *
 * Pi has no shell-curl-as-doctrine path. We register an `advisor_check`
 * tool the model invokes; it spawns model-call.ts in advisor role (different
 * cognitive lineage than the executor) and returns structured findings.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { existsSync, readFileSync } from "node:fs";
import { callModel } from "./model-call.js";

const MAX_CONTEXT_FILES = 6;
const MAX_CONTEXT_BYTES_PER_FILE = 12_000;
const MAX_CONTEXT_BYTES_TOTAL = 50_000;

function loadContext(paths: string[] | undefined): string {
	if (!paths || paths.length === 0) return "";
	const slice = paths.slice(0, MAX_CONTEXT_FILES);
	let total = 0;
	const blocks: string[] = [];
	for (const p of slice) {
		if (!existsSync(p)) {
			blocks.push(`<file path="${p}" status="missing" />`);
			continue;
		}
		try {
			let body = readFileSync(p, "utf-8");
			if (body.length > MAX_CONTEXT_BYTES_PER_FILE) {
				body = body.slice(0, MAX_CONTEXT_BYTES_PER_FILE) + "\n…[truncated]";
			}
			if (total + body.length > MAX_CONTEXT_BYTES_TOTAL) {
				blocks.push(`<file path="${p}" status="omitted: total context budget exceeded" />`);
				continue;
			}
			total += body.length;
			blocks.push(`<file path="${p}">\n${body}\n</file>`);
		} catch (err) {
			blocks.push(`<file path="${p}" status="read-error: ${(err as Error).message}" />`);
		}
	}
	return blocks.join("\n\n");
}

const ADVISOR_SYSTEM_PROMPT = `You are the PAI Advisor — a commitment-boundary second-opinion. The principal agent (executor) has reached a decision point and is asking you to stress-test it before they commit.

Your job:
1. Read the TASK and QUESTION.
2. Examine any provided context.
3. Return a concise, candid verdict — agree, disagree, or "concerns" with the gaps you'd address before commitment.

Format your response as JSON:
{
  "verdict": "agree" | "concerns" | "disagree",
  "summary": "one-sentence headline",
  "concerns": ["specific concern 1", "specific concern 2", ...],
  "recommendations": ["actionable suggestion 1", ...]
}

Be direct. Do not flatter. Do not pad. If the executor's plan is sound, say "agree" and move on.`;

interface AdvisorFinding {
	verdict: "agree" | "concerns" | "disagree" | "unparseable";
	summary?: string;
	concerns?: string[];
	recommendations?: string[];
	rawText?: string;
}

function parseAdvisorResponse(text: string): AdvisorFinding {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	const candidate = fenced ? fenced[1] : text;
	const jsonStart = candidate.indexOf("{");
	const jsonEnd = candidate.lastIndexOf("}");
	if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
		return { verdict: "unparseable", rawText: text.slice(0, 1000) };
	}
	try {
		const parsed = JSON.parse(candidate.slice(jsonStart, jsonEnd + 1)) as AdvisorFinding;
		const verdict = parsed.verdict;
		if (verdict !== "agree" && verdict !== "concerns" && verdict !== "disagree") {
			return { verdict: "unparseable", rawText: text.slice(0, 1000) };
		}
		return {
			verdict,
			summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
			concerns: Array.isArray(parsed.concerns) ? parsed.concerns.filter((c) => typeof c === "string") : [],
			recommendations: Array.isArray(parsed.recommendations)
				? parsed.recommendations.filter((r) => typeof r === "string")
				: [],
		};
	} catch {
		return { verdict: "unparseable", rawText: text.slice(0, 1000) };
	}
}

export function registerAdvisor(pi: ExtensionAPI) {
	pi.registerTool({
		name: "advisor_check",
		label: "Advisor",
		description:
			"Commitment-boundary second-opinion. Spawns the advisor model (different reasoning lineage) and returns a structured verdict {agree|concerns|disagree} with concerns and recommendations. Call before committing to an approach, when stuck, or before phase: complete on Extended+ ISAs.",
		parameters: Type.Object({
			task: Type.String({ description: "One-sentence task description (e.g., 'Refactor auth middleware for compliance')" }),
			question: Type.String({
				description:
					"Specific decision point or 'any gaps before declaring done?'. Be concrete; the advisor doesn't see the full chat.",
			}),
			context_paths: Type.Optional(
				Type.Array(Type.String(), {
					description: "Up to 6 absolute file paths to include as context (ISA, key source files). Each truncated to 12KB.",
				}),
			),
			thinking: Type.Optional(
				Type.String({
					description: "Thinking level for the advisor model: off|low|medium|high. Default 'medium' for advisor calls.",
				}),
			),
		}),
		async execute(_id, params) {
			const contextBlock = loadContext(params.context_paths);
			const userPrompt = [
				`TASK: ${params.task}`,
				`QUESTION: ${params.question}`,
				contextBlock ? `\nCONTEXT:\n${contextBlock}` : "",
			]
				.filter(Boolean)
				.join("\n");

			const thinking = (params.thinking as "off" | "low" | "medium" | "high" | undefined) ?? "medium";
			const result = await callModel("advisor", userPrompt, {
				systemPrompt: ADVISOR_SYSTEM_PROMPT,
				thinking,
				cache: false,
			});

			if (!result.ok) {
				const text =
					`advisor_check FAILED: ${result.error ?? "unknown"}\n\n` +
					`The advisor subprocess did not complete. Proceed with executor's own judgement and surface this gap to the user.`;
				const details: Record<string, unknown> = { error: true, reason: result.error, source: result.source };
				return { content: [{ type: "text" as const, text }], details };
			}

			const finding = parseAdvisorResponse(result.text ?? "");
			const lines: string[] = [];
			lines.push(`advisor_check: VERDICT = ${finding.verdict.toUpperCase()}`);
			if (finding.summary) lines.push(`Summary: ${finding.summary}`);
			if (finding.concerns && finding.concerns.length > 0) {
				lines.push("Concerns:");
				for (const c of finding.concerns) lines.push(`  - ${c}`);
			}
			if (finding.recommendations && finding.recommendations.length > 0) {
				lines.push("Recommendations:");
				for (const r of finding.recommendations) lines.push(`  - ${r}`);
			}
			if (finding.verdict === "unparseable") {
				lines.push(`(Advisor returned non-JSON. Raw excerpt below.)`);
				lines.push(finding.rawText ?? "");
			}

			const details: Record<string, unknown> = {
				verdict: finding.verdict,
				summary: finding.summary,
				concerns: finding.concerns,
				recommendations: finding.recommendations,
				latencyMs: result.latencyMs,
			};
			return { content: [{ type: "text" as const, text: lines.join("\n") }], details };
		},
		promptSnippet:
			"advisor_check - Commitment-boundary second-opinion via separate model; returns verdict + concerns + recommendations",
		promptGuidelines: [
			"Call at three commitment boundaries on Extended+ ISAs: (1) after PLAN before BUILD, (2) when stuck on the same problem twice, (3) before phase: complete in LEARN.",
			"Pass concrete TASK + QUESTION; the advisor sees no chat history.",
			"Include ISA path and the 1-3 most relevant source files as context_paths. Each truncated to 12KB.",
			"On verdict 'concerns' or 'disagree': do not silently override. Surface to user; if empirical evidence later contradicts, re-call once with the conflict explicit (max 2 re-calls per conflict before escalating).",
		],
	});
}
