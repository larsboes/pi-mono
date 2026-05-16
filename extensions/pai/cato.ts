/**
 * cato.ts — Cross-vendor audit adapter (E4/E5 mandatory).
 *
 * Mirrors CC PAI Algorithm v6.3.0 § Rule 2a: on Deep (E4) and Comprehensive
 * (E5) ISAs, after the advisor returns and before `phase: complete`, spawn
 * Cato to audit the work using a DIFFERENT cognitive lineage than the
 * executor and advisor. Read-only. Returns structured JSON.
 *
 * Cross-vendor enforcement:
 *   - The executor + advisor are typically Anthropic-family (claude/sonnet/opus).
 *   - Cato MUST run on a different provider — GPT or Gemini (Vertex)
 *     — so blind spots inherent to one vendor don't propagate.
 *
 * Provider override:
 *   ~/.pai/cato-provider.json:
 *     { "provider": "google-vertex", "model": "gemini-3.1-pro-preview" }
 *   default: google-vertex / gemini-3.1-pro-preview
 *
 * Implementation: cato uses the standard model-call subprocess but injects
 * the Cato provider/model directly via a temporary override of the smart role.
 * To keep model-call.ts simple we pass the cato config through the role-file
 * mechanism: cato writes a transient override to the in-process roles map.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";

interface CatoProviderSpec {
	provider: string;
	model: string;
}

/**
 * Default ordered fallback chain for cross-vendor audit. The whole point of
 * Cato is cross-vendor — running on a DIFFERENT lineage than the executor
 * (typically Anthropic). The chain tries Gemini first (best non-Anthropic
 * reasoner), then GPT via OpenAI, then bedrock-anthropic as last-resort
 * same-lineage so the E4/E5 mandate has a non-silent failure.
 *
 * Override at ~/.pai/cato-provider.json. Two shapes accepted:
 *   - Single: {"provider":"...","model":"..."}    → chain of 1
 *   - List:   {"providers":[{"provider":"...","model":"..."}, ...]}
 */
const DEFAULT_CATO_CHAIN: CatoProviderSpec[] = [
	{ provider: "google-vertex", model: "gemini-3.1-pro-preview" },
	{ provider: "openai", model: "gpt-5.4" },
];

const CATO_CONFIG = join(homedir(), ".pai", "cato-provider.json");
const CATO_ATTEMPTS_LOG = join(homedir(), ".pai", "data", "cato-attempts.jsonl");

function loadCatoChain(): CatoProviderSpec[] {
	if (!existsSync(CATO_CONFIG)) return DEFAULT_CATO_CHAIN;
	try {
		const parsed = JSON.parse(readFileSync(CATO_CONFIG, "utf-8")) as
			| Partial<CatoProviderSpec>
			| { providers?: CatoProviderSpec[] };
		// New shape: explicit list
		if (parsed && Array.isArray((parsed as { providers?: unknown }).providers)) {
			const list = (parsed as { providers: CatoProviderSpec[] }).providers
				.filter((p) => p && typeof p.provider === "string" && typeof p.model === "string")
				.map((p) => ({ provider: p.provider, model: p.model }));
			if (list.length > 0) return list;
		}
		// Old shape: single → chain of 1
		const single = parsed as Partial<CatoProviderSpec>;
		if (single && typeof single.provider === "string" && typeof single.model === "string") {
			return [{ provider: single.provider, model: single.model }];
		}
	} catch {}
	return DEFAULT_CATO_CHAIN;
}

/**
 * Patterns that indicate the failure was an auth/credentials issue and we
 * should advance to the next provider instead of treating it as a real error.
 */
const AUTH_ERROR_RX = /\b(401|403|404|not\s+found|unauthor[iz]ed|forbidden|credentials|auth(?:entication)?\s+failed|api\s*key|invalid\s+token|expired\s+token)\b/i;

