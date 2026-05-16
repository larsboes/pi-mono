/**
 * PAI Inline Verification — soft-enforce the "no [ ]→[x] without evidence" rule.
 *
 * Watches `tool_result` events. When an Edit or Write touches `.pi/ISA.md` and
 * flips one or more ISCs from `[ ]` to `[x]`, we look back at the recent tool
 * history for a matching probe (Read after Write, Grep for code edits, Bash
 * with curl for HTTP, screenshot for UI, etc.). If nothing matches, we log the
 * violation and stage a `<system-reminder>` for the next turn pointing at the
 * unverified ISC.
 *
 * Soft enforcement only: we log + nudge, never block. v6.3.0 doctrine § EXECUTE
 * § INLINE VERIFICATION MANDATE has the rule the model is supposed to follow;
 * this extension surfaces when it didn't.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join, isAbsolute, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { checkCompleteness, type EffortTier } from "./isa.js";
import { findGranularityFlags } from "./doctrine-parser.js";

/**
 * Per-ISA digest of granularity flags we've already nudged on this session.
 * Idempotency: re-running the same ISA shape doesn't double-log or double-nudge.
 * Key: ISA absolute path. Value: Set of `${iscId}|${reason}` we've reported.
 */
const granularityNudged = new Map<string, Set<string>>();

type ToolEntry = {
	id: string;
	tool: string;
	input: Record<string, unknown>;
	resultText: string;
	ts: number;
};

const HISTORY_CAP = 30;
const VIOLATION_LOG = join(homedir(), ".pai", "data", "verification-violations.jsonl");
const ISA_REL = ".pi/ISA.md";

const history: ToolEntry[] = [];
const isaSnapshots = new Map<string, string>();
let pendingNudge: string | null = null;

type ProbeKind =
	| "file-write"
	| "code-edit"
	| "command"
	| "http"
	| "ui"
	| "schema"
	| "config-readback"
	| "unspecified";

const PROBE_HINTS: { kind: ProbeKind; rx: RegExp }[] = [
	{ kind: "ui", rx: /\b(screenshot|interceptor|browser|UI|page renders|route)\b/i },
	{ kind: "http", rx: /\b(curl|HTTP|endpoint|API call|status\s*code|response body)\b/i },
	{ kind: "schema", rx: /\b(SELECT|migration|table|schema|column added|index created)\b/i },
	{ kind: "config-readback", rx: /\b(env var|environment|config|settings\.json|frontmatter)\b/i },
	{ kind: "code-edit", rx: /\b(symbol|function|import|grep|searchable|line\s+\d+)\b/i },
	{ kind: "file-write", rx: /\b(write|create|file at|file exists|content matches|wrote)\b/i },
	{ kind: "command", rx: /\b(bash|exec|run|stdout|exit code|output of)\b/i },
];

function classifyISC(text: string): ProbeKind {
	for (const h of PROBE_HINTS) if (h.rx.test(text)) return h.kind;
	return "unspecified";
}

function pushHistory(entry: ToolEntry) {
	history.push(entry);
	if (history.length > HISTORY_CAP) history.splice(0, history.length - HISTORY_CAP);
}

function recentSince(ts: number): ToolEntry[] {
	return history.filter((e) => e.ts >= ts - 50);
}

/**
 * Check the recent tool history for evidence matching the probe kind.
 * Returns true iff the model actually called something that proves the ISC.
 */
