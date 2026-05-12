/**
 * Phase 8.2: Query Intent Classification
 *
 * Classifies queries into intent categories and produces:
 * - Confidence score (0-1) for classification quality
 * - Weight vectors per category for score adjustment
 * - Auto-granularity recommendations per intent
 * - Source category mapping for result scoring
 */

export type QueryIntent = 'recall' | 'learn' | 'debug' | 'navigate' | 'create' | 'general';

export interface IntentResult {
  intent: QueryIntent;
  confidence: number;
  suggestedGranularity: 'document' | 'section' | 'chunk' | null;
}

export interface IntentWeights {
  recencyBias: number;
  skillBoost: number;
  errorBoost: number;
  pathBoost: number;
  codeBoost: number;
}

// ── Pattern Definitions ────────────────────────────────────────────────────

interface IntentPattern {
  regex: RegExp;
  weight: number;
}

const RECALL_PATTERNS: IntentPattern[] = [
  { regex: /what did (we|i|you) (do|work|build|fix|change|implement|discuss)/i, weight: 1.0 },
  { regex: /last (time|session|week)/i, weight: 0.9 },
  { regex: /yesterday/i, weight: 0.85 },
  { regex: /previous(ly)?/i, weight: 0.7 },
  { regex: /recently/i, weight: 0.75 },
  { regex: /\bhistory\b/i, weight: 0.7 },
  { regex: /\bwhen did\b/i, weight: 0.9 },
  { regex: /remind me/i, weight: 0.8 },
  { regex: /what('s| is) (the )?status/i, weight: 0.7 },
  { regex: /where (were|are) we/i, weight: 0.8 },
  { regex: /check .*(state|progress|status)/i, weight: 0.75 },
  { regex: /what (happened|changed)/i, weight: 0.85 },
  { regex: /current state/i, weight: 0.7 },
  { regex: /\bplans?\b.*(we|i|had|made)/i, weight: 0.7 },
  { regex: /\blast\b.*\b(commit|push|deploy|merge)\b/i, weight: 0.85 },
];

const LEARN_PATTERNS: IntentPattern[] = [
  { regex: /how (does|do|can|should|would)/i, weight: 0.9 },
  { regex: /explain/i, weight: 0.95 },
  { regex: /what (is|are)\b/i, weight: 0.7 },
  { regex: /teach me/i, weight: 1.0 },
  { regex: /\bdocument(ation)?\b/i, weight: 0.7 },
  { regex: /\bguide\b/i, weight: 0.65 },
  { regex: /\bexample(s)?\b/i, weight: 0.7 },
  { regex: /\btutorial\b/i, weight: 0.8 },
  { regex: /\bapi\b/i, weight: 0.6 },
  { regex: /\bpattern\b/i, weight: 0.6 },
  { regex: /\binterface\b/i, weight: 0.5 },
  { regex: /how.*work/i, weight: 0.85 },
  { regex: /difference between/i, weight: 0.75 },
  { regex: /best (practice|way|approach)/i, weight: 0.8 },
];

const DEBUG_PATTERNS: IntentPattern[] = [
  { regex: /why (did|does|is|was|isn't|doesn't|won't)/i, weight: 0.9 },
  { regex: /\berror\b/i, weight: 0.85 },
  { regex: /\bfail(ed|ing|s|ure)?\b/i, weight: 0.9 },
  { regex: /\bbroken\b/i, weight: 0.85 },
  { regex: /not working/i, weight: 0.9 },
  { regex: /\bcrash(ed|es|ing)?\b/i, weight: 0.9 },
  { regex: /\bbug\b/i, weight: 0.8 },
  { regex: /\bfix\b/i, weight: 0.6 },
  { regex: /\bdebug\b/i, weight: 0.9 },
  { regex: /\bissue\b/i, weight: 0.6 },
  { regex: /what went wrong/i, weight: 0.95 },
  { regex: /\btrace(back)?\b/i, weight: 0.8 },
  { regex: /\bstack\b/i, weight: 0.6 },
  { regex: /\bundefined\b/i, weight: 0.65 },
  { regex: /\bnull\b.*\b(error|pointer|reference)\b/i, weight: 0.8 },
  { regex: /type.*error/i, weight: 0.75 },
  { regex: /cannot (find|read|resolve)/i, weight: 0.8 },
];

const NAVIGATE_PATTERNS: IntentPattern[] = [
  { regex: /find.*(file|dir|folder|path)/i, weight: 0.9 },
  { regex: /where is/i, weight: 0.9 },
  { regex: /path to/i, weight: 0.85 },
  { regex: /\blist\b.*(files|dirs|folders)/i, weight: 0.85 },
  { regex: /open.*(file|dir|folder)/i, weight: 0.8 },
  { regex: /\blocate\b/i, weight: 0.8 },
  { regex: /show me (the )?(file|dir|folder|code|source)/i, weight: 0.85 },
  { regex: /which (file|module|package)/i, weight: 0.8 },
  { regex: /\bsource\b.*(of|for|code)/i, weight: 0.7 },
  { regex: /look at/i, weight: 0.5 },
  { regex: /check (the )?(file|code|source)/i, weight: 0.6 },
];

const CREATE_PATTERNS: IntentPattern[] = [
  { regex: /\bcreate\b/i, weight: 0.75 },
  { regex: /\bbuild\b/i, weight: 0.6 },
  { regex: /\bimplement\b/i, weight: 0.7 },
  { regex: /\bwrite\b/i, weight: 0.5 },
  { regex: /\badd\b.*(feature|tool|command|extension|skill)/i, weight: 0.85 },
  { regex: /\bset up\b/i, weight: 0.7 },
  { regex: /\bscaffold\b/i, weight: 0.8 },
  { regex: /\bgenerate\b/i, weight: 0.7 },
  { regex: /let('s| us) (make|build|create|add|write)/i, weight: 0.85 },
  { regex: /\bnew\b.*(file|module|component|function|class)/i, weight: 0.75 },
];

// ── Classifier ─────────────────────────────────────────────────────────────

function scorePatterns(query: string, patterns: IntentPattern[]): number {
  let totalScore = 0;
  let matchCount = 0;

  for (const p of patterns) {
    if (p.regex.test(query)) {
      totalScore += p.weight;
      matchCount++;
    }
  }

  if (matchCount === 0) return 0;
  // Combine: best match weight + bonus for multiple matches (diminishing returns)
  const maxWeight = Math.max(...patterns.filter(p => p.regex.test(query)).map(p => p.weight));
  const multiMatchBonus = Math.min(0.2, (matchCount - 1) * 0.05);
  return Math.min(1.0, maxWeight + multiMatchBonus);
}

/**
 * Classify query intent with confidence score.
 * Returns the most likely intent and a confidence value.
 */
export function classifyIntentFull(query: string): IntentResult {
  const scores: Record<QueryIntent, number> = {
    recall: scorePatterns(query, RECALL_PATTERNS),
    learn: scorePatterns(query, LEARN_PATTERNS),
    debug: scorePatterns(query, DEBUG_PATTERNS),
    navigate: scorePatterns(query, NAVIGATE_PATTERNS),
    create: scorePatterns(query, CREATE_PATTERNS),
    general: 0.15, // baseline — general always has a small default score
  };

  // Find winner
  let bestIntent: QueryIntent = 'general';
  let bestScore = 0;

  for (const [intent, score] of Object.entries(scores) as [QueryIntent, number][]) {
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  // Confidence is the margin between winner and runner-up
  const sorted = Object.values(scores).sort((a, b) => b - a);
  const margin = sorted.length >= 2 ? sorted[0] - sorted[1] : sorted[0];
  const confidence = Math.min(1.0, bestScore * 0.7 + margin * 0.3);

  return {
    intent: bestIntent,
    confidence,
    suggestedGranularity: getGranularityForIntent(bestIntent, confidence),
  };
}

/**
 * Simple backward-compatible classifier (returns just the intent string).
 */
export function classifyIntent(query: string): QueryIntent {
  return classifyIntentFull(query).intent;
}

// ── Granularity Routing (Phase 8.4 integration) ────────────────────────────

/**
 * Determine optimal granularity level based on intent.
 * Returns null to use mixed granularity (no filter).
 */
function getGranularityForIntent(intent: QueryIntent, confidence: number): IntentResult['suggestedGranularity'] {
  // Only auto-route when confident enough
  if (confidence < 0.5) return null;

  switch (intent) {
    case 'recall':
      // Recall queries want summaries — document or section level
      return 'document';
    case 'learn':
      // Learning queries want structured explanations — section level
      return 'section';
    case 'debug':
      // Debug queries want specific details — chunk level (error lines, stack traces)
      return 'chunk';
    case 'navigate':
      // Navigate queries want file references — chunk level (paths, listings)
      return 'chunk';
    case 'create':
      // Create queries want prior art / patterns — section level
      return 'section';
    case 'general':
      return null;
  }
}

// ── Weight Vectors ─────────────────────────────────────────────────────────

export function getIntentWeights(intent: QueryIntent): IntentWeights {
  switch (intent) {
    case 'recall':
      return { recencyBias: 2.0, skillBoost: 0.6, errorBoost: 0.6, pathBoost: 0.7, codeBoost: 0.6 };
    case 'learn':
      return { recencyBias: 0.5, skillBoost: 2.0, errorBoost: 0.5, pathBoost: 0.7, codeBoost: 1.2 };
    case 'debug':
      return { recencyBias: 1.2, skillBoost: 0.5, errorBoost: 2.0, pathBoost: 0.8, codeBoost: 1.3 };
    case 'navigate':
      return { recencyBias: 0.6, skillBoost: 0.5, errorBoost: 0.5, pathBoost: 2.0, codeBoost: 0.8 };
    case 'create':
      return { recencyBias: 0.7, skillBoost: 1.5, errorBoost: 0.5, pathBoost: 0.8, codeBoost: 1.5 };
    case 'general':
      return { recencyBias: 1.0, skillBoost: 1.0, errorBoost: 1.0, pathBoost: 1.0, codeBoost: 1.0 };
  }
}

// ── Source Categorization ──────────────────────────────────────────────────

export type SourceCategory = 'daily' | 'skill' | 'error' | 'path' | 'code' | 'other';

export function categorizeSource(sourcePath: string): SourceCategory {
  if (sourcePath.includes('daily/') || sourcePath.includes('DAILY/')) {
    return 'daily';
  }

  if (
    sourcePath.includes('skills/') ||
    sourcePath.endsWith('SKILL.md') ||
    sourcePath.endsWith('skill.md')
  ) {
    return 'skill';
  }

  const filename = sourcePath.split('/').pop() ?? sourcePath;
  if (
    filename.includes('error') ||
    filename.includes('debug') ||
    filename.includes('crash') ||
    filename.includes('trace')
  ) {
    return 'error';
  }

  // Code files
  if (
    sourcePath.endsWith('.ts') ||
    sourcePath.endsWith('.js') ||
    sourcePath.endsWith('.py') ||
    sourcePath.endsWith('.go') ||
    sourcePath.endsWith('.rs') ||
    sourcePath.endsWith('.tsx') ||
    sourcePath.endsWith('.jsx')
  ) {
    return 'code';
  }

  // File-path-heavy sources
  const slashCount = (sourcePath.match(/\//g) ?? []).length;
  if (slashCount > 2) {
    return 'path';
  }

  return 'other';
}

/**
 * Apply intent weights to a source category.
 * Returns the multiplier for this source given the current intent.
 */
export function getWeightForSource(source: string, weights: IntentWeights): number {
  const cat = categorizeSource(source);
  switch (cat) {
    case 'daily': return weights.recencyBias;
    case 'skill': return weights.skillBoost;
    case 'error': return weights.errorBoost;
    case 'path': return weights.pathBoost;
    case 'code': return weights.codeBoost;
    case 'other': return 1.0;
  }
}
