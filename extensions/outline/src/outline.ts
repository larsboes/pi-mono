/**
 * AST-based outline extraction.
 *
 * Walks the tree-sitter AST and extracts structural elements:
 * - Function/method signatures (no bodies)
 * - Class/struct/interface declarations with members
 * - Type aliases, enums
 * - Imports (collapsed)
 * - Constants/variables with type annotations
 *
 * Output is optimized for LLM consumption:
 * - Line numbers for `read --offset` navigation
 * - Indentation shows nesting
 * - Bodies replaced with `...`
 */

import type Parser from "web-tree-sitter";

export interface OutlineEntry {
	/** 1-indexed line number */
	line: number;
	/** End line (for size context) */
	endLine: number;
	/** Indentation depth */
	depth: number;
	/** The signature/declaration text (single or multi-line) */
	text: string;
	/** Entry kind for filtering */
	kind: "import" | "type" | "interface" | "class" | "function" | "method" | "field" | "enum" | "module" | "variable" | "trait" | "impl" | "struct" | "other";
}

export interface OutlineResult {
	entries: OutlineEntry[];
	language: string;
	totalLines: number;
}

// ── Language-Specific Extractors ────────────────────────────────────────────

type NodeExtractor = (node: Parser.SyntaxNode, source: string, depth: number) => OutlineEntry[];

// ── TypeScript / JavaScript ─────────────────────────────────────────────────

const TS_STRUCTURAL_TYPES = new Set([
	"import_statement",
	"export_statement",
	"function_declaration",
	"generator_function_declaration",
	"class_declaration",
	"abstract_class_declaration",
	"interface_declaration",
	"type_alias_declaration",
	"enum_declaration",
	"module", // namespace
	"lexical_declaration", // const/let at top level
	"variable_declaration",
]);

const TS_CLASS_MEMBER_TYPES = new Set([
	"method_definition",
	"abstract_method_definition",
	"public_field_definition",
	"property_declaration",
	"method_signature",
	"property_signature",
	"index_signature",
	"construct_signature",
	"call_signature",
]);

const TS_INTERFACE_MEMBER_TYPES = new Set([
	"method_signature",
	"property_signature",
	"index_signature",
	"construct_signature",
	"call_signature",
]);

function getNodeText(node: Parser.SyntaxNode, source: string): string {
	return source.slice(node.startIndex, node.endIndex);
}

function getSignatureLine(node: Parser.SyntaxNode, source: string): string {
	// Get the text up to the opening brace (body start)
	const text = getNodeText(node, source);
	const braceIdx = text.indexOf("{");
	if (braceIdx === -1) return text.split("\n")[0];
	const sig = text.slice(0, braceIdx).trimEnd();
	return sig || text.split("\n")[0];
}

function extractFunctionSignature(node: Parser.SyntaxNode, source: string): string {
	// For functions/methods: everything before the body block
	const body = node.childForFieldName("body");
	if (body) {
		const beforeBody = source.slice(node.startIndex, body.startIndex).trimEnd();
		// Clean up: remove trailing newlines, keep signature compact
		return beforeBody.replace(/\n\s*/g, " ").trim();
	}
	// No body (abstract, interface method, etc.)
	return getNodeText(node, source).replace(/\n\s*/g, " ").trim();
}

function extractClassHeader(node: Parser.SyntaxNode, source: string): string {
	// Get "class Foo extends Bar implements Baz {"
	const body = node.childForFieldName("body");
	if (body) {
		return source.slice(node.startIndex, body.startIndex).trimEnd().replace(/\n\s*/g, " ").trim();
	}
	return getNodeText(node, source).split("\n")[0];
}

function extractTypeSignature(node: Parser.SyntaxNode, source: string): string {
	const text = getNodeText(node, source);
	// For short types (single line), keep full text
	if (!text.includes("\n")) return text;
	// For multi-line types, show first line + hint
	const lines = text.split("\n");
	if (lines.length <= 4) return text;
	return lines[0] + "\n  ...";
}

