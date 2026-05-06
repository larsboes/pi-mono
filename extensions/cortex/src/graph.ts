/**
 * Phase 8.3: Entity Graph — Co-occurrence tracking + graph traversal
 *
 * Entities: files, skills, concepts, packages, tools, errors
 * Edges: co-occurrence in same session/store call, weighted by recency
 * Traversal: BFS with recency-weighted edge selection
 *
 * The graph is updated on:
 * - memory.store() — entities in stored text
 * - session.flushSession() — session activity entities
 * - agent_end — extracted from tool calls (lightweight)
 */

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

// ── Types ──────────────────────────────────────────────────────────────────

export interface Entity {
  type: 'file' | 'skill' | 'concept' | 'package' | 'tool' | 'error';
  name: string;
  count: number;
  lastSeen: string;
  /** First time this entity was seen */
  firstSeen: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  /** Recency-weighted score: decays over time */
  recencyScore: number;
  lastCooccurrence: string;
  sessions: string[];
}

export interface EntityGraph {
  nodes: Record<string, Entity>;
  edges: GraphEdge[];
  version: number;
  lastPruned: string;
}

// ── Config ─────────────────────────────────────────────────────────────────

const GRAPH_PATH = join(homedir(), '.pi', 'memory', 'cortex', 'graph.json');
const MAX_ENTITIES = 500;
const MAX_EDGES = 2000;
const MAX_SESSIONS_PER_EDGE = 30;
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const STALE_THRESHOLD_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const RECENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Entity Extraction ──────────────────────────────────────────────────────

