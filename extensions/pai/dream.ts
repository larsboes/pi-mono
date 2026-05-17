/**
 * PAI Dream — Periodic self-improvement via execution-history reflection.
 *
 * Three reflection tiers (claude-soul-style):
 *   QUICK  — Haiku, 20+ signals, refines existing frameworks against recent data
 *   DEEP   — Sonnet, 100+ signals, discovers new frameworks, retires contradicted
 *   META   — Sonnet, manual or 500+ signals, audits coherence, calibrates conf
 *
 * Each cycle reads:
 *   - algo-feedback.jsonl   (tier accuracy, costs)
 *   - patterns.json         (tool-use sequences)
 *   - signals.jsonl         (typed user signals — corrections, success, etc.)
 *   - daily/                (daily session logs, last 7 days)
 *   - frameworks.json       (current framework store with evidence tiers)
 *
 * Each cycle writes:
 *   - latest.json           (proposals, consumed by applier.ts)
 *   - frameworks.json       (updated tier states, hypothesis → observed → validated)
 *   - state.json            (session counters, last-tier timestamps)
 *
 * Auto-fire wiring: agent_end increments sessionsCount. session_start checks
 * shouldAutoDream() and fires QUICK if threshold met.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadSignals, type SignalRecord, type SignalKind } from "./signals.js";

// ── Paths ────────────────────────────────────────────────────────────────────

const PI_MEMORY = join(homedir(), ".pi", "memory");
const CORTEX_DIR = join(PI_MEMORY, "cortex");
const DAILY_DIR = join(PI_MEMORY, "daily");
const DREAM_DIR = join(homedir(), ".pi", "dreams");
const PATTERNS_FILE = join(CORTEX_DIR, "patterns.json");
const FEEDBACK_FILE = join(homedir(), ".pai", "data", "algo-feedback.jsonl");
const DREAM_STATE_FILE = join(DREAM_DIR, "state.json");
const FRAMEWORKS_FILE = join(DREAM_DIR, "frameworks.json");

// ── Tier thresholds ──────────────────────────────────────────────────────────

const QUICK_THRESHOLD_SIGNALS = 20;
const DEEP_THRESHOLD_SIGNALS = 100;
const META_THRESHOLD_SIGNALS = 500;

// ── Types ────────────────────────────────────────────────────────────────────

export type ReflectionTier = "quick" | "deep" | "meta";

interface DreamProposal {
	id: string;
	type: "skill" | "isa" | "algo-tune" | "knowledge" | "extension" | "config";
	title: string;
	description: string;
	evidence: string[];
	effort: "trivial" | "small" | "medium" | "large";
	priority: "high" | "medium" | "low";
	action?: string;
	auto_applicable?: boolean;
}

interface DreamReport {
	timestamp: string;
	tier: ReflectionTier;
	sessionsSinceLast: number;
	dataGathered: {
		feedbackRecords: number;
		patternsAnalyzed: number;
		dailyLogsScanned: number;
		signalsCount: number;
		frameworksConsidered: number;
	};
	proposals: DreamProposal[];
	applied: string[];
}

interface DreamState {
	lastDreamTimestamp: string | null;
	lastDreamTier: ReflectionTier | null;
	sessionsCount: number;
	signalsAtLastDream: number;
	rejectedProposalIds: string[];
	appliedProposalIds: string[];
}

// Framework — claude-soul-inspired evidence-tier hypothesis tracker.
type EvidenceTier = "hypothesis" | "observed" | "validated" | "retired";

export interface Framework {
	id: string;
	title: string;
	rule: string;            // the framework itself, ~one sentence
	rationale: string;       // why we think this works
	tier: EvidenceTier;
	confidence: number;       // 0..1
	confirmations: number;    // signal/feedback evidence supporting it
	contradictions: number;   // evidence against it
	created: string;
	updated: string;
	tags: string[];
}

interface FrameworkStore {
	frameworks: Framework[];
	updated: string;
	totalReflections: number;
}

// ── State ────────────────────────────────────────────────────────────────────

let dreamState: DreamState = {
	lastDreamTimestamp: null,
	lastDreamTier: null,
	sessionsCount: 0,
	signalsAtLastDream: 0,
	rejectedProposalIds: [],
	appliedProposalIds: [],
};

function loadDreamState(): void {
	if (!existsSync(DREAM_STATE_FILE)) return;
	try {
		const parsed = JSON.parse(readFileSync(DREAM_STATE_FILE, "utf-8")) as Partial<DreamState>;
		dreamState = {
			lastDreamTimestamp: parsed.lastDreamTimestamp ?? null,
			lastDreamTier: parsed.lastDreamTier ?? null,
			sessionsCount: parsed.sessionsCount ?? 0,
			signalsAtLastDream: parsed.signalsAtLastDream ?? 0,
			rejectedProposalIds: parsed.rejectedProposalIds ?? [],
			appliedProposalIds: parsed.appliedProposalIds ?? [],
		};
	} catch { /* fresh state */ }
}

