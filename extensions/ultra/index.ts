/**
 * Ultra Modes Extension
 *
 * Keyword-triggered cognitive modes that boost thinking depth and inject
 * specialized reasoning instructions. Per-turn by default, sticky via commands.
 *
 * Keywords (detected at start of message, case-insensitive):
 *   ULTRATHINK  — max thinking budget + deep multi-angle analysis
 *   ULTRAWIDE   — divergent exploration, unconventional approaches
 *   ULTRAFOCUS  — surgical precision, verify assumptions, narrow scope
 *   ULTRACARE   — defensive mode, security-aware, edge cases, thorough testing
 *
 * Commands (sticky toggle):
 *   /ultra [mode]  — toggle a mode on/off, or show selector
 *   /ultra off     — disable all modes
 *
 * When active, sets thinking level to xhigh and injects mode-specific
 * reasoning instructions into the system prompt for that turn.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ─── Mode Definitions ────────────────────────────────────────────────────────

export type UltraMode = "think" | "wide" | "focus" | "care";

// ThinkingLevel as used by pi's extension API (includes "off")
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

interface ModeConfig {
	keyword: string;
	label: string;
	emoji: string;
	thinkingLevel: ThinkingLevel;
	prompt: string;
}

const MODES: Record<UltraMode, ModeConfig> = {
	think: {
		keyword: "ULTRATHINK",
		label: "ULTRATHINK",
		emoji: "🧠",
		thinkingLevel: "xhigh",
		prompt: `## DEEP ANALYSIS MODE

You have been asked to think with exceptional depth. Before responding:

1. DECOMPOSE — Break the problem into its fundamental components. Separate real constraints from assumed ones. What is actually fixed vs. what feels fixed?

2. EXPLORE ALTERNATIVES — Generate at least 3 meaningfully different approaches. Don't anchor on the first viable solution. Consider approaches from different paradigms, disciplines, or abstraction levels.

3. CHALLENGE ASSUMPTIONS — What would the strongest critic push back on? What's the counter-argument to your preferred approach? What are you taking for granted that might be wrong?

4. SECOND-ORDER EFFECTS — What does each option make easier or harder 6 months from now? What doors does it open or close? What maintenance burden does it create?

5. EDGE CASES & FAILURE MODES — What breaks at scale? Under concurrency? With adversarial input? What's the worst case, and is it acceptable?

6. SYNTHESIS — After exploring the space, commit to a recommendation with clear reasoning. State what you'd do differently if constraints changed.

Take your full thinking budget. The user explicitly asked for depth over speed. Thoroughness is the priority.`,
	},
	wide: {
		keyword: "ULTRAWIDE",
		label: "ULTRAWIDE",
		emoji: "🌊",
		thinkingLevel: "xhigh",
		prompt: `## DIVERGENT EXPLORATION MODE

You have been asked to think expansively and unconventionally. Your goal is maximum creative coverage of the solution space.

RULES FOR THIS TURN:
- DO NOT converge early. Resist the pull toward the "obvious" answer.
- Generate ideas from at least 3 different mental models or disciplines (e.g., if it's a software problem, think about it from biology, economics, game theory, UX psychology, distributed systems, etc.)
- Include at least one "wild card" option that sounds impractical but reveals something about the problem space.
- For each idea, note what unique advantage it has that NO other approach shares.
- Look for combinations — can you merge the best parts of different approaches?
- Question the problem framing itself. Is the user solving the right problem? Is there a reframe that makes the problem disappear?

STRUCTURE:
- Start with a rapid divergent brainstorm (quantity over quality)
- Then evaluate: which ideas have legs? Which reveal something non-obvious?
- End with your top recommendations, noting which are safe bets vs. high-upside gambles

Think outside the box. The user wants breadth and novelty, not the first correct answer.`,
	},
	focus: {
		keyword: "ULTRAFOCUS",
		label: "ULTRAFOCUS",
		emoji: "🎯",
		thinkingLevel: "high",
		prompt: `## SURGICAL PRECISION MODE

You have been asked for maximum precision and correctness. Every claim must be verified, every assumption stated explicitly.

RULES FOR THIS TURN:
- NARROW SCOPE — Do exactly what was asked. Nothing more. If scope is ambiguous, ask before assuming.
- VERIFY BEFORE CLAIMING — If you reference a function, file, or API: confirm it exists. Don't trust memory alone.
- STATE ASSUMPTIONS — List every assumption you're making. If any are uncertain, flag them.
- TRACE DEPENDENCIES — For any change, trace what depends on it. What calls this? What reads this state? What breaks if this changes?
- MINIMAL DIFF — Make the smallest change that solves the problem. Don't refactor adjacent code. Don't "improve" what wasn't broken.
- DOUBLE-CHECK — Before presenting your answer, re-read the user's request. Did you actually answer what they asked? Did you drift?

If you're writing code:
- Read the file before editing. Read the full function, not just the line.
- Check for existing tests. Will your change break them?
- Consider: is there a simpler way to do this that you're overcomplicating?

Precision over speed. Get it right the first time.`,
	},
	care: {
		keyword: "ULTRACARE",
		label: "ULTRACARE",
		emoji: "🛡️",
		thinkingLevel: "xhigh",
		prompt: `## DEFENSIVE ENGINEERING MODE

You have been asked to prioritize safety, robustness, and thoroughness. Think like a security engineer reviewing production code.

RULES FOR THIS TURN:
- THREAT MODEL — Before implementing, consider: who/what can misuse this? What inputs are untrusted? What's the blast radius of failure?
- INPUT VALIDATION — Every external input is hostile until proven safe. Check boundaries, types, encoding, length, null cases.
- ERROR PATHS — For every operation that can fail: what happens on failure? Is the error handled? Is state left consistent? Can partial failures leave corruption?
- CONCURRENCY — If anything is shared or async: what are the race conditions? What ordering assumptions exist? Are they enforced?
- SECURITY CHECKLIST — Injection (SQL, command, XSS)? Auth/authz gaps? Secrets in logs/errors? TOCTOU? Privilege escalation paths?
- TEST COVERAGE — What tests need to exist? What's the minimal set that catches regressions? Are edge cases covered (empty, huge, unicode, concurrent, partial failure)?
- ROLLBACK — If this goes wrong in production, how do you undo it? Is there a safe fallback?

After your implementation, provide a brief "security notes" section listing:
- Assumptions made about trust boundaries
- Known limitations or accepted risks
- What additional hardening could be done if time allowed

Be paranoid. The user wants defense in depth.`,
	},
};

// Map keywords to modes for lookup
const KEYWORD_TO_MODE: Record<string, UltraMode> = {};
for (const [mode, config] of Object.entries(MODES)) {
	KEYWORD_TO_MODE[config.keyword.toLowerCase()] = mode as UltraMode;
}

// ─── Extension ───────────────────────────────────────────────────────────────

export default function ultraExtension(pi: ExtensionAPI) {
	// State: per-turn mode (set by keyword, cleared after turn)
	let turnMode: UltraMode | null = null;
	// State: sticky mode (set by command, persists across turns)
	let stickyMode: UltraMode | null = null;
	// State: previous thinking level (to restore after turn)
	let previousThinkingLevel: ReturnType<typeof pi.getThinkingLevel> | null = null;

	// ─── Input Detection ───────────────────────────────────────────────────

	pi.on("input", async (event, _ctx) => {
		if (event.source === "extension") return { action: "continue" as const };

		const text = event.text.trim();
		const firstWord = text.split(/\s+/)[0]?.toLowerCase();

		if (firstWord && KEYWORD_TO_MODE[firstWord]) {
			turnMode = KEYWORD_TO_MODE[firstWord];
			const rest = text.slice(firstWord.length).trim();

			if (!rest) {
				// Keyword alone — just activate mode for next prompt
				// (will apply to whatever they type next, or they can continue typing)
				return { action: "transform" as const, text: "" };
			}

			return { action: "transform" as const, text: rest };
		}

		return { action: "continue" as const };
	});

	// ─── System Prompt Injection + Thinking Level Boost ─────────────────────

	pi.on("before_agent_start", async (event, _ctx) => {
		const activeMode = turnMode ?? stickyMode;
		if (!activeMode) return undefined;

		const config = MODES[activeMode];

		// Boost thinking level
		previousThinkingLevel = pi.getThinkingLevel();
		pi.setThinkingLevel(config.thinkingLevel);

		// Inject mode prompt
		return {
			systemPrompt: event.systemPrompt + "\n\n" + config.prompt,
		};
	});

	// ─── Reset After Turn ──────────────────────────────────────────────────

	pi.on("agent_end", async () => {
		// Restore thinking level if we changed it
		if (previousThinkingLevel !== null) {
			pi.setThinkingLevel(previousThinkingLevel);
			previousThinkingLevel = null;
		}
		// Clear per-turn mode (sticky persists)
		turnMode = null;
	});

	// ─── Visual Feedback ───────────────────────────────────────────────────

	function showUltraVisuals(ctx: { ui: any }) {
		const activeMode = turnMode ?? stickyMode;
		if (!activeMode) return;

		const config = MODES[activeMode];
		const theme = ctx.ui.theme;

		// Glowing status in footer
		ctx.ui.setStatus(
			"ultra",
			theme.fg("thinkingXhigh", `${config.emoji} ${config.label}`) +
				(stickyMode ? theme.fg("dim", " (sticky)") : ""),
		);

		// Animated working indicator — pulsing glow
		ctx.ui.setWorkingIndicator({
			frames: [
				theme.fg("dim", "⟡"),
				theme.fg("thinkingMedium", "⟡"),
				theme.fg("thinkingHigh", "⟡"),
				theme.fg("thinkingXhigh", "⟡"),
				theme.fg("thinkingHigh", "⟡"),
				theme.fg("thinkingMedium", "⟡"),
			],
			intervalMs: 150,
		});

		// Widget banner above editor
		ctx.ui.setWidget("ultra", [
			theme.fg("thinkingXhigh", `━━━ ${config.emoji} ${config.label} `) +
				theme.fg("dim", "━".repeat(40)),
		]);
	}

	function clearUltraVisuals(ctx: { ui: any }) {
		ctx.ui.setStatus("ultra", "");
		ctx.ui.setWidget("ultra", undefined);
		ctx.ui.setWorkingIndicator(); // restore default
	}

	pi.on("turn_start", async (_event, ctx) => {
		showUltraVisuals(ctx);
	});

	pi.on("turn_end", async (_event, ctx) => {
		if (!stickyMode) {
			clearUltraVisuals(ctx);
		}
	});

	// ─── Commands ──────────────────────────────────────────────────────────

	pi.registerCommand("ultra", {
		description: "Toggle ultra mode (think/wide/focus/care/off)",
		handler: async (args, ctx) => {
			const arg = args?.trim().toLowerCase();

			// /ultra off — disable
			if (arg === "off" || arg === "none" || arg === "disable") {
				if (stickyMode) {
					const prev = MODES[stickyMode];
					stickyMode = null;
					clearUltraVisuals(ctx);
					ctx.ui.notify(`${prev.emoji} ${prev.label} disabled`, "info");
				} else {
					ctx.ui.notify("No ultra mode active", "info");
				}
				return;
			}

			// /ultra <mode> — toggle specific mode
			const modeMap: Record<string, UltraMode> = {
				think: "think",
				ultrathink: "think",
				wide: "wide",
				ultrawide: "wide",
				focus: "focus",
				ultrafocus: "focus",
				care: "care",
				ultracare: "care",
			};

			if (arg && modeMap[arg]) {
				const mode = modeMap[arg];
				if (stickyMode === mode) {
					// Toggle off
					stickyMode = null;
					clearUltraVisuals(ctx);
					ctx.ui.notify(`${MODES[mode].emoji} ${MODES[mode].label} disabled`, "info");
				} else {
					stickyMode = mode;
					showUltraVisuals(ctx);
					ctx.ui.notify(`${MODES[mode].emoji} ${MODES[mode].label} enabled (sticky — stays on until /ultra off)`, "info");
				}
				return;
			}

			// /ultra — show selector
			const items = [
				...Object.entries(MODES).map(([key, config]) => ({
					value: key,
					label: `${config.emoji} ${config.label}${stickyMode === key ? " ✓" : ""}`,
				})),
				{ value: "off", label: "❌ Off" },
			];

			const choice = await ctx.ui.select("Ultra Mode", items.map((i) => i.label));
			if (!choice) return;

			const selected = items.find((i) => i.label === choice);
			if (!selected) return;

			if (selected.value === "off") {
				stickyMode = null;
				clearUltraVisuals(ctx);
				ctx.ui.notify("Ultra modes disabled", "info");
			} else {
				stickyMode = selected.value as UltraMode;
				showUltraVisuals(ctx);
				ctx.ui.notify(`${MODES[stickyMode].emoji} ${MODES[stickyMode].label} enabled (sticky)`, "info");
			}
		},
	});

	// ─── Keyboard Shortcut ─────────────────────────────────────────────────

	pi.registerShortcut("ctrl+shift+u", {
		description: "Cycle ultra modes",
		handler: async (ctx) => {
			const modeOrder: (UltraMode | null)[] = [null, "think", "wide", "focus", "care"];
			const currentIndex = modeOrder.indexOf(stickyMode);
			const nextIndex = (currentIndex + 1) % modeOrder.length;
			const next = modeOrder[nextIndex];

			if (next === null) {
				stickyMode = null;
				clearUltraVisuals(ctx);
				ctx.ui.notify("Ultra modes off", "info");
			} else {
				stickyMode = next;
				showUltraVisuals(ctx);
				ctx.ui.notify(`${MODES[next].emoji} ${MODES[next].label}`, "info");
			}
		},
	});
}
