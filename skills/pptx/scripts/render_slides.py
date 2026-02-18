# /// script
# dependencies = [
#   "pdf2image",
#   "pillow",
# ]
# ///
import os
import sys
import subprocess
import shutil
from pathlib import Path

def find_soffice():
    """Locate LibreOffice binary on macOS or Linux."""
    paths = [
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/usr/bin/soffice",
        "/usr/local/bin/soffice"
    ]
    for p in paths:
        if os.path.exists(p):
            return p
    return shutil.which("soffice")

def render_pptx(pptx_path, output_dir):
    pptx_path = Path(pptx_path).absolute()
    output_dir = Path(output_dir).absolute()
    output_dir.mkdir(parents=True, exist_ok=True)
    
    soffice = find_soffice()
    if not soffice:
        print("Error: LibreOffice (soffice) not found. Please install it (brew install --cask libreoffice).")
        return False

    print(f"Step 1: Converting {pptx_path.name} to PDF...")
    try:
        subprocess.run([
            soffice, "--headless", "--convert-to", "pdf", 
            "--outdir", str(output_dir), str(pptx_path)
        ], check=True, capture_output=True)
    except subprocess.CalledProcessError as e:
        print(f"Conversion failed: {e.stderr.decode()}")
        return False

    pdf_path = output_dir / pptx_path.with_suffix(".pdf").name
    print(f"Step 2: Rendering PDF slides to PNGs...")
    
    # Check for pdftoppm (poppler)
    if shutil.which("pdftoppm"):
        subprocess.run([
            "pdftoppm", "-png", "-r", "150", str(pdf_path), str(output_dir / "slide")
        ], check=True)
    else:
        # Fallback to pdf2image if installed via uv
        try:
            from pdf2image import convert_from_path
            images = convert_from_path(pdf_path)
            for i, image in enumerate(images):
                image.save(output_dir / f"slide-{i+1:02d}.png", "PNG")
        except ImportError:
            print("Error: Neither 'pdftoppm' nor 'pdf2image' Python library found.")
            return False

    # Cleanup PDF
    if pdf_path.exists():
        pdf_path.unlink()
    
    print(f"Success! Images saved in: {output_dir}")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: uv run render_slides.py <path_to_pptx> [output_dir]")
        sys.exit(1)
    
    pptx = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "./slides_export"
    render_pptx(pptx, out)