function saveDreamState(): void {
	if (!existsSync(DREAM_DIR)) mkdirSync(DREAM_DIR, { recursive: true });
	writeFileSync(DREAM_STATE_FILE, JSON.stringify(dreamState, null, 2));
}

function loadFrameworks(): FrameworkStore {
	if (!existsSync(FRAMEWORKS_FILE)) {
		return { frameworks: [], updated: new Date().toISOString(), totalReflections: 0 };
	}
	try {
		return JSON.parse(readFileSync(FRAMEWORKS_FILE, "utf-8")) as FrameworkStore;
	} catch {
		return { frameworks: [], updated: new Date().toISOString(), totalReflections: 0 };
	}
}

function saveFrameworks(store: FrameworkStore): void {
	if (!existsSync(DREAM_DIR)) mkdirSync(DREAM_DIR, { recursive: true });
	store.updated = new Date().toISOString();
	writeFileSync(FRAMEWORKS_FILE, JSON.stringify(store, null, 2));
}

// ── Tier selection ──────────────────────────────────────────────────────────

export function shouldAutoDream(): { yes: boolean; tier: ReflectionTier | null; reason: string } {
	const signals = loadSignals();
	const newSignals = signals.length - dreamState.signalsAtLastDream;
	if (signals.length >= META_THRESHOLD_SIGNALS && newSignals >= 200) {
		return { yes: true, tier: "meta", reason: `${newSignals} new signals since last dream (≥200 → meta)` };
	}
	if (newSignals >= DEEP_THRESHOLD_SIGNALS) {
		return { yes: true, tier: "deep", reason: `${newSignals} new signals since last dream (≥100 → deep)` };
	}
	if (newSignals >= QUICK_THRESHOLD_SIGNALS && dreamState.sessionsCount >= 10) {
		return { yes: true, tier: "quick", reason: `${newSignals} new signals + ${dreamState.sessionsCount} sessions (≥20+10 → quick)` };
	}
	return { yes: false, tier: null, reason: `${newSignals} new signals, ${dreamState.sessionsCount} sessions — below threshold` };
}

export function getLastReport(): DreamReport | null {
	const reportFile = join(DREAM_DIR, "latest.json");
	if (!existsSync(reportFile)) return null;
	try {
		return JSON.parse(readFileSync(reportFile, "utf-8")) as DreamReport;
	} catch {
		return null;
	}
}

export function rejectProposal(id: string): void {
	if (!dreamState.rejectedProposalIds.includes(id)) {
		dreamState.rejectedProposalIds.push(id);
		saveDreamState();
	}
}

export function markApplied(id: string): void {
	if (!dreamState.appliedProposalIds.includes(id)) {
		dreamState.appliedProposalIds.push(id);
		saveDreamState();
	}
}

// ── Data gathering ───────────────────────────────────────────────────────────

