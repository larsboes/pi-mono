/**
 * Phase 9.2: Temporal Query Routing
 *
 * Detects temporal references in queries ("last week", "yesterday", "in March")
 * and routes retrieval to the appropriate daily log date range.
 *
 * Works with the hierarchical index: temporal queries prefer document-level
 * chunks from daily logs matching the resolved date range.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface TemporalRange {
	/** Start date (inclusive) YYYY-MM-DD */
	start: string;
	/** End date (inclusive) YYYY-MM-DD */
	end: string;
	/** The temporal expression that was detected */
	expression: string;
	/** Confidence 0-1 */
	confidence: number;
}

// ── Temporal Pattern Detection ─────────────────────────────────────────────

interface TemporalPattern {
	regex: RegExp;
	resolve: (match: RegExpMatchArray, now: Date) => TemporalRange;
}

function fmt(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function daysAgo(now: Date, n: number): Date {
	const d = new Date(now);
	d.setDate(d.getDate() - n);
	return d;
}

function startOfWeek(d: Date): Date {
	const day = d.getDay();
	const diff = day === 0 ? 6 : day - 1; // Monday = start
	const start = new Date(d);
	start.setDate(start.getDate() - diff);
	return start;
}

const MONTH_NAMES: Record<string, number> = {
	january: 0, jan: 0,
	february: 1, feb: 1,
	march: 2, mar: 2,
	april: 3, apr: 3,
	may: 4,
	june: 5, jun: 5,
	july: 6, jul: 6,
	august: 7, aug: 7,
	september: 8, sep: 8, sept: 8,
	october: 9, oct: 9,
	november: 10, nov: 10,
	december: 11, dec: 11,
};

const PATTERNS: TemporalPattern[] = [
	// "today"
	{
		regex: /\btoday\b/i,
		resolve: (_m, now) => ({
			start: fmt(now),
			end: fmt(now),
			expression: "today",
			confidence: 0.95,
		}),
	},
	// "yesterday"
	{
		regex: /\byesterday\b/i,
		resolve: (_m, now) => ({
			start: fmt(daysAgo(now, 1)),
			end: fmt(daysAgo(now, 1)),
			expression: "yesterday",
			confidence: 0.95,
		}),
	},
	// "last week" / "past week"
	{
		regex: /\b(?:last|past)\s+week\b/i,
		resolve: (_m, now) => ({
			start: fmt(daysAgo(now, 7)),
			end: fmt(daysAgo(now, 1)),
			expression: "last week",
			confidence: 0.9,
		}),
	},
	// "this week"
	{
		regex: /\bthis\s+week\b/i,
		resolve: (_m, now) => ({
			start: fmt(startOfWeek(now)),
			end: fmt(now),
			expression: "this week",
			confidence: 0.9,
		}),
	},
	// "last month" / "past month"
	{
		regex: /\b(?:last|past)\s+month\b/i,
		resolve: (_m, now) => {
			const start = new Date(now);
			start.setMonth(start.getMonth() - 1);
			return {
				start: fmt(start),
				end: fmt(daysAgo(now, 1)),
				expression: "last month",
				confidence: 0.85,
			};
		},
	},
	// "N days ago" / "last N days"
	{
		regex: /\b(?:(\d+)\s+days?\s+ago|last\s+(\d+)\s+days?)\b/i,
		resolve: (m, now) => {
			const n = parseInt(m[1] || m[2], 10);
			return {
				start: fmt(daysAgo(now, n)),
				end: fmt(daysAgo(now, Math.max(0, n - 1))),
				expression: `${n} days ago`,
				confidence: 0.9,
			};
		},
	},
	// "in January" / "in March" etc (current or previous year)
	{
		regex: /\bin\s+(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\b/i,
		resolve: (m, now) => {
			const monthName = m[1].toLowerCase();
			const month = MONTH_NAMES[monthName];
			if (month === undefined) return { start: fmt(now), end: fmt(now), expression: m[0], confidence: 0.3 };
			let year = now.getFullYear();
			// If the month is in the future, assume previous year
			if (month > now.getMonth()) year--;
			const start = new Date(year, month, 1);
			const end = new Date(year, month + 1, 0); // last day of month
			return {
				start: fmt(start),
				end: fmt(end),
				expression: `in ${m[1]}`,
				confidence: 0.85,
			};
		},
	},
	// "on YYYY-MM-DD" or just "YYYY-MM-DD"
	{
		regex: /\b(?:on\s+)?(\d{4}-\d{2}-\d{2})\b/,
		resolve: (m, _now) => ({
			start: m[1],
			end: m[1],
			expression: m[1],
			confidence: 0.99,
		}),
	},
	// "last Monday" / "last Tuesday" etc
	{
		regex: /\blast\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
		resolve: (m, now) => {
			const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
			const targetDay = dayNames.indexOf(m[1].toLowerCase());
			const currentDay = now.getDay();
			let diff = currentDay - targetDay;
			if (diff <= 0) diff += 7;
			const target = daysAgo(now, diff);
			return {
				start: fmt(target),
				end: fmt(target),
				expression: `last ${m[1]}`,
				confidence: 0.85,
			};
		},
	},
];

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Detect temporal references in a query.
 * Returns the best matching temporal range, or null if no temporal intent.
 */
export function detectTemporalRange(query: string): TemporalRange | null {
	let best: TemporalRange | null = null;

	for (const pattern of PATTERNS) {
		const match = query.match(pattern.regex);
		if (match) {
			const range = pattern.resolve(match, new Date());
			if (!best || range.confidence > best.confidence) {
				best = range;
			}
		}
	}

	return best;
}

/**
 * Check if a daily log filename falls within a temporal range.
 * Filenames are expected in format "YYYY-MM-DD.md" or "pai/daily/YYYY-MM/YYYY-MM-DD.md"
 */
export function isInRange(source: string, range: TemporalRange): boolean {
	// Extract date from source filename
	const dateMatch = source.match(/(\d{4}-\d{2}-\d{2})/);
	if (!dateMatch) return false;
	const date = dateMatch[1];
	return date >= range.start && date <= range.end;
}

/**
 * Check if a query has strong temporal intent (vs just mentioning a date in passing).
 * Queries like "what did I do last week?" have strong temporal intent.
 * Queries like "the bug from last week" have weak temporal intent.
 */
export function hasStrongTemporalIntent(query: string): boolean {
	const strongIndicators = [
		/\bwhat\s+(?:did|have|was)\b.*\b(?:today|yesterday|last|this)\b/i,
		/\b(?:summary|recap|review|log)\b.*\b(?:today|yesterday|last|this)\b/i,
		/\b(?:today|yesterday|last|this)\b.*\b(?:summary|recap|review|log|happen|do)\b/i,
		/\bshow\s+(?:me\s+)?(?:today|yesterday|last|this)\b/i,
	];
	return strongIndicators.some((p) => p.test(query));
}
