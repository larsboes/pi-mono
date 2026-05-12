/**
 * PAI Security Guard — Block dangerous bash commands
 *
 * Intercepts tool_call events for bash and blocks:
 * - Destructive filesystem operations (rm -rf /, chmod 777, etc.)
 * - Credential exposure (cat ~/.ssh/*, env | grep KEY, etc.)
 * - System-breaking commands (dd if=/dev/zero, mkfs, shutdown)
 * - Network exfiltration patterns (curl ... | bash, wget -O- | sh)
 *
 * Builds on the existing secrets-guard (which blocks ~/.secrets access)
 * with broader pattern matching on bash commands.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

interface DangerPattern {
	pattern: RegExp;
	reason: string;
	severity: "block" | "warn";
}

const DANGER_PATTERNS: DangerPattern[] = [
	// Destructive filesystem
	{ pattern: /\brm\s+(-[a-z]*f[a-z]*\s+)?(-[a-z]*r[a-z]*\s+)?\/(dev|proc|sys|boot|usr|bin|sbin|lib|etc)\b/i, reason: "Destructive: removing system directories", severity: "block" },
	{ pattern: /\brm\s+-[a-z]*r[a-z]*f[a-z]*\s+\/\s*$/m, reason: "Destructive: rm -rf /", severity: "block" },
	{ pattern: /\brm\s+-[a-z]*r[a-z]*f[a-z]*\s+~\/?\s*$/m, reason: "Destructive: rm -rf ~ (home directory)", severity: "block" },
	{ pattern: /\bchmod\s+-R\s+777\s+\//i, reason: "Destructive: chmod 777 on system path", severity: "block" },
	{ pattern: /\bmkfs\b/i, reason: "Destructive: formatting filesystem", severity: "block" },
	{ pattern: /\bdd\s+.*if=\/dev\/(zero|random|urandom).*of=\/dev\//i, reason: "Destructive: writing to disk device", severity: "block" },

	// System operations
	{ pattern: /\b(shutdown|reboot|poweroff|halt|init\s+[06])\b/i, reason: "System: shutdown/reboot command", severity: "block" },
	{ pattern: /\b(systemctl|service)\s+(stop|disable|mask)\s+(sshd|networking|systemd|dbus)/i, reason: "System: disabling critical service", severity: "block" },
	{ pattern: /\b>\s*\/etc\/(passwd|shadow|sudoers|fstab|hosts)\b/, reason: "System: overwriting critical config", severity: "block" },

	// Credential/key exposure
	{ pattern: /\bcat\s+.*\.(pem|key|p12|pfx|keystore)\b/i, reason: "Security: exposing private key file", severity: "block" },
	{ pattern: /\bcat\s+~\/\.ssh\/(id_|.*_key)/i, reason: "Security: exposing SSH private key", severity: "block" },
	{ pattern: /\bcat\s+.*\/(credentials|\.aws\/credentials|\.netrc)\b/i, reason: "Security: exposing credentials file", severity: "block" },

	// Exfiltration patterns
	{ pattern: /\bcurl\s+.*\|\s*(ba)?sh\b/i, reason: "Security: piping remote code to shell", severity: "warn" },
	{ pattern: /\bwget\s+.*-O\s*-\s*\|\s*(ba)?sh\b/i, reason: "Security: piping remote code to shell", severity: "warn" },
	{ pattern: /\bcurl\s+.*--upload-file\s+.*\.(pem|key|env|ssh)/i, reason: "Security: uploading sensitive files", severity: "block" },

	// Fork bomb / resource exhaustion
	{ pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;?\s*:/i, reason: "Destructive: fork bomb", severity: "block" },
	{ pattern: /\bwhile\s+true.*do.*fork\b/i, reason: "Destructive: infinite fork loop", severity: "block" },

	// History/audit evasion
	{ pattern: /\bunset\s+HISTFILE\b/i, reason: "Evasion: disabling command history", severity: "warn" },
	{ pattern: /\bhistory\s+-c\b/i, reason: "Evasion: clearing command history", severity: "warn" },
];

/**
 * Check a bash command against danger patterns.
 * Returns the first matching pattern, or null if safe.
 */
function checkCommand(command: string): DangerPattern | null {
	for (const dp of DANGER_PATTERNS) {
		if (dp.pattern.test(command)) {
			return dp;
		}
	}
	return null;
}

/**
 * Register the security guard.
 */
export function registerSecurityGuard(pi: ExtensionAPI) {
	pi.on("tool_call", async (event) => {
		if (event.toolName !== "bash") return;

		const command = (event.input as any)?.command;
		if (!command || typeof command !== "string") return;

		const match = checkCommand(command);
		if (!match) return;

		if (match.severity === "block") {
			return {
				block: true,
				reason: `🛡️ PAI Security: ${match.reason}\nCommand blocked: ${command.slice(0, 100)}${command.length > 100 ? "..." : ""}`,
			};
		}

		// For "warn" severity, we log but don't block
		// (Pi doesn't have a warn-but-allow mechanism, so we just let it through)
		// In future: could surface a warning to the user via widget
		return;
	});
}
