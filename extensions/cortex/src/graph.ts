import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export interface Entity {
  type: 'file' | 'skill' | 'concept' | 'error';
  name: string;
  count: number;
  lastSeen: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  sessions: string[];
}

export interface EntityGraph {
  nodes: Record<string, Entity>;
  edges: GraphEdge[];
  version: number;
}

const GRAPH_PATH = join(homedir(), '.pi', 'memory', 'cortex', 'graph.json');

function emptyGraph(): EntityGraph {
  return { nodes: {}, edges: [], version: 1 };
}

function classifyEntity(name: string): Entity['type'] {
  if (/\.(ts|js|py|go|md|json|yaml|sh)$/.test(name)) return 'file';
  if (/(Error|Exception)$/.test(name)) return 'error';
  if (/(Skill|Extension|Hook)$/.test(name)) return 'skill';
  return 'concept';
}

export function extractEntities(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const found = new Set<string>();

  const fileRe = /\b[\w-]+\.(?:ts|js|py|go|md|json|yaml|sh)\b/g;
  const skillRe = /\b[A-Z][a-zA-Z]+(?:Skill|Extension|Hook)\b/g;
  const errorRe = /\b\w*(?:Error|Exception)\b/g;

  const collect = (re: RegExp) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (found.size >= 20) return;
      const v = m[0];
      if (v && v.length > 1) found.add(v);
    }
  };

  collect(fileRe);
  collect(skillRe);
  collect(errorRe);

  return Array.from(found).slice(0, 20);
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
      version: typeof parsed.version === 'number' ? parsed.version : 1,
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

export async function updateGraph(text: string, sessionId: string): Promise<void> {
  try {
    const entities = extractEntities(text);
    if (entities.length === 0) return;

    const graph = await loadGraph();
    const now = new Date().toISOString();

    for (const name of entities) {
      const existing = graph.nodes[name];
      if (existing) {
        existing.count += 1;
        existing.lastSeen = now;
      } else {
        graph.nodes[name] = {
          type: classifyEntity(name),
          name,
          count: 1,
          lastSeen: now,
        };
      }
    }

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i];
        const b = entities[j];
        if (!a || !b || a === b) continue;
        const [source, target] = a < b ? [a, b] : [b, a];

        let edge = graph.edges.find(e => e.source === source && e.target === target);
        if (!edge) {
          edge = { source, target, weight: 0, sessions: [] };
          graph.edges.push(edge);
        }
        edge.weight += 1;
        if (sessionId && !edge.sessions.includes(sessionId)) {
          edge.sessions.push(sessionId);
          if (edge.sessions.length > 50) {
            edge.sessions = edge.sessions.slice(-50);
          }
        }
      }
    }

    await saveGraph(graph);
  } catch {
    return;
  }
}

export async function traverseGraph(entityName: string, hops: number = 2): Promise<string[]> {
  try {
    if (!entityName) return [];
    const graph = await loadGraph();
    if (Object.keys(graph.nodes).length === 0) return [];

    const needle = entityName.toLowerCase();
    const startNodes = Object.keys(graph.nodes).filter(n =>
      n.toLowerCase().startsWith(needle)
    );
    if (startNodes.length === 0) return [];

    const visited = new Set<string>(startNodes);
    let frontier = new Set<string>(startNodes);

    for (let h = 0; h < hops; h++) {
      const next = new Set<string>();
      for (const edge of graph.edges) {
        if (frontier.has(edge.source) && !visited.has(edge.target)) {
          next.add(edge.target);
        }
        if (frontier.has(edge.target) && !visited.has(edge.source)) {
          next.add(edge.source);
        }
      }
      if (next.size === 0) break;
      for (const n of next) visited.add(n);
      frontier = next;
    }

    for (const s of startNodes) visited.delete(s);
    return Array.from(visited).slice(0, 20);
  } catch {
    return [];
  }
}