function tsExtractor(node: Parser.SyntaxNode, source: string, depth: number): OutlineEntry[] {
	const entries: OutlineEntry[] = [];

	function walk(n: Parser.SyntaxNode, d: number, insideExport: boolean) {
		const type = n.type;

		// Handle export_statement: extract the declaration inside
		if (type === "export_statement") {
			const declaration = n.childForFieldName("declaration");
			if (declaration) {
				walk(declaration, d, true);
			} else {
				// export { ... } or export default ...
				const text = getNodeText(n, source).replace(/\n\s*/g, " ").trim();
				if (text.length < 200) {
					entries.push({
						line: n.startPosition.row + 1,
						endLine: n.endPosition.row + 1,
						depth: d,
						text,
						kind: "other",
					});
				}
			}
			return;
		}

		// Imports: collapse
		if (type === "import_statement") {
			const text = getNodeText(n, source).replace(/\n\s*/g, " ").trim();
			entries.push({
				line: n.startPosition.row + 1,
				endLine: n.endPosition.row + 1,
				depth: d,
				text,
				kind: "import",
			});
			return;
		}

		// Function declarations
		if (type === "function_declaration" || type === "generator_function_declaration") {
			const prefix = insideExport ? "export " : "";
			const sig = extractFunctionSignature(n, source);
			entries.push({
				line: n.startPosition.row + 1,
				endLine: n.endPosition.row + 1,
				depth: d,
				text: prefix + sig,
				kind: "function",
			});
			return;
		}

		// Class declarations
		if (type === "class_declaration" || type === "abstract_class_declaration") {
			const prefix = insideExport ? "export " : "";
			const header = extractClassHeader(n, source);
			entries.push({
				line: n.startPosition.row + 1,
				endLine: n.endPosition.row + 1,
				depth: d,
				text: prefix + header,
				kind: "class",
			});
			// Extract members
			const body = n.childForFieldName("body");
			if (body) {
				for (const child of body.namedChildren) {
					if (TS_CLASS_MEMBER_TYPES.has(child.type)) {
						const memberSig = extractFunctionSignature(child, source);
						const memberKind = child.type.includes("method") ? "method" : "field";
						entries.push({
							line: child.startPosition.row + 1,
							endLine: child.endPosition.row + 1,
							depth: d + 1,
							text: memberSig,
							kind: memberKind,
						});
					}
				}
			}
			return;
		}

		// Interface declarations
		if (type === "interface_declaration") {
			const prefix = insideExport ? "export " : "";
			const header = extractClassHeader(n, source);
			entries.push({
				line: n.startPosition.row + 1,
				endLine: n.endPosition.row + 1,
				depth: d,
				text: prefix + header,
				kind: "interface",
			});
			// Extract members
			const body = n.childForFieldName("body");
			if (body) {
				for (const child of body.namedChildren) {
					if (TS_INTERFACE_MEMBER_TYPES.has(child.type)) {
						const memberText = getNodeText(child, source).replace(/\n\s*/g, " ").trim();
						entries.push({
							line: child.startPosition.row + 1,
							endLine: child.endPosition.row + 1,
							depth: d + 1,
							text: memberText,
							kind: "field",
						});
					}
				}
			}
			return;
		}

		// Type aliases
		if (type === "type_alias_declaration") {
			const prefix = insideExport ? "export " : "";
			const text = extractTypeSignature(n, source);
			entries.push({
				line: n.startPosition.row + 1,
				endLine: n.endPosition.row + 1,
				depth: d,
				text: prefix + text,
				kind: "type",
			});
			return;
		}

		// Enum declarations
		if (type === "enum_declaration") {
			const prefix = insideExport ? "export " : "";
			const header = getNodeText(n, source).split("{")[0].trim();
			entries.push({
				line: n.startPosition.row + 1,
				endLine: n.endPosition.row + 1,
				depth: d,
				text: prefix + header + " { ... }",
				kind: "enum",
			});
			return;
		}

		// Top-level variable/const declarations (only if they look significant)
		if ((type === "lexical_declaration" || type === "variable_declaration") && d === 0) {
			const text = getNodeText(n, source);
			const firstLine = text.split("\n")[0];
			// Only include if it has a type annotation or is an arrow function or is short
			if (
				firstLine.includes(":") ||
				text.includes("=>") ||
				text.includes("function") ||
				n.endPosition.row - n.startPosition.row === 0
			) {
				const prefix = insideExport ? "export " : "";
				// For arrow functions, show signature
				if (text.includes("=>") || text.includes("function")) {
					const sig = getSignatureLine(n, source);
					entries.push({
						line: n.startPosition.row + 1,
						endLine: n.endPosition.row + 1,
						depth: d,
						text: prefix + sig.replace(/\n\s*/g, " ").trim(),
						kind: "function",
					});
				} else {
					entries.push({
						line: n.startPosition.row + 1,
						endLine: n.endPosition.row + 1,
						depth: d,
						text: prefix + firstLine.trim(),
						kind: "variable",
					});
				}
			}
			return;
		}

		// Namespace/module blocks
		if (type === "module") {
			const prefix = insideExport ? "export " : "";
			const name = n.childForFieldName("name");
			const nameText = name ? getNodeText(name, source) : "?";
			entries.push({
				line: n.startPosition.row + 1,
				endLine: n.endPosition.row + 1,
				depth: d,
				text: `${prefix}namespace ${nameText}`,
				kind: "module",
			});
			// Recurse into module body
			const body = n.childForFieldName("body");
			if (body) {
				for (const child of body.namedChildren) {
					walk(child, d + 1, false);
				}
			}
			return;
		}
	}

	// Walk top-level statements
	for (const child of node.namedChildren) {
		walk(child, depth, false);
	}

	return entries;
}

