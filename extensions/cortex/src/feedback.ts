/**
 * Phase 8.6: Feedback Loop — Interaction tracking + personalized weight learning
 *
 * Tracks which memory sources appear in results, applies correction-derived
 * negative signals, and computes personalized weight adjustments.
 *
 * Key improvements over initial version:
 * - Time-decay: old interactions contribute less (exponential decay, 14d half-life)
 * - Source-normalized weights: frequent sources aren't auto-boosted
 * - Staleness cap: interactions older than 30d are pruned on next compaction
 * - Smooth scoring: sigmoid-based weight curve instead of hard threshold
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SearchInteraction {
  query: string;
  results: string[];
  sessionId: string;
  timestamp: string;
  /** True for correction-derived negative signals (decrement source counts). */
  negative?: boolean;
  /** Intent that was classified for this query */
  intent?: string;
}

export interface FeedbackStore {
  interactions: SearchInteraction[];
  version: number;
  lastCompacted: string;
}

export interface PersonalWeights {
  /** Source path → weight multiplier (0.7–1.3 range, 1.0 = neutral) */
  weights: Record<string, number>;
  /** When weights were last computed */
  computedAt: number;
}

// ── Config ─────────────────────────────────────────────────────────────────

const FEEDBACK_PATH = join(homedir(), ".pi", "memory", "cortex", "feedback.json");
const MAX_INTERACTIONS = 500;
const COMPACT_THRESHOLD = 600; // compact when exceeding this
const STALENESS_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DECAY_HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000; // 14 day half-life
const TOP_K = 3; // top results to track per interaction
const WEIGHTS_CACHE_TTL_MS = 60_000; // 1 minute cache

// Scoring parameters
const NEUTRAL_WEIGHT = 1.0;
const MAX_BOOST = 1.3;
const MAX_PENALTY = 0.7;
const SIGMOID_STEEPNESS = 0.5; // how quickly weight changes with score

// ── State ──────────────────────────────────────────────────────────────────

let weightsCache: PersonalWeights | null = null;

// ── Persistence ────────────────────────────────────────────────────────────

async function loadStore(): Promise<FeedbackStore> {
  try {
    const raw = await readFile(FEEDBACK_PATH, "utf8");
    const parsed = JSON.parse(raw) as FeedbackStore;
    if (!parsed || !Array.isArray(parsed.interactions)) {
      return { interactions: [], version: 2, lastCompacted: new Date().toISOString() };
    }
    return {
      interactions: parsed.interactions,
      version: typeof parsed.version === "number" ? parsed.version : 2,
      lastCompacted: parsed.lastCompacted || new Date().toISOString(),
    };
  } catch {
    return { interactions: [], version: 2, lastCompacted: new Date().toISOString() };
  }
}

