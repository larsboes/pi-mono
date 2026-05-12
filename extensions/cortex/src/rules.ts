import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type RuleScope = "global" | "project";

export interface Rule {
  index: number;
  text: string;
  addedAt: string;
}

const RULES_DIR = join(homedir(), ".pi", "memory", "cortex");
const DEFAULT_INJECTION_BYTES = 2048;
const RULE_LINE_RE = /^- \[([^\]]+)\] (.+)$/;

function cwdHash(cwd: string): string {
  return createHash("sha1").update(cwd).digest("hex").slice(0, 8);
}

export function rulesPath(scope: RuleScope, cwd: string): string {
  if (scope === "global") return join(RULES_DIR, "rules-global.md");
  return join(RULES_DIR, `rules-${cwdHash(cwd)}.md`);
}

async function readRaw(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function parseRules(raw: string): Rule[] {
  if (!raw) return [];
  const out: Rule[] = [];
  let idx = 1;
  for (const line of raw.split("\n")) {
    const m = RULE_LINE_RE.exec(line);
    if (!m) continue;
    out.push({ index: idx++, text: m[2], addedAt: m[1] });
  }
  return out;
}

function serializeRules(rules: Rule[]): string {
  if (rules.length === 0) return "";
  return `${rules.map((r) => `- [${r.addedAt}] ${r.text}`).join("\n")}\n`;
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, content, "utf8");
  await rename(tmp, path);
}

export async function listRules(scope: RuleScope, cwd: string): Promise<Rule[]> {
  try {
    return parseRules(await readRaw(rulesPath(scope, cwd)));
  } catch {
    return [];
  }
}

export async function addRule(text: string, scope: RuleScope, cwd: string): Promise<void> {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed.length === 0) throw new Error("rule text required");

  const path = rulesPath(scope, cwd);
  const existing = parseRules(await readRaw(path));
  existing.push({
    index: existing.length + 1,
    text: trimmed,
    addedAt: new Date().toISOString(),
  });
  try {
    await atomicWrite(path, serializeRules(existing));
  } catch (err) {
    console.error("[cortex] addRule write failed:", (err as Error).message);
  }
}

export async function removeRule(index: number, scope: RuleScope, cwd: string): Promise<Rule | null> {
  const path = rulesPath(scope, cwd);
  const rules = parseRules(await readRaw(path));
  if (!Number.isInteger(index) || index < 1 || index > rules.length) return null;

  const removed = rules[index - 1];
  const remaining = rules.filter((_, i) => i !== index - 1).map((r, i) => ({ ...r, index: i + 1 }));
  try {
    await atomicWrite(path, serializeRules(remaining));
  } catch (err) {
    console.error("[cortex] removeRule write failed:", (err as Error).message);
    return null;
  }
  return removed;
}

/** Build the markdown block injected into agent context. Truncates oldest-first to fit maxBytes. */
export async function buildInjectionBlock(cwd: string, maxBytes: number = DEFAULT_INJECTION_BYTES): Promise<string> {
  const [globalRules, projectRules] = await Promise.all([listRules("global", cwd), listRules("project", cwd)]);
  if (globalRules.length === 0 && projectRules.length === 0) return "";

  // Combined oldest-first sequence; drop from the front (oldest) when over budget.
  // Global rules render before project rules in the final output, but for budget purposes
  // we drop oldest across the union.
  const tagged = [
    ...globalRules.map((r) => ({ scope: "global" as const, r })),
    ...projectRules.map((r) => ({ scope: "project" as const, r })),
  ];

  const render = (items: typeof tagged): string => {
    const g = items.filter((x) => x.scope === "global").map((x) => `- ${x.r.text}`);
    const p = items.filter((x) => x.scope === "project").map((x) => `- ${x.r.text}`);
    const parts: string[] = [];
    if (g.length > 0) parts.push(g.join("\n"));
    if (p.length > 0) parts.push(p.join("\n"));
    return `## Recent Corrections (avoid repeating)\n\n${parts.join("\n")}\n`;
  };

  let kept = tagged.slice();
  let block = render(kept);
  while (Buffer.byteLength(block, "utf8") > maxBytes && kept.length > 0) {
    kept = kept.slice(1);
    if (kept.length === 0) return "";
    block = render(kept);
  }
  return block;
}
