/**
 * PAI Voice — TTS notifications for Algorithm phase transitions.
 *
 * Mirrors the curl-based pattern in CC's PAI Algorithm v6.3.0:
 *   curl -s -X POST http://localhost:31337/notify ...
 *
 * Pi has no shell-curl-as-doctrine path; instead we register a `voice_notify`
 * tool the model can invoke at phase transitions, plus a session-start
 * announcement and a /voice slash command for ad-hoc messages.
 *
 * Voice is opt-in: if PAI_VOICE_ENABLED is not "true" or PAI_VOICE_ID is unset,
 * every entry point is a no-op (returns silently rather than erroring).
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { spawn } from "node:child_process";

const VOICE_ENABLED = process.env.PAI_VOICE_ENABLED === "true";
const VOICE_ENDPOINT = process.env.PAI_VOICE_ENDPOINT || "http://localhost:31337/notify";
const VOICE_ID = process.env.PAI_VOICE_ID || "";

function isVoiceConfigured(): boolean {
	return VOICE_ENABLED && VOICE_ID.length > 0;
}

/**
 * Fire-and-forget voice notification.
 * Detached + unref'd so a slow/missing voice server never blocks the agent.
 */
function notify(message: string): { ok: boolean; reason?: string } {
	if (!isVoiceConfigured()) {
		return { ok: false, reason: "voice disabled (PAI_VOICE_ENABLED!=true or PAI_VOICE_ID unset)" };
	}
	try {
		const body = JSON.stringify({
			message,
			voice_id: VOICE_ID,
			voice_enabled: true,
		});
		const child = spawn("curl", [
			"-s", "-X", "POST", VOICE_ENDPOINT,
			"-H", "Content-Type: application/json",
			"--connect-timeout", "1",
			"-m", "3",
			"-d", body,
		], { stdio: "ignore", detached: true });
		child.unref();
		return { ok: true };
	} catch (err) {
		return { ok: false, reason: `voice spawn failed: ${(err as Error).message}` };
	}
}

export function registerVoice(pi: ExtensionAPI) {
	pi.registerTool({
		name: "voice_notify",
		label: "Voice",
		description:
			"Speak a short text via the PAI TTS server. Used at PAI Algorithm phase transitions (\"Entering the Observe phase.\", etc.) and on Algorithm entry. No-op if voice is not configured.",
		parameters: Type.Object({
			message: Type.String({ description: "Text to speak. Keep under 60 chars for fast TTS." }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const result = notify(params.message);
			const text = result.ok
				? `Voice: "${params.message}"`
				: `Voice: skipped (${result.reason})`;
			return {
				content: [{ type: "text" as const, text }],
				details: { ok: result.ok, reason: result.reason },
			};
		},
		promptSnippet: "voice_notify - Speak short text via TTS for Algorithm phase transitions",
		promptGuidelines: [
			"Call at Algorithm entry (\"Entering the Algorithm\") and at every phase transition (\"Entering the {Phase} phase.\").",
			"Only the primary agent calls this — subagents skip voice.",
			"Returns silently if voice is not configured, so safe to call unconditionally at E2+.",
		],
	});

	pi.on("session_start", async (event) => {
		if (!isVoiceConfigured()) return;
		if (event.reason === "startup" || event.reason === "new") {
			notify("PAI online. Ready for work.");
		}
	});

	pi.registerCommand("voice", {
		description: "Send a voice notification (test or ad-hoc)",
		handler: async (args, ctx) => {
			if (!isVoiceConfigured()) {
				ctx.ui.notify(
					"Voice disabled. Set PAI_VOICE_ENABLED=true and PAI_VOICE_ID=<id> to enable.",
					"warning"
				);
				return;
			}
			const message = args?.trim() || "Hello from PAI";
			const result = notify(message);
			if (result.ok) {
				ctx.ui.notify(`Voice sent: "${message}"`, "info");
			} else {
				ctx.ui.notify(`Voice failed: ${result.reason}`, "warning");
			}
		},
	});
}
