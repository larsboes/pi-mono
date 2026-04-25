/**
 * Memo writer — generates structured decision memos and transcripts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { CouncilConfig } from "./config.js";
import type { DeliberationResult, MemberStats } from "./deliberate.js";

function formatDuration(ms: number): string {
	const minutes = ms / 60000;
	if (minutes < 1) return `${Math.round(ms / 1000)}s`;
	return `${minutes.toFixed(1)} minutes`;
}

function formatCost(cost: number): string {
	return `$${cost.toFixed(2)}`;
}

export function generateMemo(result: DeliberationResult, config: CouncilConfig): string {
	const memberNames = Object.values(result.stats)
		.filter((s) => s.name !== "Chair")
		.map((s) => s.name);

	const duration = formatDuration(result.endTime - result.startTime);

	const frontmatter = [
		"---",
		`session: ${result.sessionId}`,
		`date: ${new Date(result.startTime).toISOString().split("T")[0]}`,
		`duration: ${duration}`,
		`budget_used: ${formatCost(result.totalCost)}`,
		`council: [${memberNames.join(", ")}]`,
		`rounds: ${config.meeting.constraints.rounds}`,
		`title: "${result.brief.title.replace(/"/g, '\\"')}"`,
		"---",
	].join("\n");

	const body = result.synthesis;

	return `${frontmatter}\n\n${body}`;
}

export function generateTranscript(result: DeliberationResult): string {
	const lines: string[] = [];

	lines.push(`# Deliberation Transcript — ${result.sessionId}`);
	lines.push(`**Date:** ${new Date(result.startTime).toISOString()}`);
	lines.push(`**Duration:** ${formatDuration(result.endTime - result.startTime)}`);
	lines.push(`**Cost:** ${formatCost(result.totalCost)}`);
	lines.push("");

	let currentPhase = "";
	for (const entry of result.transcript) {
		const phase = entry.phase;
		if (phase !== currentPhase) {
			currentPhase = phase;
			lines.push(`---`);
			if (phase === "framing") {
				lines.push(`## Chair Framing`);
			} else if (phase === "debate") {
				lines.push(`## Round ${entry.round}: Debate`);
			} else if (phase === "final-statement") {
				lines.push(`## Final Statements`);
			} else if (phase === "synthesis") {
				lines.push(`## Chair Synthesis`);
			} else {
				lines.push(`## ${phase}`);
			}
			lines.push("");
		}

		lines.push(`### ${entry.member}`);
		lines.push("");
		lines.push(entry.content);
		lines.push("");
	}

	// Usage summary
	lines.push("---");
	lines.push("## Usage Summary");
	lines.push("");
	lines.push("| Member | Turns | Input | Output | Cost |");
	lines.push("|--------|-------|-------|--------|------|");
	for (const s of Object.values(result.stats)) {
		lines.push(
			`| ${s.name} | ${s.turns} | ${s.inputTokens.toLocaleString()} | ${s.outputTokens.toLocaleString()} | ${formatCost(s.cost)} |`,
		);
	}
	lines.push("");

	return lines.join("\n");
}

export function generateTranscriptJsonl(result: DeliberationResult): string {
	return result.transcript.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
}

export async function writeMemoFiles(
	result: DeliberationResult,
	config: CouncilConfig,
	baseDir: string,
): Promise<{ memoPath: string; transcriptPath: string; jsonlPath: string }> {
	const memoDir = path.join(baseDir, config.paths.memos, result.sessionId);
	const deliberationDir = path.join(baseDir, config.paths.deliberations, result.sessionId);

	fs.mkdirSync(memoDir, { recursive: true });
	fs.mkdirSync(deliberationDir, { recursive: true });

	const memoPath = path.join(memoDir, "memo.md");
	const transcriptPath = path.join(deliberationDir, "transcript.md");
	const jsonlPath = path.join(deliberationDir, "conversation.jsonl");

	fs.writeFileSync(memoPath, generateMemo(result, config));
	fs.writeFileSync(transcriptPath, generateTranscript(result));
	fs.writeFileSync(jsonlPath, generateTranscriptJsonl(result));

	return { memoPath, transcriptPath, jsonlPath };
}
