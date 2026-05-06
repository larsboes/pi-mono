/**
 * Tool discovery tool — BM25 search over all registered tools.
 *
 * Allows the agent to discover available tools via natural language queries.
 * Useful when many MCP tools or extensions are registered and the agent
 * doesn't know which one to use.
 */

import type { AgentToolResult, AgentToolUpdateCallback } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "typebox";
import type { ExtensionContext, ToolDefinition } from "../extensions/types.js";
import { buildToolSearchIndex, type DiscoverableTool, searchTools, type ToolSearchIndex } from "../tool-discovery.js";

const searchToolsSchema = Type.Object({
	query: Type.String({
		description: "Natural language query to search for tools (e.g. 'kubernetes', 'image processing', 'git')",
	}),
	limit: Type.Optional(
		Type.Integer({ description: "Maximum results to return (default: 8)", minimum: 1, maximum: 20 }),
	),
});

type SearchToolsParams = Static<typeof searchToolsSchema>;

/** Factory that creates the search_tools definition with access to the tool registry */
export function createSearchToolsDefinition(
	getAllTools?: () => Array<{
		name: string;
		description?: string;
		parameters?: unknown;
		sourceInfo?: { source?: string };
	}>,
	getActiveToolNames?: () => string[],
): ToolDefinition<typeof searchToolsSchema> {
	let cachedIndex: ToolSearchIndex | null = null;
	let cachedToolCount = 0;

	return {
		name: "search_tools",
		label: "Search Tools",
		description:
			"Search for available tools by name or description. Use when you need a specific capability but don't know which tool provides it. Returns matching tools with their names, descriptions, and parameter keys.",
		promptSnippet: "Search for available tools by capability (use when you need to find a tool)",
		parameters: searchToolsSchema,
		executionMode: "parallel",

		async execute(
			_toolCallId: string,
			params: SearchToolsParams,
			_signal: AbortSignal | undefined,
			_onUpdate: AgentToolUpdateCallback | undefined,
			_ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			// Build discoverable tools from all registered tools
			const allTools = getAllTools?.() ?? [];
			const discoverable: DiscoverableTool[] = allTools.map((t) => ({
				name: t.name,
				description: t.description || "",
				parameterKeys: getParameterKeys(t.parameters),
				source: t.sourceInfo?.source || "unknown",
			}));

			// Rebuild index if tool count changed
			if (!cachedIndex || cachedToolCount !== discoverable.length) {
				cachedIndex = buildToolSearchIndex(discoverable);
				cachedToolCount = discoverable.length;
			}

			const limit = params.limit ?? 8;
			const results = searchTools(cachedIndex, params.query, limit);

			if (results.length === 0) {
				return {
					content: [
						{
							type: "text",
							text: `No tools found matching "${params.query}". There are ${discoverable.length} tools registered total.`,
						},
					],
					details: undefined,
				};
			}

			const activeTools = new Set(getActiveToolNames?.() ?? []);
			const lines = results.map((r) => {
				const active = activeTools.has(r.tool.name) ? " [active]" : "";
				const paramStr = r.tool.parameterKeys.length > 0 ? ` (params: ${r.tool.parameterKeys.join(", ")})` : "";
				return `- **${r.tool.name}**${active}: ${r.tool.description}${paramStr}`;
			});

			const text = [
				`Found ${results.length} tool(s) matching "${params.query}" (${discoverable.length} total):`,
				"",
				...lines,
			].join("\n");

			return { content: [{ type: "text", text }], details: undefined };
		},
	};
}

function getParameterKeys(parameters: unknown): string[] {
	if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return [];
	const props = (parameters as { properties?: unknown }).properties;
	if (!props || typeof props !== "object" || Array.isArray(props)) return [];
	return Object.keys(props as Record<string, unknown>);
}
