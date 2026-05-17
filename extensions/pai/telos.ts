/**
 * telos.ts — TELOS / SOUL / IDENTITY context injection for pi.
 *
 * RATIONALE
 * Pi previously loaded only `Atlas/TELOS/TELOS.md` from the vault — but that
 * file is the *index* of the TELOS framework, not its substance. CC's
 * CLAUDE.md loads four files (IDENTITY, SOUL, TELOS, PERSONAL_CONTEXT). Pi
 * sessions felt less Jarvis-flavored because the actual identity / voice /
 * personal-context content never reached the model.
 *
 * This module:
 *   1. Loads the same four files CC loads (configurable via TELOS_FILES)
 *   2. Concatenates them with section-headed wrappers under <pai-telos>
 *   3. Invalidates the cache when any source file's mtime changes
 *   4. Surfaces an additional auto-managed-files block if SHADOW / STORY /
 *      CORRECTIONS exist (claude-soul-style — see signals.ts and dream.ts)
 *
 * Output is appended to the system prompt at before_agent_start, replacing
 * the old single-file injection in index.ts.
 *
 * Cache strategy: in-memory map keyed by absolute path → { mtimeMs, content }.
 * On every before_agent_start we statSync each file (cheap) and re-read only
 * if mtime advanced. Survives "Lars edits SOUL.md mid-session" without
 * requiring fs.watch handles.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// ── Source files ─────────────────────────────────────────────────────────────

/**
 * Paths relative to $VAULT_PATH. Order matters — IDENTITY first so the model
 * knows who it is before it knows what it knows. SOUL next (operational
 * protocol). TELOS last (framework + index). PERSONAL_CONTEXT augments.
 *
 * Auto-managed soul files (SHADOW, STORY, CORRECTIONS) are loaded conditionally
 * — they only exist after dream / signal-extractor produces them.
 */
const TELOS_FILES = [
	"Atlas/TELOS/IDENTITY.md",
	"Atlas/TELOS/SOUL.md",
	"Atlas/TELOS/TELOS.md",
	"Atlas/Personal/PERSONAL_CONTEXT.md",
] as const;

const SOUL_FILES = [
	"Atlas/TELOS/SHADOW.md",       // blind spots / behavioral tendencies (auto-managed by dream)
	"Atlas/TELOS/CORRECTIONS.md",  // patterns to avoid (signal-driven)
	"Atlas/TELOS/STORY.md",        // chronological growth log (meta-reflection output)
] as const;

// ── Cache ────────────────────────────────────────────────────────────────────

interface CachedFile {
	mtimeMs: number;
	content: string;
}

const fileCache = new Map<string, CachedFile>();

/**
 * Read a vault-relative file with mtime-keyed caching. Returns null if the
 * file doesn't exist or can't be read.
 */
function readVaultFile(vaultPath: string, relPath: string): string | null {
	const absPath = join(vaultPath, relPath);
	if (!existsSync(absPath)) return null;
	let mtimeMs: number;
	try {
		mtimeMs = statSync(absPath).mtimeMs;
	} catch {
		return null;
	}
	const hit = fileCache.get(absPath);
	if (hit && hit.mtimeMs === mtimeMs) return hit.content;
	try {
		const content = readFileSync(absPath, "utf-8").trim();
		fileCache.set(absPath, { mtimeMs, content });
		return content;
	} catch {
		return null;
	}
}

// ── Block builders ───────────────────────────────────────────────────────────

function buildSection(label: string, relPath: string, content: string): string {
	return `<!-- ${relPath} -->\n## ${label}\n\n${content}`;
}

function labelFromPath(relPath: string): string {
	const base = relPath.split("/").pop() ?? relPath;
	return base.replace(/\.md$/i, "");
}

/**
 * Build the full TELOS context block. Returns empty string if VAULT_PATH unset
 * or none of the source files exist (graceful degrade for fresh installs).
 */
export function buildTelosContext(): string {
	const vaultPath = process.env.VAULT_PATH;
	if (!vaultPath) {
		if (process.env.DEBUG) console.error("[pai-telos] VAULT_PATH not set");
		return "";
	}

	const sections: string[] = [];

	// Required (or "expected") TELOS files — IDENTITY, SOUL, TELOS, PERSONAL_CONTEXT.
	for (const rel of TELOS_FILES) {
		const content = readVaultFile(vaultPath, rel);
		if (!content) continue;
		sections.push(buildSection(labelFromPath(rel), rel, content));
	}

	// Auto-managed soul files — only if they exist.
	const soulSections: string[] = [];
	for (const rel of SOUL_FILES) {
		const content = readVaultFile(vaultPath, rel);
		if (!content) continue;
		soulSections.push(buildSection(labelFromPath(rel), rel, content));
	}

	if (sections.length === 0 && soulSections.length === 0) return "";

	const parts: string[] = [];
	parts.push("<pai-telos>");
	parts.push("");
	parts.push(
		"# Personal Context (TELOS / SOUL / IDENTITY)",
		"",
		"Loaded from $VAULT_PATH at session-prompt time. The four files below are the principal's identity, operational protocol, life framework, and personal context. Apply them as the lens through which every response is framed.",
		"",
	);
	if (sections.length > 0) parts.push(sections.join("\n\n---\n\n"));

	if (soulSections.length > 0) {
		parts.push("");
		parts.push("---");
		parts.push("");
		parts.push("# Auto-Managed Soul Files");
		parts.push("");
		parts.push(
			"These files are written by the pi pai extension's learning loop (signal extraction → dream reflection → framework tier promotion). They reflect what the system has learned about working with the principal.",
			"",
		);
		parts.push(soulSections.join("\n\n---\n\n"));
	}

	parts.push("");
	parts.push("</pai-telos>");
	return parts.join("\n");
}

/**
 * before_agent_start hook entry — appends the TELOS block to the system prompt
 * if anything was loaded. Idempotent (safe to call every turn — cache makes
 * it free after the first hit).
 */
export function telosSystemPromptAddition(existingPrompt: string): string {
	const block = buildTelosContext();
	if (!block) return existingPrompt;
	return existingPrompt + "\n\n<system-reminder>\n" + block + "\n</system-reminder>\n";
}

// ── CLI test harness ────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
	const block = buildTelosContext();
	if (!block) {
		console.error("[pai-telos] no content loaded — check VAULT_PATH");
		process.exit(1);
	}
	console.log(block);
}
