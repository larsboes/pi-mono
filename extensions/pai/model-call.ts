/**
 * model-call.ts — Subprocess helper for calling pi as a model from extension code.
 *
 * RATIONALE
 * Extensions cannot import @mariozechner/pi-ai (or @earendil-works/pi-ai); doing
 * so poisons the api-registry and causes 403 on openai-completions providers.
 * This helper spawns `pi --mode rpc --no-session --no-tools` as a subprocess
 * and parses its JSONL stdout, never importing pi-ai.
 *
 * Used by:
 *   - algorithm.ts mode classifier (fast role)
 *   - advisor.ts commitment-boundary checks (advisor role)
 *   - cato.ts cross-vendor audit (different provider via roles override)
 *
 * STRICT INVARIANT: this file imports zero pi-ai surface. Node built-ins only.
 */

import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";

// ── Types ────────────────────────────────────────────────────────────────────

export type ModelRole = "fast" | "standard" | "smart" | "advisor";
export type ThinkingLevel = "off" | "low" | "medium" | "high";

export interface CallOptions {
	timeoutMs?: number;
	cache?: boolean;
	thinking?: ThinkingLevel;
	systemPrompt?: string;
}

export interface CallResult {
	ok: boolean;
	text?: string;
	error?: string;
	cached?: boolean;
	latencyMs?: number;
	source: "subprocess" | "cache" | "error";
}

interface RoleSpec {
	provider: string;
	model: string;
}

type RoleMap = Record<ModelRole, RoleSpec>;

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_ROLES: RoleMap = {
	fast: { provider: "amazon-bedrock", model: "eu.anthropic.claude-haiku-4-5-20251001-v1:0" },
	standard: { provider: "amazon-bedrock", model: "eu.anthropic.claude-sonnet-4-6" },
	smart: { provider: "amazon-bedrock", model: "eu.anthropic.claude-opus-4-7" },
	advisor: { provider: "amazon-bedrock", model: "eu.anthropic.claude-opus-4-7" },
};

const DEFAULT_TIMEOUTS: Record<ModelRole, number> = {
	fast: 10_000,
	standard: 30_000,
	smart: 60_000,
	advisor: 60_000,
};

const VALID_ROLES: readonly ModelRole[] = ["fast", "standard", "smart", "advisor"];

// ── Paths ────────────────────────────────────────────────────────────────────

const HOME = homedir();
const PAI_DIR = join(HOME, ".pai");
const DATA_DIR = join(PAI_DIR, "data");
const ROLES_FILE = join(PAI_DIR, "model-call-roles.json");
const CACHE_FILE = join(DATA_DIR, "model-call-cache.json");
const LOG_FILE = join(DATA_DIR, "model-call.jsonl");
const PI_FALLBACK_CLI = join(HOME, "Developer", "pi-mono", "packages", "coding-agent", "dist", "cli.js");

const CACHE_MAX_ENTRIES = 500;

// ── Role config ──────────────────────────────────────────────────────────────

let cachedRoles: RoleMap | null = null;

function loadRoles(): RoleMap {
	if (cachedRoles) return cachedRoles;
	if (!existsSync(ROLES_FILE)) {
		cachedRoles = DEFAULT_ROLES;
		return cachedRoles;
	}
	try {
		const raw = readFileSync(ROLES_FILE, "utf-8");
		const parsed = JSON.parse(raw) as Partial<RoleMap>;
		const merged: RoleMap = { ...DEFAULT_ROLES };
		for (const role of VALID_ROLES) {
			const spec = parsed[role];
			if (spec && typeof spec.provider === "string" && typeof spec.model === "string") {
				merged[role] = { provider: spec.provider, model: spec.model };
			}
		}
		cachedRoles = merged;
		return merged;
	} catch (err) {
		process.stderr.write(`[model-call] warning: ${ROLES_FILE} malformed (${(err as Error).message}); using defaults\n`);
		cachedRoles = DEFAULT_ROLES;
		return cachedRoles;
	}
}

// ── Pi binary resolution ─────────────────────────────────────────────────────

let cachedPiCommand: string[] | null = null;