function isAuthError(error: string | undefined): boolean {
	if (!error) return false;
	return AUTH_ERROR_RX.test(error);
}

function logAttempt(entry: Record<string, unknown>): void {
	try {
		mkdirSync(join(homedir(), ".pai", "data"), { recursive: true });
		appendFileSync(CATO_ATTEMPTS_LOG, JSON.stringify({ ...entry, ts: new Date().toISOString() }) + "\n");
	} catch {}
}

const CATO_SYSTEM_PROMPT = `You are Cato — a cross-vendor PAI auditor. The executor (different model lineage than yours) has built work against an ISA (Ideal State Artifact) and is about to declare phase: complete. Your job is to audit before that happens, surfacing blind spots the executor and advisor (same lineage as executor) could share.

Your discipline:
1. Read the ISA carefully — Goal, Criteria, Test Strategy, Verification.
2. For each ISC marked [x], check the Verification entry. Probe shape match? Real evidence or hand-wave?
3. Check anti-criteria — could any be quietly violated?
4. Look for category errors: missing test surfaces (auth, RBAC, perf, error paths) the executor's lineage tends to forget.
5. Check the Decisions log for asserted-but-unverified claims.

Return JSON:
{
  "verdict": "pass" | "concerns" | "fail",
  "critical_findings": [
    { "isc_id": "ISC-N or null", "issue": "...", "evidence": "what is missing/wrong" }
  ],
  "concerns": [
    { "isc_id": "...", "issue": "..." }
  ],
  "blind_spot_check": "one paragraph on what cross-lineage adds: did the executor's vendor-specific habits cause any miss?"
}

Strict rule: any "critical_finding" → verdict MUST be "fail". Any non-empty "concerns" with no critical_findings → "concerns". Otherwise "pass".

Be candid. Be specific. Cite ISC IDs. Don't pad.`;

interface CatoFinding {
	verdict: "pass" | "concerns" | "fail" | "unparseable";
	critical_findings?: Array<{ isc_id?: string | null; issue?: string; evidence?: string }>;
	concerns?: Array<{ isc_id?: string; issue?: string }>;
	blind_spot_check?: string;
	rawText?: string;
}

function parseCatoResponse(text: string): CatoFinding {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	const candidate = fenced ? fenced[1] : text;
	const jsonStart = candidate.indexOf("{");
	const jsonEnd = candidate.lastIndexOf("}");
	if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
		return { verdict: "unparseable", rawText: text.slice(0, 1500) };
	}
	try {
		const parsed = JSON.parse(candidate.slice(jsonStart, jsonEnd + 1)) as CatoFinding;
		const v = parsed.verdict;
		if (v !== "pass" && v !== "concerns" && v !== "fail") {
			return { verdict: "unparseable", rawText: text.slice(0, 1500) };
		}
		return parsed;
	} catch {
		return { verdict: "unparseable", rawText: text.slice(0, 1500) };
	}
}

const PI_FALLBACK_CLI = join(homedir(), "Developer", "pi-mono", "packages", "coding-agent", "dist", "cli.js");

function resolvePiCommand(): string[] {
	try {
		const out = require("node:child_process").execSync("which pi", { timeout: 1000, encoding: "utf-8" }).trim();
		if (out && existsSync(out)) return [out];
	} catch {}
	if (existsSync(PI_FALLBACK_CLI)) {
		try {
			const bun = require("node:child_process").execSync("which bun", { timeout: 1000, encoding: "utf-8" }).trim();
			if (bun && existsSync(bun)) return [bun, "run", PI_FALLBACK_CLI];
		} catch {}
		return ["node", PI_FALLBACK_CLI];
	}
	return ["pi"];
}

interface CatoSubprocessResult {
	ok: boolean;
	text?: string;
	error?: string;
}

