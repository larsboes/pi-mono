/**
 * Tree-sitter WASM parser management.
 * Handles initialization, grammar loading, and caching.
 */

import Parser from "web-tree-sitter";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";

let parserReady: Promise<void> | null = null;
const languageCache = new Map<string, Parser.Language>();

// Map from pi's language identifiers to tree-sitter-wasms filenames
const GRAMMAR_MAP: Record<string, string> = {
	typescript: "tree-sitter-typescript.wasm",
	tsx: "tree-sitter-tsx.wasm",
	javascript: "tree-sitter-javascript.wasm",
	python: "tree-sitter-python.wasm",
	rust: "tree-sitter-rust.wasm",
	go: "tree-sitter-go.wasm",
	java: "tree-sitter-java.wasm",
	c: "tree-sitter-c.wasm",
	cpp: "tree-sitter-cpp.wasm",
	ruby: "tree-sitter-ruby.wasm",
	php: "tree-sitter-php.wasm",
	csharp: "tree-sitter-c_sharp.wasm",
	kotlin: "tree-sitter-kotlin.wasm",
	swift: "tree-sitter-swift.wasm",
	scala: "tree-sitter-scala.wasm",
	lua: "tree-sitter-lua.wasm",
	bash: "tree-sitter-bash.wasm",
	elixir: "tree-sitter-elixir.wasm",
	dart: "tree-sitter-dart.wasm",
	zig: "tree-sitter-zig.wasm",
	ocaml: "tree-sitter-ocaml.wasm",
	html: "tree-sitter-html.wasm",
	css: "tree-sitter-css.wasm",
	json: "tree-sitter-json.wasm",
	yaml: "tree-sitter-yaml.wasm",
	toml: "tree-sitter-toml.wasm",
	vue: "tree-sitter-vue.wasm",
};

// File extension to language
const EXT_TO_LANG: Record<string, string> = {
	ts: "typescript",
	tsx: "tsx",
	mts: "typescript",
	cts: "typescript",
	js: "javascript",
	jsx: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	py: "python",
	pyx: "python",
	rs: "rust",
	go: "go",
	java: "java",
	c: "c",
	h: "c",
	cpp: "cpp",
	cc: "cpp",
	cxx: "cpp",
	hpp: "cpp",
	hh: "cpp",
	rb: "ruby",
	php: "php",
	cs: "csharp",
	kt: "kotlin",
	kts: "kotlin",
	swift: "swift",
	scala: "scala",
	sc: "scala",
	lua: "lua",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	ex: "elixir",
	exs: "elixir",
	dart: "dart",
	zig: "zig",
	ml: "ocaml",
	mli: "ocaml",
	html: "html",
	htm: "html",
	css: "css",
	scss: "css",
	json: "json",
	yaml: "yaml",
	yml: "yaml",
	toml: "toml",
	vue: "vue",
};

function getWasmDir(): string {
	// Resolve path to tree-sitter-wasms/out/ directory
	const require = createRequire(import.meta.url);
	const wasmsPkg = require.resolve("tree-sitter-wasms/package.json");
	return resolve(dirname(wasmsPkg), "out");
}

async function ensureInit(): Promise<void> {
	if (!parserReady) {
		parserReady = Parser.init();
	}
	await parserReady;
}

function getWasmPath(language: string): string | null {
	const wasmFile = GRAMMAR_MAP[language];
	if (!wasmFile) return null;
	return resolve(getWasmDir(), wasmFile);
}

// Filenames without extensions
const FILENAME_TO_LANG: Record<string, string> = {
	".bashrc": "bash",
	".bash_profile": "bash",
	".zshrc": "bash",
	".profile": "bash",
	Makefile: "makefile",
	Dockerfile: "dockerfile",
	CMakeLists: "cmake",
	Jenkinsfile: "groovy",
};

export function detectLanguage(filePath: string): string | undefined {
	const basename = filePath.split("/").pop() || "";
	if (FILENAME_TO_LANG[basename]) return FILENAME_TO_LANG[basename];
	const ext = basename.split(".").pop()?.toLowerCase();
	if (!ext || ext === basename.toLowerCase()) return undefined;
	return EXT_TO_LANG[ext];
}

export function isSupported(language: string): boolean {
	return language in GRAMMAR_MAP;
}

export function supportedLanguages(): string[] {
	return Object.keys(GRAMMAR_MAP);
}

export async function loadLanguage(language: string): Promise<Parser.Language | null> {
	if (languageCache.has(language)) {
		return languageCache.get(language)!;
	}

	const wasmPath = getWasmPath(language);
	if (!wasmPath) return null;

	await ensureInit();

	try {
		const lang = await Parser.Language.load(wasmPath);
		languageCache.set(language, lang);
		return lang;
	} catch (e: any) {
		console.error(`[outline] Failed to load grammar for ${language}: ${e.message}`);
		return null;
	}
}

export async function parse(source: string, language: string): Promise<Parser.Tree | null> {
	const lang = await loadLanguage(language);
	if (!lang) return null;

	await ensureInit();
	const parser = new Parser();
	parser.setLanguage(lang);
	const tree = parser.parse(source);
	parser.delete();
	return tree;
}