function resolvePiCommand(): string[] {
	if (cachedPiCommand) return cachedPiCommand;
	try {
		const found = execSync("which pi", { timeout: 1000, encoding: "utf-8" }).trim();
		if (found && existsSync(found)) {
			cachedPiCommand = [found];
			return cachedPiCommand;
		}
	} catch {}
	if (existsSync(PI_FALLBACK_CLI)) {
		// Prefer bun: pi extensions use bun:sqlite which fails under plain node
		try {
			const bun = execSync("which bun", { timeout: 1000, encoding: "utf-8" }).trim();
			if (bun && existsSync(bun)) {
				cachedPiCommand = [bun, "run", PI_FALLBACK_CLI];
				return cachedPiCommand;
			}
		} catch {}
		cachedPiCommand = ["node", PI_FALLBACK_CLI];
		return cachedPiCommand;
	}
	// Last resort — assume `pi` is on PATH and let spawn ENOENT later
	cachedPiCommand = ["pi"];
	return cachedPiCommand;
}

// ── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry {
	text: string;
	ts: number;
	role: ModelRole;
	model: string;
}

type CacheMap = Record<string, CacheEntry>;

function ensureDataDir(): void {
	try {
		mkdirSync(DATA_DIR, { recursive: true });
	} catch {}
}

function readCache(): CacheMap {
	if (!existsSync(CACHE_FILE)) return {};
	try {
		const raw = readFileSync(CACHE_FILE, "utf-8");
		const parsed = JSON.parse(raw) as CacheMap;
		if (parsed && typeof parsed === "object") return parsed;
	} catch {}
	return {};
}

/**
 * Merge-on-write — re-read the cache right before writing and merge our new
 * entries into the latest map. This narrows the lost-update window when
 * multiple callModel() calls race in the same Node event loop. We also use a
 * pid+counter+random tmp name so cross-process writers don't clobber each
 * other's `.tmp` file.
 *
 * This isn't a true mutex — concurrent writers can still race on the rename
 * itself — but for cache semantics (lost entry = re-run a cheap model call)
 * the cost of a real lockfile (proper-lockfile dep, fcntl on POSIX, retry
 * loops) outweighs the marginal benefit. Atomic rename gives us crash-safety;
 * merge-on-write narrows the race; unique tmp eliminates tmp-clobber.
 */
let tmpCounter = 0;
function uniqueTmpPath(): string {
	tmpCounter += 1;
	const rand = Math.random().toString(36).slice(2, 8);
	return `${CACHE_FILE}.${process.pid}.${tmpCounter}.${rand}.tmp`;
}

function writeCacheMergingNew(newEntries: CacheMap): void {
	ensureDataDir();
	const tmp = uniqueTmpPath();
	try {
		const latest = readCache();
		for (const [k, v] of Object.entries(newEntries)) {
			const prior = latest[k];
			// If a fresher entry already exists for this key, prefer it.
			if (!prior || prior.ts < v.ts) {
				latest[k] = v;
			}
		}
		const merged = evictIfNeeded(latest);
		writeFileSync(tmp, JSON.stringify(merged));
		renameSync(tmp, CACHE_FILE);
	} catch {
		try { /* best-effort cleanup of orphaned tmp on error */ } catch {}
	}
}

function evictIfNeeded(map: CacheMap): CacheMap {
	const entries = Object.entries(map);
	if (entries.length <= CACHE_MAX_ENTRIES) return map;
	entries.sort((a, b) => a[1].ts - b[1].ts);
	const keep = entries.slice(entries.length - CACHE_MAX_ENTRIES);
	const next: CacheMap = {};
	for (const [k, v] of keep) next[k] = v;
	return next;
}

function cacheKey(role: ModelRole, spec: RoleSpec, prompt: string, thinking: ThinkingLevel, systemPrompt?: string): string {
	const h = createHash("sha256");
	h.update(role);
	h.update("\0");
	h.update(spec.provider);
	h.update("\0");
	h.update(spec.model);
	h.update("\0");
	h.update(thinking);
	h.update("\0");
	h.update(systemPrompt ?? "");
	h.update("\0");
	h.update(prompt);
	return h.digest("hex");
}

// ── Logging ──────────────────────────────────────────────────────────────────

interface LogEntry {
	ts: string;
	role: ModelRole;
	provider: string;
	model: string;
	latencyMs: number;
	ok: boolean;
	cached: boolean;
	error?: string;
	promptLen: number;
	responseLen: number;
}

function logCall(entry: LogEntry): void {
	try {
		ensureDataDir();
		appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
	} catch {}
}

// ── Subprocess invocation ────────────────────────────────────────────────────

interface RpcLineResponse {
	type: "response";
	command?: string;
	success?: boolean;
	error?: string;
	id?: string;
}