async function gatherFeedback(): Promise<string> {
	if (!existsSync(FEEDBACK_FILE)) return "No algorithm feedback data yet.";
	try {
		const raw = await readFile(FEEDBACK_FILE, "utf-8");
		const lines = raw.trim().split("\n").filter(Boolean);
		if (lines.length === 0) return "No feedback records.";
		const records = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

		let accurate = 0, under = 0, over = 0;
		const tierCosts: Record<string, { totalTokens: number; count: number }> = {};
		for (const r of records) {
			if (r.detectedTier === r.idealTier) accurate++;
			else if (tierNum(r.idealTier) > tierNum(r.detectedTier)) under++;
			else over++;
			if (!tierCosts[r.detectedTier]) tierCosts[r.detectedTier] = { totalTokens: 0, count: 0 };
			tierCosts[r.detectedTier].totalTokens += r.actualTokens || 0;
			tierCosts[r.detectedTier].count++;
		}

		let output = `## Algorithm Feedback (${records.length} executions)\n\n`;
		output += `Tier accuracy: ${Math.round(accurate / records.length * 100)}% | Under: ${under} | Over: ${over}\n\n`;
		output += "| Tier | Executions | Avg Tokens | Avg Turns | Avg Tools |\n|---|---|---|---|---|\n";
		for (const [tier, data] of Object.entries(tierCosts).sort()) {
			const tierRecs = records.filter((r: any) => r.detectedTier === tier);
			const avgTurns = Math.round(tierRecs.reduce((s: number, r: any) => s + r.actualTurns, 0) / data.count);
			const avgTools = Math.round(tierRecs.reduce((s: number, r: any) => s + r.actualTools, 0) / data.count);
			output += `| ${tier.toUpperCase()} | ${data.count} | ${Math.round(data.totalTokens / data.count)} | ${avgTurns} | ${avgTools} |\n`;
		}

		const misclass = records.filter((r: any) => r.detectedTier !== r.idealTier).slice(-5);
		if (misclass.length) {
			output += "\n### Recent misclassifications\n";
			for (const r of misclass) {
				output += `- ${r.detectedTier} → needed ${r.idealTier} (${r.actualTurns} turns, ${r.actualTokens} tokens)\n`;
			}
		}
		return output;
	} catch { return "Failed to read feedback data."; }
}

async function gatherPatterns(): Promise<string> {
	if (!existsSync(PATTERNS_FILE)) return "No patterns recorded yet.";
	try {
		const data = JSON.parse(await readFile(PATTERNS_FILE, "utf-8"));
		const patterns = Object.entries(data.sequences || {})
			.sort(([_, a]: any, [__, b]: any) => b.count - a.count)
			.slice(0, 20);
		if (patterns.length === 0) return "No patterns recorded.";
		let output = `## Tool-Use Patterns (${data.sessionsAnalyzed ?? "?"} sessions)\n\n`;
		output += "| Count | Pattern | Example |\n|---|---|---|\n";
		for (const [sig, p] of patterns as [string, any][]) {
			output += `| ${p.count}x | ${sig} | ${(p.examplePrompt ?? "?").slice(0, 50)} |\n`;
		}
		const candidates = patterns.filter(([_, p]: any) => p.count >= 5);
		if (candidates.length) {
			output += `\n### Crystallization candidates (${candidates.length} patterns 5+ occurrences)\n`;
			for (const [sig, p] of candidates as [string, any][]) {
				output += `- **${sig}** (${p.count}x) — "${(p.examplePrompt ?? "").slice(0, 80)}"\n`;
			}
		}
		return output;
	} catch { return "Failed to read patterns."; }
}

async function gatherDailyLogs(days = 7): Promise<string> {
	if (!existsSync(DAILY_DIR)) return "";
	try {
		const files = (await readdir(DAILY_DIR)).filter((f) => f.endsWith(".md")).sort().slice(-days);
		if (files.length === 0) return "";
		let output = `## Recent Activity (${files.length} days)\n\n`;
		for (const f of files) {
			const content = await readFile(join(DAILY_DIR, f), "utf-8");
			output += `### ${f.replace(".md", "")}\n${content.slice(0, 1500)}\n\n`;
		}
		return output;
	} catch { return ""; }
}

function gatherSignalSummary(signals: SignalRecord[]): string {
	if (signals.length === 0) return "## Signals\n\nNo typed signals captured yet.";
	const byKind: Record<SignalKind, number> = {
		correction: 0, confusion: 0, gratitude: 0, restart: 0, success: 0, frustration: 0,
	};
	for (const s of signals) byKind[s.kind] = (byKind[s.kind] || 0) + 1;

	let output = `## Typed Signals (${signals.length} total)\n\n`;
	output += Object.entries(byKind).map(([k, v]) => `${k}: ${v}`).join(" · ") + "\n\n";

	const lastCorrections = signals.filter((s) => s.kind === "correction").slice(-5);
	if (lastCorrections.length) {
		output += "### Recent corrections (most useful for framework updates)\n";
		for (const c of lastCorrections) {
			output += `- [${c.evidence}] "${c.prompt_excerpt.slice(0, 120)}"\n`;
		}
	}
	return output;
}

