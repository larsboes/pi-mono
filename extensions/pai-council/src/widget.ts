/**
 * Widget — status grid showing council member states during deliberation
 */

import type { MemberStats } from "./deliberate.js";

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1_000_000).toFixed(1)}M`;
}

function statusIcon(status: "idle" | "active" | "done"): string {
	switch (status) {
		case "idle":
			return "⏸";
		case "active":
			return "⏳";
		case "done":
			return "✅";
	}
}

export function renderBoardWidget(
	allStats: Record<string, MemberStats>,
	theme: { fg: (color: any, text: string) => string; bold: (text: string) => string },
): string[] {
	const lines: string[] = [];
	const members = Object.values(allStats);

	// Chair on its own line (always first)
	const chair = members.find((m) => m.name === "Chair");
	if (chair) {
		const icon = statusIcon(chair.status);
		const cost = chair.cost > 0 ? ` 💰 $${chair.cost.toFixed(2)}` : "";
		const ctx = chair.contextTokens > 0 ? ` 🧠 ${formatTokens(chair.contextTokens)}` : "";
		lines.push(`${icon} ${theme.fg("accent", theme.bold("Chair"))}${cost}${ctx}`);
	}

	// Board members in 2-column grid
	const board = members.filter((m) => m.name !== "Chair");
	for (let i = 0; i < board.length; i += 2) {
		const left = board[i];
		const right = board[i + 1];

		const formatMember = (m: MemberStats): string => {
			const icon = statusIcon(m.status);
			const turns = m.turns > 0 ? ` 🔄${m.turns}` : "";
			const cost = m.cost > 0 ? ` $${m.cost.toFixed(2)}` : "";
			const ctx = m.contextTokens > 0 ? ` 🧠${formatTokens(m.contextTokens)}` : "";
			return `${icon} ${m.name}${turns}${cost}${ctx}`;
		};

		if (right) {
			lines.push(`  ${formatMember(left)}  │  ${formatMember(right)}`);
		} else {
			lines.push(`  ${formatMember(left)}`);
		}
	}

	return lines;
}

export function renderStartupBoard(
	chairName: string,
	chairModel: string,
	members: Array<{ name: string; color: string; model?: string }>,
	config: { maxTime: number; maxBudget: number; rounds: number },
	theme: { fg: (color: any, text: string) => string; bold: (text: string) => string },
): string[] {
	const lines: string[] = [];

	lines.push(theme.fg("accent", theme.bold("pai-council")) + " — Multi-Agent Deliberation");
	lines.push("");
	lines.push(
		`  ${theme.fg("muted", "Time")}   ${config.maxTime}min   ${theme.fg("muted", "Budget")}  $${config.maxBudget}   ${theme.fg("muted", "Rounds")}  ${config.rounds}`,
	);
	lines.push("");
	lines.push(theme.fg("muted", "  Council"));

	const chairModelShort = chairModel.split("/").pop() ?? chairModel;
	lines.push(`  ◆ ${theme.fg("accent", theme.bold(chairName))}  ${theme.fg("muted", `[${chairModelShort}]`)}`);

	for (const m of members) {
		const modelShort = (m.model ?? "claude-sonnet-4").split("/").pop() ?? m.model ?? "sonnet";
		lines.push(`  ◆ ${m.name}  ${theme.fg("muted", `[${modelShort}]`)}`);
	}

	lines.push("");
	lines.push(theme.fg("dim", "  Run /council to start a deliberation."));

	return lines;
}
