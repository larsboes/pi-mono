# outline — Tree-sitter Code Summarization

Tree-sitter powered code outline/summarization extension for pi.

## What it does

Registers an `outline` tool that shows structural elements of source files:
- Function/method **signatures** (no bodies)
- Class/struct/interface declarations with **member signatures**
- Type aliases, enums, traits, impls
- Imports (collapsed when >5)
- Top-level constants/variables with types

Output is **5-20x smaller** than reading the full file, optimized for LLM context.
Includes line numbers for `read --offset` navigation.

## Supported Languages

TypeScript, TSX, JavaScript, Python, Rust, Go, Java, C, C++, Ruby, PHP, C#, Kotlin, Swift, Scala, Lua, Bash, Elixir, Dart, Zig, OCaml, HTML, CSS, JSON, YAML, TOML, Vue.

## Usage

The model can call:
```
outline("path/to/file.ts")
```

Output example:
```
// typescript | 363 lines | 44 symbols

   1 // 17 imports (lines 1-17)

  25 export type ReadToolInput = Static<typeof readSchema>

  27 export interface ReadToolDetails (3 lines)
  28   truncation?: TruncationResult

  42 export interface ReadOperations (8 lines)
  44   readFile: (absolutePath: string) => Promise<Buffer>
  46   access: (absolutePath: string) => Promise<void>

 205 export function createReadToolDefinition(cwd: string, options?: ReadToolOptions) (154 lines)

 360 export function createReadTool(cwd: string, options?: ReadToolOptions) (3 lines)
```

## Architecture

- **Runtime**: `web-tree-sitter` 0.22.x (WASM-based, runs in Node/Bun)
- **Grammars**: Pre-built `.wasm` files from `tree-sitter-wasms` (loaded on demand per language)
- **Extractors**: Per-language AST walkers for TypeScript, Python, Rust, Go (generic fallback for others)
- **Caching**: Grammar WASM modules cached in memory after first load

## Compression Results

| File | Lines | Outline | Compression |
|------|-------|---------|-------------|
| types.ts (interfaces) | 1568 | 511 | 3.1x |
| session-manager.ts (impl) | 1461 | 201 | 7.3x |
| read.ts (mixed) | 363 | 48 | 7.6x |

## Dependencies

- `web-tree-sitter@0.22.6` — WASM tree-sitter runtime (~250KB)
- `tree-sitter-wasms@0.1.13` — Pre-built grammar .wasm files (~49MB in node_modules, loaded on demand)
