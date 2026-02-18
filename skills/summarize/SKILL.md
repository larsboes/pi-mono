---
name: summarize
description: "Fetch a URL or convert a local file (PDF/DOCX/HTML/etc.) into Markdown using `uvx markitdown`, with optional AI summarization, entity extraction, and memory storage."
---

<!--
🌐 COMMUNITY SKILL

Part of the pi-mono open skills collection.
- Repository: https://github.com/larsboes/pi-mono
- License: MIT
- Author: {{author}}

Contributions welcome via GitHub issues and PRs.
Last synced: 2026-02-18 21:06:31
-->

# Summarize Skill

Convert URLs, PDFs, Word docs, PowerPoints, HTML pages, and text files into **Markdown** for analysis. Optionally summarize, extract entities, or store to memory.

## When to Use

- Pull down a web page as Markdown
- Convert binary docs (PDF/DOCX/PPTX) for analysis
- Summarize long documents with specific focus
- Extract entities (APIs, dates, people, emails, links)
- Batch process multiple documents

## Quick Usage

### Convert to Markdown

```bash
# From URL or file
cd ~/.pi/skills/summarize
node to-markdown.mjs https://example.com
node to-markdown.mjs ./document.pdf

# Write to temp file (prints path)
node to-markdown.mjs ./doc.pdf --tmp

# Write to specific file
node to-markdown.mjs ./doc.pdf --out /tmp/output.md
```

### Summarize

```bash
# Basic summary
node to-markdown.mjs ./doc.pdf --summary

# Summary with custom focus
node to-markdown.mjs ./doc.pdf --summary "Focus on security implications"
node to-markdown.mjs ./doc.pdf --summary --prompt "Extract API endpoints and auth details"

# Store summary to memory
node to-markdown.mjs ./doc.pdf --summary --memory
```

### Extract Entities

```bash
# Extract API endpoints
node to-markdown.mjs ./doc.pdf --extract apis

# Extract dates and deadlines
node to-markdown.mjs ./doc.pdf --extract dates

# Extract people mentioned
node to-markdown.mjs ./doc.pdf --extract people

# Extract email addresses
node to-markdown.mjs ./doc.pdf --extract emails

# Extract all URLs/links
node to-markdown.mjs ./doc.pdf --extract links

# Output as JSON
node to-markdown.mjs ./doc.pdf --extract apis --json
```

### Batch Processing

```bash
# Create batch file
cat > urls.txt << 'EOF'
https://example.com/page1
https://example.com/page2
./local/document.pdf
EOF

# Process all
node to-markdown.mjs --batch urls.txt
```

## Options Reference

| Flag | Description |
|------|-------------|
| `--out <file>` | Write Markdown to specific file |
| `--tmp` | Write to temp file, print path |
| `--summary [prompt]` | Summarize (optional custom prompt) |
| `--prompt <text>` | Set summary instructions |
| `--memory` | Store result to Cortex memory |
| `--extract <type>` | Extract entities (apis, dates, people, emails, links) |
| `--json` | Output as JSON (for extraction) |
| `--batch <file>` | Process multiple inputs |
| `--model <model>` | Override AI model for summarization |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PI_SUMMARY_MODEL` | Default model (default: claude-haiku-4-5) |

## Tips

- The `--tmp` flag always saves the full Markdown, even when summarizing
- Use `--extract` with `--json` for programmatic processing
- Combine `--summary` and `--memory` to build a personal knowledge base
- The script auto-detects model availability and falls back if needed
- Summaries truncate at 140k chars (keeps head + tail for context)