function gatherFrameworkSummary(store: FrameworkStore): string {
	if (store.frameworks.length === 0) return "## Frameworks\n\nNo frameworks tracked yet — discover from this dream.";
	const byTier: Record<EvidenceTier, Framework[]> = { hypothesis: [], observed: [], validated: [], retired: [] };
	for (const f of store.frameworks) byTier[f.tier].push(f);

	let output = `## Active Frameworks (${store.frameworks.length} total, ${store.totalReflections} reflections)\n\n`;
	for (const tier of ["validated", "observed", "hypothesis", "retired"] as EvidenceTier[]) {
		const list = byTier[tier];
		if (list.length === 0) continue;
		output += `### ${tier.toUpperCase()} (${list.length})\n`;
		for (const f of list) {
			output += `- [${f.id}] **${f.title}** — ${f.rule} (conf=${f.confidence.toFixed(2)}, +${f.confirmations}/-${f.contradictions})\n`;
		}
	}
	return output;
}

// ── Reflection prompts (per tier) ───────────────────────────────────────────

function buildQuickPrompt(feedback: string, signals: string, frameworks: string): string {
	return `You are pi's QUICK reflection (Haiku, ~20 new signals). Focus: refine existing frameworks against the latest evidence — do NOT discover new frameworks.

${feedback}
${signals}
${frameworks}

Tasks:
1. For each ACTIVE framework above, classify recent signals as confirming or contradicting it.
2. Bump confidence (+0.1) for >2 confirmations, drop (-0.15) for any contradiction.
3. Promote hypothesis → observed if confirmations >= 1 AND no contradictions.
4. Promote observed → validated if confirmations >= 3 AND contradictions === 0.
5. Retire any framework whose contradictions exceed confirmations by 2 OR whose confidence drops below 0.2.

Output JSON ONLY, no prose:
\`\`\`json
{
  "framework_updates": [
    {"id": "fw-001", "delta_confirmations": 2, "delta_contradictions": 0, "promote_to": null, "retire": false}
  ],
  "proposals": []
}
\`\`\``;
}

function buildDeepPrompt(
	feedback: string, patterns: string, logs: string, signals: string, frameworks: string,
	rejectedIds: string[],
): string {
	const rejectedNote = rejectedIds.length ? `\n\nPreviously rejected proposal IDs (do NOT re-propose): ${rejectedIds.join(", ")}` : "";
	return `You are pi's DEEP reflection (Sonnet, 100+ new signals). Discover new frameworks AND propose concrete improvements. Be specific — every proposal cites evidence.

${feedback}
${patterns}
${logs}
${signals}
${frameworks}
${rejectedNote}

Tasks:
1. Same framework updates as QUICK above.
2. Discover up to 3 NEW frameworks from corrections + patterns. Each new framework starts as hypothesis with confidence 0.5.
3. Propose actionable improvements (skill / isa / algo-tune / knowledge / extension / config) — only if CLEAR evidence supports them. Cite evidence directly.

Output JSON ONLY, no prose:
\`\`\`json
{
  "framework_updates": [
    {"id": "fw-001", "delta_confirmations": 2, "delta_contradictions": 0, "promote_to": "validated", "retire": false}
  ],
  "frameworks_new": [
    {"title": "...", "rule": "...", "rationale": "evidence summary", "tags": ["..."]}
  ],
  "proposals": [
    {
      "type": "algo-tune",
      "title": "Bump multi-file tasks to E3 minimum",
      "description": "Patterns show E2 chosen but E3 needed for 18% of tasks with 3+ file mentions.",
      "evidence": ["Tier accuracy 60% on multi-file", "Recent misclassifications: 14 of 23"],
      "effort": "small", "priority": "high",
      "action": "pattern=\\".*[34][[:space:]]+files?\\\\b.*\\"; tier=e3; reason=\\"multi-file tasks under-classified\\"",
      "auto_applicable": true
    }
  ]
}
\`\`\``;
}

