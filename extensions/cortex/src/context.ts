/**
 * Hot Context Injection — pi-mem style
 *
 * Reads static memory files and recent daily logs, injects into system prompt.
 * This is the "dumb but effective" layer: zero latency, predictable context.
 * Semantic search (memory.ts) is the "smart" layer for deep retrieval.
 *
 * Files injected:
 * - IDENTITY.md, SOUL.md, USER.md, MEMORY.md (static identity)
 * - SCRATCHPAD.md (open items only — working memory)
 * - daily/YYYY-MM-DD.md (today + yesterday — recent continuity)
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import * as scratchpad from "./scratchpad.js";
import { applyTokenBudget, type ContextSection } from "./token-budget.js";

const MEMORY_DIR = join(homedir(), ".pi", "memory");
const TELOS_DIR = join(MEMORY_DIR, "TELOS");
const PAI_MEMORY_DIR = join(homedir(), ".pai", "MEMORY");

async function readFileSafe(path: string): Promise<string | null> {
	try {
		return await readFile(path, "utf-8");
	} catch {
		return null;
	}
}

function getTodayDate(): string {
	return new Date().toISOString().slice(0, 10);
}

function getYesterdayDate(): string {
	const d = new Date();
	d.setDate(d.getDate() - 1);
	return d.toISOString().slice(0, 10);
}

export interface HotContext {
	identity: string | null;
	soul: string | null;
	user: string | null;
	memory: string | null;
	telos: string | null;
	scratchpadOpen: string[];
	todayLog: string | null;
	yesterdayLog: string | null;
	paiRelationshipToday: string | null;
	paiRelationshipYesterday: string | null;
}

/**
 * Load TELOS summary from Obsidian vault (via symlink chain:
 * ~/.pi/memory/TELOS → ~/.pai/USER/TELOS → ~/Developer/knowledge-base/Atlas/TELOS)
 * Reads GOALS.md, MISSION.md, and STATUS.md for a compact life context snapshot.
 */
async function loadTelosSummary(): Promise<string | null> {
	const priorityFiles = ["GOALS.md", "MISSION.md", "STATUS.md", "CHALLENGES.md", "STRATEGIES.md", "BELIEFS.md", "FRAMES.md", "MODELS.md", "PROBLEMS.md"];
	const parts: string[] = [];

	for (const file of priorityFiles) {
		const content = await readFileSafe(join(TELOS_DIR, file));
		if (content) {
			parts.push(content.trim());
		}
	}

	return parts.length > 0 ? parts.join("\n\n---\n\n") : null;
}

function getPaiRelationshipPath(date: string): string {
	const month = date.slice(0, 7);
	return join(PAI_MEMORY_DIR, "RELATIONSHIP", month, `${date}.md`);
}

export async function loadHotContext(): Promise<HotContext> {
	const todayDate = getTodayDate();
	const yesterdayDate = getYesterdayDate();

	const [identity, soul, user, memory, telos, scratchpadOpen, todayLog, yesterdayLog, paiRelationshipToday, paiRelationshipYesterday] = await Promise.all([
		readFileSafe(join(MEMORY_DIR, "IDENTITY.md")),
		readFileSafe(join(MEMORY_DIR, "SOUL.md")),
		readFileSafe(join(MEMORY_DIR, "USER.md")),
		readFileSafe(join(MEMORY_DIR, "MEMORY.md")),
		loadTelosSummary(),
		scratchpad.getOpenItems(),
		readFileSafe(join(MEMORY_DIR, "daily", `${todayDate}.md`)),
		readFileSafe(join(MEMORY_DIR, "daily", `${yesterdayDate}.md`)),
		readFileSafe(getPaiRelationshipPath(todayDate)),
		readFileSafe(getPaiRelationshipPath(yesterdayDate)),
	]);

	return {
		identity,
		soul,
		user,
		memory,
		telos,
		scratchpadOpen,
		todayLog,
		yesterdayLog,
		paiRelationshipToday,
		paiRelationshipYesterday,
	};
}

export function formatHotContext(ctx: HotContext): string | null {
	// Phase 10.2: Build sections with priorities and apply token budget
	const sections: ContextSection[] = [];

	// Mandatory: always include (small, high-signal)
	if (ctx.scratchpadOpen.length > 0) {
		sections.push({ id: "scratchpad", content: `## Open Scratchpad Items\n${ctx.scratchpadOpen.join("\n")}`, basePriority: 10, mandatory: true });
	}
	if (ctx.todayLog) {
		sections.push({ id: "today", content: `## Today's Log\n${ctx.todayLog}`, basePriority: 9, mandatory: true });
	}

	// High priority: usually included
	if (ctx.memory) {
		sections.push({ id: "memory", content: `## Long-term Memory\n${ctx.memory}`, basePriority: 8 });
	}
	if (ctx.yesterdayLog) {
		sections.push({ id: "yesterday", content: `## Yesterday's Log\n${ctx.yesterdayLog}`, basePriority: 7 });
	}

	// Medium priority: included if budget allows
	if (ctx.telos) {
		sections.push({ id: "telos", content: `## Life Context (TELOS)\n${ctx.telos}`, basePriority: 5 });
	}
	if (ctx.paiRelationshipToday || ctx.paiRelationshipYesterday) {
		const notes = [ctx.paiRelationshipToday, ctx.paiRelationshipYesterday].filter(Boolean).join("\n\n---\n\n");
		sections.push({ id: "pai-notes", content: `## CC Session Notes\n${notes}`, basePriority: 4 });
	}

	// Lower priority: only if small or budget has room
	if (ctx.identity) {
		sections.push({ id: "identity", content: `## Identity\n${ctx.identity}`, basePriority: 3 });
	}
	if (ctx.soul) {
		sections.push({ id: "soul", content: `## Soul\n${ctx.soul}`, basePriority: 2 });
	}
	if (ctx.user) {
		sections.push({ id: "user", content: `## User Profile\n${ctx.user}`, basePriority: 2 });
	}

	if (sections.length === 0) return null;

	// Apply token budget — keeps mandatory + highest-priority that fits
	const included = applyTokenBudget(sections);
	if (included.length === 0) return null;

	const parts = included.map((s) => s.content);
	return `\n\n# Memory Context (auto-loaded)\n\n${parts.join("\n\n")}`;
}

/**
 * Build the full context block for injection (hot context + semantic results)
 */
export async function buildContextBlock(semanticResults: { source: string; text: string; score: number; method: string }[]): Promise<string | null> {
	const hot = await loadHotContext();
	const hotBlock = formatHotContext(hot);

	// Build semantic block
	const relevant = semanticResults.filter((r) => r.score >= 0.4);
	let semanticBlock = "";
	if (relevant.length > 0) {
		const contextText = relevant
			.map((r) => `- [${r.source}] ${r.text.slice(0, 300)}`)
			.join("\n");
		semanticBlock = `\n\n## Relevant Past Context (retrieved)\n${contextText}`;
	}

	if (!hotBlock && !semanticBlock) return null;

	return (hotBlock || "") + semanticBlock;
}
