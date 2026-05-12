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

function icon(s: MemberStat["status"]): string {
	return s === "idle" ? "⏸" : s === "active" ? "⏳" : "✅";
}

export function renderDeliberationWidget(
	stats: Record<string, MemberStat>,
	elapsedMin: number,
	totalCost: number,
	theme: { fg: (c: any, t: string) => string; bold: (t: string) => string },
): string[] {
	const lines: string[] = [];
	lines.push(
		`${theme.fg("accent", theme.bold("Swarm Deliberation"))} — ` +
		`${theme.fg("muted", `${elapsedMin.toFixed(1)}min`)}  💰 ${theme.fg("warning", `$${totalCost.toFixed(2)}`)}`,
	);
	const members = Object.values(stats);
	for (let i = 0; i < members.length; i += 2) {
		const left = members[i];
		const right = members[i + 1];
		const fmt = (m: MemberStat) => `${icon(m.status)} ${m.name} 🔄${m.turns} $${m.cost.toFixed(2)} ${fmtTokens(m.tokens)}`;
		lines.push(right ? `  ${fmt(left)}  │  ${fmt(right)}` : `  ${fmt(left)}`);
	}
	return lines;
}

export function renderStartup(
	agentNames: string[],
	constraints: { maxTime?: number; maxBudget?: number },
	theme: { fg: (c: any, t: string) => string; bold: (t: string) => string },
): string[] {
	const lines: string[] = [];
	lines.push(theme.fg("accent", theme.bold("Swarm Deliberation")) + " — Interactive Mode");
	lines.push("");
	if (constraints.maxTime) lines.push(`  ${theme.fg("muted", "Time")}  ${constraints.maxTime}min`);
	if (constraints.maxBudget) lines.push(`  ${theme.fg("muted", "Budget")}  $${constraints.maxBudget}`);
	lines.push("");
	lines.push(theme.fg("muted", "  Board"));
	for (const n of agentNames) lines.push(`  ◆ ${n}`);
	lines.push("");
	return lines;
}
