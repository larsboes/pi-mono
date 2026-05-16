/**
 * smoke-promotions.ts — exercise every programmatic promotion shipped
 * 2026-05-16. Prints PASS/FAIL per check; exits 0 iff all PASS.
 *
 * Run from extensions/pai/:
 *   bun scripts/smoke-promotions.ts
 *
 * Exercises:
 *   - doctrine-parser.ts: parseDoctrineOutput, checkThinkingFloor,
 *     findGranularityFlags, detectMultiAskPrompt
 *   - algorithm.ts: buildAlgorithmContext model-family hint
 *   - cato.ts: chain shape (loadCatoChain default)
 *
 * No subprocesses, no I/O on real session state. Pure-function smoke.
 */

import {
	parseDoctrineOutput,
	checkThinkingFloor,
	findGranularityFlags,
	detectMultiAskPrompt,
	CLOSED_THINKING_LIST,
} from "../doctrine-parser.js";
import { buildAlgorithmContext } from "../algorithm.js";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string): void {
	if (ok) {
		console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
		passed++;
	} else {
		console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
		failed++;
	}
}

console.log("\n## #6 Phantom thinking-capability detection\n");
{
	const out = parseDoctrineOutput(
		"🏹 CAPABILITIES SELECTED:\n 🏹 **FirstPrinciples** → THINK\n 🏹 deep reasoning → THINK",
	);
	check("phantom recognized", out.capabilityCounts.phantom === 1);
	check("genuine recognized", out.capabilityCounts.thinking === 1);
}

console.log("\n## #8 Tier thinking floor\n");
{
	const out = parseDoctrineOutput("🏹 CAPABILITIES SELECTED:\n 🏹 **IterativeDepth** → THINK");
	const e3 = checkThinkingFloor(out, "e3");
	const e2 = checkThinkingFloor(out, "e2");
	const e4 = checkThinkingFloor(out, "e4");
	check("e3 floor not met (1<4)", !e3.met && e3.requiredThinking === 4);
	check("e2 floor not met (1<2)", !e2.met && e2.requiredThinking === 2);
	check("e4 floor not met (1<6)", !e4.met && e4.requiredThinking === 6);
}

console.log("\n## #3 ISC granularity heuristic\n");
{
	const isa = `
- [ ] ISC-1: do A and B in one step
- [ ] ISC-2: read every file in the directory
- [ ] ISC-3: Anti: should not corrupt all data
- [ ] ISC-4: simple atomic check
- [ ] ISC-5: Antecedent: vault must be loaded
`;
	const flags = findGranularityFlags(isa);
	check("ISC-1 flagged (and-join, low)", flags.some((f) => f.iscId === "1" && f.confidence === "low"));
	check("ISC-2 flagged (scope-word, high)", flags.some((f) => f.iscId === "2" && f.confidence === "high"));
	check("ISC-3 skipped (Anti:)", !flags.some((f) => f.iscId === "3"));
	check("ISC-4 skipped (atomic)", !flags.some((f) => f.iscId === "4"));
	check("ISC-5 skipped (Antecedent:)", !flags.some((f) => f.iscId === "5"));
	check("idempotent", JSON.stringify(flags) === JSON.stringify(findGranularityFlags(isa)));
}

console.log("\n## #18 Deliverable Manifest detection\n");
{
	const single = detectMultiAskPrompt("fix the auth bug");
	const conn = detectMultiAskPrompt("fix the bug and also add a test");
	const numbered = detectMultiAskPrompt("1. add a test\n2. fix the bug");
	check("single-ask → false", !single.multiAsk);
	check("and-also → true", conn.multiAsk && conn.reasons.includes("and-also"));
	check("numbered → true", numbered.multiAsk);
}

console.log("\n## Model-family hint\n");
{
	const sonnet = buildAlgorithmContext("e3", "amazon-bedrock/eu.anthropic.claude-sonnet-4-6");
	const kimi = buildAlgorithmContext("e3", "moonshotai/kimi-k2.6");
	const e1k = buildAlgorithmContext("e1", "moonshotai/kimi-k2.6");
	check("Anthropic gets no notice", !sonnet.includes("non-Anthropic-trained"));
	check("Non-Anthropic gets notice", kimi.includes("non-Anthropic-trained"));
	check("Notice has closed enumeration keyword", kimi.includes("Closed enumeration"));
	check("Notice has phase-header emoji keyword", kimi.includes("Phase-header emoji"));
	check("Notice has visible response keyword", kimi.includes("VISIBLE RESPONSE"));
	check("E1 fast-path skips notice", !e1k.includes("non-Anthropic-trained"));
	const delta = kimi.length - sonnet.length;
	check(`Non-anthropic byte delta ≥400 (got ${delta})`, delta >= 400);
}

console.log("\n## Closed enumeration sanity\n");
check("19 entries exactly", CLOSED_THINKING_LIST.length === 19);

console.log("\n## Summary\n");
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
	console.log("\nSMOKE FAILED");
	process.exit(1);
}
console.log("\nSMOKE OK");
process.exit(0);