function runCatoSubprocess(
	prompt: string,
	timeoutMs: number,
	provider: CatoProviderSpec,
): Promise<CatoSubprocessResult> {
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
		const finish = (out: CatoSubprocessResult) => {
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

		const timer = setTimeout(() => finish({ ok: false, error: `cato timeout after ${timeoutMs}ms` }), timeoutMs);
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
				let parsed: { type?: string; assistantMessageEvent?: { delta?: string; text?: string }; messages?: Array<{ role?: string; content?: unknown }>; success?: boolean; error?: string; command?: string };
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

		child.on("error", (err) => finish({ ok: false, error: `cato spawn failed: ${err.message}` }));

		child.on("close", (code) => {
			if (resolved) return;
			if (finalText !== null) {
				finish({ ok: true, text: finalText });
				return;
			}
			const tail = stderrBuf.slice(0, 500);
			finish({
				ok: false,
				error: promptError ?? `cato subprocess exit ${code} before agent_end${tail ? `; stderr: ${tail}` : ""}`,
			});
		});

		try {
			child.stdin?.write(JSON.stringify({ id: "1", type: "prompt", message: `${CATO_SYSTEM_PROMPT}\n\n${prompt}` }) + "\n");
			child.stdin?.end();
		} catch (err) {
			finish({ ok: false, error: `stdin write failed: ${(err as Error).message}` });
		}
	});
}

