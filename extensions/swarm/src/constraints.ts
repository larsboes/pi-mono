export interface ConstraintState {
	startTime: number;
	maxTimeMs: number;
	maxBudget: number;
	boardCost: number;
	ceoCost: number;
	warned80: boolean;
	warned100: boolean;
}

export function createConstraintState(maxTimeMinutes: number, maxBudget: number): ConstraintState {
	return { startTime: Date.now(), maxTimeMs: maxTimeMinutes * 60_000, maxBudget, boardCost: 0, ceoCost: 0, warned80: false, warned100: false };
}

export function addBoardCost(state: ConstraintState, cost: number): void { state.boardCost += cost; }
export function addCeoCost(state: ConstraintState, cost: number): void { state.ceoCost += cost; }
export function getTotalCost(state: ConstraintState): number { return state.ceoCost + state.boardCost; }
export function getElapsedMinutes(state: ConstraintState): number { return (Date.now() - state.startTime) / 60_000; }

function getBudgetPercent(state: ConstraintState): number { return (getTotalCost(state) / state.maxBudget) * 100; }
function getTimePercent(state: ConstraintState): number { return (getElapsedMinutes(state) / (state.maxTimeMs / 60_000)) * 100; }

export function checkConstraints(state: ConstraintState): string | null {
	const budgetPct = getBudgetPercent(state);
	const timePct = getTimePercent(state);
	const cost = getTotalCost(state);
	const elapsed = getElapsedMinutes(state).toFixed(1);
	const maxMin = (state.maxTimeMs / 60_000).toFixed(0);

	if (!state.warned100 && (budgetPct >= 100 || timePct >= 100)) {
		state.warned100 = true;
		const reasons: string[] = [];
		if (budgetPct >= 100) reasons.push(`Budget limit: $${cost.toFixed(2)} of $${state.maxBudget.toFixed(2)}`);
		if (timePct >= 100) reasons.push(`Time limit: ${elapsed}min of ${maxMin}min`);
		return `⚠️ CONSTRAINT LIMIT REACHED\n${reasons.join("\n")}\nCall end_deliberation() now and write the memo.`;
	}

	if (!state.warned80 && (budgetPct >= 80 || timePct >= 80)) {
		state.warned80 = true;
		const reasons: string[] = [];
		if (budgetPct >= 80) reasons.push(`Budget: $${cost.toFixed(2)} of $${state.maxBudget.toFixed(2)} (${budgetPct.toFixed(0)}%)`);
		if (timePct >= 80) reasons.push(`Time: ${elapsed}min of ${maxMin}min (${timePct.toFixed(0)}%)`);
		return `📊 Constraint advisory\n${reasons.join("\n")}\nConsider wrapping up.`;
	}

	return null;
}