function buildMetaPrompt(frameworks: string, signals: string): string {
	return `You are pi's META reflection (Sonnet, manual or 500+ signals). Audit the framework store for coherence — duplicates, contradictions, dead weight.

${frameworks}
${signals}

Tasks:
1. Detect tensions: pairs of frameworks that imply contradictory action under the same conditions. Surface them.
2. Detect redundancy: pairs that say the same thing. Recommend a merge with a single combined rule.
3. Detect dead weight: validated frameworks not consulted (no confirmations in 30 days).
4. Write ONE narrative paragraph for STORY.md describing what the past meta period taught us.

Output JSON ONLY:
\`\`\`json
{
  "tensions": [{"pair": ["fw-A", "fw-B"], "issue": "..."}],
  "merge_candidates": [{"pair": ["fw-A", "fw-B"], "merged_rule": "..."}],
  "retire_dead": ["fw-X"],
  "story_narrative": "Over the past N reflections, the system learned ..."
}
\`\`\``;
}

// ── Run a reflection ────────────────────────────────────────────────────────

async function runReflection(tier: ReflectionTier, ctx: ExtensionContext): Promise<void> {
	ctx.ui.notify(`[dream] ${tier.toUpperCase()} reflection — gathering data...`, "info");

	const signals = loadSignals();
	const recentSignals = signals.slice(dreamState.signalsAtLastDream);
	const frameworks = loadFrameworks();

	const [feedback, patterns, logs] = await Promise.all([
		gatherFeedback(),
		gatherPatterns(),
		tier === "quick" ? Promise.resolve("") : gatherDailyLogs(7),
	]);
	const signalsBlock = gatherSignalSummary(recentSignals);
	const frameworksBlock = gatherFrameworkSummary(frameworks);

	let prompt: string;
	if (tier === "quick") prompt = buildQuickPrompt(feedback, signalsBlock, frameworksBlock);
	else if (tier === "deep") prompt = buildDeepPrompt(feedback, patterns, logs, signalsBlock, frameworksBlock, dreamState.rejectedProposalIds);
	else prompt = buildMetaPrompt(frameworksBlock, signalsBlock);

	const dataSize = prompt.length;
	ctx.ui.notify(
		`[dream] ${tier.toUpperCase()} — ${(dataSize / 1024).toFixed(1)}KB data, ${recentSignals.length} new signals, ${frameworks.frameworks.length} frameworks`,
		"info",
	);

	ctx.sendMessage(
		{
			customType: `dream_${tier}`,
			content: [{ type: "text", text: prompt }],
			display: {
				label: `dream:${tier}`,
				text: `${tier.toUpperCase()} reflection — ${recentSignals.length} new signals, ${frameworks.frameworks.length} frameworks`,
			},
		},
		{ triggerTurn: true },
	);
}

// ── Tier helper ─────────────────────────────────────────────────────────────

function tierNum(tier: string): number {
	return parseInt(tier.replace("e", ""), 10) || 0;
}

// ── Apply reflection output to framework store ─────────────────────────────

interface ReflectionOutput {
	framework_updates?: Array<{
		id: string;
		delta_confirmations?: number;
		delta_contradictions?: number;
		promote_to?: EvidenceTier | null;
		retire?: boolean;
	}>;
	frameworks_new?: Array<{
		title: string;
		rule: string;
		rationale: string;
		tags?: string[];
	}>;
	proposals?: DreamProposal[];
	tensions?: Array<{ pair: [string, string]; issue: string }>;
	merge_candidates?: Array<{ pair: [string, string]; merged_rule: string }>;
	retire_dead?: string[];
	story_narrative?: string;
}