// Patterns for different entity types
const FILE_RE = /(?:^|\s|["`'(])([a-zA-Z][\w.-]*\.(?:ts|tsx|js|jsx|py|go|rs|md|json|yaml|yml|toml|sh|css|html|sql|env))\b/g;
const SKILL_RE = /\b([a-z][\w-]*(?:-[a-z][\w-]*)+)\b/g; // kebab-case multi-segment
const PACKAGE_RE = /\b(?:@[\w-]+\/[\w.-]+|[\w-]+(?:\/[\w.-]+)?)\b/g;
const TOOL_RE = /\b(read|edit|write|bash|web_search|fetch_content|memory_search|memory_store|crystallize_skill|mcp|converse)\b/g;
const ERROR_RE = /\b(\w*(?:Error|Exception|ENOENT|EACCES|EPERM|TypeError|RangeError|SyntaxError))\b/g;
const CONCEPT_RE = /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g; // PascalCase compound words

// Common false positives to skip
const SKIP_WORDS = new Set([
  'true', 'false', 'null', 'undefined', 'string', 'number', 'boolean',
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Function', 'Promise',
  'import', 'export', 'default', 'return', 'const', 'let', 'var',
  'async', 'await', 'class', 'interface', 'type', 'enum',
]);

function classifyEntity(name: string, matchSource: string): Entity['type'] {
  if (matchSource === 'file') return 'file';
  if (matchSource === 'error') return 'error';
  if (matchSource === 'tool') return 'tool';
  if (matchSource === 'package') return 'package';
  if (matchSource === 'skill') return 'skill';
  return 'concept';
}

/**
 * Extract entities from text. Returns unique entity names with their types.
 */
export function extractEntities(text: string): Array<{ name: string; type: Entity['type'] }> {
  if (!text || typeof text !== 'string') return [];
  const found = new Map<string, Entity['type']>();

  const collect = (re: RegExp, type: string, group = 0) => {
    let m: RegExpExecArray | null;
    const regex = new RegExp(re.source, re.flags); // fresh state
    while ((m = regex.exec(text)) !== null) {
      if (found.size >= 30) return;
      const v = m[group] || m[0];
      if (!v || v.length <= 2 || v.length > 80) continue;
      if (SKIP_WORDS.has(v)) continue;
      if (!found.has(v)) {
        found.set(v, classifyEntity(v, type));
      }
    }
  };

  collect(FILE_RE, 'file', 1);
  collect(ERROR_RE, 'error', 1);
  collect(TOOL_RE, 'tool', 1);
  // Only match packages with @ scope or clear indicators
  const scopedPkgRe = /@[\w-]+\/[\w.-]+/g;
  collect(scopedPkgRe, 'package', 0);
  collect(CONCEPT_RE, 'concept', 1);
  // Skill names: only if they look like actual skill names (multi-segment kebab)
  collect(SKILL_RE, 'skill', 1);

  return Array.from(found.entries())
    .map(([name, type]) => ({ name, type }))
    .slice(0, 30);
}

/**
 * Simple string-based entity extraction (backward compat — returns just names).
 */
export function extractEntityNames(text: string): string[] {
  return extractEntities(text).map(e => e.name);
}

// ── Graph Persistence ──────────────────────────────────────────────────────

function emptyGraph(): EntityGraph {
  return { nodes: {}, edges: [], version: 2, lastPruned: new Date().toISOString() };
}

export async function loadGraph(): Promise<EntityGraph> {
  try {
    const raw = await readFile(GRAPH_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyGraph();
    if (!parsed.nodes || !parsed.edges) return emptyGraph();
    return {
      nodes: parsed.nodes || {},
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      version: typeof parsed.version === 'number' ? parsed.version : 2,
      lastPruned: parsed.lastPruned || new Date().toISOString(),
    };
  } catch {
    return emptyGraph();
  }
}

export async function saveGraph(graph: EntityGraph): Promise<void> {
  await mkdir(dirname(GRAPH_PATH), { recursive: true });
  const tmp = `${GRAPH_PATH}.tmp`;
  await writeFile(tmp, JSON.stringify(graph, null, 2), 'utf8');
  await rename(tmp, GRAPH_PATH);
}

// ── Recency Scoring ────────────────────────────────────────────────────────

function computeRecencyScore(lastCooccurrence: string, weight: number): number {
  const age = Date.now() - new Date(lastCooccurrence).getTime();
  const decay = Math.exp(-age / RECENCY_HALF_LIFE_MS * Math.LN2);
  return weight * decay;
}

// ── Pruning ────────────────────────────────────────────────────────────────

function shouldPrune(graph: EntityGraph): boolean {
  const lastPruned = new Date(graph.lastPruned).getTime();
  return Date.now() - lastPruned > PRUNE_INTERVAL_MS;
}

function pruneGraph(graph: EntityGraph): EntityGraph {
  const now = Date.now();
  const cutoff = new Date(now - STALE_THRESHOLD_MS).toISOString();

  // Remove stale nodes (not seen in 60 days and low count)
  const staleNodes = new Set<string>();
  for (const [name, node] of Object.entries(graph.nodes)) {
    if (node.lastSeen < cutoff && node.count <= 2) {
      staleNodes.add(name);
    }
  }

  // Keep top nodes if we're over capacity
  if (Object.keys(graph.nodes).length - staleNodes.size > MAX_ENTITIES) {
    const sorted = Object.entries(graph.nodes)
      .filter(([name]) => !staleNodes.has(name))
      .sort((a, b) => b[1].count - a[1].count);
    const keep = new Set(sorted.slice(0, MAX_ENTITIES).map(([name]) => name));
    for (const name of Object.keys(graph.nodes)) {
      if (!keep.has(name)) staleNodes.add(name);
    }
  }

  // Remove stale nodes
  for (const name of staleNodes) {
    delete graph.nodes[name];
  }

  // Remove edges referencing pruned nodes or stale edges
  graph.edges = graph.edges
    .filter(e =>
      !staleNodes.has(e.source) &&
      !staleNodes.has(e.target) &&
      e.lastCooccurrence >= cutoff
    )
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_EDGES);

  // Recalculate recency scores
  for (const edge of graph.edges) {
    edge.recencyScore = computeRecencyScore(edge.lastCooccurrence, edge.weight);
  }

  graph.lastPruned = new Date().toISOString();
  return graph;
}

// ── Core Operations ────────────────────────────────────────────────────────

/**
 * Update graph with entities from text.
 * Called from memory.store() and session.flushSession().
 */
export async function updateGraph(text: string, sessionId: string): Promise<void> {
  try {
    const entities = extractEntities(text);
    if (entities.length === 0) return;

    const graph = await loadGraph();
    const now = new Date().toISOString();

    // Upsert nodes
    for (const { name, type } of entities) {
      const existing = graph.nodes[name];
      if (existing) {
        existing.count += 1;
        existing.lastSeen = now;
        // Upgrade type if we get a more specific classification
        if (existing.type === 'concept' && type !== 'concept') {
          existing.type = type;
        }
      } else {
        graph.nodes[name] = {
          type,
          name,
          count: 1,
          lastSeen: now,
          firstSeen: now,
        };
      }
    }

    // Build co-occurrence edges
    const entityNames = entities.map(e => e.name);
    for (let i = 0; i < entityNames.length; i++) {
      for (let j = i + 1; j < entityNames.length; j++) {
        const a = entityNames[i]!;
        const b = entityNames[j]!;
        if (a === b) continue;
        const [source, target] = a < b ? [a, b] : [b, a];

        let edge = graph.edges.find(e => e.source === source && e.target === target);
        if (!edge) {
          edge = { source, target, weight: 0, recencyScore: 0, lastCooccurrence: now, sessions: [] };
          graph.edges.push(edge);
        }
        edge.weight += 1;
        edge.lastCooccurrence = now;
        edge.recencyScore = computeRecencyScore(now, edge.weight);
        if (sessionId && !edge.sessions.includes(sessionId)) {
          edge.sessions.push(sessionId);
          if (edge.sessions.length > MAX_SESSIONS_PER_EDGE) {
            edge.sessions = edge.sessions.slice(-MAX_SESSIONS_PER_EDGE);
          }
        }
      }
    }

    // Periodic pruning
    if (shouldPrune(graph)) {
      const pruned = pruneGraph(graph);
      await saveGraph(pruned);
    } else {
      await saveGraph(graph);
    }
  } catch {
    // Graph updates are best-effort — never crash the host
    return;
  }
}

// ── Graph Traversal ────────────────────────────────────────────────────────

export interface TraversalResult {
  entity: string;
  type: Entity['type'];
  /** Distance from query entity (1 = direct neighbor) */
  hops: number;
  /** Combined score: edge weight * recency */
  score: number;
}

/**
 * Traverse the graph from one or more seed entities.
 * Returns related entities sorted by relevance (weight * recency).
 */
export async function traverseGraph(
  seedEntities: string[],
  maxHops: number = 2,
  maxResults: number = 15,
): Promise<TraversalResult[]> {
  try {
    if (!seedEntities || seedEntities.length === 0) return [];
    const graph = await loadGraph();
    if (Object.keys(graph.nodes).length === 0) return [];

    // Find matching start nodes (case-insensitive prefix match)
    const startNodes = new Set<string>();
    for (const seed of seedEntities) {
      const needle = seed.toLowerCase();
      for (const name of Object.keys(graph.nodes)) {
        if (name.toLowerCase() === needle || name.toLowerCase().startsWith(needle)) {
          startNodes.add(name);
        }
      }
    }
    if (startNodes.size === 0) return [];

    // BFS traversal with score accumulation
    const results: Map<string, TraversalResult> = new Map();
    let frontier = new Set(startNodes);
    const visited = new Set(startNodes);

    for (let hop = 1; hop <= maxHops; hop++) {
      const nextFrontier = new Set<string>();
      const hopDecay = 1.0 / hop; // Closer = more relevant

      for (const edge of graph.edges) {
        let neighbor: string | null = null;
        let edgeScore = edge.recencyScore || edge.weight;

        if (frontier.has(edge.source) && !visited.has(edge.target)) {
          neighbor = edge.target;
        } else if (frontier.has(edge.target) && !visited.has(edge.source)) {
          neighbor = edge.source;
        }

        if (neighbor) {
          const existingResult = results.get(neighbor);
          const score = edgeScore * hopDecay;

          if (existingResult) {
            // Accumulate score from multiple paths
            existingResult.score += score;
          } else {
            const node = graph.nodes[neighbor];
            results.set(neighbor, {
              entity: neighbor,
              type: node?.type ?? 'concept',
              hops: hop,
              score,
            });
          }
          nextFrontier.add(neighbor);
        }
      }

      for (const n of nextFrontier) visited.add(n);
      frontier = nextFrontier;
      if (frontier.size === 0) break;
    }

    return Array.from(results.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  } catch {
    return [];
  }
}

/**
 * Get entities related to a query by extracting entities from the query text
 * and traversing the graph.
 */
export async function getRelatedEntities(queryText: string, maxResults: number = 10): Promise<string[]> {
  const queryEntities = extractEntities(queryText).map(e => e.name);
  if (queryEntities.length === 0) return [];

  const results = await traverseGraph(queryEntities, 2, maxResults);
  return results.map(r => r.entity);
}

// ── Stats ──────────────────────────────────────────────────────────────────

export async function getGraphStats(): Promise<{
  nodeCount: number;
  edgeCount: number;
  topNodes: Array<{ name: string; type: Entity['type']; count: number }>;
  lastPruned: string;
}> {
  const graph = await loadGraph();
  const sorted = Object.values(graph.nodes).sort((a, b) => b.count - a.count);
  return {
    nodeCount: Object.keys(graph.nodes).length,
    edgeCount: graph.edges.length,
    topNodes: sorted.slice(0, 10).map(n => ({ name: n.name, type: n.type, count: n.count })),
    lastPruned: graph.lastPruned,
  };
}
