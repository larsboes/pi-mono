/**
 * Phase 8.5: Session Context — Activity tracking + context injection
 *
 * Tracks current session activities, provides context entities for
 * retrieval boost, and generates session summaries for daily logs.
 *
 * Phase 8.5 enhancements:
 * - Recency-weighted context entities (recent files > old files)
 * - Tool call names included as context
 * - Dynamic boost magnitude based on activity density
 */

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { store as storeMemory } from "./memory.js";
import { updateGraph } from "./graph.js";

// ── Paths ──────────────────────────────────────────────────────────────────

const CORTEX_DIR = join(homedir(), ".pi", "memory", "cortex");
const SESSION_STATE_FILE = join(CORTEX_DIR, "session-state.json");

// ── Types ──────────────────────────────────────────────────────────────────

interface SessionActivity {
  type: "read" | "edit" | "write" | "bash" | "tool" | "skill" | "crystallize";
  detail: string;
  timestamp: string;
}

interface SessionState {
  activities: SessionActivity[];
  startTime: string;
  lastActivity: string;
  filesTouched: string[];
  skillsUsed: string[];
  toolsUsed: string[];
  processedMessages: number;
}

// ── State ──────────────────────────────────────────────────────────────────

let currentSession: SessionState | null = null;

// ── Helpers ────────────────────────────────────────────────────────────────

function isValidState(value: unknown): value is SessionState {
  const s = value as Partial<SessionState>;
  return (
    !!s &&
    Array.isArray(s.activities) &&
    typeof s.startTime === "string" &&
    typeof s.lastActivity === "string" &&
    Array.isArray(s.filesTouched) &&
    Array.isArray(s.skillsUsed) &&
    typeof s.processedMessages === "number"
  );
}

async function loadState(): Promise<SessionState | null> {
  if (!existsSync(SESSION_STATE_FILE)) return null;
  try {
    const raw = await readFile(SESSION_STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidState(parsed)) return null;
    // Ensure toolsUsed exists (backward compat)
    if (!Array.isArray(parsed.toolsUsed)) {
      (parsed as SessionState).toolsUsed = [];
    }
    return parsed as SessionState;
  } catch {
    return null;
  }
}

