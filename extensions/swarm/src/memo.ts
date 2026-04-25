import * as fs from "node:fs";
import * as path from "node:path";

export interface TranscriptEntry {
	from: string;
	to: string;
	content: string;
	timestamp: number;
	round: number;
}

export function writeDeliberationFiles(
	sessionId: string,
	log: TranscriptEntry[],
	totalCost: number,
	startTime: number,
	briefTitle: string,
	boardNames: string[],
	outputDir: string,
): { deliberationDir: string; memoDir: string; transcriptPath: string; jsonlPath: string; memoPath: string } {
	const deliberationDir = path.join(outputDir, "deliberations", sessionId);
	const memoDir = path.join(outputDir, "memos", sessionId);
	fs.mkdirSync(deliberationDir, { recursive: true });
	fs.mkdirSync(memoDir, { recursive: true });

	const jsonlPath = path.join(deliberationDir, "conversation.jsonl");
	fs.writeFileSync(jsonlPath, log.map(e => JSON.stringify(e)).join("\n") + "\n");

	const transcriptPath = path.join(deliberationDir, "transcript.md");
	const duration = ((Date.now() - startTime) / 60_000).toFixed(1);
	const lines: string[] = [
		`# Deliberation Transcript — ${sessionId}`,
		`**Date:** ${new Date(startTime).toISOString()}`,
		`**Duration:** ${duration} minutes`,
		`**Cost:** $${totalCost.toFixed(2)}`,
		"",
	];
	let currentRound = -1;
	for (const entry of log) {
		if (entry.round !== currentRound) { currentRound = entry.round; lines.push("---", `## Round ${currentRound}`, ""); }
		lines.push(`### ${entry.from} → ${entry.to}`, "", entry.content, "");
	}
	fs.writeFileSync(transcriptPath, lines.join("\n"));

	const memoPath = path.join(memoDir, "memo.md");
	fs.writeFileSync(memoPath, [
		"---",
		`session: ${sessionId}`,
		`date: ${new Date(startTime).toISOString().split("T")[0]}`,
		`duration: ${duration} minutes`,
		`budget_used: $${totalCost.toFixed(2)}`,
		`board: [${boardNames.join(", ")}]`,
		`title: "${briefTitle.replace(/"/g, '\\"')}"`,
		"---", "", "",
	].join("\n"));

	return { deliberationDir, memoDir, transcriptPath, jsonlPath, memoPath };
}
