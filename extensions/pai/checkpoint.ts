/**
 * PAI Per-ISC Checkpoints — auto-commit when an ISC transitions to [x].
 *
 * Mirrors CC's CheckpointPerISC.hook.ts. Pi has no PostToolUse Edit hook, so
 * we observe `tool_result` for Edit/Write on `.pi/ISA.md`, parse the diff for
 * newly-passed ISCs, and for each repo listed in ~/.pai/checkpoint-repos.txt
 * with uncommitted changes, run `git add -A && git commit -m "chore(pai):
 * checkpoint ISC-N"`.
 *
 * Idempotency: a sidecar `.checkpoint-state.json` next to the ISA tracks which
 * ISC ids have already triggered a commit. Re-running on the same ISC is a no-op.
 *
 * Opt-in: if ~/.pai/checkpoint-repos.txt does not exist or contains no entries,
 * the extension does nothing.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	existsSync,
	readFileSync,
	writeFileSync,
	mkdirSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, isAbsolute, resolve, sep } from "node:path";
import { homedir } from "node:os";

const CHECKPOINT_REPOS = join(homedir(), ".pai", "checkpoint-repos.txt");
const ISA_REL = ".pi/ISA.md";

type StateFile = { committed: string[] };

function loadCheckpointRepos(): string[] {
	if (!existsSync(CHECKPOINT_REPOS)) return [];
	try {
		return readFileSync(CHECKPOINT_REPOS, "utf-8")
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l && !l.startsWith("#"))
			.map(expandTilde);
	} catch {
		return [];
	}
}

function expandTilde(p: string): string {
	if (p === "~") return homedir();
	if (p.startsWith("~/")) return join(homedir(), p.slice(2));
	return p;
}

function loadState(isaPath: string): StateFile {
	const path = sidecarPath(isaPath);
	if (!existsSync(path)) return { committed: [] };
	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8"));
		if (Array.isArray(parsed.committed)) return { committed: parsed.committed };
	} catch {}
	return { committed: [] };
}

function saveState(isaPath: string, state: StateFile) {
	const path = sidecarPath(isaPath);
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, JSON.stringify(state, null, 2));
	} catch {}
}

function sidecarPath(isaPath: string): string {
	return join(dirname(isaPath), ".checkpoint-state.json");
}

function isISAEdit(toolName: string, input: Record<string, unknown>): string | null {
	if (toolName !== "edit" && toolName !== "write") return null;
	const path = (input as any)?.file_path;
	if (typeof path !== "string") return null;
	const abs = isAbsolute(path) ? path : resolve(path);
	const platformISA = ISA_REL.replace(/\//g, sep);
	if (!abs.endsWith(platformISA) && !abs.endsWith(ISA_REL)) return null;
	return abs;
}

function parsePassedISCs(content: string): Set<string> {
	const out = new Set<string>();
	const rx = /^-\s*\[x\]\s*ISC-([\w.]+):/gm;
	for (const m of content.matchAll(rx)) out.add(m[1]);
	return out;
}

function gitDirtyRepos(repos: string[]): string[] {
	const dirty: string[] = [];
	for (const repo of repos) {
		if (!existsSync(repo)) continue;
		try {
			const out = execFileSync("git", ["-C", repo, "status", "--porcelain"], {
				encoding: "utf-8",
				timeout: 5000,
			});
			if (out.trim().length > 0) dirty.push(repo);
		} catch {}
	}
	return dirty;
}

function commitCheckpoint(repo: string, iscId: string): { ok: boolean; reason?: string } {
	try {
		execFileSync("git", ["-C", repo, "add", "-A"], { timeout: 10000 });
		execFileSync(
			"git",
			["-C", repo, "commit", "-m", `chore(pai): checkpoint ISC-${iscId}`, "--no-verify"],
			{ timeout: 15000, stdio: ["ignore", "pipe", "pipe"] },
		);
		return { ok: true };
	} catch (err) {
		return { ok: false, reason: (err as Error).message.slice(0, 200) };
	}
}

/**
 * Track per-ISA the previously-passed set so we only act on transitions.
 * Re-keyed across the lifetime of the extension; survives session resumes
 * because the sidecar `.checkpoint-state.json` stores already-committed ids.
 */
const lastPassedByISA = new Map<string, Set<string>>();

export function registerCheckpoint(pi: ExtensionAPI) {
	pi.on("tool_result", async (event) => {
		const isaPath = isISAEdit(event.toolName, (event.input as Record<string, unknown>) ?? {});
		if (!isaPath) return;
		if (!existsSync(isaPath)) return;

		let content: string;
		try {
			content = readFileSync(isaPath, "utf-8");
		} catch {
			return;
		}

		const passed = parsePassedISCs(content);
		const previous = lastPassedByISA.get(isaPath) ?? new Set();
		lastPassedByISA.set(isaPath, passed);

		const newlyPassed: string[] = [];
		for (const id of passed) if (!previous.has(id)) newlyPassed.push(id);
		if (newlyPassed.length === 0) return;

		const repos = loadCheckpointRepos();
		if (repos.length === 0) return;

		const state = loadState(isaPath);
		const alreadyCommitted = new Set(state.committed);

		for (const iscId of newlyPassed) {
			if (alreadyCommitted.has(iscId)) continue;
			const dirty = gitDirtyRepos(repos);
			if (dirty.length === 0) {
				alreadyCommitted.add(iscId);
				continue;
			}
			let anyOk = false;
			for (const repo of dirty) {
				const result = commitCheckpoint(repo, iscId);
				if (result.ok) anyOk = true;
			}
			if (anyOk) alreadyCommitted.add(iscId);
		}

		state.committed = Array.from(alreadyCommitted);
		saveState(isaPath, state);
	});
}
