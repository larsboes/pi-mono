/**
 * doctrine-enforcer.ts — soft-enforce PAI doctrine output format on the
 * session model, regardless of model family.
 *
 * Why this exists:
 *   The doctrine block in algorithm.ts injects into the system prompt at E2+.
 *   Anthropic models (Sonnet/Opus) follow it cleanly. Other model families
 *   (Qwen, Kimi, Gemini, GPT) often treat the doctrine as decorative — they
 *   answer the question correctly but skip phase headers, intent echo, and
 *   the closing summary block. The result: the user can't tell from output
 *   whether the Algorithm fired or not.
 *
 * Approach (two-pronged):
 *   1. before_agent_start (this file) — at E2+, prepend a strong imperative
 *      to the user message itself ("🎯 INTENT-ECHO REQUIRED — start your
 *      reply with: 🎯 INTENT: <one-sentence>"). User messages get more
 *      obedience than system prompts in non-Anthropic-trained models.
 *   2. agent_end (this file) — scan the last assistant turn for required
 *      markers (🎯 INTENT, phase header, 📃 SUMMARY). If missing, log a
 *      violation and stage a corrective nudge for the next turn.
 *
 * Soft enforcement: log + nudge, never block. The doctrine is the source of
 * truth; this file ensures the model doesn't quietly ignore it.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getAlgoState } from "./algorithm.js";
import {
	parseDoctrineOutput,
	checkThinkingFloor,
	detectMultiAskPrompt,
	type EffortTier,
} from "./doctrine-parser.js";

const VIOLATION_LOG = join(homedir(), ".pai", "data", "verification-violations.jsonl");

let pendingDoctrineNudge: string | null = null;
/** Set by before_agent_start when the prompt has 2+ explicit sub-tasks. Read at agent_end. */
let lastPromptMultiAsk: { multiAsk: boolean; reasons: string[] } = { multiAsk: false, reasons: [] };

function logViolation(entry: Record<string, unknown>): void {
	try {
		mkdirSync(join(homedir(), ".pai", "data"), { recursive: true });
		appendFileSync(VIOLATION_LOG, JSON.stringify({ ...entry, ts: new Date().toISOString() }) + "\n");
	} catch {}
}

interface ComplianceCheck {
	hasIntent: boolean;
	hasPhaseHeader: boolean;
	hasSummary: boolean;
	hasCapabilities: boolean;
	score: number;
	missing: string[];
}

const PHASE_HEADER_RX = /━━━\s*[👁🧠📋🔨⚡✅📚📃]+\s*(OBSERVE|THINK|PLAN|BUILD|EXECUTE|VERIFY|LEARN|SUMMARY)/i;
const INTENT_RX = /🎯\s*INTENT:/i;
const SUMMARY_RX = /━━━\s*📃\s*SUMMARY|🖊️\s*STORY:/i;
const CAPABILITIES_RX = /🏹\s*CAPABILITIES SELECTED/i;

function checkCompliance(text: string): ComplianceCheck {
	const hasIntent = INTENT_RX.test(text);
	const hasPhaseHeader = PHASE_HEADER_RX.test(text);
	const hasSummary = SUMMARY_RX.test(text);
	const hasCapabilities = CAPABILITIES_RX.test(text);
	const missing: string[] = [];
	if (!hasIntent) missing.push("🎯 INTENT echo");
	if (!hasPhaseHeader) missing.push("phase header (━━━ ... ━━━)");
	if (!hasSummary) missing.push("📃 SUMMARY closing block");
	if (!hasCapabilities) missing.push("🏹 CAPABILITIES SELECTED");
	const score =
		(hasIntent ? 1 : 0) +
		(hasPhaseHeader ? 1 : 0) +
		(hasSummary ? 1 : 0) +
		(hasCapabilities ? 1 : 0);
	return { hasIntent, hasPhaseHeader, hasSummary, hasCapabilities, score, missing };
}

