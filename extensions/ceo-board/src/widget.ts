/**
 * Widget — status grid showing board member states
 */
import type { MemberResponse } from "./converse.js";

export interface MemberStat {
	name: string;
	color: string;
	turns: number;
	cost: number;
	tokens: number;
	status: "idle" | "active" | "done";
}

function fmtTokens(n: number): string {
	if (n < 1000) return String(n);
	if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
	if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

function statusIcon(s: "idle" | "active" | "done"): string {
	return s === "idle" ? "⏸" : s === "active" ? "⏳" : "✅";
}

export function renderWidget(
	stats: Record<string, MemberStat>,
	elapsedMin: number,
	totalCost: number,
	theme: { fg: (c: any, t: string) => string; bold: (t: string) => string },
): string[] {
	const lines: string[] = [];

	// Header
	lines.push(
		`${theme.fg("accent", theme.bold("CEO & Board"))} — ` +
			`${theme.fg("muted", `${elapsedMin.toFixed(1)}min`)}  ` +
			`💰 ${theme.fg("warning", `$${totalCost.toFixed(2)}`)}`,
	);

	// Members in 2-col grid
	const members = Object.values(stats);
	for (let i = 0; i < members.length; i += 2) {
		const left = members[i];
		const right = members[i + 1];
		const fmt = (m: MemberStat) =>
			`${statusIcon(m.status)} ${m.name} 🔄${m.turns} $${m.cost.toFixed(2)} ${fmtTokens(m.tokens)}`;
		lines.push(right ? `  ${fmt(left)}  │  ${fmt(right)}` : `  ${fmt(left)}`);
	}

	return lines;
}

export function renderStartup(
	ceoName: string,
	ceoModel: string,
	members: Array<{ name: string; model: string }>,
	constraints: { maxTime: number; maxBudget: number },
	theme: { fg: (c: any, t: string) => string; bold: (t: string) => string },
): string[] {
	const lines: string[] = [];
	lines.push(theme.fg("accent", theme.bold("CEO & Board")) + " — Strategic Decision-Making");
	lines.push("");
	lines.push(
		`  ${theme.fg("muted", "Time")}  ${constraints.maxTime}min   ` +
			`${theme.fg("muted", "Budget")}  $${constraints.maxBudget}`,
	);
	lines.push("");
	lines.push(theme.fg("muted", "  Board"));
	const short = (m: string) => m.split("/").pop() ?? m;
	lines.push(`  ◆ ${theme.fg("accent", theme.bold(ceoName))}  ${theme.fg("muted", `[${short(ceoModel)}]`)}`);
	for (const m of members) {
		lines.push(`  ◆ ${m.name}  ${theme.fg("muted", `[${short(m.model)}]`)}`);
	}
	lines.push("");
	lines.push(theme.fg("dim", "  Run /ceo-begin to start a deliberation."));
	return lines;
}
