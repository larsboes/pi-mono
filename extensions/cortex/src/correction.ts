import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface AbortContext {
  lastAssistantText: string;
  lastAssistantToolCalls: { name: string; argsPreview: string }[];
  referencedPaths: string[];
  model: string;
  provider: string;
  timestamp: string;
}

export interface CorrectionSuggestion {
  abort: AbortContext;
  userText: string;
  matchedKeyword: string;
  cwd: string;
  sessionId: string;
  timestamp: string;
}

export const NEGATION_KEYWORDS = [
  "no",
  "stop",
  "wrong",
  "don't",
  "dont",
  "wtf",
  "instead",
  "not",
  "bad",
  "nope",
] as const;

const SUGGESTIONS_PATH = join(homedir(), ".pi", "memory", "cortex", "correction-suggestions.jsonl");
const MAX_TEXT_LEN = 500;
const MAX_TOOL_CALLS = 5;
const MAX_PATHS = 10;
const MAX_ARGS_PREVIEW = 100;
const DEFAULT_LIMIT = 200;
const PATH_REGEX = /\B\/[\w/.\-]+/g;

function clampText(s: unknown): string {
  if (typeof s !== "string") return "";
  const trimmed = s.trim();
  return trimmed.length > MAX_TEXT_LEN ? trimmed.slice(0, MAX_TEXT_LEN) : trimmed;
}

function extractPathsFromArgs(args: unknown, sink: Set<string>): void {
  if (!args || typeof args !== "object") return;
  const obj = args as Record<string, unknown>;
  for (const key of ["path", "file_path"]) {
    const v = obj[key];
    if (typeof v === "string" && v.length > 0) sink.add(v);
  }
  const cmd = obj.command;
  if (typeof cmd === "string") {
    const matches = cmd.match(PATH_REGEX);
    if (matches) for (const m of matches) sink.add(m);
  }
}

/** Walks messages from end, returns AbortContext if last assistant message has stopReason "aborted". */
export function detectAbortedTurn(messages: readonly any[]): AbortContext | null {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg || msg.role !== "assistant") continue;
    if (msg.stopReason !== "aborted") return null;

    const content = Array.isArray(msg.content) ? msg.content : [];
    const textParts: string[] = [];
    const toolCalls: { name: string; argsPreview: string }[] = [];
    const paths = new Set<string>();

    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      if (block.type === "text" && typeof block.text === "string") {
        textParts.push(block.text);
      } else if (block.type === "toolCall") {
        const args = block.arguments ?? {};
        if (toolCalls.length < MAX_TOOL_CALLS) {
          let preview = "";
          try {
            preview = JSON.stringify(args).slice(0, MAX_ARGS_PREVIEW);
          } catch {
            preview = "";
          }
          toolCalls.push({
            name: typeof block.name === "string" ? block.name : "unknown",
            argsPreview: preview,
          });
        }
        extractPathsFromArgs(args, paths);
      }
    }

    const tsNum = typeof msg.timestamp === "number" ? msg.timestamp : Date.now();
    return {
      lastAssistantText: clampText(textParts.join("\n")),
      lastAssistantToolCalls: toolCalls,
      referencedPaths: Array.from(paths).slice(0, MAX_PATHS),
      model: typeof msg.model === "string" ? msg.model : "",
      provider: typeof msg.provider === "string" ? msg.provider : "",
      timestamp: new Date(tsNum).toISOString(),
    };
  }
  return null;
}

/** Returns a CorrectionSuggestion if userText (case-insensitive, word-boundary) matches any negation keyword. */
export function pairWithUserCorrection(
  abort: AbortContext,
  userText: string,
  cwd: string,
  sessionId: string,
): CorrectionSuggestion | null {
  if (typeof userText !== "string") return null;
  const trimmed = userText.trim();
  if (trimmed.length === 0) return null;
  const lower = trimmed.toLowerCase();

  for (const kw of NEGATION_KEYWORDS) {
    // Escape regex specials (apostrophe in "don't" is safe but escape defensively).
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    if (re.test(lower)) {
      return {
        abort,
        userText: clampText(trimmed),
        matchedKeyword: kw,
        cwd,
        sessionId,
        timestamp: new Date().toISOString(),
      };
    }
  }
  return null;
}

/** Append suggestion as one JSONL line. Errors are logged, never thrown. */
export async function appendSuggestion(suggestion: CorrectionSuggestion): Promise<void> {
  try {
    await mkdir(dirname(SUGGESTIONS_PATH), { recursive: true });
    await appendFile(SUGGESTIONS_PATH, `${JSON.stringify(suggestion)}\n`, "utf8");
  } catch (err) {
    console.error("[cortex] appendSuggestion failed:", (err as Error).message);
  }
}

/** Read JSONL suggestions, return most recent N. Tail-prunes the file if it exceeds limit. */
export async function readSuggestions(limit: number = DEFAULT_LIMIT): Promise<CorrectionSuggestion[]> {
  let raw: string;
  try {
    raw = await readFile(SUGGESTIONS_PATH, "utf8");
  } catch {
    return [];
  }

  const lines = raw.split("\n").filter((l) => l.length > 0);
  const parsed: CorrectionSuggestion[] = [];
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line) as CorrectionSuggestion);
    } catch {
      // skip malformed lines
    }
  }

  if (lines.length > limit) {
    const kept = parsed.slice(-limit);
    try {
      const rewritten = `${kept.map((s) => JSON.stringify(s)).join("\n")}\n`;
      await writeFile(SUGGESTIONS_PATH, rewritten, "utf8");
    } catch (err) {
      console.error("[cortex] readSuggestions tail-prune failed:", (err as Error).message);
    }
    return kept;
  }

  return parsed.slice(-limit);
}