interface RpcLineMessageUpdate {
	type: "message_update";
	assistantMessageEvent?: {
		type?: string;
		delta?: string;
		text?: string;
	};
}

interface RpcAgentEnd {
	type: "agent_end";
	messages?: Array<{
		role?: string;
		content?: Array<{ type?: string; text?: string }> | string;
	}>;
}

type RpcLine = RpcLineResponse | RpcLineMessageUpdate | RpcAgentEnd | { type: string };

function extractFinalAssistantText(end: RpcAgentEnd): string | null {
	if (!end.messages || !Array.isArray(end.messages)) return null;
	for (let i = end.messages.length - 1; i >= 0; i--) {
		const msg = end.messages[i];
		if (msg && msg.role === "assistant") {
			const content = msg.content;
			if (typeof content === "string") return content;
			if (Array.isArray(content)) {
				const parts: string[] = [];
				for (const block of content) {
					if (block && typeof block.text === "string") parts.push(block.text);
				}
				if (parts.length > 0) return parts.join("");
			}
		}
	}
	return null;
}

interface SpawnOutcome {
	ok: boolean;
	text?: string;
	error?: string;
}

function runSubprocess(
	role: ModelRole,
	spec: RoleSpec,
	finalPrompt: string,
	thinking: ThinkingLevel,
	timeoutMs: number,
): Promise<SpawnOutcome> {
	return new Promise((resolve) => {
		const cmd = resolvePiCommand();
		const args = [
			...cmd.slice(1),
			"--mode", "rpc",
			"--no-session",
			"--no-tools",
			"--no-extensions",
			"--provider", spec.provider,
			"--model", spec.model,
		];
		if (thinking !== "off") {
			args.push("--thinking", thinking);
		}

		let resolved = false;
		const finish = (outcome: SpawnOutcome) => {
			if (resolved) return;
			resolved = true;
			clearTimeout(timer);
			try { child.stdout?.removeAllListeners(); } catch {}
			try { child.stderr?.removeAllListeners(); } catch {}
			try { child.removeAllListeners(); } catch {}
			try { child.stdin?.end(); } catch {}
			try {
				if (!child.killed) child.kill("SIGTERM");
				setTimeout(() => { try { if (!child.killed) child.kill("SIGKILL"); } catch {} }, 500).unref();
			} catch {}
			resolve(outcome);
		};

		const child = spawn(cmd[0], args, {
			env: process.env,
			cwd: process.cwd(),
			stdio: ["pipe", "pipe", "pipe"],
		});

		const timer = setTimeout(() => {
			finish({ ok: false, error: `timeout after ${timeoutMs}ms` });
		}, timeoutMs);
		timer.unref();

		let stdoutBuf = "";
		let stderrBuf = "";
		let accumulatedDeltas = "";
		let finalText: string | null = null;
		let promptAckSeen = false;
		let promptError: string | null = null;

		const handleLine = (rawLine: string): void => {
			const line = rawLine.trim();
			if (!line) return;
			let parsed: RpcLine;
			try {
				parsed = JSON.parse(line) as RpcLine;
			} catch {
				return;
			}
			if (parsed.type === "response") {
				const r = parsed as RpcLineResponse;
				if (r.command === "prompt") {
					if (r.success === true) {
						promptAckSeen = true;
					} else if (r.success === false) {
						promptError = r.error ?? "prompt rejected";
					}
				}
				return;
			}
			if (parsed.type === "message_update") {
				const u = parsed as RpcLineMessageUpdate;
				const ev = u.assistantMessageEvent;
				if (ev) {
					if (typeof ev.delta === "string") accumulatedDeltas += ev.delta;
					else if (typeof ev.text === "string") accumulatedDeltas += ev.text;
				}
				return;
			}
			if (parsed.type === "agent_end") {
				const text = extractFinalAssistantText(parsed as RpcAgentEnd);
				finalText = text ?? accumulatedDeltas;
				const result: SpawnOutcome = promptError
					? { ok: false, error: promptError }
					: { ok: true, text: finalText ?? "" };
				finish(result);
				return;
			}
		};

		child.stdout?.setEncoding("utf-8");
		child.stdout?.on("data", (chunk: string) => {
			stdoutBuf += chunk;
			let nl: number;
			while ((nl = stdoutBuf.indexOf("\n")) !== -1) {
				const line = stdoutBuf.slice(0, nl);
				stdoutBuf = stdoutBuf.slice(nl + 1);
				handleLine(line);
				if (resolved) return;
			}
		});

		child.stderr?.setEncoding("utf-8");
		child.stderr?.on("data", (chunk: string) => {
			stderrBuf += chunk;
			if (stderrBuf.length > 4000) stderrBuf = stderrBuf.slice(-4000);
		});

		child.on("error", (err) => {
			finish({ ok: false, error: `spawn failed: ${err.message}` });
		});

		child.on("close", (code) => {
			if (resolved) return;
			if (finalText !== null) {
				finish({ ok: true, text: finalText });
				return;
			}
			const stderrTail = stderrBuf.slice(0, 500);
			const reason = promptError
				? promptError
				: !promptAckSeen
					? `subprocess exit ${code} before prompt ack${stderrTail ? `; stderr: ${stderrTail}` : ""}`
					: `subprocess exit ${code} before agent_end${stderrTail ? `; stderr: ${stderrTail}` : ""}`;
			finish({ ok: false, error: reason });
		});

		try {
			const command = JSON.stringify({ id: "1", type: "prompt", message: finalPrompt }) + "\n";
			child.stdin?.write(command);
			// IMPORTANT: do NOT call child.stdin?.end() here. Pi RPC mode treats
			// stdin EOF as a shutdown signal — closing it before agent_end fires
			// causes the subprocess to exit mid-stream. We close stdin from
			// inside finish() (after the response or timeout), not here.
		} catch (err) {
			finish({ ok: false, error: `stdin write failed: ${(err as Error).message}` });
		}
	});
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function callModel(
	role: ModelRole,
	prompt: string,
	opts: CallOptions = {},
): Promise<CallResult> {
	if (!VALID_ROLES.includes(role)) {
		throw new Error(`callModel: invalid role "${role}" — expected one of ${VALID_ROLES.join(",")}`);
	}

	const start = Date.now();
	const roles = loadRoles();
	const spec = roles[role];
	const thinking: ThinkingLevel = opts.thinking ?? "off";
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUTS[role];
	const useCache = opts.cache !== false;
	const finalPrompt = opts.systemPrompt && opts.systemPrompt.trim().length > 0
		? `${opts.systemPrompt}\n\n${prompt}`
		: prompt;

	const key = cacheKey(role, spec, prompt, thinking, opts.systemPrompt);

	// Cache read
	if (useCache) {
		const map = readCache();
		const hit = map[key];
		if (hit) {
			const result: CallResult = {
				ok: true,
				text: hit.text,
				cached: true,
				latencyMs: Date.now() - start,
				source: "cache",
			};
			logCall({
				ts: new Date().toISOString(),
				role,
				provider: spec.provider,
				model: spec.model,
				latencyMs: result.latencyMs ?? 0,
				ok: true,
				cached: true,
				promptLen: prompt.length,
				responseLen: hit.text.length,
			});
			return result;
		}
	}

	const outcome = await runSubprocess(role, spec, finalPrompt, thinking, timeoutMs);
	const latencyMs = Date.now() - start;

	if (!outcome.ok) {
		const result: CallResult = {
			ok: false,
			error: outcome.error,
			latencyMs,
			source: "error",
		};
		logCall({
			ts: new Date().toISOString(),
			role,
			provider: spec.provider,
			model: spec.model,
			latencyMs,
			ok: false,
			cached: false,
			error: outcome.error,
			promptLen: prompt.length,
			responseLen: 0,
		});
		return result;
	}

	const text = outcome.text ?? "";

	if (useCache) {
		writeCacheMergingNew({ [key]: { text, ts: Date.now(), role, model: spec.model } });
	}

	logCall({
		ts: new Date().toISOString(),
		role,
		provider: spec.provider,
		model: spec.model,
		latencyMs,
		ok: true,
		cached: false,
		promptLen: prompt.length,
		responseLen: text.length,
	});

	return {
		ok: true,
		text,
		cached: false,
		latencyMs,
		source: "subprocess",
	};
}

// ── CLI entry point ──────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
	const role = (process.argv[2] || "fast") as ModelRole;
	const prompt = process.argv.slice(3).join(" ") || "respond with the literal text: pong";
	if (!VALID_ROLES.includes(role)) {
		console.error(`invalid role: ${role}; expected one of ${VALID_ROLES.join(",")}`);
		process.exit(2);
	}
	callModel(role, prompt, { cache: false }).then((r) => {
		console.log(JSON.stringify(r, null, 2));
		process.exit(r.ok ? 0 : 1);
	});
}