function hasEvidence(kind: ProbeKind, ts: number, isaPath: string): boolean {
	const window = recentSince(ts);
	const isaDir = resolveAbs(isaPath);

	const exclude = (e: ToolEntry) => {
		if (e.tool === "edit" || e.tool === "write") {
			const path = (e.input as any)?.file_path;
			return typeof path === "string" && resolveAbs(path) === isaDir;
		}
		return false;
	};
	const usable = window.filter((e) => !exclude(e));

	switch (kind) {
		case "file-write":
		case "config-readback":
			return usable.some((e) => e.tool === "read");
		case "code-edit":
			return usable.some((e) => e.tool === "grep" || e.tool === "read");
		case "http":
			return usable.some(
				(e) => e.tool === "bash" && /\bcurl\b/i.test(stringInput(e)),
			);
		case "schema":
			return usable.some(
				(e) => e.tool === "bash" && /\b(select|psql|sqlite|mysql|migration)\b/i.test(stringInput(e)),
			);
		case "command":
			return usable.some((e) => e.tool === "bash" && e.resultText.length > 0);
		case "ui":
			return usable.some(
				(e) =>
					e.tool === "interceptor_screenshot" ||
					/\b(screenshot|playwright|interceptor)\b/i.test(e.tool),
			);
		case "unspecified":
			return usable.some((e) => e.tool !== "edit" && e.tool !== "write");
	}
}

function stringInput(e: ToolEntry): string {
	const cmd = (e.input as any)?.command;
	if (typeof cmd === "string") return cmd;
	try {
		return JSON.stringify(e.input);
	} catch {
		return "";
	}
}

function resolveAbs(p: string): string {
	return isAbsolute(p) ? p : resolve(p);
}

function ensureViolationDir() {
	try {
		mkdirSync(join(homedir(), ".pai", "data"), { recursive: true });
	} catch {}
}

function logViolation(record: Record<string, unknown>) {
	ensureViolationDir();
	try {
		appendFileSync(VIOLATION_LOG, JSON.stringify(record) + "\n");
	} catch {}
}

/**
 * Parse "- [x] ISC-3.1: criterion text" lines, return a map id → text.
 */
function parseISCs(content: string): Map<string, { passed: boolean; text: string }> {
	const out = new Map<string, { passed: boolean; text: string }>();
	const rx = /^-\s*\[([ x])\]\s*ISC-([\w.]+):\s*(.+)$/gm;
	for (const m of content.matchAll(rx)) {
		out.set(m[2], { passed: m[1] === "x", text: m[3].trim() });
	}
	return out;
}

function snapshotKey(cwd: string): string {
	return resolveAbs(join(cwd, ISA_REL));
}