function applyReflectionToFrameworks(output: ReflectionOutput, store: FrameworkStore, tier: ReflectionTier): FrameworkStore {
	const now = new Date().toISOString();
	store.totalReflections++;

	if (output.framework_updates) {
		for (const u of output.framework_updates) {
			const f = store.frameworks.find((x) => x.id === u.id);
			if (!f) continue;
			f.confirmations += u.delta_confirmations ?? 0;
			f.contradictions += u.delta_contradictions ?? 0;
			f.confidence = Math.max(0, Math.min(1, 0.5 + (f.confirmations - f.contradictions) * 0.1));
			if (u.promote_to) f.tier = u.promote_to;
			if (u.retire) f.tier = "retired";
			f.updated = now;
		}
	}

	if (tier !== "meta" && output.frameworks_new) {
		const baseId = store.frameworks.length;
		for (let i = 0; i < output.frameworks_new.length; i++) {
			const n = output.frameworks_new[i];
			store.frameworks.push({
				id: `fw-${String(baseId + i + 1).padStart(3, "0")}`,
				title: n.title,
				rule: n.rule,
				rationale: n.rationale,
				tier: "hypothesis",
				confidence: 0.5,
				confirmations: 0,
				contradictions: 0,
				created: now,
				updated: now,
				tags: n.tags ?? [],
			});
		}
	}

	if (output.retire_dead) {
		for (const id of output.retire_dead) {
			const f = store.frameworks.find((x) => x.id === id);
			if (f) { f.tier = "retired"; f.updated = now; }
		}
	}

	return store;
}

// ── Extension registration ───────────────────────────────────────────────────

