/**
 * outline — Tree-sitter powered code summarization for pi.
 *
 * Registers an `outline` tool that shows structural elements of source files:
 * function signatures, class declarations, type definitions, imports — no bodies.
 *
 * Output is 5-20x smaller than the full source, optimized for LLM context.
 * Includes line numbers so the agent can use `read --offset` to zoom into details.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { detectLanguage, isSupported, supportedLanguages, parse } from "./src/parser.ts";
import { extractOutline, formatOutline } from "./src/outline.ts";

export default function outline(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "outline",
		label: "outline",
		description:
			"Show the structural outline of a source file — function signatures, classes, types, imports — without bodies. " +
			"Output is 5-20x smaller than reading the full file. Use to understand a file's API surface before reading specific sections. " +
			`Supports: ${supportedLanguages().slice(0, 12).join(", ")}, and more.`,
		parameters: Type.Object({
			path: Type.String({
				description: "Path to the source file to outline (relative or absolute)",
			}),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const cwd = ctx?.cwd || process.cwd();
			const absolutePath = resolve(cwd, params.path);

			// Read file
			let source: string;
			try {
				const buffer = await readFile(absolutePath);
				source = buffer.toString("utf-8");
			} catch (e: any) {
				return {
					content: [{ type: "text", text: `Error reading file: ${e.message}` }],
					isError: true,
				};
			}

			// Detect language
			const language = detectLanguage(absolutePath);
			if (!language) {
				return {
					content: [{
						type: "text",
						text: `Cannot determine language for: ${params.path}\nSupported extensions: .ts, .tsx, .js, .py, .rs, .go, .java, .c, .cpp, .rb, .php, .kt, .swift, and more.`,
					}],
					isError: true,
				};
			}

			if (!isSupported(language)) {
				return {
					content: [{
						type: "text",
						text: `Language "${language}" detected but no grammar available.\nSupported: ${supportedLanguages().join(", ")}`,
					}],
					isError: true,
				};
			}

			// Parse with tree-sitter
			const tree = await parse(source, language);
			if (!tree) {
				return {
					content: [{
						type: "text",
						text: `Failed to parse ${params.path} as ${language}. The grammar may not be available.`,
					}],
					isError: true,
				};
			}

			// Extract and format outline
			const result = extractOutline(tree, source, language);
			const formatted = formatOutline(result);

			// Clean up tree
			tree.delete();

			return {
				content: [{ type: "text", text: formatted }],
			};
		},
	});
}
