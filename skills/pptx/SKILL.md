---
name: pptx
description: Advanced PowerPoint generation with Content-First workflow, Auto-Layout Engine, Vault-Templates, and Design-System integration. Create presentations from Markdown, apply modern layouts (Neumorphism, Asymmetric, Editorial), auto-generate charts, and export to PDF with QA.
---

# PPTX Skill — Next Generation

## Overview

This skill transforms how you create presentations:
- **Content-First:** Write Markdown, get slides automatically
- **Auto-Layout:** AI picks optimal layout based on content type
- **Vault-Templates:** Design systems stored in Obsidian
- **Modern Design:** Neumorphism, Glassmorphism, Asymmetric grids
- **Export Pipeline:** PDF, thumbnails, markdown back-conversion

## Quick Start

```bash
# Create from Markdown with auto-layout
pi pptx create --from content.md --theme telekom --output deck.pptx

# Use Vault template
pi pptx create --template "Vault:Templates/PPTX/Corporate" --from content.md

# Auto-detect layout based on content
pi pptx create --from content.md --layout auto --export pdf
```

## Content-First Workflow

### 1. Write Content in Markdown

```markdown
# Praxischeck: Moderne Technologien

## Trends
- KI-gestützte Anomalieerkennung
- Open Source First (Weg von Elastic)
- Ressourcen-Effizienz (RAM-Optimierung)

## Stats
- 40% Kosteneinsparung durch Open Source
- 60% RAM-Engpass vor Optimierung
- 3 Teams → 1 vereinigtes Team
```

### 2. Auto-Layout Detection

The engine analyzes content structure and picks layouts:

| Content Pattern | Auto-Selected Layout | Example |
|----------------|---------------------|---------|
| 3-4 bullet points | `card-grid` | Trends, Features |
| Key: Value pairs | `stat-cards` | Metrics, KPIs |
| A vs B comparison | `split-compare` | Before/After |
| Step 1 → Step 2 → Step 3 | `process-flow` | Roadmaps, Pipelines |
| Single big number | `hero-stat` | Impact slide |
| Mixed content types | `editorial` | Complex explanations |

## Template System (Vault Integration)

### Create a Design Template

Save in Obsidian: `Templates/PPTX/Telekom-Modern.md`

See [references/design-systems/](references/design-systems/) for full template specifications.

Quick example:
```yaml
---
name: "Corporate Modern"
colors:
  primary: "E20074"
  secondary: "262626"
  background: "FFFFFF"
typography:
  heading:
    font: "Helvetica Neue"
    size: 44
---
```

### Use Template

```bash
# Reference Vault template
pi pptx create --template "Vault:Templates/PPTX/Corporate" --from content.md

# Or use built-in
pi pptx create --template builtin/minimal --from content.md
```

## CLI Reference

### Create Command

```bash
pi pptx create [options]

Options:
  --from <path>           Source markdown file
  --template <name>       Template (Vault:path or builtin/name)
  --theme <name>          Quick theme (telekom, minimal, dark, corporate)
  --layout <type>         Layout mode (auto, card-grid, split-compare, etc.)
  --output <path>         Output file
  --export <formats>      Comma-separated: pdf,png,md
```

### Chart Command

```bash
pi pptx chart --type bar --data "A:10,B:20,C:30" --slide deck.pptx
```

### Export Command

```bash
pi pptx export deck.pptx --formats pdf,png --quality high
```

## Advanced Features

- **Charts & Data Viz:** CSV/inline data → charts (bar, line, pie, radar)
- **Shape Library:** Neumorphic, glassmorphic, elevated, brutalist styles
- **QA & Linting:** Contrast checks, overflow detection, layout suggestions
- **Multi-Format Export:** PDF, PNG grid, Markdown back-conversion

See [references/design-systems/](references/design-systems/) for detailed documentation on:
- Layout types (card-grid, split-compare, process-flow, etc.)
- Shape styles (neumorphism, glassmorphism)
- Chart configurations
- QA rules

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Content-First (Markdown → PPTX) | ✅ | `pptxgenjs` + parser |
| Auto-Layout Engine | 🚧 | Layout selection algorithm |
| Vault Template System | 🚧 | YAML parser + Obsidian integration |
| Design Tokens | 🚧 | Token resolution engine |
| Shape Library | 🚧 | Neumorphism, Glassmorphism |
| Charts from Data | ✅ | `pptxgenjs` charts |
| Export Pipeline | ✅ | LibreOffice + ImageMagick |
| QA/Linting | 🚧 | Contrast, overflow checks |

Legend: ✅ Ready | 🚧 In Progress | 📋 Planned

## References

- [references/design-systems/](references/design-systems/) — Design tokens, layouts, shapes
- [references/pptxgenjs.md](references/pptxgenjs.md) — Low-level PptxGenJS API
- [references/editing.md](references/editing.md) — Template unpacking workflow
- [examples/](examples/) — Sample presentations and templates