function buildFinalImperative(tier: string): string {
	const tierUpper = tier.toUpperCase();
	return `<system-reminder priority="critical">
PAI ALGORITHM ${tierUpper} — REQUIRED OUTPUT FORMAT

These markers MUST appear in your **VISIBLE RESPONSE** (the text the user
sees), NOT in your reasoning/thinking trace. If extended thinking is enabled,
you may use it freely — but the markers below must also appear in the text
output that follows your reasoning. The doctrine-enforcer scans only your
visible response; markers buried in reasoning do not count.

Required, in this order:

1. \`🎯 INTENT: <one-sentence restatement of the user's request>\` — FIRST line of your visible response, before any prose, tool call, or analysis.
2. \`━━━ 👁️ OBSERVE ━━━\` phase header, then reverse-engineering and preflight gates.
3. \`🏹 CAPABILITIES SELECTED:\` listing each capability you'll invoke (use names verbatim from the closed enumeration in the doctrine block above).
4. A phase header for every phase you enter: \`━━━ 🧠 THINK ━━━\`, \`━━━ 📋 PLAN ━━━\`, \`━━━ 🔨 BUILD ━━━\`, \`━━━ ⚡ EXECUTE ━━━\`, \`━━━ ✅ VERIFY ━━━\`, \`━━━ 📚 LEARN ━━━\`.
5. \`━━━ 📃 SUMMARY ━━━\` block at the end containing: 🔄 ITERATION (only on follow-ups), 📃 CONTENT, 🖊️ STORY (4 bullets), 🗣️ summary line.

This is not optional formatting. If you handle the entire request inside
reasoning/thinking and emit only a polished answer in the visible response,
that is non-compliant — the visible response is what the doctrine-enforcer
checks, and what becomes part of the conversation log.
</system-reminder>`;
}

function buildPhantomNudge(phantomNames: string[]): string {
	return [
		"## PAI Capability-Name Audit — phantom thinking capabilities detected",
		"",
		"Your previous response named the following thinking capabilities under `🏹 CAPABILITIES SELECTED:` that are NOT in the v6.3.0 closed enumeration:",
		"",
		...phantomNames.map((n) => `- \`${n}\` — phantom (does NOT count toward the tier thinking floor)`),
		"",
		"The closed enumeration (verbatim names): IterativeDepth, ApertureOscillation, FeedbackMemoryConsult, Advisor, ReReadCheck, FirstPrinciples, SystemsThinking, RootCauseAnalysis, Council, RedTeam, Science, BeCreative, Ideate, BitterPillEngineering, Evals, WorldThreatModel, Fabric patterns, ContextSearch, ISA.",
		"",
		"On the next response, replace each phantom with the closest match from the closed list, OR remove it. Inventing labels is a CRITICAL FAILURE per Algorithm § Capability-Name Audit Gate.",
	].join("\n");
}

function buildFloorNudge(declared: number, required: number, tier: string, declaredNames: string[]): string {
	return [
		`## PAI Thinking Floor — under-floor at ${tier.toUpperCase()}`,
		"",
		`Your previous response declared ${declared} genuine thinking capabilities; ${tier.toUpperCase()} requires ≥${required}.`,
		"",
		`Declared: ${declaredNames.length > 0 ? declaredNames.join(", ") : "(none)"}.`,
		"",
		"The thinking floor is HARD per v6.3.0 — non-relaxable via show-your-math. Add capabilities from the closed enumeration that the work genuinely needs, then invoke each one.",
	].join("\n");
}

function buildManifestNudge(reasons: string[]): string {
	return [
		"## PAI Deliverable Manifest — multi-task prompt without manifest",
		"",
		`Your previous prompt contained 2+ explicit sub-tasks (signals: ${reasons.join(", ")}) but your response did not include a \`📦 DELIVERABLE MANIFEST:\` block at PLAN.`,
		"",
		"Per Algorithm § Deliverable Manifest, every prompt with 2+ explicit sub-tasks must produce a numbered manifest mapping each sub-task to ≥1 ISC. Without the manifest, sub-tasks silently disappear from VERIFY.",
		"",
		"On the next response, enumerate D1..DN under the manifest block, quoting distinctive phrasing from the request.",
	].join("\n");
}

function buildCorrectionNudge(missing: string[], lastTurnHead: string, lastTurnTail: string): string {
	return `<pai-doctrine-violation>
Your previous response did not follow PAI Algorithm output format. Missing markers in your visible response: ${missing.join(", ")}.

If you used thinking/reasoning for that previous turn, the markers may have appeared THERE — but they need to appear in your VISIBLE RESPONSE (the text the user sees), not the reasoning trace. The doctrine-enforcer only scans visible response text.

Head of your last visible response (first 240 chars):
"${lastTurnHead.slice(0, 240)}"

Tail of your last visible response (last 240 chars):
"${lastTurnTail.slice(-240)}"

For your NEXT response, place these in the visible output text:
- Start your visible response with \`🎯 INTENT: <one-sentence restatement>\` — first line, before any prose.
- Use phase headers (\`━━━ 👁️ OBSERVE ━━━\`, etc.) for every phase you enter.
- Name capabilities under \`🏹 CAPABILITIES SELECTED:\`.
- End with \`━━━ 📃 SUMMARY ━━━\` block.

If your task is genuinely E1 (single-step lookup, trivial fix), you may skip phase headers — but the INTENT echo in your visible response is mandatory at every tier above MINIMAL.
</pai-doctrine-violation>`;
}