function readFrontmatterField(content: string, key: string): string | null {
	const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
	if (!match) return null;
	return match[1].trim().replace(/^["']|["']$/g, "");
}

function detectPhaseCompleteTransition(before: string | undefined, after: string): boolean {
	const wasComplete = before ? readFrontmatterField(before, "phase") === "complete" : false;
	const isComplete = readFrontmatterField(after, "phase") === "complete";
	return !wasComplete && isComplete;
}

function readEffortTier(content: string): EffortTier {
	const raw = readFrontmatterField(content, "effort");
	if (raw && /^e[1-5]$/.test(raw)) return raw as EffortTier;
	return "e3";
}

function readISA(cwd: string): string | null {
	const p = snapshotKey(cwd);
	if (!existsSync(p)) return null;
	try {
		return readFileSync(p, "utf-8");
	} catch {
		return null;
	}
}

function diffPassedISCs(
	before: string | undefined,
	after: string,
): Array<{ id: string; text: string }> {
	const beforeMap = before ? parseISCs(before) : new Map();
	const afterMap = parseISCs(after);
	const newlyPassed: Array<{ id: string; text: string }> = [];
	for (const [id, info] of afterMap) {
		if (!info.passed) continue;
		const prior = beforeMap.get(id);
		if (!prior || !prior.passed) newlyPassed.push({ id, text: info.text });
	}
	return newlyPassed;
}

const PHASE_HEADER_RX = /━━━[^━]*\b(OBSERVE|THINK|PLAN|BUILD|EXECUTE|VERIFY|LEARN)\b[^━]*━━━/;
const SUMMARY_BLOCK_RX = /━━━\s*📃\s*SUMMARY\s*━━━/;

export function registerVerification(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		const before = readISA(ctx.cwd);
		if (before !== null) isaSnapshots.set(snapshotKey(ctx.cwd), before);
		pendingNudge = null;
	});

	pi.on("agent_end", async (event) => {
		const messages = (event as any).messages || [];
		const assistant = messages.filter((m: any) => m.role === "assistant");
		if (assistant.length === 0) return;
		const allText = assistant
			.flatMap((m: any) =>
				(m.content || [])
					.filter((c: any) => c.type === "text")
					.map((c: any) => c.text || ""),
			)
			.join("\n");
		const sawPhaseHeader = PHASE_HEADER_RX.test(allText);
		if (!sawPhaseHeader) return;
		const sawSummaryBlock = SUMMARY_BLOCK_RX.test(allText);
		if (sawSummaryBlock) return;
		logViolation({
			timestamp: new Date().toISOString(),
			event: "missing-closing-summary-block",
			assistantTurns: assistant.length,
			tail: allText.slice(-400),
		});
		pendingNudge = (pendingNudge ? pendingNudge + "\n\n" : "") + buildSummaryNudge();
	});

	pi.on("tool_result", async (event) => {
		const tool = event.toolName;
		const ts = Date.now();

		const result: ToolEntry = {
			id: event.toolCallId,
			tool,
			input: (event.input as Record<string, unknown>) ?? {},
			resultText: event.content
				.filter((c): c is { type: "text"; text: string } => c.type === "text")
				.map((c) => c.text)
				.join("\n")
				.slice(0, 4000),
			ts,
		};
		pushHistory(result);

		if (tool !== "edit" && tool !== "write") return;
		const path = (event.input as any)?.file_path;
		if (typeof path !== "string") return;
		const abs = resolveAbs(path);
		const platformISA = ISA_REL.replace(/\//g, sep);
		if (!abs.endsWith(platformISA) && !abs.endsWith(ISA_REL)) return;
		if (!existsSync(abs)) return;

		let after: string;
		try {
			after = readFileSync(abs, "utf-8");
		} catch {
			return;
		}
		const before = isaSnapshots.get(abs);
		isaSnapshots.set(abs, after);

		const newlyPassed = diffPassedISCs(before, after);

		const violations: Array<{ id: string; text: string; kind: ProbeKind }> = [];
		for (const { id, text } of newlyPassed) {
			const kind = classifyISC(text);
			if (!hasEvidence(kind, ts, abs)) {
				violations.push({ id, text, kind });
				logViolation({
					timestamp: new Date().toISOString(),
					isaPath: abs,
					iscId: id,
					iscText: text.slice(0, 200),
					expectedProbe: kind,
					recentTools: history.slice(-8).map((h) => h.tool),
				});
			}
		}

		if (violations.length > 0) {
			pendingNudge = buildNudge(violations);
		} else {
			pendingNudge = null;
		}

		// ── ISC granularity heuristic (#3) ──
		// On every ISA Edit/Write, scan for criteria that look non-atomic
		// (scope words, "and"/"with" joins) and surface them. We only nudge
		// on `confidence === "high"` to keep noise low; low/medium tiers are
		// logged but not nudged. Idempotent: same ISC+reason isn't reported twice.
		try {
			const allFlags = findGranularityFlags(after);
			const seen = granularityNudged.get(abs) ?? new Set<string>();
			const newFlags = allFlags.filter((f) => !seen.has(`${f.iscId}|${f.reason}`));
			for (const f of newFlags) {
				seen.add(`${f.iscId}|${f.reason}`);
				logViolation({
					timestamp: new Date().toISOString(),
					isaPath: abs,
					event: "isc-granularity-flag",
					iscId: f.iscId,
					criterion: f.criterion,
					confidence: f.confidence,
					reason: f.reason,
				});
			}
			granularityNudged.set(abs, seen);
			const highConf = newFlags.filter((f) => f.confidence === "high");
			if (highConf.length > 0) {
				const granularityNudge = buildGranularityNudge(highConf);
				pendingNudge = pendingNudge
					? pendingNudge + "\n\n---\n\n" + granularityNudge
					: granularityNudge;
			}
		} catch {}

		if (detectPhaseCompleteTransition(before, after)) {
			const tier = readEffortTier(after);
			const result = checkCompleteness(abs, tier);
			if (!result.passed) {
				const completionNudge = buildCompletenessNudge(tier, result.missing, abs);
				pendingNudge = pendingNudge
					? pendingNudge + "\n\n" + completionNudge
					: completionNudge;
				logViolation({
					timestamp: new Date().toISOString(),
					isaPath: abs,
					event: "phase-complete-without-required-sections",
					tier,
					missing: result.missing,
				});
			}
		}
	});

	pi.on("before_agent_start", async (event) => {
		if (!pendingNudge) return;
		const nudge = pendingNudge;
		pendingNudge = null;
		return {
			systemPrompt: event.systemPrompt + "\n\n<system-reminder>\n" + nudge + "\n</system-reminder>\n",
		};
	});
}

function buildSummaryNudge(): string {
	return [
		"## PAI Output Format — closing summary block missing",
		"",
		"Your previous response showed Algorithm phase headers (━━━ 👁️ OBSERVE ━━━ etc.) but did NOT end with the mandatory closing block:",
		"",
		"```",
		"━━━ 📃 SUMMARY ━━━",
		"",
		"🔄 ITERATION on: [16 words of context — only on follow-ups]",
		"📃 CONTENT: [up to 128 lines]",
		"🖊️ STORY: [4 8-word Paul-Graham bullets]",
		"🗣️ Jarvis: [8-16 word summary]",
		"```",
		"",
		"On any Algorithm run, the response MUST end with this block. Nothing follows the `🗣️` line. On the next response, include it.",
	].join("\n");
}

function buildCompletenessNudge(tier: EffortTier, missing: string[], isaPath: string): string {
	return [
		`## PAI Completeness Gate — \`phase: complete\` blocked at ${tier.toUpperCase()}`,
		"",
		`The ISA at \`${isaPath}\` was set to \`phase: complete\` but is missing required sections per the ${tier.toUpperCase()} tier completeness gate (Algorithm v6.3.0 § Tier Completeness Gate):`,
		"",
		...missing.map((m) => `- ${m}`),
		"",
		"Either fill the missing sections via `isa_append_*` tools and Edit, OR roll back the phase via `isa_update_frontmatter` with `phase: <previous>`. The Algorithm forbids declaring `phase: complete` while required sections are empty.",
	].join("\n");
}

function buildGranularityNudge(
	flags: Array<{ iscId: string; criterion: string; confidence: string; reason: string }>,
): string {
	const lines = flags.map(
		(f) =>
			`- ISC-${f.iscId} (${f.confidence}, ${f.reason}): "${f.criterion.slice(0, 120)}"`,
	);
	return [
		"## PAI ISC Granularity — non-atomic criteria detected",
		"",
		"Per Algorithm § ISC Quality System: every criterion must describe ONE binary tool probe. The following ISC(s) look non-atomic (scope words like \"all\"/\"every\", or \"and\"/\"with\" joining two things):",
		"",
		...lines,
		"",
		"Apply the Splitting Test: split each into separate ISC-N.M children, OR rephrase to a single binary probe. If the criterion is genuinely atomic and the heuristic is wrong, ignore — but verify the probe really is one tool call returning yes/no.",
	].join("\n");
}

function buildNudge(
	violations: Array<{ id: string; text: string; kind: ProbeKind }>,
): string {
	const lines = violations.map(
		(v) =>
			`- ISC-${v.id}: marked passed without evidence. Expected probe: ${v.kind}. Criterion: "${v.text.slice(0, 120)}"`,
	);
	return [
		"## PAI Verification — unverified ISC transitions detected",
		"",
		"You marked the following ISC(s) `[x]` without a matching tool-call probe in recent history:",
		"",
		...lines,
		"",
		"Per Algorithm § Inline Verification Mandate: every `[ ]→[x]` transition needs evidence in the same or immediately-following tool block. Run the missing probe now (Read/Grep/Bash/curl/screenshot as appropriate), then call `isa_mark_isc` with `evidence` set to the probe output to record it. If a live probe is genuinely impossible, mark `[DEFERRED-VERIFY]` with a follow-up task ID instead of `[x]`.",
	].join("\n");
}
