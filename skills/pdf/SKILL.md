---
name: pdf
description: Use when the user wants to do anything with PDF files — read, extract text/tables, merge, split, rotate, watermark, create, fill forms, encrypt/decrypt, extract images, or OCR scanned PDFs.
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

# PDF Processing

## Quick Reference

| Task | Best Tool | Key |
|---|---|---|
| Read/extract text | pdfplumber | `page.extract_text()` |
| Extract tables | pdfplumber | `page.extract_tables()` |
| Merge PDFs | pypdf | `writer.add_page(page)` |
| Split PDFs | pypdf | One page per file |
| Create PDFs | reportlab | Canvas or Platypus |
| CLI text extraction | pdftotext | `pdftotext -layout input.pdf` |
| CLI merge/split | qpdf | `qpdf --empty --pages ...` |
| OCR scanned PDFs | pytesseract + pdf2image | Convert to image first |
| Fill forms | See `references/forms.md` | Fillable vs non-fillable workflow |
| JS PDF manipulation | pdf-lib | `PDFDocument.load()` |

## Python Libraries

### pypdf — Merge, Split, Rotate, Encrypt

```python
from pypdf import PdfReader, PdfWriter

# Read
reader = PdfReader("document.pdf")
text = "".join(page.extract_text() for page in reader.pages)

# Merge
writer = PdfWriter()
for pdf_file in ["doc1.pdf", "doc2.pdf"]:
    for page in PdfReader(pdf_file).pages:
        writer.add_page(page)
with open("merged.pdf", "wb") as f:
    writer.write(f)

# Split
for i, page in enumerate(reader.pages):
    w = PdfWriter()
    w.add_page(page)
    with open(f"page_{i+1}.pdf", "wb") as f:
        w.write(f)

# Rotate
page = reader.pages[0]
page.rotate(90)

# Encrypt
writer.encrypt("userpass", "ownerpass")
```

### pdfplumber — Text & Table Extraction

```python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    for page in pdf.pages:
        # Text
        print(page.extract_text())

        # Tables → DataFrames
        for table in page.extract_tables():
            df = pd.DataFrame(table[1:], columns=table[0])

    # Extract from bounding box
    text = pdf.pages[0].within_bbox((100, 100, 400, 200)).extract_text()

    # Custom table settings for complex layouts
    tables = page.extract_tables({
        "vertical_strategy": "lines",
        "horizontal_strategy": "lines",
        "snap_tolerance": 3,
    })
```

### reportlab — Create PDFs

```python
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors

doc = SimpleDocTemplate("report.pdf")
styles = getSampleStyleSheet()
elements = [
    Paragraph("Report Title", styles['Title']),
    Spacer(1, 12),
    Paragraph("Body text here. " * 20, styles['Normal']),
]

# Tables
data = [['Product', 'Q1', 'Q2'], ['Widgets', '120', '135']]
table = Table(data)
table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
    ('GRID', (0, 0), (-1, -1), 1, colors.black),
]))
elements.append(table)
doc.build(elements)
```

**Important:** Never use Unicode subscript/superscript characters (₀₁₂₃) in reportlab — they render as black boxes. Use `<sub>` and `<super>` tags in Paragraph objects instead.

## CLI Tools

```bash
# pdftotext (poppler-utils)
pdftotext -layout input.pdf output.txt
pdftotext -f 1 -l 5 input.pdf output.txt  # pages 1-5

# qpdf
qpdf --empty --pages file1.pdf file2.pdf -- merged.pdf
qpdf input.pdf --pages . 1-5 -- excerpt.pdf
qpdf --linearize input.pdf optimized.pdf   # optimize for web
qpdf --check corrupted.pdf                 # repair

# Extract images
pdfimages -j input.pdf output_prefix
```

## OCR (Scanned PDFs)

```python
import pytesseract
from pdf2image import convert_from_path

images = convert_from_path('scanned.pdf')
text = "\n\n".join(
    f"Page {i+1}:\n{pytesseract.image_to_string(img)}"
    for i, img in enumerate(images)
)
```

## Watermark

```python
watermark = PdfReader("watermark.pdf").pages[0]
reader = PdfReader("document.pdf")
writer = PdfWriter()
for page in reader.pages:
    page.merge_page(watermark)
    writer.add_page(page)
```

## Deep Dives

- `references/advanced.md` — pypdfium2, pdf-lib (JS), advanced CLI, batch processing, performance tips
- `references/forms.md` — Fillable and non-fillable PDF form workflows

