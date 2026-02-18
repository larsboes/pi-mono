/**
 * Brand Scanner Utility
 * Extracts colors and font styles from a website or URL
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class BrandScanner {
  constructor() {
    this.defaultBrand = {
      primary: 'E20074',
      secondary: '262626',
      background: 'FFFFFF',
      text: '262626',
      font: 'Helvetica Neue'
    };
  }

  /**
   * Scan a URL for brand colors and fonts
   * (Placeholder: Complex scanning requires browser automation/puppeteer)
   */
  async scan(url) {
    console.log(`  → Scanning brand tokens from ${url}...`);

    try {
      // Basic fetch to check if URL is reachable
      const response = await axios.get(url, { timeout: 10000 });
      const html = response.data.toLowerCase();

      // Rule-based heuristic for major brands
      if (url.includes('telekom')) {
        return {
          primary: 'E20074',
          secondary: '1A1A2E',
          background: 'FFFFFF',
          text: '262626',
          font: 'Helvetica Neue'
        };
      }

      if (url.includes('google')) {
        return {
          primary: '4285F4',
          secondary: '34A853',
          background: 'FFFFFF',
          text: '202124',
          font: 'Product Sans'
        };
      }

      if (url.includes('apple')) {
        return {
          primary: '000000',
          secondary: '555555',
          background: 'FFFFFF',
          text: '1D1D1F',
          font: 'San Francisco'
        };
      }

      // Simple CSS regex check in HTML content (looks for hex codes)
      const hexMatch = html.match(/#[a-f0-9]{6}/g);
      if (hexMatch && hexMatch.length > 3) {
        // Unique top 3 colors
        const colors = [...new Set(hexMatch)].slice(0, 3).map(c => c.replace('#', ''));
        return {
          primary: colors[0],
          secondary: colors[1],
          background: 'FFFFFF',
          text: colors[1],
          font: 'Arial'
        };
      }

      return this.defaultBrand;
    } catch (err) {
      console.warn(`  ⚠ Scan failed for ${url}. Using default brand.`);
      return this.defaultBrand;
    }
  }

  /**
   * Save scanned tokens to a YAML template in the Vault
   */
  async saveToVault(tokens, name) {
    const vaultPath = process.env.OBSIDIAN_VAULT || '/Users/larsboes/Developer/Knowledge-Base';
    const templateDir = path.join(vaultPath, 'Templates', 'PPTX');
    
    if (!fs.existsSync(templateDir)) fs.mkdirSync(templateDir, { recursive: true });

    const yaml = `---
name: \"${name}\"
version: \"1.0.0\"
design_system:
  type: \"scanned\"
  source: \"${name}\"

colors:
  primary: \"${tokens.primary}\"
  secondary: \"${tokens.secondary}\"
  background: \"${tokens.background}\"
  text: \"${tokens.text}\"
  accent: \"${tokens.primary}\"

typography:
  heading: \"${tokens.font}\"
  body: \"Arial\"
---

# Scanned Brand Template: ${name}
`;

    const outputPath = path.join(templateDir, `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`);
    fs.writeFileSync(outputPath, yaml);
    console.log(`  ✓ Brand template saved: Vault:Templates/PPTX/${path.basename(outputPath)}`);
    
    return outputPath;
  }
}

// CLI Integration helper
if (require.main === module) {
  const url = process.argv[2];
  if (!url) {
    console.log('Usage: node brand-scanner.js <url>');
    process.exit(1);
  }

  const scanner = new BrandScanner();
  scanner.scan(url).then(t => console.log(JSON.stringify(t, null, 2)));
}

module.exports = BrandScanner;
