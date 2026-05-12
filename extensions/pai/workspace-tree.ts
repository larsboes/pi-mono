/**
 * Workspace tree — injects project structure into system prompt via before_agent_start.
 * Moved from packages/coding-agent/src/core/workspace-tree.ts to keep packages/ clean for upstream merges.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import * as fs from "node:fs";
import * as path from "node:path";

export function registerWorkspaceTree(pi: ExtensionAPI): void {
	pi.on("before_agent_start", (event) => {
		const cwd = event.systemPromptOptions?.cwd;
		if (!cwd) return;
		const tree = buildWorkspaceTree(cwd);
		if (tree) {
			return { systemPrompt: event.systemPrompt + `\n\n<workspace-tree>\n${tree}\n</workspace-tree>` };
		}
	});
}

export interface WorkspaceTreeOptions {
	/** Maximum depth to traverse (default: 3) */
	maxDepth?: number;
	/** Maximum entries per directory (default: 15) */
	maxEntriesPerDir?: number;
	/** Maximum total lines in output (default: 80) */
	maxLines?: number;
	/** Directory names to skip (default: common build/dep dirs) */
	excludeDirs?: Set<string>;
}

const DEFAULT_EXCLUDE_DIRS = new Set([
	"node_modules",
	".git",
	".next",
	"dist",
	"build",
	"target",
	".venv",
	"__pycache__",
	".cache",
	".turbo",
	".parcel-cache",
	"coverage",
	".nyc_output",
	".tox",
	"vendor",
	".gradle",
	".idea",
	".vscode",
	"out",
	".output",
	".nuxt",
	".svelte-kit",
]);

const DEFAULT_OPTIONS: Required<WorkspaceTreeOptions> = {
	maxDepth: 3,
	maxEntriesPerDir: 15,
	maxLines: 80,
	excludeDirs: DEFAULT_EXCLUDE_DIRS,
};

interface TreeEntry {
	name: string;
	isDir: boolean;
}

/**
 * Build a workspace tree string for system prompt injection.
 * Returns null if the directory doesn't exist or is empty.
 */
export function buildWorkspaceTree(cwd: string, options?: WorkspaceTreeOptions): string | null {
	const opts = { ...DEFAULT_OPTIONS, ...options };

	if (!fs.existsSync(cwd)) return null;

	const lines: string[] = [];
	const rootName = path.basename(cwd) || cwd;
	lines.push(`${rootName}/`);

	buildTreeRecursive(cwd, "", 1, opts, lines);

	if (lines.length <= 1) return null; // Empty directory
	if (lines.length > opts.maxLines) {
		const truncated = lines.slice(0, opts.maxLines);
		truncated.push(`... (${lines.length - opts.maxLines} more entries)`);
		return truncated.join("\n");
	}

	return lines.join("\n");
}

function buildTreeRecursive(
	dirPath: string,
	prefix: string,
	depth: number,
	opts: Required<WorkspaceTreeOptions>,
	lines: string[],
): void {
	if (depth > opts.maxDepth) return;
	if (lines.length >= opts.maxLines) return;

	let entries: TreeEntry[];
	try {
		const dirents = fs.readdirSync(dirPath, { withFileTypes: true });
		entries = dirents
			.filter((d) => {
				// Skip hidden files at depth > 1
				if (d.name.startsWith(".") && depth > 1) return false;
				// Skip excluded directories
				if (d.isDirectory() && opts.excludeDirs.has(d.name)) return false;
				return true;
			})
			.map((d) => ({ name: d.name, isDir: d.isDirectory() || d.isSymbolicLink() }))
			.sort((a, b) => {
				// Directories first, then alphabetical
				if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
				return a.name.localeCompare(b.name);
			});
	} catch {
		return; // Permission denied or other error
	}

	const truncated = entries.length > opts.maxEntriesPerDir;
	const visible = truncated ? entries.slice(0, opts.maxEntriesPerDir) : entries;

	for (let i = 0; i < visible.length; i++) {
		if (lines.length >= opts.maxLines) return;

		const entry = visible[i];
		const isLast = i === visible.length - 1 && !truncated;
		const connector = isLast ? "└── " : "├── ";
		const childPrefix = isLast ? "    " : "│   ";

		const displayName = entry.isDir ? `${entry.name}/` : entry.name;
		lines.push(`${prefix}${connector}${displayName}`);

		if (entry.isDir) {
			buildTreeRecursive(path.join(dirPath, entry.name), prefix + childPrefix, depth + 1, opts, lines);
		}
	}

	if (truncated) {
		if (lines.length < opts.maxLines) {
			const remaining = entries.length - opts.maxEntriesPerDir;
			lines.push(`${prefix}└── ... (${remaining} more)`);
		}
	}
}
