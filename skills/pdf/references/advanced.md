# PDF Advanced Reference

## pypdfium2 — Fast Rendering (PDFium)

```python
import pypdfium2 as pdfium

pdf = pdfium.PdfDocument("document.pdf")

# Render to image
for i, page in enumerate(pdf):
    bitmap = page.render(scale=2.0)
    img = bitmap.to_pil()
    img.save(f"page_{i+1}.png")

# Extract text
for page in pdf:
    print(page.get_text())
```

## pdf-lib (JavaScript)

```javascript
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';

// Load and modify
const pdfDoc = await PDFDocument.load(fs.readFileSync('input.pdf'));
const page = pdfDoc.addPage([595, 842]); // A4
const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

page.drawText('Hello', { x: 50, y: 750, size: 18, font, color: rgb(0.2, 0.2, 0.8) });
page.drawRectangle({ x: 40, y: 700, width: 515, height: 30, color: rgb(0.9, 0.9, 0.9) });

fs.writeFileSync('output.pdf', await pdfDoc.save());

// Merge
const merged = await PDFDocument.create();
const pages = await merged.copyPages(pdfDoc, pdfDoc.getPageIndices());
pages.forEach(p => merged.addPage(p));
```

## Advanced CLI

```bash
# High-res page images
pdftoppm -png -r 300 document.pdf output_prefix

# Complex page extraction
qpdf input.pdf --pages input.pdf 1,3-5,8,10-end -- extracted.pdf

# Split into groups
qpdf --split-pages=3 input.pdf output_%02d.pdf

# Encryption with permissions
qpdf --encrypt user owner 256 --print=none --modify=none -- in.pdf out.pdf

# Text with bounding boxes (XML)
pdftotext -bbox-layout document.pdf output.xml
```

## Batch Processing

```python
import glob, logging
from pypdf import PdfReader, PdfWriter

logger = logging.getLogger(__name__)

def batch_process(input_dir, operation='merge'):
    pdf_files = sorted(glob.glob(f"{input_dir}/*.pdf"))

    if operation == 'merge':
        writer = PdfWriter()
        for f in pdf_files:
            try:
                for page in PdfReader(f).pages:
                    writer.add_page(page)
            except Exception as e:
                logger.error(f"Failed: {f}: {e}")
        with open("merged.pdf", "wb") as out:
            writer.write(out)

    elif operation == 'extract_text':
        for f in pdf_files:
            try:
                text = "".join(p.extract_text() for p in PdfReader(f).pages)
                with open(f.replace('.pdf', '.txt'), 'w') as out:
                    out.write(text)
            except Exception as e:
                logger.error(f"Failed: {f}: {e}")
```

## Performance Tips

- **Large PDFs**: Process pages individually, use `qpdf --split-pages`
- **Text extraction**: `pdftotext` is fastest for plain text; pdfplumber for structured data
- **Image extraction**: `pdfimages` is much faster than rendering pages
- **Memory**: Process in chunks for very large documents

## Troubleshooting

```python
# Encrypted PDFs
reader = PdfReader("encrypted.pdf")
if reader.is_encrypted:
    reader.decrypt("password")

# Corrupted PDFs
# qpdf --check corrupted.pdf && qpdf --replace-input corrupted.pdf

# OCR fallback for failed text extraction
from pdf2image import convert_from_path
import pytesseract
text = "\n".join(pytesseract.image_to_string(img) for img in convert_from_path(path))
```
