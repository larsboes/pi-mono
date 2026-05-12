/**
 * Phase 10.2: Token-Budgeted Context Injection
 *
 * The hot context injection (MEMORY.md, TELOS, daily logs) can grow unbounded.
 * This module enforces a token budget by scoring each section's relevance
 * to the current session and pruning low-value content.
 *
 * Strategy:
 * - Estimate token count per section (chars/4 approximation)
 * - Score relevance using session entities + query terms
 * - Fill budget starting with highest-relevance sections
 * - Always include: today's log, open scratchpad (high-signal, small)
 * - Conditionally include: MEMORY.md, TELOS, yesterday's log
 */

import { getContextEntities } from "./session.js";

// ── Configuration ──────────────────────────────────────────────────────────

/** Max approximate tokens for context injection (conservative — leaves room for tools + prompt) */
const DEFAULT_BUDGET = 6000;

// ── Types ──────────────────────────────────────────────────────────────────

export interface ContextSection {
	/** Identifier for this section */
	id: string;
	/** The content to inject */
	content: string;
	/** Priority: higher = more important (0-10) */
	basePriority: number;
	/** Whether this section is always included regardless of budget */
	mandatory?: boolean;
}

interface ScoredSection extends ContextSection {
	/** Final relevance score (basePriority + session relevance boost) */
	score: number;
	/** Estimated token count */
	tokens: number;
}

// ── Scoring ────────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
	// Rough approximation: 1 token ≈ 4 chars for English text
	return Math.ceil(text.length / 4);
}

/**
 * Score a section's relevance to the current session.
 * Returns a bonus (0-3) based on entity overlap.
 */
function sessionRelevanceBonus(content: string, entities: string[]): number {
	if (entities.length === 0) return 0;

	const lower = content.toLowerCase();
	const matchCount = entities.filter((e) => lower.includes(e.toLowerCase())).length;

	// More matches = higher bonus, capped at 3
	if (matchCount >= 5) return 3;
	if (matchCount >= 3) return 2;
	if (matchCount >= 1) return 1;
	return 0;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Apply token budget to context sections.
 * Returns the sections that fit within budget, ordered by priority.
 *
 * @param sections - All candidate sections for injection
 * @param budget - Max tokens to use (default: 6000)
 * @returns Sections that fit within budget, in injection order
 */
export function applyTokenBudget(
	sections: ContextSection[],
	budget = DEFAULT_BUDGET,
): ContextSection[] {
	const entities = getContextEntities();

	// Score all sections
	const scored: ScoredSection[] = sections.map((s) => ({
		...s,
		score: s.basePriority + sessionRelevanceBonus(s.content, entities),
		tokens: estimateTokens(s.content),
	}));

	// Separate mandatory from optional
	const mandatory = scored.filter((s) => s.mandatory);
	const optional = scored.filter((s) => !s.mandatory);

	// Sort optional by score (highest first)
	optional.sort((a, b) => b.score - a.score);

	// Fill budget: mandatory first, then optional by score
	let usedTokens = 0;
	const result: ContextSection[] = [];

	for (const section of mandatory) {
		usedTokens += section.tokens;
		result.push(section);
	}

	for (const section of optional) {
		if (usedTokens + section.tokens > budget) {
			// Try truncating if it's large and high-priority
			if (section.score >= 7 && section.tokens > 500) {
				const availableTokens = budget - usedTokens;
				if (availableTokens > 200) {
					const truncatedChars = availableTokens * 4;
					result.push({
						...section,
						content: section.content.slice(0, truncatedChars) + "\n\n[...truncated for context budget]",
					});
					usedTokens += availableTokens;
				}
			}
			continue;
		}
		usedTokens += section.tokens;
		result.push(section);
	}

	return result;
}

/**
 * Get the current budget utilization stats.
 */
export function getBudgetStats(sections: ContextSection[], budget = DEFAULT_BUDGET): {
	totalSections: number;
	includedSections: number;
	totalTokens: number;
	budgetUsed: number;
	budgetPct: number;
} {
	const included = applyTokenBudget(sections, budget);
	const totalTokens = sections.reduce((a, s) => a + estimateTokens(s.content), 0);
	const budgetUsed = included.reduce((a, s) => a + estimateTokens(s.content), 0);

	return {
		totalSections: sections.length,
		includedSections: included.length,
		totalTokens,
		budgetUsed,
		budgetPct: budget > 0 ? (budgetUsed / budget) * 100 : 0,
	};
}
