/**
 * Display rendering — companion card and compact formats for pi TUI.
 */

import {
	type CompanionBones,
	type Rarity,
	RARITY_STARS,
	STAT_NAMES,
	SPECIES_EMOJI,
	getDefaultName,
} from "./companion.js";
import { renderSprite } from "./sprites.js";

// ── Theme-aware rendering ────────────────────────────────────────

type ThemeFn = {
	fg: (color: string, text: string) => string;
	bold: (text: string) => string;
};

function statBar(theme: ThemeFn, value: number): string {
	const filled = Math.round(value / 10);
	const empty = 10 - filled;
	return theme.fg("success", "█".repeat(filled)) + theme.fg("dim", "░".repeat(empty));
}

function stripAnsi(s: string): string {
	return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function padRight(s: string, len: number): string {
	const visible = stripAnsi(s).length;
	return s + " ".repeat(Math.max(0, len - visible));
}

function centerIn(s: string, width: number): string {
	const visible = stripAnsi(s).length;
	const pad = Math.max(0, width - visible);
	const left = Math.floor(pad / 2);
	const right = pad - left;
	return " ".repeat(left) + s + " ".repeat(right);
}

function rarityColor(theme: ThemeFn, rarity: Rarity): (s: string) => string {
	switch (rarity) {
		case "common": return (s) => theme.fg("dim", s);
		case "uncommon": return (s) => theme.fg("success", s);
		case "rare": return (s) => theme.fg("accent", s);
		case "epic": return (s) => theme.fg("error", s);
		case "legendary": return (s) => theme.bold(theme.fg("warning", s));
	}
}

// ── Full Card ────────────────────────────────────────────────────

export function renderCard(
	theme: ThemeFn,
	companion: CompanionBones,
	name: string | null,
	seed: number,
): string[] {
	const color = rarityColor(theme, companion.rarity);
	const stars = RARITY_STARS[companion.rarity];
	const displayName = name ?? getDefaultName(companion.species);
	const width = 34;
	const hr = "─".repeat(width);
	const lines: string[] = [];

	lines.push(theme.fg("dim", `  ╭${hr}╮`));

	// Name + rarity
	const nameRarity = `${displayName} — ${stars} ${companion.rarity.toUpperCase()}`;
	lines.push(theme.fg("dim", "  │ ") + color(padRight(nameRarity, width - 1)) + theme.fg("dim", "│"));

	// Sprite
	const sprite = renderSprite(companion);
	for (const spriteLine of sprite) {
		lines.push(theme.fg("dim", "  │") + color(centerIn(spriteLine, width)) + theme.fg("dim", "│"));
	}

	// Shiny badge
	if (companion.shiny) {
		lines.push(
			theme.fg("dim", "  │ ") +
			padRight(theme.bold(theme.fg("warning", "✨ SHINY!")), width - 1) +
			theme.fg("dim", "│"),
		);
	}

	lines.push(theme.fg("dim", "  │") + " ".repeat(width) + theme.fg("dim", "│"));

	// Species / eye / hat
	const emoji = SPECIES_EMOJI[companion.species];
	lines.push(
		theme.fg("dim", "  │ ") +
		padRight(`${emoji} Species: ${companion.species}`, width - 1) +
		theme.fg("dim", "│"),
	);
	const eyeHat = `Eyes: ${companion.eye}   Hat: ${companion.hat}`;
	lines.push(
		theme.fg("dim", "  │ ") +
		padRight(eyeHat, width - 1) +
		theme.fg("dim", "│"),
	);

	lines.push(theme.fg("dim", "  │") + " ".repeat(width) + theme.fg("dim", "│"));

	// Stats
	for (const stat of STAT_NAMES) {
		const value = companion.stats[stat];
		const bar = statBar(theme, value);
		const label = stat.padEnd(10);
		const valStr = String(value).padStart(3);
		const statLine = `${label} ${bar}  ${valStr}`;
		lines.push(
			theme.fg("dim", "  │ ") +
			padRight(statLine, width - 1) +
			theme.fg("dim", "│"),
		);
	}

	lines.push(theme.fg("dim", "  │") + " ".repeat(width) + theme.fg("dim", "│"));

	// Seed
	lines.push(
		theme.fg("dim", "  │ ") +
		theme.fg("dim", padRight(`Seed: ${seed}`, width - 1)) +
		theme.fg("dim", "│"),
	);

	lines.push(theme.fg("dim", `  ╰${hr}╯`));

	return lines;
}

// ── Compact status line ──────────────────────────────────────────

export function renderStatus(
	theme: ThemeFn,
	companion: CompanionBones,
	name: string | null,
): string {
	const displayName = name ?? getDefaultName(companion.species);
	const emoji = SPECIES_EMOJI[companion.species];
	const stars = RARITY_STARS[companion.rarity];
	const color = rarityColor(theme, companion.rarity);
	const shiny = companion.shiny ? " ✨" : "";
	return `${emoji} ${theme.fg("dim", displayName)} ${color(stars)}${shiny}`;
}

// ── Widget sprite (compact, for above editor) ────────────────────

export function renderWidget(
	theme: ThemeFn,
	companion: CompanionBones,
	name: string | null,
	frame: number,
): string[] {
	const color = rarityColor(theme, companion.rarity);
	const sprite = renderSprite(companion, frame);
	const displayName = name ?? getDefaultName(companion.species);
	const emoji = SPECIES_EMOJI[companion.species];
	const stars = RARITY_STARS[companion.rarity];
	const shiny = companion.shiny ? " ✨" : "";

	const lines = sprite.map((l) => color(l));
	lines.push(theme.fg("dim", `  ${emoji} ${displayName} ${stars}${shiny}`));
	return lines;
}

// ── Gallery (all species) ────────────────────────────────────────

export function renderGallery(theme: ThemeFn): string[] {
	const defaultEye = "·";
	const cols = 3;
	const colWidth = 16;
	const lines: string[] = [];

	lines.push(theme.bold("  Species Gallery"));
	lines.push(theme.fg("dim", "  All 18 buddy species\n"));

	for (let i = 0; i < 18; i += cols) {
		const batch = ([
			"duck", "goose", "blob", "cat", "dragon", "octopus",
			"owl", "penguin", "turtle", "snail", "ghost", "axolotl",
			"capybara", "cactus", "robot", "rabbit", "mushroom", "chonk",
		] as const).slice(i, i + cols);

		const companions: CompanionBones[] = batch.map((species) => ({
			species,
			rarity: "common" as const,
			eye: defaultEye as any,
			hat: "none" as const,
			shiny: false,
			stats: { DEBUGGING: 0, PATIENCE: 0, CHAOS: 0, WISDOM: 0, SNARK: 0 },
		}));

		const sprites = companions.map((c) => renderSprite(c));
		const maxHeight = Math.max(...sprites.map((s) => s.length));
		const padded = sprites.map((s) => {
			while (s.length < maxHeight) s.push(" ".repeat(12));
			return s;
		});

		// Species names
		const nameRow = batch.map((s) => {
			const name = SPECIES_EMOJI[s] + " " + s.charAt(0).toUpperCase() + s.slice(1);
			return theme.bold(name.padEnd(colWidth));
		}).join("");
		lines.push(`  ${nameRow}`);

		// Sprites side by side
		for (let row = 0; row < maxHeight; row++) {
			const line = padded.map((s) => (s[row] ?? "").padEnd(colWidth)).join("");
			lines.push(`  ${line}`);
		}
		lines.push("");
	}

	// Eye styles
	lines.push(theme.bold("  Eye Styles"));
	lines.push(`  ${["·", "✦", "×", "◉", "@", "°"].map((e) => `  ${e}  `).join(theme.fg("dim", "│"))}\n`);

	// Hat types
	lines.push(theme.bold("  Hat Types"));
	lines.push(`  ${["crown", "tophat", "propeller", "halo", "wizard", "beanie", "tinyduck"].join(", ")}\n`);

	// Rarities
	lines.push(theme.bold("  Rarity Tiers"));
	for (const r of ["common", "uncommon", "rare", "epic", "legendary"] as const) {
		const color = rarityColor(theme, r);
		lines.push(`  ${color(`${RARITY_STARS[r]} ${r}`)}`);
	}
	lines.push("");

	return lines;
}