// ── Python ──────────────────────────────────────────────────────────────────

function pythonExtractor(node: Parser.SyntaxNode, source: string, depth: number): OutlineEntry[] {
	const entries: OutlineEntry[] = [];

	function walk(n: Parser.SyntaxNode, d: number) {
		const type = n.type;

		if (type === "import_statement" || type === "import_from_statement") {
			entries.push({
				line: n.startPosition.row + 1,
				endLine: n.endPosition.row + 1,
				depth: d,
				text: getNodeText(n, source).replace(/\n\s*/g, " ").trim(),
				kind: "import",
			});
			return;
		}

		if (type === "decorated_definition") {
			const definition = n.namedChildren.find(
				(c) => c.type === "function_definition" || c.type === "class_definition",
			);
			if (definition) {
				const decorators = n.namedChildren.filter((c) => c.type === "decorator");
				const decoText = decorators.map((dec) => getNodeText(dec, source).trim()).join("\n");
				extractPythonDef(definition, source, d, decoText);
			}
			return;
		}

		if (type === "function_definition" || type === "class_definition") {
			extractPythonDef(n, source, d, "");
			return;
		}

		// Top-level assignments with type annotations
		if (type === "expression_statement" && d === 0) {
			const child = n.namedChildren[0];
			if (child?.type === "assignment" || child?.type === "type_aliased_assignment") {
				const text = getNodeText(n, source).split("\n")[0].trim();
				if (text.includes(":") && text.length < 200) {
					entries.push({
						line: n.startPosition.row + 1,
						endLine: n.endPosition.row + 1,
						depth: d,
						text,
						kind: "variable",
					});
				}
			}
		}
	}

	function extractPythonDef(n: Parser.SyntaxNode, source: string, d: number, decorators: string): void {
		const type = n.type;

		if (type === "function_definition") {
			const name = n.childForFieldName("name");
			const params = n.childForFieldName("parameters");
			const returnType = n.childForFieldName("return_type");
			let sig = "def " + (name ? getNodeText(name, source) : "?");
			sig += params ? getNodeText(params, source) : "()";
			if (returnType) sig += " -> " + getNodeText(returnType, source);
			sig += ":";
			const fullText = decorators ? decorators + "\n" + sig : sig;
			entries.push({
				line: n.startPosition.row + 1,
				endLine: n.endPosition.row + 1,
				depth: d,
				text: fullText,
				kind: d > 0 ? "method" : "function",
			});
		}

		if (type === "class_definition") {
			const name = n.childForFieldName("name");
			const superclasses = n.childForFieldName("superclasses");
			let header = "class " + (name ? getNodeText(name, source) : "?");
			if (superclasses) header += getNodeText(superclasses, source);
			header += ":";
			const fullText = decorators ? decorators + "\n" + header : header;
			entries.push({
				line: n.startPosition.row + 1,
				endLine: n.endPosition.row + 1,
				depth: d,
				text: fullText,
				kind: "class",
			});
			// Extract class members
			const body = n.childForFieldName("body");
			if (body) {
				for (const child of body.namedChildren) {
					if (child.type === "function_definition") {
						extractPythonDef(child, source, d + 1, "");
					} else if (child.type === "decorated_definition") {
						const def = child.namedChildren.find(
							(c) => c.type === "function_definition" || c.type === "class_definition",
						);
						if (def) {
							const decos = child.namedChildren.filter((c) => c.type === "decorator");
							const decoText = decos.map((dec) => getNodeText(dec, source).trim()).join("\n");
							extractPythonDef(def, source, d + 1, decoText);
						}
					} else if (child.type === "expression_statement") {
						const firstChild = child.namedChildren[0];
						if (firstChild?.type === "assignment") {
							const text = getNodeText(child, source).split("\n")[0].trim();
							if (text.includes(":") && text.length < 200) {
								entries.push({
									line: child.startPosition.row + 1,
									endLine: child.endPosition.row + 1,
									depth: d + 1,
									text,
									kind: "field",
								});
							}
						}
					}
				}
			}
		}
	}

	for (const child of node.namedChildren) {
		walk(child, depth);
	}
	return entries;
}

