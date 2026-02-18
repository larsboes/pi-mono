---
name: markitdown
description: Use when converting PDFs, Word docs, PowerPoint, HTML, or other files to Markdown. Uses Microsoft's markitdown via uvx for fast, accurate document conversion.
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

# Document → Markdown Conversion

## Installation

```bash
# Full install with all format support (PDF, Office, images, etc.)
uv tool install markitdown[all]

# Or minimal install with just specific extras
uv tool install markitdown[pdf,docx]
```

## Quick Reference

| Source | Command | Output |
|--------|---------|--------|
| PDF | `markitdown doc.pdf` | Clean Markdown |
| Word (.docx) | `markitdown doc.docx` | Preserves headings, tables |
| PowerPoint | `markitdown slides.pptx` | One slide per section |
| HTML | `markitdown page.html` | Strips tags, keeps content |
| Images (OCR) | `markitdown image.png` | Extracted text |
| URL | `curl -s URL | markitdown` | Web page → Markdown |
| Batch folder | `for f in *.pdf; do ...` | Multiple .md files |

## Single File

```bash
# Basic conversion
markitdown document.pdf > output.md

# With specific output path
markitdown /path/to/input.pdf > /path/to/output.md

# From stdin (pipe)
cat document.pdf | markitdown > output.md
```

## Batch Conversion

```bash
# Convert all PDFs in directory
for f in /path/to/pdfs/*.pdf; do
    markitdown "$f" > "${f%.pdf}.md"
done

# Convert with progress output
for f in *.pdf; do
    echo "Converting: $f"
    markitdown "$f" > "${f%.pdf}.md"
done
```

## Python Alternative

```python
import subprocess
from pathlib import Path

def pdf_to_markdown(pdf_path: Path, output_path: Path | None = None) -> str:
    """Convert PDF to markdown using markitdown."""
    result = subprocess.run(
        ["markitdown", str(pdf_path)],
        capture_output=True,
        text=True
    )
    markdown = result.stdout
    
    if output_path:
        output_path.write_text(markdown)
    
    return markdown

# Batch convert
def batch_convert(directory: Path, pattern: str = "*.pdf"):
    """Convert all matching files to markdown."""
    for pdf_file in directory.glob(pattern):
        md_file = pdf_file.with_suffix(".md")
        print(f"Converting: {pdf_file.name} → {md_file.name}")
        markdown = pdf_to_markdown(pdf_file)
        md_file.write_text(markdown)
```

## Supported Formats

- **PDF** — Best results with text-based PDFs (scanned PDFs use OCR)
- **Microsoft Office** — Word (.docx), PowerPoint (.pptx), Excel (.xlsx)
- **Images** — PNG, JPG, TIFF (via OCR)
- **Web** — HTML, MHTML
- **Audio** — MP3, WAV (transcription)
- **Archives** — ZIP (iterates contents)

## Tips

- markitdown extracts **semantic structure** (headings, lists, tables)
- For scanned/image PDFs, OCR quality depends on image clarity
- Complex tables may need manual cleanup after conversion
- Use `-q` flag for quiet mode (suppress progress output)