export function registerDoctrineEnforcer(pi: ExtensionAPI) {
	// At E2+, append a strong final imperative as the LAST thing in the system
	// prompt. Pi's BeforeAgentStartEventResult only exposes { message, systemPrompt }
	// — there's no user-prompt rewrite channel. The system-prompt tail is the
	// strongest position we have: most models attend more strongly to the most
	// recent system content, especially when wrapped as <system-reminder>.
	//
	// We register this AFTER algorithm.ts's own before_agent_start handler. Pi
	// chains multiple extensions returning systemPrompt — we append the
	// imperative on top of whatever algorithm.ts produced.
	pi.on("before_agent_start", async (event) => {
		const algo = getAlgoState();

		// Detect multi-ask prompt for the Deliverable Manifest check (#18). Stored
		// in module-level state for agent_end to read alongside the parsed output.
		lastPromptMultiAsk = detectMultiAskPrompt(event.prompt ?? "");

		const parts: string[] = [];

		// 1. Pending correction nudge (from previous turn's compliance check).
		if (pendingDoctrineNudge) {
			parts.push("<system-reminder>\n" + pendingDoctrineNudge + "\n</system-reminder>");
			pendingDoctrineNudge = null;
		}

		// 2. Final imperative at E2+ — last position in system prompt.
		if (algo.lastTier && algo.lastTier !== "e1") {
			parts.push(buildFinalImperative(algo.lastTier));
		}

		// Diagnostic trace.
		try {
			mkdirSync(join(homedir(), ".pai", "data"), { recursive: true });
			appendFileSync(
				join(homedir(), ".pai", "data", "doctrine-enforcer-trace.jsonl"),
				JSON.stringify({
					ts: new Date().toISOString(),
					handler: "before_agent_start",
					lastTier: algo.lastTier,
					injectedNudge: parts.length > 0,
					nudgeBytes: parts.join("").length,
					inputSystemPromptLen: event.systemPrompt.length,
				}) + "\n",
			);
		} catch {}

		if (parts.length === 0) return;

		return {
			systemPrompt: event.systemPrompt + "\n\n" + parts.join("\n\n"),
		};
	});

	// On agent_end, scan the last assistant message for compliance markers.
	// Stage a corrective nudge if missing.
	pi.on("agent_end", async (event) => {
		const algo = getAlgoState();

		// Diagnostic: log every agent_end fire so we can confirm this handler
		// actually runs. If you see no entries here after a prompt, the handler
		// itself isn't being called.
		try {
			mkdirSync(join(homedir(), ".pai", "data"), { recursive: true });
			appendFileSync(
				join(homedir(), ".pai", "data", "doctrine-enforcer-trace.jsonl"),
				JSON.stringify({
					ts: new Date().toISOString(),
					handler: "agent_end",
					lastTier: algo.lastTier,
					messageCount: (event.messages || []).length,
				}) + "\n",
			);
		} catch {}

		if (!algo.lastTier || algo.lastTier === "e1") return;

		const messages = event.messages || [];
		// Find last assistant message text content. AgentMessage content may be
		// a string OR an array of content blocks.
		let lastAssistantText = "";
		for (let i = messages.length - 1; i >= 0; i--) {
			const m = messages[i] as { role?: string; content?: unknown };
			if (m && m.role === "assistant") {
				if (typeof m.content === "string") {
					lastAssistantText = m.content;
				} else if (Array.isArray(m.content)) {
					const parts: string[] = [];
					for (const block of m.content as Array<{ type?: string; text?: string }>) {
						if (block && typeof block.text === "string") parts.push(block.text);
					}
					lastAssistantText = parts.join("\n");
				}
				break;
			}
		}

		// Trace what we found.
		try {
			// Capture HEAD too — INTENT echo lives at the start, not the tail
			const head = lastAssistantText.slice(0, 300);
			// Detect each marker's codepoints individually for diagnosis
			const has1F3AF = /\u{1F3AF}/u.test(lastAssistantText);  // 🎯
			const hasIntentColon = /INTENT:/i.test(lastAssistantText);
			const has1F3F9 = /\u{1F3F9}/u.test(lastAssistantText);  // 🏹
			const hasBoxLine = /━━━/u.test(lastAssistantText);
			appendFileSync(
				join(homedir(), ".pai", "data", "doctrine-enforcer-trace.jsonl"),
				JSON.stringify({
					ts: new Date().toISOString(),
					handler: "agent_end:scan",
					lastTier: algo.lastTier,
					assistantTextLen: lastAssistantText.length,
					head: head,
					tail: lastAssistantText.slice(-200),
					rawCodepoints: { has_1F3AF_target: has1F3AF, has_INTENT_colon: hasIntentColon, has_1F3F9_bow: has1F3F9, has_box_line: hasBoxLine },
				}) + "\n",
			);
		} catch {}

		if (!lastAssistantText) return;

		// ── v6.3.0 § Capability-Name Audit Gate + Thinking Floor (#6, #8) ──
		// Parse the assistant output as structured doctrine and check for
		// phantoms + under-floor declarations. These are doctrine violations
		// per v6.3.0 Rules and join the existing format-compliance checks.
		const tier = algo.lastTier as EffortTier;
		const parsed = parseDoctrineOutput(lastAssistantText);
		const floor = checkThinkingFloor(parsed, tier);
		const additionalNudges: string[] = [];

		// Phantom check fires at E2+ (E1 has thinking floor 0 — the closed-enumeration
		// rule still applies in principle, but we don't nudge on the fast-path).
		if (tier !== "e1" && floor.phantomNames.length > 0) {
			logViolation({
				event: "phantom-thinking-capability",
				tier,
				phantom_names: floor.phantomNames,
				declared_names: floor.declaredNames,
			});
			additionalNudges.push(buildPhantomNudge(floor.phantomNames));
		}

		// Thinking-floor check fires whenever the model entered the Algorithm at E2+
		// AND the tier requires ≥1 thinking cap. If the model didn't even enter
		// the Algorithm (no phase headers), the format-compliance check below
		// already handles that case, so we skip the floor nudge to avoid
		// double-nudging.
		if (
			tier !== "e1" &&
			parsed.enteredAlgorithm &&
			!floor.met &&
			floor.requiredThinking > 0
		) {
			logViolation({
				event: "thinking-floor-miss",
				tier,
				declared_count: floor.declaredThinking,
				required_count: floor.requiredThinking,
				declared_names: floor.declaredNames,
			});
			additionalNudges.push(
				buildFloorNudge(floor.declaredThinking, floor.requiredThinking, tier, floor.declaredNames),
			);
		}

		// Deliverable Manifest check (#18) — fires at E2+ when the prompt was
		// multi-ask AND the response entered the Algorithm but had no manifest.
		if (
			tier !== "e1" &&
			lastPromptMultiAsk.multiAsk &&
			parsed.enteredAlgorithm &&
			parsed.deliverableManifest.length === 0
		) {
			logViolation({
				event: "missing-deliverable-manifest",
				tier,
				prompt_signals: lastPromptMultiAsk.reasons,
			});
			additionalNudges.push(buildManifestNudge(lastPromptMultiAsk.reasons));
		}
		// Reset multi-ask state after each agent_end so the next prompt's
		// before_agent_start sets it fresh.
		lastPromptMultiAsk = { multiAsk: false, reasons: [] };

		const check = checkCompliance(lastAssistantText);
		// At E2 we want intent + (phase-header OR summary). At E3+ we want all.
		const minScore = algo.lastTier === "e2" ? 2 : 3;

		try {
			appendFileSync(
				join(homedir(), ".pai", "data", "doctrine-enforcer-trace.jsonl"),
				JSON.stringify({
					ts: new Date().toISOString(),
					handler: "agent_end:check",
					tier: algo.lastTier,
					score: check.score,
					minScore,
					missing: check.missing,
					triggered: check.score < minScore,
				}) + "\n",
			);
		} catch {}

		// Format-compliance nudge (existing behavior — fires when score < minScore).
		const correctionNudge =
			check.score < minScore
				? (logViolation({
						event: "doctrine-format-violation",
						tier: algo.lastTier,
						score: check.score,
						missing: check.missing,
						tail: lastAssistantText.slice(-200),
					}),
					buildCorrectionNudge(check.missing, lastAssistantText.slice(0, 240), lastAssistantText))
				: null;

		// Combine all nudges (correction + phantom + floor + manifest) into one
		// pending nudge. ISC-7 requires this to be a single staged block, not
		// multiple separate nudges that would clutter the next prompt.
		const allNudges = [correctionNudge, ...additionalNudges].filter(
			(n): n is string => typeof n === "string" && n.length > 0,
		);
		if (allNudges.length > 0) {
			pendingDoctrineNudge = allNudges.join("\n\n---\n\n");
		}
	});
}
