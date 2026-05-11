/**
 * /tools command — view and switch tool profiles
 *
 * Profiles:
 * - lean: 9 tools for smaller models (bash, read, write, edit, outline, web_search, memory_search, memory_store, todo)
 * - standard: 17 tools with web access + images (adds: fetch_content, code_search, generate_image, analyze_image, scratchpad, mcp, signal_loop_success, get_search_content)
 * - full: All tools including meta/orchestration (adds: crystallize_skill, create_extension, audit_skill, capabilities_query, converse, end_deliberation, recruit_specialist, send_to_session, list_sessions, grep, find, ls, search_tools)
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const VALID_PROFILES = ["lean", "standard", "full"] as const;

export default function (pi: ExtensionAPI) {
	pi.registerCommand("tools", {
		description: "View or switch tool profile (lean/standard/full)",
		async handler(args, ctx) {
			const trimmed = args?.trim().toLowerCase() ?? "";

			if (!trimmed) {
				const activeTools = pi.getActiveTools();
				const configPath = join(homedir(), ".pi", "agent", "config.yml");
				let currentProfile = "full";
				if (existsSync(configPath)) {
					const content = readFileSync(configPath, "utf-8");
					const match = content.match(/toolProfile:\s*(\S+)/);
					if (match) currentProfile = match[1];
				}
				ctx.ui.notify(
					`Profile: ${currentProfile} | Active tools: ${activeTools.length}\n` +
						`Tools: ${activeTools.join(", ")}\n\n` +
						`Profiles: lean (9), standard (17), full (30+)\n` +
						`Switch: /tools lean | /tools standard | /tools full`,
					"info",
				);
				return;
			}

			if (!VALID_PROFILES.includes(trimmed as any)) {
				ctx.ui.notify(`Unknown profile: "${trimmed}". Valid: lean, standard, full`, "warning");
				return;
			}

			// Write the setting directly to config
			const configPath = join(homedir(), ".pi", "agent", "config.yml");
			if (existsSync(configPath)) {
				let content = readFileSync(configPath, "utf-8");
				if (content.includes("toolProfile:")) {
					content = content.replace(/toolProfile:\s*\S+/, `toolProfile: ${trimmed}`);
				} else {
					content = `toolProfile: ${trimmed}\n${content}`;
				}
				writeFileSync(configPath, content);
				ctx.ui.notify(`Tool profile → ${trimmed}. Use /reload to apply.`, "info");
			} else {
				ctx.ui.notify(
					`Config not found. Create ~/.pi/agent/config.yml with:\ntoolProfile: ${trimmed}`,
					"warning",
				);
			}
		},
	});
}
