/**
 * Phase 10.4: Graph Maintenance
 *
 * The entity graph accumulates edges over time. Without maintenance:
 * - Old edges boost irrelevant results
 * - Weak co-occurrences add noise
 * - The graph grows unbounded
 *
 * This module provides:
 * 1. Temporal decay — reduce edge weights for old co-occurrences
 * 2. Weak edge pruning — remove edges below a threshold
 * 3. Orphan node removal — clean up disconnected nodes
 *
 * Runs at session start, max once per day (same pattern as compaction).
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Paths ──────────────────────────────────────────────────────────────────

const CORTEX_DIR = join(homedir(), ".pi", "memory", "cortex");
const GRAPH_FILE = join(CORTEX_DIR, "graph.json");
const MAINTENANCE_STATE_FILE = join(CORTEX_DIR, "graph-maintenance.json");

// ── Configuration ──────────────────────────────────────────────────────────

/** Edges not seen in this many days get their weight halved */
const DECAY_HALF_LIFE_DAYS = 30;

/** Edges with weight below this are pruned */
const MIN_EDGE_WEIGHT = 0.5;

/** Nodes with no edges after pruning are removed */
const PRUNE_ORPHANS = true;

// ── Types ──────────────────────────────────────────────────────────────────

interface GraphNode {
	type: string;
	name: string;
	count: number;
	lastSeen: string;
}

interface GraphEdge {
	weight: number;
	lastSeen: string;
	coOccurrences: number;
}

interface Graph {
	nodes: Record<string, GraphNode>;
	edges: Record<string, GraphEdge>;
}

interface MaintenanceState {
	lastRun: string;
	edgesPruned: number;
	nodesPruned: number;
	decayApplied: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function daysSince(isoDate: string): number {
	const then = new Date(isoDate).getTime();
	const now = Date.now();
	return Math.max(0, (now - then) / 86400000);
}

function decayFactor(daysSinceLastSeen: number): number {
	// Exponential decay with configurable half-life
	return Math.pow(0.5, daysSinceLastSeen / DECAY_HALF_LIFE_DAYS);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Run graph maintenance. Call at session start (max once per day).
 */
export async function runGraphMaintenance(): Promise<{
	ran: boolean;
	edgesPruned: number;
	nodesPruned: number;
	decayApplied: number;
}> {
	const today = new Date().toISOString().slice(0, 10);

	// Check if already ran today
	if (existsSync(MAINTENANCE_STATE_FILE)) {
		try {
			const state: MaintenanceState = JSON.parse(await readFile(MAINTENANCE_STATE_FILE, "utf-8"));
			if (state.lastRun === today) {
				return { ran: false, edgesPruned: 0, nodesPruned: 0, decayApplied: 0 };
			}
		} catch {
			// Continue with maintenance
		}
	}

	if (!existsSync(GRAPH_FILE)) {
		return { ran: false, edgesPruned: 0, nodesPruned: 0, decayApplied: 0 };
	}

	let graph: Graph;
	try {
		graph = JSON.parse(await readFile(GRAPH_FILE, "utf-8"));
	} catch {
		return { ran: false, edgesPruned: 0, nodesPruned: 0, decayApplied: 0 };
	}

	let decayApplied = 0;
	let edgesPruned = 0;
	let nodesPruned = 0;

	// ── Step 1: Apply temporal decay ─────────────────────────────────
	const edgeKeys = Object.keys(graph.edges);
	for (const key of edgeKeys) {
		const edge = graph.edges[key];
		if (!edge.lastSeen) continue;

		const days = daysSince(edge.lastSeen);
		if (days < 7) continue; // Don't decay recent edges

		const factor = decayFactor(days);
		const originalWeight = edge.weight;
		edge.weight = edge.weight * factor;
		if (edge.weight !== originalWeight) decayApplied++;
	}

	// ── Step 2: Prune weak edges ─────────────────────────────────────
	for (const key of Object.keys(graph.edges)) {
		if (graph.edges[key].weight < MIN_EDGE_WEIGHT) {
			delete graph.edges[key];
			edgesPruned++;
		}
	}

	// ── Step 3: Remove orphan nodes ──────────────────────────────────
	if (PRUNE_ORPHANS) {
		const connectedNodes = new Set<string>();
		for (const key of Object.keys(graph.edges)) {
			// Edge keys are "nodeA::nodeB" format
			const parts = key.split("::");
			if (parts.length === 2) {
				connectedNodes.add(parts[0]);
				connectedNodes.add(parts[1]);
			}
		}

		for (const nodeKey of Object.keys(graph.nodes)) {
			if (!connectedNodes.has(nodeKey)) {
				// Only prune if node hasn't been seen recently
				const node = graph.nodes[nodeKey];
				if (node.lastSeen && daysSince(node.lastSeen) > 30) {
					delete graph.nodes[nodeKey];
					nodesPruned++;
				}
			}
		}
	}

	// Save updated graph
	await writeFile(GRAPH_FILE, JSON.stringify(graph, null, 2));

	// Save maintenance state
	const state: MaintenanceState = {
		lastRun: today,
		edgesPruned,
		nodesPruned,
		decayApplied,
	};
	await writeFile(MAINTENANCE_STATE_FILE, JSON.stringify(state, null, 2));

	return { ran: true, edgesPruned, nodesPruned, decayApplied };
}