export function registerDream(pi: ExtensionAPI): void {
	loadDreamState();

	pi.registerCommand("dream", {
		description: "Trigger a dream reflection. Args: quick | deep | meta | status (default: auto)",
		async handler(args, ctx) {
			const arg = (args ?? "").trim().toLowerCase();
			if (arg === "status") {
				const state = shouldAutoDream();
				const fw = loadFrameworks();
				ctx.ui.notify(
					[
						`Sessions since last dream: ${dreamState.sessionsCount}`,
						`Signals at last dream: ${dreamState.signalsAtLastDream}`,
						`Last dream: ${dreamState.lastDreamTimestamp ?? "never"} (tier: ${dreamState.lastDreamTier ?? "—"})`,
						`Frameworks: ${fw.frameworks.length} (${fw.totalReflections} reflections total)`,
						`Auto-trigger: ${state.yes ? `YES (${state.tier})` : "no"} — ${state.reason}`,
					].join("\n"),
					"info",
				);
				return;
			}
			let tier: ReflectionTier;
			if (arg === "quick" || arg === "deep" || arg === "meta") tier = arg;
			else {
				const auto = shouldAutoDream();
				tier = auto.tier ?? "quick";
			}
			await runReflection(tier, ctx);
		},
	});

	pi.registerCommand("dream-report", {
		description: "View latest dream analysis and proposals",
		async handler(_args, ctx) {
			const report = getLastReport();
			if (!report) {
				ctx.ui.notify("[dream] No reports yet. Run /dream first.", "info");
				return;
			}
			const fw = loadFrameworks();
			const summary = report.proposals
				.map((p, i) => {
					const status = report.applied?.includes(p.id) ? "✓" :
						dreamState.rejectedProposalIds.includes(p.id) ? "✗" : "○";
					return `${status} ${i + 1}. [${p.type}] **${p.title}** (${p.priority}, ${p.effort})\n   ${p.description.slice(0, 120)}`;
				})
				.join("\n");

			ctx.sendMessage(
				{
					customType: "dream_report",
					content: [{
						type: "text",
						text: `## Dream Report — ${report.timestamp.slice(0, 10)} (${report.tier})\n\n` +
							`**Data:** ${report.dataGathered.feedbackRecords} feedback, ${report.dataGathered.signalsCount} signals, ${report.dataGathered.frameworksConsidered} frameworks\n\n` +
							`### Proposals\n${summary || "(none)"}\n\n` +
							`### Frameworks\n${fw.frameworks.length} total (${fw.frameworks.filter((f) => f.tier === "validated").length} validated, ${fw.frameworks.filter((f) => f.tier === "observed").length} observed, ${fw.frameworks.filter((f) => f.tier === "hypothesis").length} hypothesis, ${fw.frameworks.filter((f) => f.tier === "retired").length} retired)\n\n` +
							`_Legend: ○ pending, ✓ applied, ✗ rejected. Use /apply <id> to apply._`,
					}],
					display: { label: "dream", text: `${report.proposals.length} proposals, ${fw.frameworks.length} frameworks (${report.timestamp.slice(0, 10)})` },
				},
				{ triggerTurn: false },
			);
		},
	});

	// Parse model responses — both legacy proposal arrays and new tiered output.
	pi.on("message_end", async (event) => {
		const message = event.message;
		if (!message || message.role !== "assistant") return;
		const text = typeof message.content === "string"
			? message.content
			: Array.isArray(message.content)
				? message.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("")
				: "";

		// Match either:
		//   { "framework_updates": [...], "proposals": [...] }   ← new tiered output
		//   [ { "type": "skill"|... }, ... ]                       ← legacy array
		let parsed: ReflectionOutput | null = null;
		const objectMatch = text.match(/\{\s*"(?:framework_updates|frameworks_new|proposals|tensions|story_narrative)"[\s\S]*?\}/);
		if (objectMatch) {
			try { parsed = JSON.parse(objectMatch[0]) as ReflectionOutput; } catch {}
		}
		if (!parsed) {
			const arrayMatch = text.match(/\[\s*\{[\s\S]*"type"\s*:\s*"(?:skill|isa|algo-tune|knowledge|extension|config)"[\s\S]*\}\s*\]/);
			if (arrayMatch) {
				try { parsed = { proposals: JSON.parse(arrayMatch[0]) as DreamProposal[] }; } catch {}
			}
		}
		if (!parsed) return;

		const tier: ReflectionTier = (() => {
			const ct = (message as { customType?: string }).customType;
			if (ct === "dream_quick") return "quick";
			if (ct === "dream_deep") return "deep";
			if (ct === "dream_meta") return "meta";
			return "deep"; // default if customType not propagated
		})();

		// Stamp proposal IDs and filter rejected.
		const proposals = (parsed.proposals ?? []).map((p) => {
			const id = `dream-${p.type}-${(p.title || "").toLowerCase().replace(/\s+/g, "-").slice(0, 30)}`;
			return { ...p, id } as DreamProposal;
		}).filter((p) => !dreamState.rejectedProposalIds.includes(p.id));

		// Update framework store.
		const store = loadFrameworks();
		applyReflectionToFrameworks(parsed, store, tier);
		saveFrameworks(store);

		// Persist report.
		if (!existsSync(DREAM_DIR)) await mkdir(DREAM_DIR, { recursive: true });
		const signals = loadSignals();
		const report: DreamReport = {
			timestamp: new Date().toISOString(),
			tier,
			sessionsSinceLast: dreamState.sessionsCount,
			dataGathered: {
				feedbackRecords: existsSync(FEEDBACK_FILE)
					? (await readFile(FEEDBACK_FILE, "utf-8")).trim().split("\n").length : 0,
				patternsAnalyzed: existsSync(PATTERNS_FILE)
					? Object.keys(JSON.parse(await readFile(PATTERNS_FILE, "utf-8")).sequences || {}).length : 0,
				dailyLogsScanned: existsSync(DAILY_DIR)
					? (await readdir(DAILY_DIR)).filter((f) => f.endsWith(".md")).length : 0,
				signalsCount: signals.length,
				frameworksConsidered: store.frameworks.length,
			},
			proposals,
			applied: [],
		};
		await writeFile(join(DREAM_DIR, "latest.json"), JSON.stringify(report, null, 2));
		await writeFile(join(DREAM_DIR, `${new Date().toISOString().slice(0, 10)}-${tier}.json`), JSON.stringify(report, null, 2));

		// Reset session counters.
		dreamState.sessionsCount = 0;
		dreamState.signalsAtLastDream = signals.length;
		dreamState.lastDreamTimestamp = new Date().toISOString();
		dreamState.lastDreamTier = tier;
		saveDreamState();
	});

	// Wire auto-fire on session_start.
	pi.on("session_start", async (_event, ctx) => {
		const auto = shouldAutoDream();
		if (auto.yes && auto.tier) {
			ctx.ui.notify(`[dream] auto-trigger: ${auto.tier} (${auto.reason})`, "info");
			await runReflection(auto.tier, ctx);
		}
	});

	// Track sessions for auto-trigger threshold.
	pi.on("agent_end", async () => {
		dreamState.sessionsCount++;
		if (dreamState.sessionsCount % 5 === 0) saveDreamState();
	});
}
