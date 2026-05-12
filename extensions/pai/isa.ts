/**
 * PAI Project ISA — Ideal State Artifact per project
 *
 * A lightweight project specification that the algorithm reads during OBSERVE
 * and updates during LEARN. Lives at `.pi/ISA.md` in the project root.
 *
 * Format:
 *   ## Goal — what this project achieves
 *   ## Criteria — atomic success conditions
 *   ## Constraints — architectural/tech mandates
 *   ## Decisions — timestamped log of key choices
 *
 * The algorithm:
 * - Reads ISA at OBSERVE (injected into context)
 * - Model may update it after completing significant work
 * - /isa command scaffolds, views, or resets the ISA
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";

const ISA_FILENAME = "ISA.md";
const ISA_DIR = ".pi";

function isaPath(cwd: string): string {
	return join(cwd, ISA_DIR, ISA_FILENAME);
}

/**
 * Load ISA content for the current project, if it exists.
 */
export function loadProjectISA(cwd: string): string | null {
	const path = isaPath(cwd);
	if (!existsSync(path)) return null;
	try {
		return readFileSync(path, "utf-8").trim();
	} catch {
		return null;
	}
}

/**
 * Build the ISA injection for the system prompt.
 */
export function buildISAContext(cwd: string): string | null {
	const content = loadProjectISA(cwd);
	if (!content) return null;

	return `
<project-isa path="${isaPath(cwd)}">
${content}
</project-isa>

The above is this project's Ideal State Artifact (ISA). During OBSERVE, check your work against these criteria. During LEARN, update the ISA if goals/criteria/decisions changed. Edit the file directly when updating.
`;
}

/**
 * Scaffold a new ISA for the current project.
 */
function scaffoldISA(cwd: string, projectName?: string): string {
	const name = projectName || basename(cwd);
	const now = new Date().toISOString().slice(0, 10);

	const content = `# ${name} — Ideal State Artifact

*Created: ${now}*

## Goal

<!-- What does "done" look like for this project? 1-3 sentences. -->


## Criteria

<!-- Atomic, binary-testable success conditions. One per line. -->
<!-- Format: - [ ] ISC-N: criterion text -->

- [ ] ISC-1: 
- [ ] ISC-2: 
- [ ] ISC-3: 

## Constraints

<!-- Immovable architectural/tech mandates -->


## Principles

<!-- Design principles guiding decisions -->


## Decisions

<!-- Timestamped log of significant choices. Format: YYYY-MM-DD: decision -->

- ${now}: ISA created

## Out of Scope

<!-- What this project explicitly does NOT include -->

`;

	const dir = join(cwd, ISA_DIR);
	mkdirSync(dir, { recursive: true });
	writeFileSync(isaPath(cwd), content);
	return isaPath(cwd);
}

/**
 * Register ISA support in the PAI extension.
 */
export function registerISA(pi: ExtensionAPI) {
	// Inject ISA into algorithm context during before_agent_start
	// (This is called from the algorithm's before_agent_start handler)
	// We expose buildISAContext for that purpose.

	// /isa command
	pi.registerCommand("isa", {
		description: "Project ISA — scaffold, view, or manage the Ideal State Artifact",
		handler: async (args, ctx) => {
			const arg = args?.trim().toLowerCase() || "";
			const cwd = ctx.cwd;

			if (!arg || arg === "view" || arg === "show") {
				const content = loadProjectISA(cwd);
				if (!content) {
					ctx.ui.notify("No ISA found. Run /isa init to create one.", "warning");
				} else {
					ctx.ui.notify(`ISA: ${isaPath(cwd)} (${content.split("\n").length} lines)`, "info");
				}
				return;
			}

			if (arg === "init" || arg === "scaffold" || arg.startsWith("init ")) {
				const name = arg.replace(/^(init|scaffold)\s*/, "").trim() || undefined;
				if (existsSync(isaPath(cwd))) {
					ctx.ui.notify("ISA already exists. Delete .pi/ISA.md first to re-scaffold.", "warning");
					return;
				}
				const path = scaffoldISA(cwd, name);
				ctx.ui.notify(`ISA created at ${path}`, "info");
				return;
			}

			if (arg === "path") {
				ctx.ui.notify(isaPath(cwd), "info");
				return;
			}

			ctx.ui.notify("Usage: /isa [view|init|init <name>|path]", "warning");
		},
	});
}
