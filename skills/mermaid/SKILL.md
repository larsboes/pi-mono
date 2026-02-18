---
name: mermaid
description: "Create, validate, and export Mermaid diagrams. Extract from Markdown, batch validate, export to images, and lint for best practices."
---

<!--
🌐 COMMUNITY SKILL

Part of the pi-mono open skills collection.
- Repository: https://github.com/larsboes/pi-mono
- License: MIT
- Author: {{author}}

Contributions welcome via GitHub issues and PRs.
Last synced: 2026-02-18 21:06:30
-->

# Mermaid Skill

Create and validate Mermaid diagrams with comprehensive tooling.

## Prerequisites

- Node.js + npm (for `npx`)
- First run downloads headless Chromium via Puppeteer (for CLI rendering)

## Tools

### Validate a diagram

```bash
./tools/validate.sh diagram.mmd [output.svg]
```

Parses and renders to verify syntax. Prints ASCII preview.

### Extract from Markdown

```bash
./tools/extract-from-md.sh document.md          # Extract only
./tools/extract-from-md.sh document.md --validate  # Extract and validate
```

Extracts mermaid code blocks from Markdown files, optionally validates each.

### Batch Validate

```bash
./tools/validate-all.sh "diagrams/*.mmd"
./tools/validate-all.sh *.mmd docs/*.mmd
```

Validate multiple diagrams at once.

### Export to Image

```bash
./tools/export.sh diagram.mmd                              # PNG, 1200px
./tools/export.sh diagram.mmd --format svg                 # SVG format
./tools/export.sh diagram.mmd --width 1920 --bg transparent
./tools/export.sh diagram.mmd -o /tmp/output.png
```

**Options:**
| Flag | Description |
|------|-------------|
| `--format png\|svg\|pdf` | Output format (default: png) |
| `--width <px>` | Width in pixels (default: 1200) |
| `--height <px>` | Height in pixels (optional) |
| `--theme <name>` | Mermaid theme (default: default) |
| `--bg <color>` | Background color (default: white) |
| `-o, --output <file>` | Output file (default: auto) |

### Lint Best Practices

```bash
./tools/lint.sh diagram.mmd
```

Checks for:
- Explicit direction (TD, LR, etc.)
- Node labels present
- Line length limits
- Subgraph labels
- Consistent styling
- Comment usage

## Workflows

### New Diagram

1. Draft in standalone `.mmd` file
2. Run `./tools/validate.sh diagram.mmd`
3. Fix any errors
4. Copy into Markdown or export to image

### Review Existing Diagrams

```bash
# Validate all diagrams in project
./tools/validate-all.sh "**/*.mmd"

# Check for best practices issues
for f in diagrams/*.mmd; do ./tools/lint.sh "$f"; done
```

### Documentation with Diagrams

```bash
# Extract from existing docs
./tools/extract-from-md.sh README.md --validate

# Export for presentations
./tools/export.sh architecture.mmd --format png --width 1920
```

## Best Practices

1. **Always specify direction** in flowcharts: `graph TD` or `graph LR`
2. **Use classes** for consistent styling instead of inline styles
3. **Label all nodes**: `A[Label]` not just `A`
4. **Add comments** (`%% comment`) for complex logic
5. **Keep lines under 100 chars** for readability
6. **Label subgraphs**: `subgraph Group Name` not just `subgraph`

## Common Diagram Types

| Type | Syntax | Use Case |
|------|--------|----------|
| Flowchart | `graph TD` / `flowchart LR` | Process flows, decisions |
| Sequence | `sequenceDiagram` | API calls, interactions |
| Class | `classDiagram` | Object models |
| ER | `erDiagram` | Database schemas |
| State | `stateDiagram` | State machines |
| Gantt | `gantt` | Project timelines |
| Pie | `pie` | Simple proportions |

## Tips

- Draft complex diagrams in standalone `.mmd` files first
- Use `--validate` before committing diagrams
- Export to PNG for presentations, SVG for web
- The ASCII preview doesn't support all diagram types (falls back gracefully)