// ── Rust ────────────────────────────────────────────────────────────────────

function rustExtractor(node: Parser.SyntaxNode, source: string, depth: number): OutlineEntry[] {
	const entries: OutlineEntry[] = [];

	function walk(n: Parser.SyntaxNode, d: number) {
		const type = n.type;

		if (type === "use_declaration") {
			entries.push({
				line: n.startPosition.row + 1,
				endLine: n.endPosition.row + 1,
				depth: d,
				text: getNodeText(n, source).replace(/\n\s*/g, " ").trim(),
				kind: "import",
			});
			return;
		}

		if (type === "function_item") {
			const sig = extractFunctionSignature(n, source);
			entries.push({
				line: n.startPosition.row + 1,
				endLine: n.endPosition.row + 1,
				depth: d,
				text: sig,
				kind: d > 0 ? "method" : "function",
			});
			return;
		}

		if (type === "struct_item") {
			const header = getSignatureLine(n, source);
			entries.push({
				line: n.startPosition.row + 1,
				endLine: n.endPosition.row + 1,
				depth: d,
				text: header + " { ... }",
				kind: "struct",
			});
			// Extract fields
			const body = n.namedChildren.find((c) => c.type === "field_declaration_list");
			if (body) {
				for (const field of body.namedChildren) {
					if (field.type === "field_declaration") {
						entries.push({
							line: field.startPosition.row + 1,
							endLine: field.endPosition.row + 1,
							depth: d + 1,
							text: getNodeText(field, source).trim(),
							kind: "field",
						});
					}
				}
			}
			return;
		}

		if (type === "enum_item") {
			const name = n.childForFieldName("name");
			entries.push({
				line: n.startPosition.row + 1,
				endLine: n.endPosition.row + 1,
				depth: d,
				text: `enum ${name ? getNodeText(name, source) : "?"} { ... }`,
				kind: "enum",
			});
			return;
		}

		if (type === "trait_item") {
			const name = n.childForFieldName("name");
			entries.push({
				line: n.startPosition.row + 1,
				endLine: n.endPosition.row + 1,
				depth: d,
				text: `trait ${name ? getNodeText(name, source) : "?"}`,
				kind: "trait",
			});
			// Extract trait methods
			const body = n.childForFieldName("body");
			if (body) {
				for (const child of body.namedChildren) {
					if (child.type === "function_item" || child.type === "function_signature_item") {
						const sig = extractFunctionSignature(child, source);
						entries.push({
							line: child.startPosition.row + 1,
							endLine: child.endPosition.row + 1,
							depth: d + 1,
							text: sig,
							kind: "method",
						});
					}
				}
			}
			return;
		}

		if (type === "impl_item") {
			// Get "impl Foo" or "impl Trait for Foo"
			const text = getNodeText(n, source);
			const braceIdx = text.indexOf("{");
			const header = braceIdx > 0 ? text.slice(0, braceIdx).trim() : text.split("\n")[0].trim();
			entries.push({
				line: n.startPosition.row + 1,
				endLine: n.endPosition.row + 1,
				depth: d,
				text: header,
				kind: "impl",
			});
			// Extract impl methods
			const body = n.childForFieldName("body");
			if (body) {
				for (const child of body.namedChildren) {
					if (child.type === "function_item") {
						walk(child, d + 1);
					}
				}
			}
			return;
		}

		if (type === "type_item") {
			entries.push({
				line: n.startPosition.row + 1,
				endLine: n.endPosition.row + 1,
				depth: d,
				text: getNodeText(n, source).replace(/\n\s*/g, " ").trim(),
				kind: "type",
			});
			return;
		}

		if (type === "mod_item") {
			const name = n.childForFieldName("name");
			entries.push({
				line: n.startPosition.row + 1,
				endLine: n.endPosition.row + 1,
				depth: d,
				text: `mod ${name ? getNodeText(name, source) : "?"}`,
				kind: "module",
			});
			const body = n.childForFieldName("body");
			if (body) {
				for (const child of body.namedChildren) {
					walk(child, d + 1);
				}
			}
			return;
		}

		if (type === "const_item" || type === "static_item") {
			entries.push({
				line: n.startPosition.row + 1,
				endLine: n.endPosition.row + 1,
				depth: d,
				text: getNodeText(n, source).split("\n")[0].trim(),
				kind: "variable",
			});
			return;
		}
	}

	for (const child of node.namedChildren) {
		walk(child, depth);
	}
	return entries;
}

