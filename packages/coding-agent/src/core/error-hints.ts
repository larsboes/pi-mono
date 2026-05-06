/**
 * Error hints: maps common error messages to actionable remediation.
 *
 * Design principles (from pi_agent_rust):
 * - Hints must be stable and testable
 * - Prefer specific, actionable guidance over generic messages
 * - Never suggest destructive actions
 */

export interface ErrorHint {
	/** Brief explanation of the error category */
	summary: string;
	/** Actionable steps (0-3) */
	hints: string[];
}

interface HintPattern {
	test: RegExp;
	hint: ErrorHint;
}

const HINT_PATTERNS: HintPattern[] = [
	// Authentication / API Key errors
	{
		test: /api.?key|authentication|unauthorized|401|invalid.*key|ANTHROPIC_API_KEY|OPENAI_API_KEY/i,
		hint: {
			summary: "Authentication failed",
			hints: [
				"Check your API key is set: ANTHROPIC_API_KEY, OPENAI_API_KEY, or configured in ~/.pi/agent/settings.json",
				"Run /login to configure provider authentication",
			],
		},
	},
	{
		test: /permission.?denied|forbidden|403/i,
		hint: {
			summary: "Permission denied by provider",
			hints: [
				"Your API key may lack permissions for this model",
				"Check if you need to enable the model in your provider dashboard",
			],
		},
	},
	// Rate limiting
	{
		test: /rate.?limit|too many requests|429|quota.*exceeded/i,
		hint: {
			summary: "Rate limited by provider",
			hints: ["Wait a moment — auto-retry is handling this", "Consider switching to a different model with /model"],
		},
	},
	// Context overflow
	{
		test: /context.*length|token.*limit|maximum.*context|too.*long|context.*window|max_tokens/i,
		hint: {
			summary: "Context window exceeded",
			hints: ["Run /compact to reduce context size", "Start a /new session if the topic has changed"],
		},
	},
	// Network / Connection errors
	{
		test: /ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up|network|connection.*refused|fetch failed/i,
		hint: {
			summary: "Network connection failed",
			hints: [
				"Check your internet connection",
				"If using a proxy, verify HTTP_PROXY/HTTPS_PROXY environment variables",
			],
		},
	},
	{
		test: /ENOTFOUND|DNS|getaddrinfo/i,
		hint: {
			summary: "DNS resolution failed",
			hints: ["Check your internet connection and DNS settings", "Verify the provider URL is correct in settings"],
		},
	},
	// Provider overloaded
	{
		test: /overloaded|capacity|500|502|503|504|service.?unavailable|server.?error/i,
		hint: {
			summary: "Provider service unavailable",
			hints: [
				"The provider is temporarily overloaded — auto-retry will handle this",
				"Try a different model with /model",
			],
		},
	},
	// Model not found
	{
		test: /model.*not.*found|invalid.*model|unknown.*model|does not exist/i,
		hint: {
			summary: "Model not available",
			hints: [
				"Run /model to select from available models",
				"Check model ID in ~/.pi/agent/models.json or settings.json",
			],
		},
	},
	// Configuration errors
	{
		test: /settings\.json|config.*invalid|parse.*error.*settings|JSON.*parse/i,
		hint: {
			summary: "Configuration error",
			hints: [
				"Check ~/.pi/agent/settings.json for valid JSON syntax",
				"Run /settings to review and fix configuration",
			],
		},
	},
	// Extension errors
	{
		test: /extension.*failed|extension.*error|extension.*crash/i,
		hint: {
			summary: "Extension error",
			hints: ["Run /reload to restart extensions", "Check extension logs with /debug"],
		},
	},
	// MCP errors
	{
		test: /MCP.*error|MCP.*failed|MCP.*timeout|mcp.*connect/i,
		hint: {
			summary: "MCP server connection issue",
			hints: ["Check that the MCP server is running", "Verify MCP configuration in .pi/mcp.json or settings"],
		},
	},
	// File system errors
	{
		test: /ENOENT|no such file|file not found/i,
		hint: {
			summary: "File or directory not found",
			hints: ["Check the file path and current working directory"],
		},
	},
	{
		test: /EACCES|permission denied.*file|cannot write/i,
		hint: {
			summary: "File permission error",
			hints: ["Check file permissions", "You may need to run with appropriate access"],
		},
	},
	// Timeout
	{
		test: /timed?\s*out|timeout|deadline.*exceeded/i,
		hint: {
			summary: "Request timed out",
			hints: ["The model may be overloaded — try again", "Consider a faster model for this task"],
		},
	},
];

/**
 * Get actionable hints for an error message.
 * Returns null if no matching pattern found.
 */
export function getErrorHint(errorMessage: string): ErrorHint | null {
	for (const pattern of HINT_PATTERNS) {
		if (pattern.test.test(errorMessage)) {
			return pattern.hint;
		}
	}
	return null;
}

/**
 * Format an error message with hints appended.
 */
export function formatErrorWithHints(errorMessage: string): string {
	const hint = getErrorHint(errorMessage);
	if (!hint) return errorMessage;

	let result = errorMessage;
	if (hint.hints.length > 0) {
		result += "\n" + hint.hints.map((h) => `  → ${h}`).join("\n");
	}
	return result;
}
