/**
 * Reveal.js Mirror Engine
 * Generates an interactive HTML presentation parallel to PPTX
 */

const fs = require('fs');
const path = require('path');

class RevealMirror {
  constructor() {
    this.cdn = {
      reveal_css: 'https://cdn.jsdelivr.net/npm/reveal.js/dist/reveal.css',
      theme_css: 'https://cdn.jsdelivr.net/npm/reveal.js/dist/theme/black.css',
      reveal_js: 'https://cdn.jsdelivr.net/npm/reveal.js/dist/reveal.js',
      markdown_js: 'https://cdn.jsdelivr.net/npm/reveal.js/plugin/markdown/markdown.js',
      highlight_js: 'https://cdn.jsdelivr.net/npm/reveal.js/plugin/highlight/highlight.js',
      highlight_css: 'https://cdn.jsdelivr.net/npm/reveal.js/plugin/highlight/monokai.css'
    };
  }

  /**
   * Generate interactive HTML presentation from markdown
   */
  async generate(markdown, options = {}) {
    const title = options.title || 'Interactive Presentation';
    const theme = options.theme || 'black'; // black | white | league | beige | sky | night | serif | simple | solarized | blood | moon
    const theme_css = this.cdn.theme_css.replace('black', theme);

    const html = `
<!doctype html>
<html lang=\"en\">
<head>
    <meta charset=\"utf-8\">
    <title>${title}</title>
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no\">
    <link rel=\"stylesheet\" href=\"${this.cdn.reveal_css}\">
    <link rel=\"stylesheet\" href=\"${theme_css}\">
    <link rel=\"stylesheet\" href=\"${this.cdn.highlight_css}\">
    <style>
        .reveal pre code { padding: 1em; border-radius: 8px; }
        .reveal .controls { color: #E20074; }
        .reveal .progress { color: #E20074; }
    </style>
</head>
<body>
    <div class=\"reveal\">
        <div class=\"slides\">
            <section data-markdown 
                     data-separator=\"^---\" 
                     data-separator-vertical=\"^\\n\\n\" 
                     data-separator-notes=\"^Note:\">
                <script type=\"text/template\">
${markdown}
                </script>
            </section>
        </div>
    </div>

    <script src=\"${this.cdn.reveal_js}\"></script>
    <script src=\"${this.cdn.markdown_js}\"></script>
    <script src=\"${this.cdn.highlight_js}\"></script>
    <script>
        Reveal.initialize({
            hash: true,
            center: true,
            mouseWheel: true,
            transition: 'slide', // none/fade/slide/convex/concave/zoom
            plugins: [ RevealMarkdown, RevealHighlight ]
        });
    </script>
</body>
</html>
    `;

    const outputPath = options.output || 'presentation.html';
    fs.writeFileSync(outputPath, html);
    console.log(`  ✓ Reveal.js: ${outputPath}`);
    
    return outputPath;
  }
}

module.exports = RevealMirror;
