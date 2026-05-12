/**
 * buddy — Your pi companion
 *
 * A virtual buddy that lives in your pi sessions. Each user gets a unique
 * companion rolled from a random seed (species, rarity, stats, hat, eyes).
 * Ported from buddy-pick's generation system.
 *
 * Commands:
 *   /buddy           — Show your companion card
 *   /buddy rename    — Rename your companion
 *   /buddy reroll    — Get a new random companion
 *   /buddy gallery   — Browse all 18 species
 *   /buddy show      — Show widget above editor
 *   /buddy hide      — Hide widget
 *   /buddy toggle    — Toggle widget visibility
 *
 * Your buddy animates during turns and lives across sessions.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text, matchesKey } from "@mariozechner/pi-tui";
import {
	type BuddyData,
	type CompanionBones,
	loadBuddy,
	saveBuddy,
	rerollBuddy,
	rollCompanion,
	getDefaultName,
	SPECIES_EMOJI,
	RARITY_STARS,
} from "./companion.js";
import { renderCard, renderWidget, renderGallery } from "./display.js";

export default function buddy(pi: ExtensionAPI) {
	let data: BuddyData;
	let bones: CompanionBones;
	let frame = 0;
	let animationTimer: ReturnType<typeof setInterval> | null = null;

	function refresh() {
		bones = rollCompanion(data.seed);
	}

	function displayName(): string {
		return data.name ?? getDefaultName(bones.species);
	}

	// ── Widget & Status ──────────────────────────────────────────

	// Status removed — widget already shows buddy info, no need to duplicate in footer

	function updateWidget(ctx: { ui: { setWidget: (id: string, content: any, opts?: any) => void; theme: any } }) {
		if (!data.widgetVisible) {
			ctx.ui.setWidget("buddy", undefined);
			return;
		}
		const lines = renderWidget(ctx.ui.theme, bones, data.name, frame);
		ctx.ui.setWidget("buddy", lines, { placement: "aboveEditor" });
	}

	function startAnimation(ctx: any) {
		stopAnimation();
		animationTimer = setInterval(() => {
			frame = (frame + 1) % 3;
			updateWidget(ctx);
		}, 600);
	}

	function stopAnimation() {
		if (animationTimer) {
			clearInterval(animationTimer);
			animationTimer = null;
		}
		frame = 0;
	}

	// ── Lifecycle ────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		data = loadBuddy();
		refresh();
		updateWidget(ctx);
	});

	pi.on("turn_start", async (_event, ctx) => {
		startAnimation(ctx);
	});

	pi.on("turn_end", async (_event, ctx) => {
		stopAnimation();
		updateWidget(ctx);
	});

	pi.on("session_shutdown", async () => {
		stopAnimation();
	});

	// ── Command ──────────────────────────────────────────────────

	pi.registerCommand("buddy", {
		description: "Your pi companion — show card, rename, reroll, gallery, show/hide/toggle",
		handler: async (args, ctx) => {
			const sub = args?.trim().toLowerCase() ?? "";

			// /buddy rename <name>
			if (sub.startsWith("rename")) {
				const newName = args!.trim().slice(6).trim();
				if (newName) {
					data.name = newName;
					saveBuddy(data);
					refresh();
					updateWidget(ctx);
					ctx.ui.notify(`Renamed to ${newName}!`, "success");
					return;
				}
				// Interactive rename
				const input = await ctx.ui.input("New name:", displayName());
				if (input && input.trim()) {
					data.name = input.trim();
					saveBuddy(data);
					refresh();
					updateWidget(ctx);
					ctx.ui.notify(`Renamed to ${data.name}!`, "success");
				}
				return;
			}

			// /buddy reroll
			if (sub === "reroll") {
				const ok = await ctx.ui.confirm(
					"Reroll?",
					`Say goodbye to ${displayName()} the ${bones.species}?`,
				);
				if (!ok) return;
				data = rerollBuddy();
				refresh();
				updateWidget(ctx);
				const emoji = SPECIES_EMOJI[bones.species];
				const stars = RARITY_STARS[bones.rarity];
				ctx.ui.notify(`${emoji} New companion: ${displayName()} — ${stars} ${bones.rarity}!`, "info");
				return;
			}

			// /buddy gallery
			if (sub === "gallery") {
				const lines = renderGallery(ctx.ui.theme);
				await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
					const content = lines.join("\n") + "\n\n" + theme.fg("dim", "  Press Enter or Esc to close");
					const text = new Text(content, 1, 1);
					return {
						render: (width: number) => text.render(width),
						invalidate: () => text.invalidate(),
						handleInput: (data: string) => {
							if (matchesKey(data, "enter") || matchesKey(data, "escape")) {
								done();
							}
						},
					};
				});
				return;
			}

			// /buddy show
			if (sub === "show") {
				data.widgetVisible = true;
				saveBuddy(data);
				updateWidget(ctx);
				ctx.ui.notify("Buddy widget visible", "info");
				return;
			}

			// /buddy hide
			if (sub === "hide") {
				data.widgetVisible = false;
				saveBuddy(data);
				updateWidget(ctx);
				ctx.ui.notify("Buddy widget hidden", "info");
				return;
			}

			// /buddy toggle
			if (sub === "toggle") {
				data.widgetVisible = !data.widgetVisible;
				saveBuddy(data);
				updateWidget(ctx);
				ctx.ui.notify(data.widgetVisible ? "Buddy widget visible" : "Buddy widget hidden", "info");
				return;
			}

			// Default: show full card
			const cardLines = renderCard(ctx.ui.theme, bones, data.name, data.seed);
			await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
				const content = cardLines.join("\n") + "\n\n" + theme.fg("dim", "  Press Enter or Esc to close");
				const text = new Text(content, 1, 1);
				return {
					render: (width: number) => text.render(width),
					invalidate: () => text.invalidate(),
					handleInput: (data: string) => {
						if (matchesKey(data, "enter") || matchesKey(data, "escape")) {
							done();
						}
					},
				};
			});
		},
	});
}
