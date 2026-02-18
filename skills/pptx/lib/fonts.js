/**
 * Font Manager for PPTX
 * Graceful font detection and fallback
 */

const { execSync } = require('child_process');
const os = require('os');

class FontManager {
  constructor() {
    this.cache = null;
    this.platform = os.platform();
  }

  /**
   * Get list of available system fonts
   */
  getSystemFonts() {
    if (this.cache) return this.cache;

    try {
      let fontList;

      if (this.platform === 'darwin') {
        // macOS: use system_profiler or fc-list
        try {
          fontList = execSync(
            'system_profiler SPFontsDataType 2>/dev/null | grep "Full Name:" | sed "s/.*Full Name: //"',
            { stdio: 'pipe', timeout: 10000 }
          ).toString();
        } catch {
          // Fallback to fc-list (if Homebrew fontconfig installed)
          try {
            fontList = execSync('fc-list : family 2>/dev/null', { stdio: 'pipe', timeout: 5000 }).toString();
          } catch {
            fontList = '';
          }
        }
      } else if (this.platform === 'linux') {
        try {
          fontList = execSync('fc-list : family 2>/dev/null', { stdio: 'pipe', timeout: 5000 }).toString();
        } catch {
          fontList = '';
        }
      } else {
        // Windows or unknown
        fontList = '';
      }

      this.cache = new Set(
        fontList.split('\n')
          .map(f => f.trim())
          .filter(f => f.length > 0)
      );

      return this.cache;
    } catch {
      this.cache = new Set();
      return this.cache;
    }
  }

  /**
   * Check if a specific font is available
   */
  isAvailable(fontName) {
    const fonts = this.getSystemFonts();

    // Exact match
    if (fonts.has(fontName)) return true;

    // Case-insensitive match
    const lower = fontName.toLowerCase();
    for (const f of fonts) {
      if (f.toLowerCase() === lower) return true;
      // Partial match (e.g., "Helvetica Neue" matches "Helvetica Neue Bold")
      if (f.toLowerCase().startsWith(lower)) return true;
    }

    return false;
  }

  /**
   * Resolve font with fallback chain
   */
  resolve(fontName, fallbackChain = null) {
    const chain = fallbackChain || this.getDefaultFallbackChain(fontName);

    for (const font of chain) {
      if (this.isAvailable(font)) {
        if (font !== fontName) {
          console.log(`  ℹ Font "${fontName}" not found, using "${font}"`);
        }
        return font;
      }
    }

    // Ultimate fallback — Arial is almost always available
    console.warn(`  ⚠ No fonts from chain [${chain.join(', ')}] found. Using Arial.`);
    return 'Arial';
  }

  /**
   * Get default fallback chain for common fonts
   */
  getDefaultFallbackChain(fontName) {
    const chains = {
      'Helvetica Neue': ['Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
      'Helvetica': ['Helvetica', 'Helvetica Neue', 'Arial', 'sans-serif'],
      'San Francisco': ['SF Pro Display', '.SF NS', 'Helvetica Neue', 'Arial'],
      'TeleNeo': ['TeleNeo', 'TeleGroteskNext', 'Helvetica Neue', 'Arial'],
      'Inter': ['Inter', 'Helvetica Neue', 'Arial', 'sans-serif'],
      'Roboto': ['Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      'Source Sans Pro': ['Source Sans Pro', 'Source Sans 3', 'Arial', 'sans-serif'],
      'Fira Code': ['Fira Code', 'JetBrains Mono', 'SF Mono', 'Menlo', 'Consolas'],
      'SF Mono': ['SF Mono', 'Fira Code', 'JetBrains Mono', 'Menlo', 'Consolas'],
      'Playfair Display': ['Playfair Display', 'Georgia', 'Times New Roman', 'serif'],
      'Georgia': ['Georgia', 'Times New Roman', 'serif']
    };

    return chains[fontName] || [fontName, 'Helvetica Neue', 'Arial'];
  }

  /**
   * Resolve all fonts in a template
   */
  resolveTemplatefonts(template) {
    const resolved = {};

    const heading = template.resolveToken('typography.heading');
    const body = template.resolveToken('typography.body');
    const mono = template.resolveToken('typography.mono');

    if (heading) resolved.heading = this.resolve(heading);
    if (body) resolved.body = this.resolve(body);
    if (mono) resolved.mono = this.resolve(mono);

    return resolved;
  }

  /**
   * Print font availability report
   */
  printReport(requestedFonts) {
    console.log('\n  Font Availability:');
    console.log('  ' + '─'.repeat(50));

    for (const font of requestedFonts) {
      const available = this.isAvailable(font);
      const resolved = this.resolve(font);
      const status = available ? '✓' : '⚠';
      const note = available ? '' : ` → fallback: ${resolved}`;
      console.log(`  ${status} ${font}${note}`);
    }

    console.log();
  }
}

module.exports = FontManager;
