/**
 * Session index — persistent metadata cache for fast session listing.
 *
 * Avoids reading all JSONL files (98MB+) just to list sessions.
 * On first use, builds the index by scanning files.
 * On subsequent uses, validates via stat() (14ms for 94 files) and only
 * re-reads files that changed (new mtime or size).
 *
 * Index stored as: ~/.pi/agent/sessions/index.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface IndexedSession {
	/** UUID */
	id: string;
	/** Working directory the session was started in */
	cwd: string;
	/** Session name (from /name command) */
	name?: string;
	/** ISO timestamp of creation */
	created: string;
	/** Epoch ms of last modification (file mtime) */
	modifiedMs: number;
	/** Total message count */
	messageCount: number;
	/** First user message text (preview) */
	firstMessage: string;
	/** Concatenated message text for search (truncated to 3000 chars) */
	allMessagesText: string;
	/** Parent session path (if forked) */
	parentSessionPath?: string;
	/** Full file path */
	filePath: string;
	/** File size in bytes */
	fileSize: number;
}

interface SessionIndexData {
	version: 2;
	/** Map of filePath → indexed session */
	sessions: Record<string, IndexedSession & { fileMtimeMs: number; fileSizeBytes: number }>;
}

const INDEX_VERSION = 2;

export class SessionIndex {
	private indexPath: string;
	private data: SessionIndexData | null = null;
	private dirty = false;

	constructor(sessionsDir: string) {
		this.indexPath = join(sessionsDir, "index.json");
	}

	/**
	 * List all sessions, using the index for speed.
	 * Returns sessions sorted by modified date (newest first).
	 */
	async listAll(sessionsDir: string, onProgress?: (loaded: number, total: number) => void): Promise<IndexedSession[]> {
		this.load();

		// Discover all JSONL files
		if (!existsSync(sessionsDir)) return [];

		const dirEntries = await readdir(sessionsDir, { withFileTypes: true });
		const dirs = dirEntries.filter((e) => e.isDirectory()).map((e) => join(sessionsDir, e.name));

		// Gather all session files with their stats
		const fileStats: { path: string; mtimeMs: number; size: number }[] = [];
		for (const dir of dirs) {
			try {
				const files = (await readdir(dir)).filter((f) => f.endsWith(".jsonl"));
				for (const f of files) {
					const filePath = join(dir, f);
					const s = await stat(filePath);
					fileStats.push({ path: filePath, mtimeMs: s.mtimeMs, size: s.size });
				}
			} catch {
				// Skip unreadable dirs
			}
		}

		const total = fileStats.length;

		// Determine which files need re-indexing
		const staleFiles: typeof fileStats = [];
		const validPaths = new Set<string>();

		for (const fs of fileStats) {
			validPaths.add(fs.path);
			const cached = this.data!.sessions[fs.path];
			if (!cached || cached.fileMtimeMs !== fs.mtimeMs || cached.fileSizeBytes !== fs.size) {
				staleFiles.push(fs);
			}
		}

		// Remove deleted files from index
		for (const path of Object.keys(this.data!.sessions)) {
			if (!validPaths.has(path)) {
				delete this.data!.sessions[path];
				this.dirty = true;
			}
		}

		// Re-index stale files
		if (staleFiles.length > 0) {
			let indexed = 0;
			await Promise.all(
				staleFiles.map(async (fs) => {
					const info = await this.indexFile(fs.path, fs.mtimeMs, fs.size);
					if (info) {
						this.data!.sessions[fs.path] = info;
					} else {
						delete this.data!.sessions[fs.path];
					}
					indexed++;
					onProgress?.(total - staleFiles.length + indexed, total);
				}),
			);
			this.dirty = true;
		}

		// Save if anything changed
		if (this.dirty) {
			this.save();
		}

		// Report progress for cached entries
		onProgress?.(total, total);

		// Collect and sort results
		const sessions: IndexedSession[] = Object.values(this.data!.sessions);
		sessions.sort((a, b) => b.modifiedMs - a.modifiedMs);
		return sessions;
	}

	/**
	 * List sessions for a specific directory.
	 */
	async listForDir(dir: string, onProgress?: (loaded: number, total: number) => void): Promise<IndexedSession[]> {
		this.load();

		if (!existsSync(dir)) return [];

		const files = (await readdir(dir)).filter((f) => f.endsWith(".jsonl"));
		const fileStats: { path: string; mtimeMs: number; size: number }[] = [];

		for (const f of files) {
			const filePath = join(dir, f);
			const s = await stat(filePath);
			fileStats.push({ path: filePath, mtimeMs: s.mtimeMs, size: s.size });
		}

		const total = fileStats.length;
		const staleFiles: typeof fileStats = [];

		for (const fs of fileStats) {
			const cached = this.data!.sessions[fs.path];
			if (!cached || cached.fileMtimeMs !== fs.mtimeMs || cached.fileSizeBytes !== fs.size) {
				staleFiles.push(fs);
			}
		}

		if (staleFiles.length > 0) {
			let indexed = 0;
			await Promise.all(
				staleFiles.map(async (fs) => {
					const info = await this.indexFile(fs.path, fs.mtimeMs, fs.size);
					if (info) {
						this.data!.sessions[fs.path] = info;
					}
					indexed++;
					onProgress?.(total - staleFiles.length + indexed, total);
				}),
			);
			this.dirty = true;
			this.save();
		}

		onProgress?.(total, total);

		const sessions: IndexedSession[] = [];
		for (const fs of fileStats) {
			const cached = this.data!.sessions[fs.path];
			if (cached) sessions.push(cached);
		}
		sessions.sort((a, b) => b.modifiedMs - a.modifiedMs);
		return sessions;
	}