async function saveStore(store: FeedbackStore): Promise<void> {
  await mkdir(dirname(FEEDBACK_PATH), { recursive: true });
  const tmp = `${FEEDBACK_PATH}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await rename(tmp, FEEDBACK_PATH);
}

/**
 * Compact store: remove stale interactions, keep recent ones.
 */
function compactStore(store: FeedbackStore): FeedbackStore {
  const cutoff = new Date(Date.now() - STALENESS_MS).toISOString();
  const fresh = store.interactions.filter(i => i.timestamp >= cutoff);
  const kept = fresh.length > MAX_INTERACTIONS ? fresh.slice(-MAX_INTERACTIONS) : fresh;
  return {
    interactions: kept,
    version: store.version,
    lastCompacted: new Date().toISOString(),
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Log a search interaction (query + results returned).
 * Best-effort — never throws.
 */
export async function logInteraction(
  query: string,
  resultSources: string[],
  sessionId: string = "unknown",
  intent?: string,
): Promise<void> {
  try {
    const interaction: SearchInteraction = {
      query,
      results: Array.isArray(resultSources) ? [...resultSources].slice(0, TOP_K) : [],
      sessionId,
      timestamp: new Date().toISOString(),
      intent,
    };

    const store = await loadStore();
    store.interactions.push(interaction);

    // Compact if over threshold
    if (store.interactions.length > COMPACT_THRESHOLD) {
      const compacted = compactStore(store);
      await saveStore(compacted);
      weightsCache = null; // invalidate
    } else {
      await saveStore(store);
    }
  } catch {
    // logging must never throw
  }
}

/**
 * Record a negative signal for paths referenced in an aborted turn.
 * These paths get penalized in future retrievals.
 */
export async function recordCorrectionAsNegativeSignal(paths: string[]): Promise<void> {
  if (!Array.isArray(paths) || paths.length === 0) return;
  try {
    const interaction: SearchInteraction = {
      query: "<correction-negative-signal>",
      results: [...paths].slice(0, TOP_K),
      sessionId: "correction",
      timestamp: new Date().toISOString(),
      negative: true,
    };

    const store = await loadStore();
    store.interactions.push(interaction);
    if (store.interactions.length > COMPACT_THRESHOLD) {
      await saveStore(compactStore(store));
    } else {
      await saveStore(store);
    }
    weightsCache = null; // invalidate cache
  } catch {
    // never throw
  }
}

// ── Weight Computation ─────────────────────────────────────────────────────

/**
 * Sigmoid function to smooth weight transitions.
 * Maps unbounded score → bounded weight range [MAX_PENALTY, MAX_BOOST].
 */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x * SIGMOID_STEEPNESS));
}

function scoreToWeight(rawScore: number): number {
  // Map raw score through sigmoid to [MAX_PENALTY, MAX_BOOST]
  const s = sigmoid(rawScore);
  return MAX_PENALTY + s * (MAX_BOOST - MAX_PENALTY);
}

/**
 * Compute time-decayed, source-normalized personal weights.
 * Uses exponential decay so recent interactions matter more.
 */
export async function computePersonalWeights(): Promise<Record<string, number>> {
  // Check cache
  if (weightsCache && Date.now() < weightsCache.computedAt + WEIGHTS_CACHE_TTL_MS) {
    return weightsCache.weights;
  }

  try {
    const store = await loadStore();
    if (store.interactions.length === 0) return {};

    const now = Date.now();
    const sourceCounts: Record<string, { positive: number; negative: number; total: number }> = {};

    for (const interaction of store.interactions) {
      if (!Array.isArray(interaction.results)) continue;

      // Compute time decay for this interaction
      const age = now - new Date(interaction.timestamp).getTime();
      const decay = Math.exp(-age / DECAY_HALF_LIFE_MS * Math.LN2);
      const isNegative = interaction.negative === true;

      for (const source of interaction.results.slice(0, TOP_K)) {
        if (typeof source !== "string" || source.length === 0) continue;

        if (!sourceCounts[source]) {
          sourceCounts[source] = { positive: 0, negative: 0, total: 0 };
        }

        if (isNegative) {
          sourceCounts[source].negative += decay;
        } else {
          sourceCounts[source].positive += decay;
        }
        sourceCounts[source].total += decay;
      }
    }

    // Compute weights: net positive = boost, net negative = penalty
    const weights: Record<string, number> = {};
    for (const [source, counts] of Object.entries(sourceCounts)) {
      // Only assign non-neutral weights for sources with meaningful signal
      if (counts.total < 0.5) continue; // Below noise threshold (decayed away)

      const netScore = counts.positive - counts.negative * 2; // Negatives count double
      const normalized = netScore / Math.max(1, counts.total); // Normalize by total activity
      const weight = scoreToWeight(normalized);

      // Only store if meaningfully different from neutral
      if (Math.abs(weight - NEUTRAL_WEIGHT) > 0.02) {
        weights[source] = weight;
      }
    }

    weightsCache = { weights, computedAt: now };
    return weights;
  } catch {
    return {};
  }
}

/**
 * Apply personal weights to search results.
 * Adjusts scores based on learned preferences.
 */
export function applyPersonalWeights(
  results: Array<{ source: string; score: number; [key: string]: unknown }>,
  weights: Record<string, number>,
): Array<{ source: string; score: number; [key: string]: unknown }> {
  if (!Array.isArray(results)) return [];
  if (Object.keys(weights).length === 0) return results;

  return results.map((result) => {
    const multiplier = weights[result.source] ?? NEUTRAL_WEIGHT;
    const adjusted = result.score * multiplier;
    return { ...result, score: Math.min(1.0, adjusted) };
  });
}

// ── Stats ──────────────────────────────────────────────────────────────────

export async function getFeedbackStats(): Promise<{
  totalInteractions: number;
  negativeSignals: number;
  uniqueSources: number;
  oldestInteraction: string | null;
  lastCompacted: string;
}> {
  const store = await loadStore();
  const sources = new Set<string>();
  let negatives = 0;
  let oldest: string | null = null;

  for (const interaction of store.interactions) {
    if (interaction.negative) negatives++;
    for (const source of interaction.results) {
      sources.add(source);
    }
    if (!oldest || interaction.timestamp < oldest) {
      oldest = interaction.timestamp;
    }
  }

  return {
    totalInteractions: store.interactions.length,
    negativeSignals: negatives,
    uniqueSources: sources.size,
    oldestInteraction: oldest,
    lastCompacted: store.lastCompacted,
  };
}
