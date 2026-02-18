/**
 * Diagram & Asset Bridge
 * Renders Mermaid, LaTeX, and other visuals to PPTX-compatible images
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DiagramBridge {
  constructor() {
    this.tools = this.detectTools();
  }

  detectTools() {
    const tools = {
      mmdc: false, // mermaid-cli
      npx: false
    };

    try {
      execSync('mmdc --version 2>/dev/null', { stdio: 'pipe' });
      tools.mmdc = true;
    } catch {
      try {
        execSync('npx --version 2>/dev/null', { stdio: 'pipe' });
        tools.npx = true;
      } catch {}
    }

    return tools;
  }

  /**
   * Render Mermaid code block to PNG/SVG
   */
  async renderMermaid(code, options = {}) {
    const tmpDir = '/tmp/pi-pptx-diagrams';
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const id = Date.now();
    const mmdPath = path.join(tmpDir, `diag-${id}.mmd`);
    const pngPath = path.join(tmpDir, `diag-${id}.png`);

    fs.writeFileSync(mmdPath, code);

    console.log('  → Rendering Mermaid diagram...');

    try {
      if (this.tools.mmdc) {
        execSync(`mmdc -i \"${mmdPath}\" -o \"${pngPath}\" -b transparent -s 2`, { stdio: 'pipe' });
        return pngPath;
      } else if (this.tools.npx) {
        execSync(`npx -p @mermaid-js/mermaid-cli mmdc -i \"${mmdPath}\" -o \"${pngPath}\" -b transparent -s 2`, { stdio: 'pipe' });
        return pngPath;
      } else {
        console.warn('  ⚠ No mermaid-cli (mmdc) or npx found. Skipping rendering.');
        return null;
      }
    } catch (err) {
      console.error('  ✖ Mermaid render failed:', err.message);
      return null;
    }
  }

  /**
   * Extract diagrams from markdown content
   */
  extractDiagrams(markdown) {
    const diagrams = [];
    const mermaidRegex = /```mermaid\n([\s\S]*?)\n```/g;
    
    let match;
    while ((match = mermaidRegex.exec(markdown)) !== null) {
      diagrams.push({
        type: 'mermaid',
        code: match[1].trim()
      });
    }

    return diagrams;
  }

  /**
   * Resolve LaTeX formulas to SVG images
   * (Placeholder: LaTeX support requires mathjax-node-cli)
   */
  async renderLatex(formula) {
    console.warn('  ⚠ LaTeX rendering not yet implemented. Requires mathjax-node-cli.');
    return null;
  }
}

module.exports = DiagramBridge;
