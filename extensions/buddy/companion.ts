/**
 * Companion system — types, PRNG, rolling, storage.
 * Ported from buddy-pick (github.com/Nailuu/buddy-pick) for pi.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomInt } from "node:crypto";

// ── Types ────────────────────────────────────────────────────────

export const SPECIES = [
	"duck", "goose", "blob", "cat", "dragon", "octopus",
	"owl", "penguin", "turtle", "snail", "ghost", "axolotl",
	"capybara", "cactus", "robot", "rabbit", "mushroom", "chonk",
] as const;
export type Species = (typeof SPECIES)[number];

export const EYES = ["·", "✦", "×", "◉", "@", "°"] as const;
export type Eye = (typeof EYES)[number];

export const HATS = ["none", "crown", "tophat", "propeller", "halo", "wizard", "beanie", "tinyduck"] as const;
export type Hat = (typeof HATS)[number];

export const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_WEIGHTS: Record<Rarity, number> = {
	common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1,
};

export const RARITY_FLOORS: Record<Rarity, number> = {
	common: 5, uncommon: 15, rare: 25, epic: 35, legendary: 50,
};

export const RARITY_STARS: Record<Rarity, string> = {
	common: "★", uncommon: "★★", rare: "★★★", epic: "★★★★", legendary: "★★★★★",
};

export const STAT_NAMES = ["DEBUGGING", "PATIENCE", "CHAOS", "WISDOM", "SNARK"] as const;
export type StatName = (typeof STAT_NAMES)[number];

export const SPECIES_EMOJI: Record<Species, string> = {
	duck: "🦆", goose: "🪿", blob: "🫠", cat: "🐱", dragon: "🐉", octopus: "🐙",
	owl: "🦉", penguin: "🐧", turtle: "🐢", snail: "🐌", ghost: "👻", axolotl: "🦎",
	capybara: "🦫", cactus: "🌵", robot: "🤖", rabbit: "🐰", mushroom: "🍄", chonk: "🐈",
};

export interface CompanionBones {
	rarity: Rarity;
	species: Species;
	eye: Eye;
	hat: Hat;
	shiny: boolean;
	stats: Record<StatName, number>;
}

export interface BuddyData {
	seed: number;
	name: string | null;
	widgetVisible: boolean;
	hatched: string;
}

// ── PRNG (Mulberry32) ────────────────────────────────────────────

export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// ── Rolling ──────────────────────────────────────────────────────

function pick<T>(rng: () => number, arr: readonly T[]): T {
	return arr[Math.floor(rng() * arr.length)]!;
}

function rollRarity(rng: () => number): Rarity {
	const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
	let roll = rng() * total;
	for (const rarity of RARITIES) {
		roll -= RARITY_WEIGHTS[rarity];
		if (roll < 0) return rarity;
	}
	return "common";
}

function rollStats(rng: () => number, rarity: Rarity): Record<StatName, number> {
	const floor = RARITY_FLOORS[rarity];
	const peak = pick(rng, STAT_NAMES);
	let dump = pick(rng, STAT_NAMES);
	while (dump === peak) dump = pick(rng, STAT_NAMES);

	const stats = {} as Record<StatName, number>;
	for (const name of STAT_NAMES) {
		if (name === peak) {
			stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30));
		} else if (name === dump) {
			stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15));
		} else {
			stats[name] = floor + Math.floor(rng() * 40);
		}
	}
	return stats;
}

export function rollCompanion(seed: number): CompanionBones {
	const rng = mulberry32(seed);
	const rarity = rollRarity(rng);
	return {
		rarity,
		species: pick(rng, SPECIES),
		eye: pick(rng, EYES),
		hat: rarity === "common" ? "none" : pick(rng, HATS),
		shiny: rng() < 0.01,
		stats: rollStats(rng, rarity),
	};
}

// ── Storage ──────────────────────────────────────────────────────

const BUDDY_FILE = join(homedir(), ".pi", "buddy.json");

export function loadBuddy(): BuddyData {
	if (existsSync(BUDDY_FILE)) {
		try {
			return JSON.parse(readFileSync(BUDDY_FILE, "utf-8"));
		} catch { /* fall through to create new */ }
	}
	return createBuddy();
}

export function saveBuddy(data: BuddyData): void {
	writeFileSync(BUDDY_FILE, JSON.stringify(data, null, 2) + "\n");
}

export function createBuddy(): BuddyData {
	const data: BuddyData = {
		seed: randomInt(0, 0xFFFFFFFF),
		name: null,
		widgetVisible: true,
		hatched: new Date().toISOString(),
	};
	saveBuddy(data);
	return data;
}

export function rerollBuddy(): BuddyData {
	const data: BuddyData = {
		seed: randomInt(0, 0xFFFFFFFF),
		name: null,
		widgetVisible: true,
		hatched: new Date().toISOString(),
	};
	saveBuddy(data);
	return data;
}

export function getDefaultName(species: Species): string {
	return species.charAt(0).toUpperCase() + species.slice(1);
}