// ── Go ──────────────────────────────────────────────────────────────────────

function goExtractor(node: Parser.SyntaxNode, source: string, depth: number): OutlineEntry[] {
	const entries: OutlineEntry[] = [];

	function walk(n: Parser.SyntaxNode, d: number) {
		const type = n.type;

		if (type === "import_declaration") {
			entries.push({
				line: n.startPosition.row + 1,
				endLine: n.endPosition.row + 1,
				depth: d,
				text: getNodeText(n, source).replace(/\n\s+/g, "\n  ").trim(),
				kind: "import",
			});
			return;
		}

		if (type === "function_declaration") {
			const sig = extractFunctionSignature(n, source);
			entries.push({
				line: n.startPosition.row + 1,
				endLine: n.endPosition.row + 1,
				depth: d,
				text: sig,
				kind: "function",
			});
			return;
		}

		if (type === "method_declaration") {
			const sig = extractFunctionSignature(n, source);
			entries.push({
				line: n.startPosition.row + 1,
				endLine: n.endPosition.row + 1,
				depth: d,
				text: sig,
				kind: "method",
			});
			return;
		}

		if (type === "type_declaration") {
			// Can contain multiple type_spec
			for (const child of n.namedChildren) {
				if (child.type === "type_spec") {
					const name = child.childForFieldName("name");
					const typeNode = child.childForFieldName("type");
					if (typeNode?.type === "struct_type") {
						entries.push({
							line: child.startPosition.row + 1,
							endLine: child.endPosition.row + 1,
							depth: d,
							text: `type ${name ? getNodeText(name, source) : "?"} struct`,
							kind: "struct",
						});
						// Extract fields
						const fieldList = typeNode.namedChildren.find((c) => c.type === "field_declaration_list");
						if (fieldList) {
							for (const field of fieldList.namedChildren) {
								if (field.type === "field_declaration") {
									entries.push({
										line: field.startPosition.row + 1,
										endLine: field.endPosition.row + 1,
										depth: d + 1,
										text: getNodeText(field, source).trim(),
										kind: "field",
									});
								}
							}
						}
					} else if (typeNode?.type === "interface_type") {
						entries.push({
							line: child.startPosition.row + 1,
							endLine: child.endPosition.row + 1,
							depth: d,
							text: `type ${name ? getNodeText(name, source) : "?"} interface`,
							kind: "interface",
						});
						// Extract interface methods
						for (const method of typeNode.namedChildren) {
							if (method.type === "method_spec" || method.type === "method_elem") {
								entries.push({
									line: method.startPosition.row + 1,
									endLine: method.endPosition.row + 1,
									depth: d + 1,
									text: getNodeText(method, source).trim(),
									kind: "method",
								});
							}
						}
					} else {
						// Other type aliases
						const text = getNodeText(child, source).replace(/\n\s*/g, " ").trim();
						entries.push({
							line: child.startPosition.row + 1,
							endLine: child.endPosition.row + 1,
							depth: d,
							text: `type ${text}`,
							kind: "type",
						});
					}
				}
			}
			return;
		}

		if (type === "const_declaration" || type === "var_declaration") {
			const keyword = type === "const_declaration" ? "const" : "var";
			const specs = n.namedChildren.filter((c) => c.type === "const_spec" || c.type === "var_spec");
			if (specs.length === 1) {
				entries.push({
					line: n.startPosition.row + 1,
					endLine: n.endPosition.row + 1,
					depth: d,
					text: `${keyword} ${getNodeText(specs[0], source).split("\n")[0].trim()}`,
					kind: "variable",
				});
			} else if (specs.length > 1) {
				entries.push({
					line: n.startPosition.row + 1,
					endLine: n.endPosition.row + 1,
					depth: d,
					text: `${keyword} (${specs.length} declarations)`,
					kind: "variable",
				});
			}
			return;
		}
	}

	for (const child of node.namedChildren) {
		walk(child, depth);
	}
	return entries;
}