	/**
	 * Update index entry for a specific session file (call after write).
	 */
	async update(filePath: string): Promise<void> {
		this.load();
		try {
			const s = await stat(filePath);
			const info = await this.indexFile(filePath, s.mtimeMs, s.size);
			if (info) {
				this.data!.sessions[filePath] = info;
			}
			this.dirty = true;
			this.save();
		} catch {
			// File may have been deleted
		}
	}

	/**
	 * Remove a session from the index.
	 */
	remove(filePath: string): void {
		this.load();
		if (this.data!.sessions[filePath]) {
			delete this.data!.sessions[filePath];
			this.dirty = true;
			this.save();
		}
	}

	/**
	 * Invalidate the entire index (forces rebuild on next list).
	 */
	invalidate(): void {
		this.data = { version: INDEX_VERSION, sessions: {} };
		this.dirty = true;
		this.save();
	}

	// ── Private ─────────────────────────────────────────────────────────────

	private load(): void {
		if (this.data) return;

		if (existsSync(this.indexPath)) {
			try {
				const raw = readFileSync(this.indexPath, "utf-8");
				const parsed = JSON.parse(raw);
				if (parsed.version === INDEX_VERSION) {
					this.data = parsed;
					return;
				}
			} catch {
				// Corrupt index, rebuild
			}
		}

		this.data = { version: INDEX_VERSION, sessions: {} };
		this.dirty = false;
	}

	private save(): void {
		if (!this.data || !this.dirty) return;
		try {
			const dir = dirname(this.indexPath);
			if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
			writeFileSync(this.indexPath, JSON.stringify(this.data), "utf-8");
			this.dirty = false;
		} catch (e: any) {
			console.error(`[session-index] Failed to save index: ${e.message}`);
		}
	}

	private async indexFile(
		filePath: string,
		mtimeMs: number,
		size: number,
	): Promise<(IndexedSession & { fileMtimeMs: number; fileSizeBytes: number }) | null> {
		try {
			const content = await readFile(filePath, "utf-8");
			const lines = content.trim().split("\n");
			if (lines.length === 0) return null;

			let header: any;
			try {
				header = JSON.parse(lines[0]);
			} catch {
				return null;
			}
			if (header.type !== "session") return null;

			let name: string | undefined;
			let messageCount = 0;
			let firstMessage = "";
			const allMessages: string[] = [];
			let allMessagesLen = 0;
			const MAX_ALL_MESSAGES = 3000;

			for (let i = 1; i < lines.length; i++) {
				if (!lines[i].trim()) continue;
				let entry: any;
				try {
					entry = JSON.parse(lines[i]);
				} catch {
					continue;
				}

				if (entry.type === "session_info" && entry.name !== undefined) {
					name = entry.name?.trim() || undefined;
				}

				if (entry.type === "message") {
					messageCount++;
					const msg = entry.message;
					if (msg?.role === "user" || msg?.role === "assistant") {
						const text = extractText(msg);
						if (text) {
							if (!firstMessage && msg.role === "user") {
								firstMessage = text.slice(0, 200);
							}
							if (allMessagesLen < MAX_ALL_MESSAGES) {
								const toAdd = text.slice(0, MAX_ALL_MESSAGES - allMessagesLen);
								allMessages.push(toAdd);
								allMessagesLen += toAdd.length;
							}
						}
					}
				}
			}

			// Extract CWD from directory name
			const parentDir = dirname(filePath).split("/").pop() || "";
			const cwd = parentDir.replace(/^--/, "/").replace(/--$/g, "").replace(/--/g, "/");

			return {
				id: header.id || "",
				cwd,
				name,
				created: header.timestamp || "",
				modifiedMs: mtimeMs,
				messageCount,
				firstMessage: firstMessage || "(no messages)",
				allMessagesText: allMessages.join(" "),
				parentSessionPath: header.parentSession,
				filePath,
				fileSize: size,
				fileMtimeMs: mtimeMs,
				fileSizeBytes: size,
			};
		} catch {
			return null;
		}
	}
}

function extractText(msg: any): string {
	if (typeof msg.content === "string") return msg.content;
	if (Array.isArray(msg.content)) {
		for (const part of msg.content) {
			if (part.type === "text" && part.text) return part.text;
		}
	}
	return "";
}
