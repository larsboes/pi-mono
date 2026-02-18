/**
 * Scratchpad — Working memory for deferred tasks
 *
 * Simple checkbox management: add, done, undo, list
 * Open items are auto-injected into context on every turn
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const MEMORY_DIR = join(homedir(), ".pi", "memory");
const SCRATCHPAD_PATH = join(MEMORY_DIR, "SCRATCHPAD.md");

interface ScratchpadItem {
	text: string;
	done: boolean;
}

function parseItems(content: string): ScratchpadItem[] {
	const lines = content.split("\n");
	const items: ScratchpadItem[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith("- [ ]") || trimmed.startsWith("* [ ]")) {
			const text = trimmed.slice(5).trim();
			items.push({ text, done: false });
		} else if (trimmed.startsWith("- [x]") || trimmed.startsWith("* [x]") || trimmed.startsWith("- [X]") || trimmed.startsWith("* [X]")) {
			const text = trimmed.slice(5).trim();
			items.push({ text, done: true });
		}
	}

	return items;
}

function formatItems(items: ScratchpadItem[]): string {
	if (items.length === 0) return "# Scratchpad\n\nNo items yet.\n";

	const lines = ["# Scratchpad\n"];
	for (const item of items) {
		const checkbox = item.done ? "- [x]" : "- [ ]";
		lines.push(`${checkbox} ${item.text}`);
	}
	lines.push("");
	return lines.join("\n");
}

async function readScratchpad(): Promise<ScratchpadItem[]> {
	try {
		const content = await readFile(SCRATCHPAD_PATH, "utf-8");
		return parseItems(content);
	} catch {
		return [];
	}
}

async function writeScratchpad(items: ScratchpadItem[]): Promise<void> {
	const content = formatItems(items);
	await writeFile(SCRATCHPAD_PATH, content, "utf-8");
}

export async function add(text: string): Promise<string> {
	const items = await readScratchpad();
	items.push({ text, done: false });
	await writeScratchpad(items);
	return `Added: "${text}"`;
}

export async function done(index?: number): Promise<string> {
	const items = await readScratchpad();
	const openItems = items.filter(i => !i.done);

	if (openItems.length === 0) {
		return "No open items to mark as done.";
	}

	if (index === undefined) {
		// Mark most recent open item as done
		const lastOpen = items.map((item, i) => ({ item, index: i }))
			.filter(({ item }) => !item.done)
			.pop();
		if (lastOpen) {
			items[lastOpen.index].done = true;
			await writeScratchpad(items);
			return `Marked as done: "${lastOpen.item.text}"`;
		}
	} else {
		// Mark specific open item by index (1-based)
		const openIndices = items.map((item, i) => ({ item, index: i }))
			.filter(({ item }) => !item.done);
		if (index < 1 || index > openIndices.length) {
			return `Invalid index. There are ${openIndices.length} open items.`;
		}
		const target = openIndices[index - 1];
		items[target.index].done = true;
		await writeScratchpad(items);
		return `Marked as done: "${target.item.text}"`;
	}

	return "No open items to mark as done.";
}

export async function undo(index?: number): Promise<string> {
	const items = await readScratchpad();
	const doneItems = items.filter(i => i.done);

	if (doneItems.length === 0) {
		return "No completed items to undo.";
	}

	if (index === undefined) {
		// Undo most recent done item
		const lastDone = items.map((item, i) => ({ item, index: i }))
			.filter(({ item }) => item.done)
			.pop();
		if (lastDone) {
			items[lastDone.index].done = false;
			await writeScratchpad(items);
			return `Reopened: "${lastDone.item.text}"`;
		}
	} else {
		// Undo specific done item by index (1-based)
		const doneIndices = items.map((item, i) => ({ item, index: i }))
			.filter(({ item }) => item.done);
		if (index < 1 || index > doneIndices.length) {
			return `Invalid index. There are ${doneIndices.length} completed items.`;
		}
		const target = doneIndices[index - 1];
		items[target.index].done = false;
		await writeScratchpad(items);
		return `Reopened: "${target.item.text}"`;
	}

	return "No completed items to undo.";
}

export async function clearDone(): Promise<string> {
	const items = await readScratchpad();
	const openItems = items.filter(i => !i.done);
	const removedCount = items.length - openItems.length;
	await writeScratchpad(openItems);
	return `Cleared ${removedCount} completed items.`;
}

export async function list(): Promise<string> {
	const items = await readScratchpad();

	if (items.length === 0) {
		return "Scratchpad is empty.";
	}

	const lines: string[] = [];
	const openItems = items.filter(i => !i.done);
	const doneItems = items.filter(i => i.done);

	if (openItems.length > 0) {
		lines.push("Open items:");
		openItems.forEach((item, i) => {
			lines.push(`  ${i + 1}. ${item.text}`);
		});
	}

	if (doneItems.length > 0) {
		if (lines.length > 0) lines.push("");
		lines.push("Completed items:");
		doneItems.forEach((item, i) => {
			lines.push(`  ${i + 1}. ~~${item.text}~~`);
		});
	}

	return lines.join("\n");
}

export async function getOpenItems(): Promise<string[]> {
	const items = await readScratchpad();
	return items
		.filter(i => !i.done)
		.map(i => `- [ ] ${i.text}`);
}
