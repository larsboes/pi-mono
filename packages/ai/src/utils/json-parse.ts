import { parse as partialParse } from "partial-json";

export type ParseQuality = "complete" | "partial" | "failed";

export interface ParseResult<T> {
	value: T;
	quality: ParseQuality;
	error?: string;
}

/**
 * Attempts to parse potentially incomplete JSON during streaming.
 * Always returns a valid object, even if the JSON is incomplete.
 *
 * @param partialJson The partial JSON string from streaming
 * @returns Parsed object or empty object if parsing fails
 */
export function parseStreamingJson<T = any>(partialJson: string | undefined): T {
	return parseStreamingJsonWithQuality<T>(partialJson).value;
}

/**
 * Like parseStreamingJson but also returns parse quality metadata.
 * Use this when you need to track whether tool arguments were fully parsed.
 */
export function parseStreamingJsonWithQuality<T = any>(partialJson: string | undefined): ParseResult<T> {
	if (!partialJson || partialJson.trim() === "") {
		return { value: {} as T, quality: "complete" };
	}

	// Try standard parsing first (fastest for complete JSON)
	try {
		return { value: JSON.parse(partialJson) as T, quality: "complete" };
	} catch {
		// Try partial-json for incomplete JSON
		try {
			const result = partialParse(partialJson);
			if (process.env.DEBUG) {
				console.warn(
					`[tool-parse] Partial JSON recovery (${partialJson.length} chars): ...${partialJson.slice(-80)}`,
				);
			}
			return { value: (result ?? {}) as T, quality: "partial" };
		} catch (e) {
			if (process.env.DEBUG) {
				console.error(
					`[tool-parse] Failed to parse tool args (${partialJson.length} chars): ...${partialJson.slice(-80)}`,
				);
			}
			return {
				value: {} as T,
				quality: "failed",
				error: e instanceof Error ? e.message : "Unknown parse error",
			};
		}
	}
}
