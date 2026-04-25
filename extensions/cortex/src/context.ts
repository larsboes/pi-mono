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
	const parts: string[] = [];

	if (ctx.identity) {
		parts.push(`## Identity\n${ctx.identity}`);
	}
	if (ctx.soul) {
		parts.push(`## Soul\n${ctx.soul}`);
	}
	if (ctx.user) {
		parts.push(`## User Profile\n${ctx.user}`);
	}
	if (ctx.memory) {
		parts.push(`## Long-term Memory\n${ctx.memory}`);
	}
	if (ctx.telos) {
		parts.push(`## Life Context (TELOS)\n${ctx.telos}`);
	}
	if (ctx.scratchpadOpen.length > 0) {
		parts.push(`## Open Scratchpad Items\n${ctx.scratchpadOpen.join("\n")}`);
	}
	if (ctx.yesterdayLog) {
		parts.push(`## Yesterday's Log\n${ctx.yesterdayLog}`);
	}
	if (ctx.todayLog) {
		parts.push(`## Today's Log\n${ctx.todayLog}`);
	}
	if (ctx.paiRelationshipYesterday || ctx.paiRelationshipToday) {
		const notes = [ctx.paiRelationshipYesterday, ctx.paiRelationshipToday].filter(Boolean).join("\n\n---\n\n");
		parts.push(`## CC Session Notes (from Claude Code)\n${notes}`);
	}

	if (parts.length === 0) return null;

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
