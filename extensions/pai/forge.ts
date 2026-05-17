/**
 * forge.ts — Cross-vendor code producer (GPT-5.4 by default).
 *
 * RATIONALE
 * Mirrors CC PAI Algorithm v6.3.0 § auto-include bindings: "Forge (GPT-5.4
 * via codex exec) — auto-include at E3/E4/E5 for any coding task." Pi has no
 * codex CLI, so Forge here uses the same `pi --mode rpc` subprocess pattern
 * Cato uses, swapping provider per call. Default chain favors GPT-5.4 via
 * OpenAI, with Vertex Gemini 3.1 as a strong fallback.
 *
 * Sister to cato.ts:
 *   - cato.ts → audits the ISA, returns a verdict (read-only)
 *   - forge.ts → produces or refines code, returns a unified diff or files
 *
 * Provider override
 *   ~/.pai/forge-provider.json:
 *     { "providers": [{"provider":"...","model":"..."}, ...] }
 *   default chain: openai/<gpt-5.4> → google-vertex/<gemini>
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";

interface ForgeProviderSpec {
	provider: string;
	model: string;
}

const DEFAULT_FORGE_CHAIN: ForgeProviderSpec[] = [
	{ provider: "openai", model: "gpt-5.4" },
	{ provider: "google-vertex", model: "gemini-3.1-pro-preview" },
];

const FORGE_CONFIG = join(homedir(), ".pai", "forge-provider.json");
const FORGE_ATTEMPTS_LOG = join(homedir(), ".pai", "data", "forge-attempts.jsonl");

function loadForgeChain(): ForgeProviderSpec[] {
	if (!existsSync(FORGE_CONFIG)) return DEFAULT_FORGE_CHAIN;
	try {
		const parsed = JSON.parse(readFileSync(FORGE_CONFIG, "utf-8")) as
			| Partial<ForgeProviderSpec>
			| { providers?: ForgeProviderSpec[] };
		if (parsed && Array.isArray((parsed as { providers?: unknown }).providers)) {
			const list = (parsed as { providers: ForgeProviderSpec[] }).providers
				.filter((p) => p && typeof p.provider === "string" && typeof p.model === "string")
				.map((p) => ({ provider: p.provider, model: p.model }));
			if (list.length > 0) return list;
		}
		const single = parsed as Partial<ForgeProviderSpec>;
		if (single && typeof single.provider === "string" && typeof single.model === "string") {
			return [{ provider: single.provider, model: single.model }];
		}
	} catch {}
	return DEFAULT_FORGE_CHAIN;
}

const AUTH_ERROR_RX = /\b(401|403|404|not\s+found|unauthor[iz]ed|forbidden|credentials|auth(?:entication)?\s+failed|api\s*key|invalid\s+token|expired\s+token)\b/i;

function isAuthError(err: string | undefined): boolean {
	return !!err && AUTH_ERROR_RX.test(err);
}

function logAttempt(entry: Record<string, unknown>): void {
	try {
		mkdirSync(join(homedir(), ".pai", "data"), { recursive: true });
		appendFileSync(FORGE_ATTEMPTS_LOG, JSON.stringify({ ...entry, ts: new Date().toISOString() }) + "\n");
	} catch {}
}

const FORGE_SYSTEM_PROMPT = `You are Forge — a cross-vendor PAI code producer. Your job: write clean, production-ready code that satisfies a stated task. The executor (different model lineage than yours) is delegating to you because either (a) whole-project context fits better in your context window, or (b) your vendor's blind spots are the executor's weak spots.

Your discipline:
1. Read the task carefully. If the task references files, the user will include them in <file> blocks below.
2. Produce ONLY code (or diffs) — no preamble, no "I'll now..." — start with the file or diff directly.
3. If multiple files: emit each as a separate fenced block, labeled with its absolute path. Format:
   \`\`\`<lang> path=/abs/path/to/file
   <content>
   \`\`\`
4. If the task is a diff request, return a unified diff in a single \`\`\`diff fenced block.
5. Default to TypeScript with strict types. Default to bun runtime over node. Never npm — use bun.
6. No emoji unless the task explicitly asks. No verbose comments — comment only the WHY, not the WHAT.
7. Match the existing code style of the surrounding files when shown.

Strict rules:
- Never write to ~/.env, ~/.ssh, or anything matching *.pem / *.key.
- Never invent file paths the task didn't reference.
- If the task is ambiguous, ASK in a single question prefixed with "QUESTION:" — do not guess.
- If you cannot complete safely, output: "FORGE: REFUSE — <reason>".

Output is consumed verbatim by the executor — keep it tight, complete, and runnable.`;

const PI_FALLBACK_CLI = join(homedir(), "Developer", "pi-mono", "packages", "coding-agent", "dist", "cli.js");

function resolvePiCommand(): string[] {
	try {
		const out = require("node:child_process")
			.execSync("which pi", { timeout: 1000, encoding: "utf-8" })
			.trim();
		if (out && existsSync(out)) return [out];
	} catch {}
	if (existsSync(PI_FALLBACK_CLI)) {
		try {
			const bun = require("node:child_process")
				.execSync("which bun", { timeout: 1000, encoding: "utf-8" })
				.trim();
			if (bun && existsSync(bun)) return [bun, "run", PI_FALLBACK_CLI];
		} catch {}
		return ["node", PI_FALLBACK_CLI];
	}
	return ["pi"];
}

interface ForgeSubprocessResult {
	ok: boolean;
	text?: string;
	error?: string;
}

function runForgeSubprocess(
	prompt: string,
	timeoutMs: number,
	provider: ForgeProviderSpec,
): Promise<ForgeSubprocessResult> {
	return new Promise((resolve) => {
		const cmd = resolvePiCommand();
		const args = [
			...cmd.slice(1),
			"--mode", "rpc",
			"--no-session",
			"--no-tools",
			"--no-extensions",
			"--provider", provider.provider,
			"--model", provider.model,
		];

		let resolved = false;
		const finish = (out: ForgeSubprocessResult): void => {
			if (resolved) return;
			resolved = true;
			clearTimeout(timer);
			try { child.stdin?.end(); } catch {}
			try {
				if (!child.killed) child.kill("SIGTERM");
				setTimeout(() => { try { if (!child.killed) child.kill("SIGKILL"); } catch {} }, 500).unref();
			} catch {}
			resolve(out);
		};

		const child = spawn(cmd[0], args, {
			env: process.env,
			cwd: process.cwd(),
			stdio: ["pipe", "pipe", "pipe"],
		});

		const timer = setTimeout(() => finish({ ok: false, error: `forge timeout after ${timeoutMs}ms` }), timeoutMs);
		timer.unref();

		let stdoutBuf = "";
		let stderrBuf = "";
		let accumulated = "";
		let finalText: string | null = null;
		let promptError: string | null = null;

		child.stdout?.setEncoding("utf-8");
		child.stdout?.on("data", (chunk: string) => {
			stdoutBuf += chunk;
			let nl: number;
			while ((nl = stdoutBuf.indexOf("\n")) !== -1) {
				const line = stdoutBuf.slice(0, nl).trim();
				stdoutBuf = stdoutBuf.slice(nl + 1);
				if (!line) continue;
				let parsed: {
					type?: string;
					assistantMessageEvent?: { delta?: string; text?: string };
					messages?: Array<{ role?: string; content?: unknown }>;
					success?: boolean;
					error?: string;
					command?: string;
				};
				try { parsed = JSON.parse(line); } catch { continue; }
				if (parsed.type === "response" && parsed.command === "prompt" && parsed.success === false) {
					promptError = parsed.error ?? "prompt rejected";
				}
				if (parsed.type === "message_update" && parsed.assistantMessageEvent) {
					const ev = parsed.assistantMessageEvent;
					if (typeof ev.delta === "string") accumulated += ev.delta;
					else if (typeof ev.text === "string") accumulated += ev.text;
				}
				if (parsed.type === "agent_end") {
					if (Array.isArray(parsed.messages)) {
						for (let i = parsed.messages.length - 1; i >= 0; i--) {
							const m = parsed.messages[i];
							if (m && m.role === "assistant") {
								if (typeof m.content === "string") {
									finalText = m.content;
									break;
								}
								if (Array.isArray(m.content)) {
									const parts: string[] = [];
									for (const block of m.content as Array<{ type?: string; text?: string }>) {
										if (block && typeof block.text === "string") parts.push(block.text);
									}
									if (parts.length) {
										finalText = parts.join("");
										break;
									}
								}
							}
						}
					}
					const text = finalText ?? accumulated;
					if (promptError) finish({ ok: false, error: promptError });
					else finish({ ok: true, text });
				}
			}
		});

		child.stderr?.setEncoding("utf-8");
		child.stderr?.on("data", (chunk: string) => {
			stderrBuf += chunk;
			if (stderrBuf.length > 4000) stderrBuf = stderrBuf.slice(-4000);
		});

		child.on("error", (err) => finish({ ok: false, error: `forge spawn failed: ${err.message}` }));

		child.on("close", (code) => {
			if (resolved) return;
			if (finalText !== null) {
				finish({ ok: true, text: finalText });
				return;
			}
			const tail = stderrBuf.slice(0, 500);
			finish({
				ok: false,
				error: promptError ?? `forge subprocess exit ${code} before agent_end${tail ? `; stderr: ${tail}` : ""}`,
			});
		});

		try {
			child.stdin?.write(JSON.stringify({ id: "1", type: "prompt", message: `${FORGE_SYSTEM_PROMPT}\n\n${prompt}` }) + "\n");
			// Cato closes stdin immediately; for parity we follow the same pattern.
			// If the subprocess ever needs streaming follow-up prompts we'd hold it open.
			child.stdin?.end();
		} catch (err) {
			finish({ ok: false, error: `stdin write failed: ${(err as Error).message}` });
		}
	});
}

export function registerForge(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "forge_code",
		label: "Forge — Cross-Vendor Code Producer",
		description:
			"Cross-vendor code producer (GPT-5.4 by default; Gemini fallback). Auto-include at E3/E4/E5 for substantial coding tasks where another vendor's lineage is materially valuable, OR when whole-project context fits better in Forge's window than the executor's. Returns ready-to-paste code or unified diff.",
		parameters: Type.Object({
			task: Type.String({ description: "What Forge should produce. Be concrete: filenames, function signatures, behavior. Forge cannot ask follow-ups — give it everything it needs in one shot." }),
			context_paths: Type.Optional(
				Type.Array(Type.String(), { description: "Up to 8 absolute file paths to include verbatim as <file> blocks. Files >12KB are truncated." }),
			),
			mode: Type.Optional(Type.Union([Type.Literal("write"), Type.Literal("diff"), Type.Literal("refactor")], { description: "write: emit new file contents. diff: emit unified diff. refactor: refactor existing files. default: write" })),
			timeout_ms: Type.Optional(Type.Number({ description: "Override default 90s timeout" })),
		}),
		async execute(_id, params) {
			const extras: string[] = [];
			if (params.context_paths && Array.isArray(params.context_paths)) {
				for (const p of params.context_paths.slice(0, 8)) {
					if (!existsSync(p)) {
						extras.push(`<file path="${p}" status="missing" />`);
						continue;
					}
					try {
						let body = readFileSync(p, "utf-8");
						if (body.length > 12_000) body = body.slice(0, 12_000) + "\n…[truncated]";
						extras.push(`<file path="${p}">\n${body}\n</file>`);
					} catch (err) {
						extras.push(`<file path="${p}" status="read-error: ${(err as Error).message}" />`);
					}
				}
			}

			const mode = params.mode ?? "write";
			const userPrompt = [
				`MODE: ${mode}`,
				`TASK: ${params.task}`,
				extras.length ? `\nFILES:\n${extras.join("\n\n")}` : "",
			].filter(Boolean).join("\n");

			const chain = loadForgeChain();
			const timeoutMs = params.timeout_ms ?? 90_000;

			let result: ForgeSubprocessResult = { ok: false, error: "no providers configured" };
			let providerUsed: ForgeProviderSpec | null = null;
			const attemptsMade: ForgeProviderSpec[] = [];

			for (let i = 0; i < chain.length; i++) {
				const attempt = chain[i];
				attemptsMade.push(attempt);
				result = await runForgeSubprocess(userPrompt, timeoutMs, attempt);
				logAttempt({
					attempt_idx: i,
					provider: attempt.provider,
					model: attempt.model,
					ok: result.ok,
					error: result.ok ? undefined : result.error,
					mode,
				});
				if (result.ok) {
					providerUsed = attempt;
					break;
				}
				if (!isAuthError(result.error)) break;
			}

			if (!result.ok || !providerUsed) {
				const text =
					`forge_code FAILED after ${attemptsMade.length} provider attempt(s).\n\n` +
					`Last error: ${result.error}\n\n` +
					`Providers tried: ${attemptsMade.map((p) => `${p.provider}/${p.model}`).join(", ")}\n\n` +
					`Configure ~/.pai/forge-provider.json to override the chain.`;
				const details: Record<string, unknown> = {
					error: true,
					reason: result.error,
					attempts_made: attemptsMade.length,
					providers_tried: attemptsMade.map((p) => `${p.provider}/${p.model}`),
				};
				return { content: [{ type: "text" as const, text }], details };
			}

			const text = result.text ?? "";
			const head = `forge_code: ${providerUsed.provider}/${providerUsed.model} (${attemptsMade.length} attempt${attemptsMade.length === 1 ? "" : "s"}, mode=${mode})\n\n`;

			const details: Record<string, unknown> = {
				ok: true,
				provider: providerUsed,
				attempts_made: attemptsMade.length,
				providers_tried: attemptsMade.map((p) => `${p.provider}/${p.model}`),
				mode,
				output_chars: text.length,
			};
			return { content: [{ type: "text" as const, text: head + text }], details };
		},
		promptSnippet:
			"forge_code - Cross-vendor code producer (GPT-5.4 default). Auto-include at E3+ coding tasks.",
		promptGuidelines: [
			"Auto-include at E3/E4/E5 for substantial coding tasks. The doctrine block names this as a delegation capability.",
			"Pass concrete `task` description and `context_paths` for any files Forge needs to read. Forge cannot ask follow-ups — be explicit.",
			"For unified diffs use mode=\"diff\". For new files use mode=\"write\" (default). For modifying existing files use mode=\"refactor\".",
			"If Forge returns 'FORGE: REFUSE' or starts with 'QUESTION:', surface that directly to the user — do not silently retry.",
		],
	});
}
