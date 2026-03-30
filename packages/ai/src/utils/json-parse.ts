import { parse as partialParse } from "partial-json";

/**
 * Attempts to parse potentially incomplete JSON during streaming.
 * Always returns a valid object, even if the JSON is incomplete.
 *
 * @param partialJson The partial JSON string from streaming
 * @returns Parsed object or empty object if parsing fails
 */
export function parseStreamingJson<T = any>(partialJson: string | undefined): T {
	if (!partialJson || partialJson.trim() === "") {
		return {} as T;
	}

	// Try standard parsing first (fastest for complete JSON)
	try {
		return JSON.parse(partialJson) as T;
	} catch {
		// Try partial-json for incomplete JSON
		try {
			const result = partialParse(partialJson);
			if (process.env.DEBUG) {
				console.warn(
					`[tool-parse] Partial JSON recovery (${partialJson.length} chars): ...${partialJson.slice(-80)}`,
				);
			}
			return (result ?? {}) as T;
		} catch {
			if (process.env.DEBUG) {
				console.error(
					`[tool-parse] Failed to parse tool args (${partialJson.length} chars): ...${partialJson.slice(-80)}`,
				);
			}
			return {} as T;
		}
	}
}
