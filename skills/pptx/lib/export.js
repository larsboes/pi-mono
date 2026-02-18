/**
 * Export Pipeline for PPTX
 * PDF, PNG thumbnails, Grid view, Markdown back-conversion
 */

const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class ExportPipeline {
  constructor() {
    this.tools = this.detectTools();
  }

  /**
   * Detect available export tools
   */
  detectTools() {
    const tools = {
      libreoffice: false,
      pdftoppm: false,
      montage: false,
      markitdown: false
    };

    // LibreOffice
    for (const cmd of ['soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice']) {
      try {
        execSync(`${cmd} --version 2>/dev/null`, { stdio: 'pipe' });
        tools.libreoffice = cmd;
        break;
      } catch {}
    }

    // pdftoppm (Poppler)
    try {
      execSync('which pdftoppm', { stdio: 'pipe' });
      tools.pdftoppm = true;
    } catch {}

    // ImageMagick montage
    try {
      execSync('which montage', { stdio: 'pipe' });
      tools.montage = true;
    } catch {}

    // markitdown
    try {
      execSync('python3 -m markitdown --help 2>/dev/null', { stdio: 'pipe' });
      tools.markitdown = true;
    } catch {
      try {
        execSync('uvx markitdown --help 2>/dev/null', { stdio: 'pipe' });
        tools.markitdown = 'uvx';
      } catch {}
    }

    return tools;
  }

  /**
   * Export to PDF
   */
  async exportPDF(inputPath, outputDir = null) {
    if (!this.tools.libreoffice) {
      console.error('  ✖ LibreOffice not found. Install: brew install --cask libreoffice');
      return null;
    }

    const outDir = outputDir || path.dirname(inputPath);
    const baseName = path.basename(inputPath, '.pptx');
    const outputPath = path.join(outDir, `${baseName}.pdf`);

    console.log('  → Converting to PDF...');

    try {
      execSync(
        `"${this.tools.libreoffice}" --headless --convert-to pdf --outdir "${outDir}" "${inputPath}" 2>/dev/null`,
        { stdio: 'pipe', timeout: 30000 }
      );
      console.log(`  ✓ PDF: ${outputPath}`);
      return outputPath;
    } catch (err) {
      console.error('  ✖ PDF conversion failed:', err.message);
      return null;
    }
  }

  /**
   * Export to PNG thumbnails
   */
  async exportThumbnails(inputPath, outputDir = null, options = {}) {
    const dpi = options.dpi || 150;
    const format = options.format || 'jpg';

    // First convert to PDF if needed
    let pdfPath = inputPath.replace('.pptx', '.pdf');
    if (!fs.existsSync(pdfPath)) {
      pdfPath = await this.exportPDF(inputPath, outputDir);
      if (!pdfPath) return null;
    }

    if (!this.tools.pdftoppm) {
      console.error('  ✖ pdftoppm not found. Install: brew install poppler');
      return null;
    }

    const outDir = outputDir || path.join(path.dirname(inputPath), 'thumbnails');
    fs.mkdirSync(outDir, { recursive: true });

    const prefix = path.join(outDir, 'slide');

    console.log('  → Generating thumbnails...');

    try {
      const formatFlag = format === 'png' ? '-png' : '-jpeg';
      execSync(
        `pdftoppm ${formatFlag} -r ${dpi} "${pdfPath}" "${prefix}"`,
        { stdio: 'pipe', timeout: 30000 }
      );

      // Count generated files
      const ext = format === 'png' ? '.png' : '.jpg';
      const files = fs.readdirSync(outDir).filter(f => f.startsWith('slide-') && f.endsWith(ext));
      console.log(`  ✓ Thumbnails: ${files.length} slides in ${outDir}/`);
      return { dir: outDir, files, count: files.length };
    } catch (err) {
      console.error('  ✖ Thumbnail generation failed:', err.message);
      return null;
    }
  }

  /**
   * Create a grid overview image of all slides
   */
  async exportGrid(inputPath, outputDir = null, options = {}) {
    const columns = options.columns || 3;
    const geometry = options.geometry || '400x300+10+10';

    // Generate thumbnails first
    const thumbResult = await this.exportThumbnails(inputPath, outputDir);
    if (!thumbResult) return null;

    if (!this.tools.montage) {
      console.error('  ✖ ImageMagick not found. Install: brew install imagemagick');
      return null;
    }

    const outDir = outputDir || path.dirname(inputPath);
    const gridPath = path.join(outDir, 'slide-grid.jpg');
    const thumbDir = thumbResult.dir;

    console.log('  → Creating grid overview...');

    try {
      execSync(
        `montage "${thumbDir}/slide-"*.jpg -geometry ${geometry} -tile ${columns}x "${gridPath}"`,
        { stdio: 'pipe', timeout: 30000 }
      );
      console.log(`  ✓ Grid: ${gridPath}`);
      return gridPath;
    } catch (err) {
      console.error('  ✖ Grid creation failed:', err.message);
      return null;
    }
  }

  /**
   * Convert PPTX back to Markdown
   */
  async exportMarkdown(inputPath, outputPath = null) {
    const baseName = path.basename(inputPath, '.pptx');
    const outPath = outputPath || inputPath.replace('.pptx', '.md');

    console.log('  → Converting to Markdown...');

    if (this.tools.markitdown === 'uvx') {
      try {
        const md = execSync(`uvx markitdown "${inputPath}"`, { stdio: 'pipe', timeout: 30000 });
        fs.writeFileSync(outPath, md.toString());
        console.log(`  ✓ Markdown: ${outPath}`);
        return outPath;
      } catch (err) {
        console.error('  ✖ Markdown conversion failed:', err.message);
        return null;
      }
    }

    if (this.tools.markitdown) {
      try {
        const md = execSync(`python3 -m markitdown "${inputPath}"`, { stdio: 'pipe', timeout: 30000 });
        fs.writeFileSync(outPath, md.toString());
        console.log(`  ✓ Markdown: ${outPath}`);
        return outPath;
      } catch (err) {
        console.error('  ✖ Markdown conversion failed:', err.message);
        return null;
      }
    }

    console.error('  ✖ markitdown not found. Install: pip install "markitdown[pptx]" or use uvx');
    return null;
  }

  /**
   * Full export pipeline
   */
  async exportAll(inputPath, outputDir = null, formats = ['pdf', 'png', 'md']) {
    const outDir = outputDir || path.dirname(inputPath);
    const results = {};

    console.log(`\n  Export Pipeline: ${path.basename(inputPath)}`);
    console.log('  ' + '─'.repeat(50));

    for (const format of formats) {
      switch (format) {
        case 'pdf':
          results.pdf = await this.exportPDF(inputPath, outDir);
          break;
        case 'png':
        case 'jpg':
          results.thumbnails = await this.exportThumbnails(inputPath, path.join(outDir, 'thumbnails'));
          break;
        case 'grid':
          results.grid = await this.exportGrid(inputPath, outDir);
          break;
        case 'md':
        case 'markdown':
          results.markdown = await this.exportMarkdown(inputPath);
          break;
        default:
          console.error(`  ✖ Unknown format: ${format}`);
      }
    }

    console.log('  ' + '─'.repeat(50));

    // Report tool availability
    const missing = [];
    if (!this.tools.libreoffice) missing.push('LibreOffice (brew install --cask libreoffice)');
    if (!this.tools.pdftoppm) missing.push('Poppler (brew install poppler)');
    if (!this.tools.montage) missing.push('ImageMagick (brew install imagemagick)');
    if (!this.tools.markitdown) missing.push('markitdown (pip install "markitdown[pptx]")');

    if (missing.length > 0) {
      console.log('\n  Missing tools (optional):');
      missing.forEach(m => console.log(`    • ${m}`));
    }

    return results;
  }

  /**
   * Print tool status
   */
  printStatus() {
    console.log('\n  Export Tools Status:');
    console.log('  ' + '─'.repeat(40));
    console.log(`  LibreOffice  ${this.tools.libreoffice ? '✓ ' + this.tools.libreoffice : '✖ not found'}`);
    console.log(`  pdftoppm     ${this.tools.pdftoppm ? '✓ available' : '✖ not found'}`);
    console.log(`  montage      ${this.tools.montage ? '✓ available' : '✖ not found'}`);
    console.log(`  markitdown   ${this.tools.markitdown ? '✓ ' + (this.tools.markitdown === 'uvx' ? 'via uvx' : 'available') : '✖ not found'}`);
    console.log();
  }
}

module.exports = ExportPipeline;