async function saveState(state: SessionState): Promise<void> {
  if (!existsSync(CORTEX_DIR)) await mkdir(CORTEX_DIR, { recursive: true });
  await writeFile(SESSION_STATE_FILE, JSON.stringify(state, null, 2));
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Initialize or resume a session.
 */
export async function initSession(): Promise<SessionState> {
  const existing = await loadState();
  if (existing) {
    currentSession = existing;
    return existing;
  }

  currentSession = {
    activities: [],
    startTime: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    filesTouched: [],
    skillsUsed: [],
    toolsUsed: [],
    processedMessages: 0,
  };

  await saveState(currentSession);
  return currentSession;
}

/**
 * Record an activity in the current session.
 */
export async function recordActivity(
  type: SessionActivity["type"],
  detail: string,
): Promise<void> {
  if (!currentSession) {
    await initSession();
  }

  const activity: SessionActivity = {
    type,
    detail,
    timestamp: new Date().toISOString(),
  };

  currentSession!.activities.push(activity);
  currentSession!.lastActivity = activity.timestamp;

  // Track files touched
  if (type === "read" || type === "edit" || type === "write") {
    const file = detail.trim();
    if (file && !currentSession!.filesTouched.includes(file)) {
      currentSession!.filesTouched.push(file);
    }
  }

  // Track skills used
  if (type === "skill") {
    if (!currentSession!.skillsUsed.includes(detail)) {
      currentSession!.skillsUsed.push(detail);
    }
  }

  // Track tools used
  if (type === "tool" || type === "crystallize") {
    if (!currentSession!.toolsUsed.includes(detail)) {
      currentSession!.toolsUsed.push(detail);
    }
  }

  await saveState(currentSession!);
}

/**
 * Extract activities from agent messages (call this from agent_end hook).
 */
export async function extractFromMessages(messages: unknown[]): Promise<void> {
  if (!currentSession) {
    await initSession();
  }

  const startIndex =
    currentSession!.processedMessages > messages.length ? 0 : currentSession!.processedMessages;
  const newMessages = messages.slice(startIndex);

  for (const msg of newMessages) {
    const m = msg as { role?: string; content?: unknown[]; name?: string };

    // Tool calls from assistant
    if (m.role === "assistant" && Array.isArray(m.content)) {
      for (const block of m.content) {
        const b = block as {
          type?: string;
          name?: string;
          input?: Record<string, unknown>;
          arguments?: Record<string, unknown>;
        };

        if (b.type === "toolCall" && b.name) {
          const toolName = b.name;
          const args = b.arguments ?? b.input ?? {};

          // Map tool calls to activities
          if (toolName === "read" && typeof args.path === "string") {
            await recordActivity("read", args.path);
          } else if (toolName === "edit" && typeof args.path === "string") {
            await recordActivity("edit", args.path);
          } else if (toolName === "write" && typeof args.path === "string") {
            await recordActivity("write", args.path);
          } else if (toolName === "bash" && typeof args.command === "string") {
            const cmd = args.command.slice(0, 120);
            await recordActivity("bash", cmd);
          } else if (toolName === "crystallize_skill") {
            const skillName = typeof args.name === "string" ? args.name : "unknown";
            await recordActivity("crystallize", skillName);
          } else {
            await recordActivity("tool", toolName);
          }
        }
      }
    }
  }

  currentSession!.processedMessages = messages.length;
  await saveState(currentSession!);
}

/**
 * Generate a session summary.
 */
function generateSummary(state: SessionState): string {
  const lines: string[] = [];

  // Time info (display in local timezone)
  const start = new Date(state.startTime);
  const end = new Date(state.lastActivity);
  const duration = Math.round((end.getTime() - start.getTime()) / 60000);
  const fmt = (d: Date) => d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
  lines.push(`Session: ${fmt(start)}-${fmt(end)} (${duration}m)`);

  // Key activities by type
  const reads = state.activities.filter(a => a.type === "read").length;
  const edits = state.activities.filter(a => a.type === "edit").length;
  const writes = state.activities.filter(a => a.type === "write").length;
  const bashs = state.activities.filter(a => a.type === "bash").length;
  const tools = state.activities.filter(a => a.type === "tool" || a.type === "skill").length;

  const summaryParts: string[] = [];
  if (reads) summaryParts.push(`${reads} reads`);
  if (edits) summaryParts.push(`${edits} edits`);
  if (writes) summaryParts.push(`${writes} writes`);
  if (bashs) summaryParts.push(`${bashs} commands`);
  if (tools) summaryParts.push(`${tools} tools`);

  if (summaryParts.length > 0) {
    lines.push(`Activity: ${summaryParts.join(", ")}`);
  }

  // Files touched (max 5)
  if (state.filesTouched.length > 0) {
    const files = state.filesTouched.slice(-5).map(f => f.split("/").pop() || f);
    lines.push(`Files: ${files.join(", ")}${state.filesTouched.length > 5 ? "..." : ""}`);
  }

  // Skills used
  if (state.skillsUsed.length > 0) {
    lines.push(`Skills: ${state.skillsUsed.join(", ")}`);
  }

  // Crystallizations
  const crystallizations = state.activities.filter(a => a.type === "crystallize");
  if (crystallizations.length > 0) {
    lines.push(`Crystallized: ${crystallizations.map(c => c.detail).join(", ")}`);
  }

  return lines.join(" | ");
}

/**
 * Flush session to daily log.
 */
export async function flushSession(): Promise<string | null> {
  if (!currentSession || currentSession.activities.length === 0) {
    return null;
  }

  const summary = generateSummary(currentSession);
  const sessionId = currentSession.startTime;

  // Store via memory module so daily markdown + vector index stay in sync.
  await storeMemory(`- ${summary}`, true);

  // Phase 8.3: Update entity graph from session activities
  const activityText = [
    ...currentSession.filesTouched,
    ...currentSession.skillsUsed,
    ...currentSession.toolsUsed,
    ...currentSession.activities.map((a) => a.detail),
  ].join(" ");
  updateGraph(activityText, sessionId).catch(() => {});

  // Clear session state
  currentSession = null;
  if (existsSync(SESSION_STATE_FILE)) {
    await rm(SESSION_STATE_FILE, { force: true });
  }

  return summary;
}

// ── Phase 8.5: Session Context for Retrieval Boost ─────────────────────────

export interface SessionContext {
  /** File basenames touched this session, ordered by recency (most recent first) */
  files: string[];
  /** Skills loaded this session */
  skills: string[];
  /** Tools used this session */
  tools: string[];
  /** Activity density: activities per minute (higher = more active session) */
  density: number;
}

/**
 * Get current session context for retrieval boost.
 *
 * Phase 8.5: Returns recency-ordered entities with activity density
 * for dynamic boost magnitude calculation.
 */
export function getSessionContext(): SessionContext {
  if (!currentSession) return { files: [], skills: [], tools: [], density: 0 };

  // Recency-ordered files: most recently touched first
  const recentFiles = [...currentSession.filesTouched]
    .reverse()
    .slice(0, 10)
    .map((f) => f.split("/").pop() ?? f);

  // Unique tools used
  const tools = [...new Set(currentSession.toolsUsed)];

  // Activity density: activities per minute
  const start = new Date(currentSession.startTime).getTime();
  const elapsed = Math.max(1, (Date.now() - start) / 60000); // minutes, min 1
  const density = currentSession.activities.length / elapsed;

  return {
    files: recentFiles,
    skills: currentSession.skillsUsed,
    tools,
    density,
  };
}

/**
 * Get all context entities for memory retrieval boost.
 * Combines files, skills, and tools into a single list ordered by relevance.
 *
 * Phase 8.5: Recency-weighted — recent files get priority, tools and skills
 * are included because they indicate the working domain.
 */
export function getContextEntities(): string[] {
  const ctx = getSessionContext();
  // Priority order: recent files > skills > tools
  // Files are already recency-ordered
  const entities = [...ctx.files, ...ctx.skills, ...ctx.tools];
  // Deduplicate preserving order
  return [...new Set(entities)].slice(0, 20);
}

/**
 * Get current session stats (for debugging).
 */
export async function getStats(): Promise<{
  activityCount: number;
  filesTouched: number;
  skillsUsed: number;
  toolsUsed: number;
  duration: number;
  density: number;
} | null> {
  if (!currentSession) {
    const state = await loadState();
    if (!state) return null;
    currentSession = state;
  }

  const start = new Date(currentSession.startTime);
  const now = new Date();
  const duration = Math.round((now.getTime() - start.getTime()) / 60000);
  const density = duration > 0 ? currentSession.activities.length / duration : 0;

  return {
    activityCount: currentSession.activities.length,
    filesTouched: currentSession.filesTouched.length,
    skillsUsed: currentSession.skillsUsed.length,
    toolsUsed: currentSession.toolsUsed?.length ?? 0,
    duration,
    density,
  };
}
