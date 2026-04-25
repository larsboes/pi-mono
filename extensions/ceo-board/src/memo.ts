/**
 * Memo — writes deliberation outputs (memo, transcript, JSONL)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { TranscriptEntry } from "./converse.js";
import type { Config } from "./config.js";

export function writeDeliberationFiles(
	sessionId: string,
	log: TranscriptEntry[],
	totalCost: number,
	startTime: number,
	briefTitle: string,
	config: Config,
	baseDir: string,
): { deliberationDir: string; memoDir: string; transcriptPath: string; jsonlPath: string; memoPath: string } {
	const deliberationDir = path.join(baseDir, config.paths.deliberations, sessionId);
	const memoDir = path.join(baseDir, config.paths.memos, sessionId);
	fs.mkdirSync(deliberationDir, { recursive: true });
	fs.mkdirSync(memoDir, { recursive: true });

	// JSONL transcript
	const jsonlPath = path.join(deliberationDir, "conversation.jsonl");
	fs.writeFileSync(jsonlPath, log.map((e) => JSON.stringify(e)).join("\n") + "\n");

	// Human-readable transcript
	const transcriptPath = path.join(deliberationDir, "transcript.md");
	const duration = ((Date.now() - startTime) / 60_000).toFixed(1);
	const transcriptLines: string[] = [
		`# Deliberation Transcript — ${sessionId}`,
		`**Date:** ${new Date(startTime).toISOString()}`,
		`**Duration:** ${duration} minutes`,
		`**Cost:** $${totalCost.toFixed(2)}`,
		"",
	];
	let currentRound = -1;
	for (const entry of log) {
		if (entry.round !== currentRound) {
			currentRound = entry.round;
			transcriptLines.push("---", `## Round ${currentRound}`, "");
		}
		transcriptLines.push(`### ${entry.from} → ${entry.to}`, "", entry.content, "");
	}
	fs.writeFileSync(transcriptPath, transcriptLines.join("\n"));

	// Memo placeholder (CEO writes the real memo via write tool)
	const memoPath = path.join(memoDir, "memo.md");
	const frontmatter = [
		"---",
		`session: ${sessionId}`,
		`date: ${new Date(startTime).toISOString().split("T")[0]}`,
		`duration: ${duration} minutes`,
		`budget_used: $${totalCost.toFixed(2)}`,
		`board: [${config.board.map((m) => m.name).join(", ")}]`,
		`title: "${briefTitle.replace(/"/g, '\\"')}"`,
		"---",
		"",
		"<!-- CEO writes the full memo below -->",
		"",
	].join("\n");
	fs.writeFileSync(memoPath, frontmatter);

	return { deliberationDir, memoDir, transcriptPath, jsonlPath, memoPath };
}
