import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface SearchInteraction {
  query: string;
  results: string[];
  sessionId: string;
  timestamp: string;
  /** True for correction-derived negative signals (decrement source counts). */
  negative?: boolean;
}

export interface FeedbackStore {
  interactions: SearchInteraction[];
  version: number;
}

const FEEDBACK_PATH = join(homedir(), ".pi", "memory", "cortex", "feedback.json");
const MAX_INTERACTIONS = 500;
const TOP_K = 3;
const WEIGHTS_CACHE_TTL_MS = 60_000;

let weightsCache: { weights: Record<string, number>; expires: number } | null = null;
const BOOST_THRESHOLD = 3;
const BOOST_WEIGHT = 1.1;
const DEFAULT_WEIGHT = 1.0;
const MAX_SCORE = 1.0;
const NEGATIVE_PENALTY = 0.85;

async function loadStore(): Promise<FeedbackStore> {
  try {
    const raw = await readFile(FEEDBACK_PATH, "utf8");
    const parsed = JSON.parse(raw) as FeedbackStore;
    if (!parsed || !Array.isArray(parsed.interactions)) {
      return { interactions: [], version: 1 };
    }
    return {
      interactions: parsed.interactions,
      version: typeof parsed.version === "number" ? parsed.version : 1,
    };
  } catch {
    return { interactions: [], version: 1 };
  }
}

async function saveStore(store: FeedbackStore): Promise<void> {
  await mkdir(dirname(FEEDBACK_PATH), { recursive: true });
  const tmp = `${FEEDBACK_PATH}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await rename(tmp, FEEDBACK_PATH);
}

export async function logInteraction(
  query: string,
  resultSources: string[],
  sessionId: string = "unknown",
): Promise<void> {
  try {
    const interaction: SearchInteraction = {
      query,
      results: Array.isArray(resultSources) ? [...resultSources] : [],
      sessionId,
      timestamp: new Date().toISOString(),
    };

    const store = await loadStore();
    store.interactions.push(interaction);

    if (store.interactions.length > MAX_INTERACTIONS) {
      store.interactions = store.interactions.slice(
        store.interactions.length - MAX_INTERACTIONS,
      );
    }

    await saveStore(store);
  } catch {
    // swallow — logging must never throw
  }
}

export async function computePersonalWeights(): Promise<Record<string, number>> {
  if (weightsCache && Date.now() < weightsCache.expires) {
    return weightsCache.weights;
  }
  try {
    const store = await loadStore();
    const counts: Record<string, number> = {};

    for (const interaction of store.interactions) {
      if (!Array.isArray(interaction.results)) continue;
      const top = interaction.results.slice(0, TOP_K);
      const isNegative = interaction.negative === true;
      for (const source of top) {
        if (typeof source !== "string" || source.length === 0) continue;
        counts[source] = (counts[source] ?? 0) + (isNegative ? -1 : 1);
      }
    }

    const weights: Record<string, number> = {};
    for (const [source, count] of Object.entries(counts)) {
      if (count <= -BOOST_THRESHOLD) {
        weights[source] = NEGATIVE_PENALTY;
      } else if (count >= BOOST_THRESHOLD) {
        weights[source] = BOOST_WEIGHT;
      } else {
        weights[source] = DEFAULT_WEIGHT;
      }
    }
    weightsCache = { weights, expires: Date.now() + WEIGHTS_CACHE_TTL_MS };
    return weights;
  } catch {
    return {};
  }
}

export function applyPersonalWeights(
  results: Array<{ source: string; score: number; [key: string]: unknown }>,
  weights: Record<string, number>,
): Array<{ source: string; score: number; [key: string]: unknown }> {
  if (!Array.isArray(results)) return [];
  return results.map((result) => {
    const multiplier = weights[result.source] ?? DEFAULT_WEIGHT;
    const adjusted = result.score * multiplier;
    const capped = adjusted > MAX_SCORE ? MAX_SCORE : adjusted;
    return { ...result, score: capped };
  });
}

/**
 * Record a negative signal for a list of paths the agent referenced in an aborted turn.
 * Stored as a SearchInteraction with `negative: true`, decrementing source counts
 * during weight computation. Never throws.
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
    if (store.interactions.length > MAX_INTERACTIONS) {
      store.interactions = store.interactions.slice(store.interactions.length - MAX_INTERACTIONS);
    }
    await saveStore(store);
    weightsCache = null;
  } catch {
    // never throw
  }
}