// ── Generic Fallback ────────────────────────────────────────────────────────

function genericExtractor(node: Parser.SyntaxNode, source: string, depth: number): OutlineEntry[] {
	const entries: OutlineEntry[] = [];
	// For unsupported languages, show all top-level named nodes with their first line
	for (const child of node.namedChildren) {
		const line = child.startPosition.row + 1;
		const text = getNodeText(child, source).split("\n")[0].trim();
		if (text.length > 0 && text.length < 200) {
			entries.push({
				line,
				endLine: child.endPosition.row + 1,
				depth,
				text,
				kind: "other",
			});
		}
	}
	return entries;
}

// ── Extractor Registry ──────────────────────────────────────────────────────

const EXTRACTORS: Record<string, NodeExtractor> = {
	typescript: tsExtractor,
	tsx: tsExtractor,
	javascript: tsExtractor, // JS is a subset of TS grammar
	python: pythonExtractor,
	rust: rustExtractor,
	go: goExtractor,
};

// ── Public API ──────────────────────────────────────────────────────────────

export function extractOutline(tree: Parser.Tree, source: string, language: string): OutlineResult {
	const extractor = EXTRACTORS[language] || genericExtractor;
	const entries = extractor(tree.rootNode, source, 0);
	const totalLines = source.split("\n").length;
	return { entries, language, totalLines };
}

export function formatOutline(result: OutlineResult, options?: { maxLines?: number }): string {
	const { entries, language, totalLines } = result;
	const maxLines = options?.maxLines ?? 500;

	if (entries.length === 0) {
		return `// ${language} (${totalLines} lines) — no structural elements found`;
	}

	const lines: string[] = [];
	lines.push(`// ${language} | ${totalLines} lines | ${entries.length} symbols`);
	lines.push("");

	// Group consecutive imports
	let importGroup: OutlineEntry[] = [];

	function flushImports() {
		if (importGroup.length === 0) return;
		if (importGroup.length <= 5) {
			for (const imp of importGroup) {
				const indent = "  ".repeat(imp.depth);
				const lineNum = String(imp.line).padStart(4);
				lines.push(`${lineNum} ${indent}${imp.text}`);
			}
		} else {
			// Collapse large import blocks
			const first = importGroup[0];
			const last = importGroup[importGroup.length - 1];
			const lineNum = String(first.line).padStart(4);
			lines.push(`${lineNum} // ${importGroup.length} imports (lines ${first.line}-${last.endLine})`);
		}
		importGroup = [];
	}

	for (const entry of entries) {
		if (lines.length > maxLines) {
			lines.push(`\n// ... truncated (${entries.length - entries.indexOf(entry)} more symbols)`);
			break;
		}

		if (entry.kind === "import") {
			importGroup.push(entry);
			continue;
		}

		flushImports();

		const indent = "  ".repeat(entry.depth);
		const lineNum = String(entry.line).padStart(4);
		const span = entry.endLine - entry.line + 1;
		const spanHint = span > 1 ? ` (${span} lines)` : "";

		// Add blank line before top-level non-field entries for readability
		if (entry.depth === 0 && lines.length > 2 && lines[lines.length - 1] !== "") {
			lines.push("");
		}

		lines.push(`${lineNum} ${indent}${entry.text}${spanHint}`);
	}

	flushImports();
	return lines.join("\n");
}
