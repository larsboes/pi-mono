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

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import * as scratchpad from "./scratchpad.js";

const MEMORY_DIR = join(homedir(), ".pi", "memory");

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
	scratchpadOpen: string[];
	todayLog: string | null;
	yesterdayLog: string | null;
}

export async function loadHotContext(): Promise<HotContext> {
	const [identity, soul, user, memory, scratchpadOpen, todayLog, yesterdayLog] = await Promise.all([
		readFileSafe(join(MEMORY_DIR, "IDENTITY.md")),
		readFileSafe(join(MEMORY_DIR, "SOUL.md")),
		readFileSafe(join(MEMORY_DIR, "USER.md")),
		readFileSafe(join(MEMORY_DIR, "MEMORY.md")),
		scratchpad.getOpenItems(),
		readFileSafe(join(MEMORY_DIR, "daily", `${getTodayDate()}.md`)),
		readFileSafe(join(MEMORY_DIR, "daily", `${getYesterdayDate()}.md`)),
	]);

	return {
		identity,
		soul,
		user,
		memory,
		scratchpadOpen,
		todayLog,
		yesterdayLog,
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
	if (ctx.scratchpadOpen.length > 0) {
		parts.push(`## Open Scratchpad Items\n${ctx.scratchpadOpen.join("\n")}`);
	}
	if (ctx.yesterdayLog) {
		parts.push(`## Yesterday's Log\n${ctx.yesterdayLog}`);
	}
	if (ctx.todayLog) {
		parts.push(`## Today's Log\n${ctx.todayLog}`);
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
