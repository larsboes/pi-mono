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
			return (result ?? {}) as T;
		} catch (e) {
			// If all parsing fails, log in debug mode and return empty object
			if (process.env.DEBUG) {
				const preview = partialJson.length > 200 ? `${partialJson.slice(0, 200)}...` : partialJson;
				console.warn(
					`[json-parse] Failed to parse streaming JSON (${partialJson.length} chars): ${(e as Error).message}\n  Preview: ${preview}`,
				);
			}
			return {} as T;
		}
	}
}
