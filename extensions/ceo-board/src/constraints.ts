/**
 * Constraints — budget/time monitoring and signaling
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getTotalBoardCost, getRoundCounter } from "./converse.js";

export interface ConstraintState {
	startTime: number;
	maxTimeMs: number;
	maxBudget: number;
	ceoCost: number;
	warned80: boolean;
	warned100: boolean;
}

export function createConstraintState(maxTimeMinutes: number, maxBudget: number): ConstraintState {
	return {
		startTime: Date.now(),
		maxTimeMs: maxTimeMinutes * 60_000,
		maxBudget,
		ceoCost: 0,
		warned80: false,
		warned100: false,
	};
}

export function getTotalCost(state: ConstraintState): number {
	return state.ceoCost + getTotalBoardCost();
}

export function getElapsedMinutes(state: ConstraintState): number {
	return (Date.now() - state.startTime) / 60_000;
}

export function getBudgetPercent(state: ConstraintState): number {
	return (getTotalCost(state) / state.maxBudget) * 100;
}

export function getTimePercent(state: ConstraintState): number {
	return (getElapsedMinutes(state) / (state.maxTimeMs / 60_000)) * 100;
}

/**
 * Check constraints and return a warning message if thresholds crossed.
 * Returns null if no warning needed.
 */
export function checkConstraints(state: ConstraintState, pi: ExtensionAPI): string | null {
	const budgetPct = getBudgetPercent(state);
	const timePct = getTimePercent(state);
	const totalCost = getTotalCost(state);
	const elapsed = getElapsedMinutes(state).toFixed(1);
	const maxMinutes = (state.maxTimeMs / 60_000).toFixed(0);

	// 100% threshold
	if (!state.warned100 && (budgetPct >= 100 || timePct >= 100)) {
		state.warned100 = true;
		const reasons: string[] = [];
		if (budgetPct >= 100) reasons.push(`Budget limit reached: $${totalCost.toFixed(2)} of $${state.maxBudget.toFixed(2)}`);
		if (timePct >= 100) reasons.push(`Time limit reached: ${elapsed}min of ${maxMinutes}min`);
		return `⚠️ CONSTRAINT LIMIT REACHED\n${reasons.join("\n")}\nPlease call end_deliberation() now and write the memo.`;
	}

	// 80% threshold
	if (!state.warned80 && (budgetPct >= 80 || timePct >= 80)) {
		state.warned80 = true;
		const reasons: string[] = [];
		if (budgetPct >= 80) reasons.push(`Budget: $${totalCost.toFixed(2)} of $${state.maxBudget.toFixed(2)} (${budgetPct.toFixed(0)}%)`);
		if (timePct >= 80) reasons.push(`Time: ${elapsed}min of ${maxMinutes}min (${timePct.toFixed(0)}%)`);
		return `📊 Constraint advisory\n${reasons.join("\n")}\nConsider wrapping up. You can call end_deliberation() or converse() one more time for final statements.`;
	}

	return null;
}
