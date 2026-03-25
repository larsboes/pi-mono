/**
 * PAI Statusline Extension for pi
 *
 * Part of the PAI (Personal AI) infrastructure — bridging pi's extension
 * system with PAI's shared data layer (~/.pai/). pi's clean extension API
 * makes it an ideal host for PAI integrations.
 *
 * Mirrors the Claude Code PAI HUD with pi-native data:
 * - Footer status: compact one-liner
 * - Widget below editor: full PAI dashboard
 *
 * Toggle widget with /pai command.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { VERSION } from "@mariozechner/pi-coding-agent";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

// ── State ────────────────────────────────────────────────────────────────────

let widgetEnabled = true;
let turnCount = 0;
let sessionStartTime = Date.now();

// ── Paths ────────────────────────────────────────────────────────────────────

const HOME = homedir();
const PAI_DIR = join(HOME, ".pai");
const CACHE_DIR = join(PAI_DIR, "data");
const LOCATION_CACHE = join(CACHE_DIR, "location-cache.json");
const WEATHER_CACHE = join(CACHE_DIR, "weather-cache.txt");
const CC_SETTINGS = join(HOME, ".claude", "settings.json");
const CC_MEMORY_DIR = join(HOME, ".claude", "MEMORY");
const LOCATION_TTL = 3600_000; // 1 hour
const WEATHER_TTL = 900_000; // 15 min

// ── Types ────────────────────────────────────────────────────────────────────

interface LocationData {
	city: string;
	regionName: string;
	lat: number;
	lon: number;
	ts: number;
}

let cachedLocation: LocationData | null = null;
let cachedWeather = "";

// ── Cache helpers ────────────────────────────────────────────────────────────

function ensureCacheDir() {
	try { mkdirSync(CACHE_DIR, { recursive: true }); } catch {}
}

function loadLocationCache(): LocationData | null {
	try {
		const data = JSON.parse(readFileSync(LOCATION_CACHE, "utf-8"));
		if (Date.now() - (data.ts || 0) < LOCATION_TTL) return data;
	} catch {}
	return null;
}

function loadWeatherCache(): string {
	try {
		if (!existsSync(WEATHER_CACHE)) return "";
		const st = statSync(WEATHER_CACHE);
		if (Date.now() - st.mtimeMs < WEATHER_TTL) {
			return readFileSync(WEATHER_CACHE, "utf-8").trim();
		}
	} catch {}
	return "";
}

async function refreshLocationAndWeather() {
	ensureCacheDir();

	// Location
	if (!cachedLocation || Date.now() - (cachedLocation.ts || 0) > LOCATION_TTL) {
		const loaded = loadLocationCache();
		if (loaded) {
			cachedLocation = loaded;
		} else {
			try {
				const raw = execSync(
					'curl -s --max-time 2 "http://ip-api.com/json/?fields=city,regionName,country,lat,lon"',
					{ encoding: "utf-8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"] }
				).trim();
				const data = JSON.parse(raw);
				if (data.city) {
					cachedLocation = { ...data, ts: Date.now() };
					writeFileSync(LOCATION_CACHE, JSON.stringify(cachedLocation));
				}
			} catch {}
		}
	}

	// Weather — use open-meteo API (more reliable than wttr.in)
	const weatherStale = !cachedWeather || !existsSync(WEATHER_CACHE) ||
		(Date.now() - statSync(WEATHER_CACHE).mtimeMs > WEATHER_TTL);

	if (weatherStale) {
		const loaded = loadWeatherCache();
		if (loaded) {
			cachedWeather = loaded;
		} else if (cachedLocation) {
			try {
				const raw = execSync(
					`curl -s --max-time 3 "https://api.open-meteo.com/v1/forecast?latitude=${cachedLocation.lat}&longitude=${cachedLocation.lon}&current=temperature_2m,weather_code&temperature_unit=celsius"`,
					{ encoding: "utf-8", timeout: 4000, stdio: ["pipe", "pipe", "pipe"] }
				).trim();
				const data = JSON.parse(raw);
				if (data.current) {
					const temp = data.current.temperature_2m;
					const code = data.current.weather_code;
					let condition = "Clear";
					if (code >= 95) condition = "Storm";
					else if (code >= 80) condition = "Showers";
					else if (code >= 71) condition = "Snow";
					else if (code >= 61) condition = "Rain";
					else if (code >= 51) condition = "Drizzle";
					else if (code >= 45) condition = "Foggy";
					else if (code >= 1) condition = "Cloudy";
					cachedWeather = `${temp}°C ${condition}`;
					writeFileSync(WEATHER_CACHE, cachedWeather);
				}
			} catch {}
		}
	}
}

// ── Color helpers (ANSI 24-bit) ──────────────────────────────────────────────

const rgb = (r: number, g: number, b: number, text: string) =>
	`\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;

const slate300 = (t: string) => rgb(203, 213, 225, t);
const slate400 = (t: string) => rgb(148, 163, 184, t);
const slate500 = (t: string) => rgb(100, 116, 139, t);
const slate600 = (t: string) => rgb(71, 85, 105, t);
const emerald = (t: string) => rgb(74, 222, 128, t);
const rose = (t: string) => rgb(251, 113, 133, t);
const amber = (t: string) => rgb(251, 191, 36, t);
const orange = (t: string) => rgb(251, 146, 60, t);
const skyBlue = (t: string) => rgb(56, 189, 248, t);
const lightBlue = (t: string) => rgb(147, 197, 253, t);
const violet = (t: string) => rgb(167, 139, 250, t);
const violetLight = (t: string) => rgb(196, 181, 253, t);
const cyan = (t: string) => rgb(34, 211, 238, t);
const teal = (t: string) => rgb(45, 212, 191, t);
const paiP = (t: string) => rgb(30, 58, 138, t);
const paiA = (t: string) => rgb(59, 130, 246, t);
const paiI = (t: string) => rgb(147, 197, 253, t);
const learnLabel = (t: string) => rgb(21, 128, 61, t);
const weatherBlue = (t: string) => rgb(135, 206, 235, t);
const sessionGray = (t: string) => rgb(120, 135, 160, t);

// Purple theme for memory
const learnWork = (t: string) => rgb(192, 132, 252, t);
const learnSignals = (t: string) => rgb(139, 92, 246, t);
const learnSessions = (t: string) => rgb(99, 102, 241, t);
const learnResearch = (t: string) => rgb(129, 140, 248, t);

// ── Data collectors ──────────────────────────────────────────────────────────

function countDir(dir: string): number {
	try {
		return readdirSync(dir).filter((f) => !f.startsWith(".")).length;
	} catch {
		return 0;
	}
}

function countFilesRecursive(dir: string, ext?: string): number {
	try {
		if (!existsSync(dir)) return 0;
		let count = 0;
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.name.startsWith(".")) continue;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) count += countFilesRecursive(full, ext);
			else if (!ext || entry.name.endsWith(ext)) count++;
		}
		return count;
	} catch {
		return 0;
	}
}

function getSkillsCount(): number {
	// Count from both PAI and pi skill dirs
	const pai = countDir(join(PAI_DIR, "skills"));
	const pi = countDir(join(HOME, ".pi", "skills"));
	return Math.max(pai, pi); // They overlap, take the higher
}

function getExtensionsCount(): number {
	return countDir(join(HOME, ".pi", "agent", "extensions"));
}

function getSourcesCount(): number {
	const conf = join(PAI_DIR, "sources.conf");
	try {
		return readFileSync(conf, "utf-8")
			.split("\n")
			.filter((l) => l.trim() && !l.trim().startsWith("#")).length;
	} catch {
		return 0;
	}
}

function getPaiVersion(): string {
	try {
		const settings = JSON.parse(readFileSync(CC_SETTINGS, "utf-8"));
		return settings?.pai?.version || "—";
	} catch {
		return "—";
	}
}

function getAlgoVersion(): string {
	try {
		const settings = JSON.parse(readFileSync(CC_SETTINGS, "utf-8"));
		return settings?.pai?.algorithmVersion || "—";
	} catch {
		return "—";
	}
}

function getHooksCount(): number {
	try {
		const settings = JSON.parse(readFileSync(CC_SETTINGS, "utf-8"));
		const hooks = settings?.hooks || {};
		let count = 0;
		for (const event of Object.values(hooks)) {
			if (Array.isArray(event)) count += event.length;
		}
		return count;
	} catch {
		return 0;
	}
}

function getMemoryCounts(): { work: number; ratings: number; sessions: number; research: number } {
	return {
		work: countDir(join(CC_MEMORY_DIR, "WORK")),
		ratings: (() => {
			try {
				const f = join(CC_MEMORY_DIR, "LEARNING", "SIGNALS", "ratings.jsonl");
				if (!existsSync(f)) return 0;
				return readFileSync(f, "utf-8").split("\n").filter(l => l.startsWith("{")).length;
			} catch { return 0; }
		})(),
		sessions: countDir(join(CC_MEMORY_DIR, "SESSIONS")),
		research: countDir(join(CC_MEMORY_DIR, "RESEARCH")),
	};
}

function getLearningData(): { avg15m: string; avg1h: string; avg1d: string; avg1w: string; avg1mo: string; total: number } | null {
	try {
		const f = join(CC_MEMORY_DIR, "LEARNING", "SIGNALS", "ratings.jsonl");
		if (!existsSync(f)) return null;
		const lines = readFileSync(f, "utf-8").split("\n").filter(l => l.startsWith("{"));
		if (lines.length === 0) return null;

		const now = Date.now() / 1000;
		const entries = lines.map(l => {
			try { const d = JSON.parse(l); return { rating: d.rating, ts: new Date(d.timestamp).getTime() / 1000 }; }
			catch { return null; }
		}).filter((e): e is { rating: number; ts: number } => e !== null && typeof e.rating === "number");

		if (entries.length === 0) return null;

		const avg = (items: { rating: number }[]) => {
			if (items.length === 0) return "—";
			const sum = items.reduce((a, b) => a + b.rating, 0);
			return (sum / items.length).toFixed(1);
		};

		return {
			avg15m: avg(entries.filter(e => now - e.ts < 900)),
			avg1h: avg(entries.filter(e => now - e.ts < 3600)),
			avg1d: avg(entries.filter(e => now - e.ts < 86400)),
			avg1w: avg(entries.filter(e => now - e.ts < 604800)),
			avg1mo: avg(entries.filter(e => now - e.ts < 2592000)),
			total: entries.length,
		};
	} catch {
		return null;
	}
}

interface GitInfo {
	branch: string;
	age: string;
	dirty: boolean;
	ahead: number;
	behind: number;
	stash: number;
}

function getGitInfo(cwd: string): GitInfo | null {
	try {
		const opts = { cwd, timeout: 2000, encoding: "utf-8" as const, stdio: ["pipe", "pipe", "pipe"] as any };
		const branch = execSync("git rev-parse --abbrev-ref HEAD", opts).trim();

		let age = "";
		try {
			const epoch = parseInt(execSync("git log -1 --format=%ct", opts).trim());
			const diff = Math.floor(Date.now() / 1000 - epoch);
			if (diff < 60) age = "now";
			else if (diff < 3600) age = `${Math.floor(diff / 60)}m`;
			else if (diff < 86400) age = `${Math.floor(diff / 3600)}h`;
			else age = `${Math.floor(diff / 86400)}d`;
		} catch {}

		let dirty = false;
		try {
			dirty = execSync("git status --porcelain", opts).trim().length > 0;
		} catch {}

		let ahead = 0, behind = 0;
		try {
			const ab = execSync("git rev-list --left-right --count HEAD...@{u}", opts).trim();
			const [a, b] = ab.split(/\s+/);
			ahead = parseInt(a) || 0;
			behind = parseInt(b) || 0;
		} catch {}

		let stash = 0;
		try {
			stash = execSync("git stash list", opts).trim().split("\n").filter(l => l).length;
		} catch {}

		return { branch, age, dirty, ahead, behind, stash };
	} catch {
		return null;
	}
}

function getSessionCost(ctx: ExtensionContext): { input: number; output: number; cost: number } {
	let input = 0, output = 0, cost = 0;
	for (const e of ctx.sessionManager.getBranch()) {
		if (e.type === "message" && e.message.role === "assistant") {
			const m = e.message as AssistantMessage;
			input += m.usage.input;
			output += m.usage.output;
			cost += m.usage.cost.total;
		}
	}
	return { input, output, cost };
}

function fmtTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

function fmtDuration(ms: number): string {
	const s = Math.floor(ms / 1000);
	if (s < 60) return `${s}s`;
	if (s < 3600) return `${Math.floor(s / 60)}m${s % 60}s`;
	return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
}

function ratingColor(val: string, text: string): string {
	if (val === "—") return slate400(text);
	const n = parseFloat(val);
	if (n >= 9) return rgb(74, 222, 128, text);
	if (n >= 8) return rgb(163, 230, 53, text);
	if (n >= 7) return rgb(250, 204, 21, text);
	if (n >= 6) return rgb(251, 191, 36, text);
	if (n >= 5) return rgb(251, 146, 60, text);
	if (n >= 4) return rgb(248, 113, 113, text);
	return rgb(239, 68, 68, text);
}

// ── Context bar renderer (⛁ buckets like CC) ────────────────────────────────

function contextBar(pct: number, width: number): string {
	const filled = Math.round((pct / 100) * width);
	let bar = "";
	for (let i = 0; i < width; i++) {
		if (i < filled) {
			const pos = i / width;
			let r: number, g: number, b: number;
			if (pos < 0.33) {
				const t = pos / 0.33;
				r = Math.round(74 + (250 - 74) * t);
				g = Math.round(222 + (204 - 222) * t);
				b = Math.round(128 + (21 - 128) * t);
			} else if (pos < 0.66) {
				const t = (pos - 0.33) / 0.33;
				r = Math.round(250 + (251 - 250) * t);
				g = Math.round(204 + (146 - 204) * t);
				b = Math.round(21 + (60 - 21) * t);
			} else {
				const t = (pos - 0.66) / 0.34;
				r = Math.round(251 + (239 - 251) * t);
				g = Math.round(146 + (68 - 146) * t);
				b = Math.round(60 + (68 - 60) * t);
			}
			bar += rgb(r, g, b, "⛁");
		} else {
			bar += rgb(75, 82, 95, "⛁");
		}
	}
	return bar;
}

function pctColor(pct: number, text: string): string {
	if (pct >= 80) return rose(text);
	if (pct >= 60) return orange(text);
	if (pct >= 40) return amber(text);
	return emerald(text);
}

const SEP = slate600("│");
const LINE = slate600("────────────────────────────────────────────────────────────────────────");

// ── Widget builder ───────────────────────────────────────────────────────────
// Pi hard-limits widgets to 10 lines (MAX_WIDGET_LINES in interactive-mode.ts).
// Layout: 9 lines (header + 3 info + separator + context + use + pwd + memory + learning)

function buildWidget(ctx: ExtensionContext): string[] {
	const lines: string[] = [];
	const paiBrand = `${paiP("P")}${paiA("A")}${paiI("I")}`;

	// Line 1: Header
	lines.push(
		`${slate600("── │")} ${paiBrand} ${paiA("STATUSLINE")} ${slate600("│ ──────────────────────────────────────────────────")}`
	);

	// Line 2: LOC + time + weather
	const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
	const city = cachedLocation?.city || "—";
	const region = cachedLocation?.regionName || "";
	const weather = cachedWeather || "";
	const locParts = [`${slate500("LOC:")} ${lightBlue(city)}${region ? `${slate600(",")} ${slate500(region)}` : ""}`];
	locParts.push(paiA(time));
	if (weather) locParts.push(weatherBlue(weather));
	lines.push(locParts.join(` ${SEP} `));

	// Line 3: ENV — versions + counts
	const skills = getSkillsCount();
	const exts = getExtensionsCount();
	const paiVersion = getPaiVersion();
	const algoVersion = getAlgoVersion();
	const hooks = getHooksCount();
	lines.push(
		`${slate400("ENV:")} ${slate400("pi:")} ${paiA(VERSION)} ${SEP} ${slate500("PAI:")}${paiA(paiVersion)} ${slate400("ALG:")}${paiA(algoVersion)} ${SEP} ${cyan("SK:")} ${slate300(`${skills}`)} ${SEP} ${teal("EXT:")} ${slate300(`${exts}`)} ${SEP} ${rgb(6, 182, 212, "Hooks:")} ${slate300(`${hooks}`)}`
	);

	// Line 4: Context bar
	const usage = ctx.getContextUsage();
	const pct = usage
		? Math.round(((usage.tokens ?? 0) / (ctx.model?.contextWindow || 200000)) * 100)
		: 0;
	const bar = contextBar(pct, 55);
	lines.push(`${skyBlue("◉")} ${skyBlue("CONTEXT:")} ${bar} ${pctColor(pct, `${pct}%`)}`);

	// Line 5: USE — tokens + duration + cost + turns
	const sessionStats = getSessionCost(ctx);
	const duration = fmtDuration(Date.now() - sessionStartTime);
	lines.push(
		`${amber("▰")} ${amber("USE:")} ${slate400("↑")}${slate300(fmtTokens(sessionStats.input))} ${slate400("↓")}${slate300(fmtTokens(sessionStats.output))} ${SEP} ${slate400("⏱")}${slate300(duration)} ${SEP} ${amber(`S:$${sessionStats.cost.toFixed(2)}`)} ${SEP} ${slate400(`T${turnCount}`)}`
	);

	// Line 6: PWD + Git (branch, age, stash, sync, dirty)
	const dirName = basename(ctx.cwd);
	const git = getGitInfo(ctx.cwd);
	let pwdLine = `${skyBlue("◈")} ${skyBlue("PWD:")} ${lightBlue(dirName)}`;
	if (git) {
		pwdLine += ` ${SEP} ${rgb(186, 230, 253, git.branch)}`;
		if (git.age) pwdLine += ` ${slate500(git.age)}`;
		if (git.dirty) pwdLine += ` ${amber("●")}`;
		if (git.stash > 0) pwdLine += ` ${rgb(165, 180, 252, `stash:${git.stash}`)}`;
		if (git.ahead > 0) pwdLine += ` ${emerald(`↑${git.ahead}`)}`;
		if (git.behind > 0) pwdLine += ` ${rose(`↓${git.behind}`)}`;
	}
	lines.push(pwdLine);

	// Line 7: MEMORY (from CC ~/.claude/MEMORY/)
	const mem = getMemoryCounts();
	lines.push(
		`${violetLight("◎")} ${violetLight("MEMORY:")} ${learnWork("📁")}${slate300(`${mem.work}`)} ${learnWork("Work")} ${SEP} ${learnSignals("✦")}${slate300(`${mem.ratings}`)} ${learnSignals("Ratings")} ${SEP} ${learnSessions("⊕")}${slate300(`${mem.sessions}`)} ${learnSessions("Sessions")} ${SEP} ${learnResearch("◇")}${slate300(`${mem.research}`)} ${learnResearch("Research")}`
	);

	// Line 8: LEARNING (rolling averages from CC ratings.jsonl)
	const learn = getLearningData();
	if (learn && learn.total > 0) {
		lines.push(
			`${learnLabel("✿")} ${learnLabel("LEARNING:")} ${SEP} ${ratingColor(learn.avg15m, `${learn.total}`)}${slate500("IMP")} ${SEP} ${slate400("15m:")} ${ratingColor(learn.avg15m, learn.avg15m)} ${slate400("60m:")} ${ratingColor(learn.avg1h, learn.avg1h)} ${slate400("1d:")} ${ratingColor(learn.avg1d, learn.avg1d)} ${slate400("1w:")} ${ratingColor(learn.avg1w, learn.avg1w)} ${slate400("1mo:")} ${ratingColor(learn.avg1mo, learn.avg1mo)}`
		);
	} else {
		lines.push(`${learnLabel("✿")} ${learnLabel("LEARNING:")} ${slate500("No ratings yet")}`);
	}

	return lines;
}

// ── Status line (footer) ─────────────────────────────────────────────────────

function buildStatus(ctx: ExtensionContext): string {
	const usage = ctx.getContextUsage();
	const pct = usage
		? Math.round(((usage.tokens ?? 0) / (ctx.model?.contextWindow || 200000)) * 100)
		: 0;
	const sessionStats = getSessionCost(ctx);
	const modelId = ctx.model?.id || "—";

	const paiBrand = `${paiP("P")}${paiA("A")}${paiI("I")}`;
	return `${paiBrand} ${pctColor(pct, `◉ ${pct}%`)} ${SEP} ${slate400(modelId)} ${SEP} ${amber(`$${sessionStats.cost.toFixed(3)}`)} ${SEP} ${slate400(`T${turnCount}`)}`;
}

// ── Refresh ──────────────────────────────────────────────────────────────────

function refresh(ctx: ExtensionContext) {
	if (!ctx.hasUI) return;

	ctx.ui.setStatus("pai", buildStatus(ctx));

	if (widgetEnabled) {
		ctx.ui.setWidget("pai-statusline", buildWidget(ctx), {
			placement: "belowEditor",
		});
	}
}

// ── Extension entry point ────────────────────────────────────────────────────

export default function paiStatusline(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		turnCount = 0;
		sessionStartTime = Date.now();
		// Fetch location/weather async (non-blocking)
		refreshLocationAndWeather().then(() => refresh(ctx)).catch(() => {});
		refresh(ctx);
	});

	pi.on("session_switch", async (_event, ctx) => {
		turnCount = 0;
		sessionStartTime = Date.now();
		refresh(ctx);
	});

	pi.on("turn_start", async (_event, ctx) => {
		turnCount++;
		refresh(ctx);
	});

	pi.on("turn_end", async (_event, ctx) => {
		refresh(ctx);
	});

	pi.on("agent_end", async (_event, ctx) => {
		refresh(ctx);
	});

	pi.on("model_select", async (_event, ctx) => {
		refresh(ctx);
	});

	pi.registerCommand("pai", {
		description: "Toggle PAI statusline widget",
		handler: async (_args, ctx) => {
			widgetEnabled = !widgetEnabled;
			if (widgetEnabled) {
				refresh(ctx);
				ctx.ui.notify("PAI statusline enabled", "info");
			} else {
				ctx.ui.setWidget("pai-statusline", undefined);
				ctx.ui.notify("PAI statusline hidden (footer status remains)", "info");
			}
		},
	});
}