export function registerCato(pi: ExtensionAPI) {
	pi.registerTool({
		name: "cato_audit",
		label: "Cato Cross-Vendor Audit",
		description:
			"Cross-vendor audit of the project ISA. Spawns Cato (different provider than executor — GPT/Gemini by default) read-only. Returns {verdict: pass|concerns|fail, critical_findings, concerns, blind_spot_check}. Mandatory at E4/E5 before phase: complete.",
		parameters: Type.Object({
			isa_path: Type.String({ description: "Absolute path to the ISA file to audit" }),
			slug: Type.Optional(Type.String({ description: "Project/task slug — included in audit prompt for context" })),
			extra_files: Type.Optional(
				Type.Array(Type.String(), {
					description: "Up to 4 additional absolute file paths to include (key source files referenced by the ISA)",
				}),
			),
			timeout_ms: Type.Optional(Type.Number({ description: "Override default 60s timeout" })),
		}),
		async execute(_id, params) {
			if (!existsSync(params.isa_path)) {
				const details: Record<string, unknown> = { error: true, reason: "isa_path not found" };
				return {
					content: [{ type: "text" as const, text: `cato_audit: ISA not found at ${params.isa_path}` }],
					details,
				};
			}

			let isaContent: string;
			try {
				isaContent = readFileSync(params.isa_path, "utf-8");
			} catch (err) {
				const details: Record<string, unknown> = { error: true, reason: (err as Error).message };
				return {
					content: [{ type: "text" as const, text: `cato_audit: failed to read ISA: ${(err as Error).message}` }],
					details,
				};
			}

			const extras: string[] = [];
			if (params.extra_files && Array.isArray(params.extra_files)) {
				for (const p of params.extra_files.slice(0, 4)) {
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

			const chain = loadCatoChain();
			const userPrompt = [
				params.slug ? `SLUG: ${params.slug}` : "",
				`ISA_PATH: ${params.isa_path}`,
				`<isa>\n${isaContent}\n</isa>`,
				extras.length ? `\nEXTRA CONTEXT:\n${extras.join("\n\n")}` : "",
			]
				.filter(Boolean)
				.join("\n");

			const timeoutMs = params.timeout_ms ?? 60_000;

			// Walk the provider chain. On auth-style errors (401/403/credentials),
			// advance to the next provider. On any non-auth error or success, stop.
			// Every attempt logged to ~/.pai/data/cato-attempts.jsonl.
			let result: CatoSubprocessResult = { ok: false, error: "no providers configured" };
			let providerUsed: CatoProviderSpec | null = null;
			const attemptsMade: CatoProviderSpec[] = [];

			for (let i = 0; i < chain.length; i++) {
				const attempt = chain[i];
				attemptsMade.push(attempt);
				result = await runCatoSubprocess(userPrompt, timeoutMs, attempt);
				logAttempt({
					attempt_idx: i,
					provider: attempt.provider,
					model: attempt.model,
					ok: result.ok,
					error: result.ok ? undefined : result.error,
				});
				if (result.ok) {
					providerUsed = attempt;
					break;
				}
				// Advance only on auth errors. Real errors (e.g., subprocess crash,
				// bad ISA path) shouldn't waste the rest of the chain.
				if (!isAuthError(result.error)) break;
			}

			if (!result.ok || !providerUsed) {
				const text =
					`cato_audit FAILED after ${attemptsMade.length} provider attempt(s).\n\n` +
					`Last error: ${result.error}\n\n` +
					`Providers tried (in order):\n${attemptsMade.map((p, i) => `  ${i + 1}. ${p.provider}/${p.model}`).join("\n")}\n\n` +
					`Cross-vendor audit could not complete. At E4/E5 this BLOCKS phase: complete — surface to user. ` +
					`Configure ~/.pai/cato-provider.json to override the chain (single provider OR explicit providers[] list).`;
				const details: Record<string, unknown> = {
					error: true,
					reason: result.error,
					attempts_made: attemptsMade.length,
					providers_tried: attemptsMade.map((p) => `${p.provider}/${p.model}`),
				};
				return { content: [{ type: "text" as const, text }], details };
			}

			const finding = parseCatoResponse(result.text ?? "");
			const lines: string[] = [];
			lines.push(`cato_audit: VERDICT = ${finding.verdict.toUpperCase()}  (provider: ${providerUsed.provider}/${providerUsed.model}${attemptsMade.length > 1 ? `, after ${attemptsMade.length} chain attempts` : ""})`);
			if (finding.critical_findings && finding.critical_findings.length > 0) {
				lines.push(`Critical findings (${finding.critical_findings.length}):`);
				for (const f of finding.critical_findings) {
					lines.push(`  - [${f.isc_id ?? "—"}] ${f.issue ?? ""}${f.evidence ? `\n      evidence: ${f.evidence}` : ""}`);
				}
			}
			if (finding.concerns && finding.concerns.length > 0) {
				lines.push(`Concerns (${finding.concerns.length}):`);
				for (const c of finding.concerns) {
					lines.push(`  - [${c.isc_id ?? "—"}] ${c.issue ?? ""}`);
				}
			}
			if (finding.blind_spot_check) {
				lines.push(`Blind-spot check: ${finding.blind_spot_check}`);
			}
			if (finding.verdict === "unparseable") {
				lines.push(`(Cato returned non-JSON. Raw excerpt below.)`);
				lines.push(finding.rawText ?? "");
			}

			const details: Record<string, unknown> = {
				verdict: finding.verdict,
				provider: providerUsed,
				attempts_made: attemptsMade.length,
				providers_tried: attemptsMade.map((p) => `${p.provider}/${p.model}`),
				critical_findings: finding.critical_findings ?? [],
				concerns: finding.concerns ?? [],
				blind_spot_check: finding.blind_spot_check,
			};
			return { content: [{ type: "text" as const, text: lines.join("\n") }], details };
		},
		promptSnippet:
			"cato_audit - Cross-vendor audit of the ISA. Mandatory at E4/E5 before phase: complete.",
		promptGuidelines: [
			"Mandatory at Deep (E4) and Comprehensive (E5) tiers, after advisor returns and before setting phase: complete.",
			"Pass the absolute ISA path; optional extra_files for key source files referenced by the ISA.",
			"Verdict 'fail' or any critical_findings → BLOCK phase: complete and return to BUILD/EXECUTE.",
			"Verdict 'concerns' → surface findings to user, ask approve/iterate/defer.",
			"Verdict 'pass' with no critical_findings → proceed to LEARN.",
		],
	});
}
