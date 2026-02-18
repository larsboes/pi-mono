#!/usr/bin/env node
/**
 * PPTX Skill CLI v2
 * Full-featured: create, chart, template, export, qa
 */

const fs = require('fs');
const path = require('path');
const PPTXGenerator = require('./pptx-generator');
const ChartGenerator = require('./charts');
const ExportPipeline = require('./export');
const QAEngine = require('./qa');
const FontManager = require('./fonts');
const AnimationEngine = require('./animations');

const commands = {
  async create(args) {
    const fromFile = getArg(args, '--from');
    const template = getArg(args, '--template') || getArg(args, '--theme') || 'builtin/minimal';
    const layout = getArg(args, '--layout') || 'auto';
    const output = getArg(args, '--output') || 'output.pptx';
    const exportFormats = getArg(args, '--export');
    const noQA = args.includes('--no-qa');
    const noTransitions = args.includes('--no-transitions');
    const transition = getArg(args, '--transition') || 'fade';
    const animate = args.includes('--animate');
    const storyMode = args.includes('--story-mode');
    const mirror = args.includes('--mirror');

    if (!fromFile) {
      console.error('Error: --from <file> is required');
      process.exit(1);
    }

    console.log(`\n  Creating presentation...`);
    console.log(`  Template: ${template}`);
    console.log(`  Layout: ${layout}`);

    const markdown = fs.readFileSync(fromFile, 'utf8');

    const generator = new PPTXGenerator({
      template,
      layout,
      qa: !noQA,
      transitions: !noTransitions,
      transition,
      charts: true
    });

    const pptx = await generator.generateFromMarkdown(markdown);
    await pptx.writeFile({ fileName: output });

    console.log(`\n  ✓ Created: ${output}`);

    // Narrative Analysis
    if (storyMode) {
      const narrative = new (require('./narrative'))();
      const report = narrative.analyzeStoryline(generator.slideData);
      console.log(`\n  Narrative Analysis: Score ${report.score}/100`);
      report.suggestions.forEach(s => console.log(`    ⚠ ${s}`));
    }

    // HTML Mirror
    if (mirror) {
      const RevealMirror = require('./reveal-gen');
      const mirrorGen = new RevealMirror();
      const mirrorOutput = output.replace('.pptx', '.html');
      await mirrorGen.generate(markdown, { output: mirrorOutput });
    }

    // Inject element animations if requested
    if (animate) {
      const anim = new AnimationEngine();
      const slideCount = pptx.slides ? pptx.slides.length : 5;
      const animMap = {};
      for (let i = 1; i <= slideCount; i++) {
        animMap[i] = anim.createPreset(i === 1 ? 'title' : 'cards');
      }
      await anim.injectElementAnimations(output, animMap);
    }

    // Handle exports
    if (exportFormats) {
      const pipeline = new ExportPipeline();
      const formats = exportFormats.split(',').map(f => f.trim());
      await pipeline.exportAll(output, path.dirname(output), formats);
    }
  },

  async chart(args) {
    const type = getArg(args, '--type') || 'bar';
    const dataStr = getArg(args, '--data');
    const fromFile = getArg(args, '--from');
    const xCol = getArg(args, '--x');
    const yCol = getArg(args, '--y');
    const slideTo = getArg(args, '--slide');
    const output = getArg(args, '--output') || 'chart.pptx';
    const title = getArg(args, '--title') || '';
    const template = getArg(args, '--template') || getArg(args, '--theme') || 'builtin/minimal';

    const PptxGenJS = require('pptxgenjs');
    const TemplateEngine = require('./template-engine');
    const tmpl = new TemplateEngine(template);
    const charts = new ChartGenerator(tmpl);

    let data;

    if (dataStr) {
      data = charts.parseInlineData(dataStr);
    } else if (fromFile) {
      if (fromFile.endsWith('.csv')) {
        data = charts.parseCSV(fromFile, xCol, yCol);
      } else {
        console.error('Chart --from currently supports .csv files');
        process.exit(1);
      }
    } else {
      console.error('Error: --data or --from required');
      console.log('  Example: chart --type bar --data "Q1:45,Q2:67,Q3:89"');
      process.exit(1);
    }

    console.log(`\n  Generating ${type} chart...`);
    console.log(`  Data: ${data.labels.length} points, ${data.datasets.length} series`);

    const pptx = new PptxGenJS();
    charts.createChartSlide(pptx, data, { type, title });
    await pptx.writeFile({ fileName: output });

    console.log(`  ✓ Chart saved: ${output}`);
  },

  async template(args) {
    const action = args[0];

    switch (action) {
      case 'list':
        listTemplates();
        break;
      case 'init':
        const name = args[1];
        if (!name) {
          console.error('Error: template name required');
          process.exit(1);
        }
        initTemplate(name);
        break;
      case 'validate':
        const tmplPath = args[1];
        if (!tmplPath) {
          console.error('Error: template path required');
          process.exit(1);
        }
        validateTemplate(tmplPath);
        break;
      default:
        console.log('Usage: pptx template [list|init <name>|validate <path>]');
    }
  },

  async export(args) {
    const input = args[0];
    const formats = (getArg(args, '--formats') || 'pdf').split(',').map(f => f.trim());
    const outputDir = getArg(args, '--output-dir');

    if (!input) {
      console.error('Error: input file required');
      process.exit(1);
    }

    if (!fs.existsSync(input)) {
      console.error(`Error: file not found: ${input}`);
      process.exit(1);
    }

    const pipeline = new ExportPipeline();
    await pipeline.exportAll(input, outputDir, formats);
  },

  async qa(args) {
    const file = args[0];
    const fix = args.includes('--fix');
    const visual = args.includes('--visual');

    if (!file) {
      console.error('Error: file required');
      process.exit(1);
    }

    if (!fs.existsSync(file)) {
      console.error(`Error: file not found: ${file}`);
      process.exit(1);
    }

    console.log(`\n  QA Check: ${path.basename(file)}`);

    // Content QA via markitdown extraction
    const pipeline = new ExportPipeline();
    if (pipeline.tools.markitdown) {
      const { execSync } = require('child_process');
      try {
        const cmd = pipeline.tools.markitdown === 'uvx'
          ? `uvx markitdown "${file}"`
          : `python3 -m markitdown "${file}"`;
        const content = execSync(cmd, { stdio: 'pipe', timeout: 15000 }).toString();

        // Check for placeholder content
        const placeholders = content.match(/lorem\s+ipsum|xxxx+|TODO|PLACEHOLDER|\[INSERT\]|TBD|FIXME/gi);
        if (placeholders) {
          console.log(`\n  ✖ Placeholder text found: ${[...new Set(placeholders)].join(', ')}`);
        }

        // Check for empty slides (only whitespace between slide markers)
        const slideTexts = content.split(/^#{1,2}\s/m).filter(s => s.trim());
        const emptySlides = slideTexts.filter(s => s.trim().length < 10);
        if (emptySlides.length > 0) {
          console.log(`  ⚠ ${emptySlides.length} slide(s) appear nearly empty`);
        }

        console.log(`  ✓ Content extracted: ${slideTexts.length} slides, ${content.length} chars`);
      } catch (err) {
        console.log('  ⚠ Could not extract content for QA');
      }
    }

    // Visual QA
    if (visual) {
      console.log('\n  Visual QA:');
      const result = await pipeline.exportThumbnails(file);
      if (result) {
        console.log(`  → Inspect thumbnails in: ${result.dir}/`);
        console.log('  → Check for: overlapping text, low contrast, uneven margins');
      }
    }

    // Font check
    const fontMgr = new FontManager();
    const commonFonts = ['Helvetica Neue', 'Arial', 'TeleNeo'];
    fontMgr.printReport(commonFonts);

    // Tool status
    pipeline.printStatus();
  },

  async scan(args) {
    const url = args[0];
    const save = args.includes('--save');

    if (!url) {
      console.error('Error: URL required');
      process.exit(1);
    }

    const BrandScanner = require('../scripts/brand-scanner');
    const scanner = new BrandScanner();
    const tokens = await scanner.scan(url);

    console.log('\n  Scanned Tokens:');
    console.log(JSON.stringify(tokens, null, 2));

    if (save) {
      const name = new URL(url).hostname;
      await scanner.saveToVault(tokens, name);
    }
  },

  async fonts(args) {
    const fontMgr = new FontManager();
    const check = args[0];

    if (check) {
      const available = fontMgr.isAvailable(check);
      const resolved = fontMgr.resolve(check);
      console.log(`\n  Font: ${check}`);
      console.log(`  Available: ${available ? '✓' : '✖'}`);
      console.log(`  Resolved: ${resolved}`);
    } else {
      const commonFonts = [
        'Helvetica Neue', 'Helvetica', 'Arial',
        'TeleNeo', 'Inter', 'Roboto',
        'SF Mono', 'Fira Code', 'JetBrains Mono',
        'Georgia', 'Playfair Display'
      ];
      fontMgr.printReport(commonFonts);
    }
  },

  async status(args) {
    console.log('\n  PPTX Skill Status');
    console.log('  ' + '═'.repeat(50));

    // Export tools
    const pipeline = new ExportPipeline();
    pipeline.printStatus();

    // Font availability
    const fontMgr = new FontManager();
    fontMgr.printReport(['Helvetica Neue', 'Arial', 'TeleNeo']);

    // Template check
    listTemplates();
  },

  async help() {
    console.log(`
  PPTX Skill v2 — Presentation Generator

  Commands:
    create      Create presentation from markdown
                --from <file>          Source markdown
                --template <name>      Template (builtin/minimal|dark|corporate)
                --layout <type>        auto, card-grid, split-compare, etc.
                --output <file>        Output file (default: output.pptx)
                --export <formats>     pdf,png,md,grid
                --transition <type>    fade, push, wipe, cover, split
                --animate              Inject element animations
                --story-mode           Run narrative quality checks
                --mirror               Generate interactive Reveal.js mirror
                --no-qa                Skip QA checks
                --no-transitions       Skip slide transitions

    chart       Generate chart slide
                --type <type>          bar, line, pie, doughnut, radar
                --data <string>        Inline: "Q1:45,Q2:67,Q3:89"
                --from <file>          CSV file
                --title <text>         Chart title
                --output <file>        Output file

    template    Manage design templates
                list                   Show available templates
                init <name>            Create template scaffold
                validate <path>        Check template syntax

    export      Export to other formats
                <file>                 Input .pptx file
                --formats <list>       pdf,png,md,grid
                --output-dir <path>    Destination directory

    qa          Quality assurance checks
                <file>                 Input .pptx file
                --visual               Generate visual thumbnails
                --fix                  Auto-fix issues

    scan        Scan a URL for brand tokens
                <url>                  URL to scan
                --save                 Save to Vault templates

    fonts       Check font availability
                [name]                 Check specific font

    status      Show tool availability

  Examples:
    node cli.js create --from content.md --theme corporate --export pdf
    node cli.js chart --type bar --data "A:10,B:20,C:30" --output chart.pptx
    node cli.js qa deck.pptx --visual
    node cli.js export deck.pptx --formats pdf,png,grid
    node cli.js fonts "Helvetica Neue"
    `);
  }
};

// --- Helper Functions ---

function getArg(args, flag) {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : null;
}

function listTemplates() {
  console.log('\n  Built-in Templates:');
  console.log('    • minimal       Clean, neutral design');
  console.log('    • dark          Dark mode with accent colors');
  console.log('    • corporate     Professional business style');
  console.log();

  // Scan vault for templates
  const vaultPath = process.env.OBSIDIAN_VAULT || '/Users/larsboes/Developer/Knowledge-Base';
  const templateDir = path.join(vaultPath, 'Templates', 'PPTX');

  if (fs.existsSync(templateDir)) {
    const files = fs.readdirSync(templateDir).filter(f => f.endsWith('.md') || f.endsWith('.yaml'));
    if (files.length > 0) {
      console.log('  Vault Templates:');
      files.forEach(f => console.log(`    • Vault:Templates/PPTX/${f}`));
      console.log();
    }
  } else {
    console.log('  Vault Templates: none (create with: template init "Vault:Templates/PPTX/MyTheme")');
  }
}

function initTemplate(name) {
  const templateYaml = `---
name: "${path.basename(name)}"
version: "1.0.0"
design_system:
  type: "corporate"

colors:
  primary: "E20074"
  secondary: "262626"
  background: "FFFFFF"
  surface: "F5F5F7"
  text: "262626"
  textMuted: "6B7280"
  accent: "E20074"
  success: "059669"
  warning: "D97706"
  error: "DC2626"

typography:
  heading: "Helvetica Neue"
  body: "Arial"
  mono: "SF Mono"
  sizes:
    h1: 44
    h2: 32
    h3: 24
    body: 14
    caption: 11

shapes:
  card_style: "elevated"
  corner_radius: 4

layouts:
  title:
    background: "secondary"
    text_color: "white"
  content:
    background: "background"
    max_bullets: 4
    prefer_cards: true
---

# ${path.basename(name)} Template

Custom slide master definitions go here.
`;

  let outputPath;
  if (name.startsWith('Vault:')) {
    const vaultPath = process.env.OBSIDIAN_VAULT || '/Users/larsboes/Developer/Knowledge-Base';
    outputPath = path.join(vaultPath, name.replace('Vault:', '') + '.md');
  } else {
    outputPath = path.join(name, 'template.md');
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, templateYaml);

  console.log(`\n  ✓ Template created: ${outputPath}`);
  console.log(`  Edit in Obsidian, then use with: --template "${name}"`);
}

function validateTemplate(tmplPath) {
  try {
    const TemplateEngine = require('./template-engine');
    const tmpl = new TemplateEngine(tmplPath);

    const required = ['colors.primary', 'colors.secondary', 'colors.background', 'typography.heading'];
    const missing = required.filter(t => !tmpl.resolveToken(t));

    if (missing.length === 0) {
      console.log('\n  ✓ Template valid');
    } else {
      console.log(`\n  ⚠ Missing tokens: ${missing.join(', ')}`);
    }

    // Print resolved values
    console.log('\n  Resolved Tokens:');
    for (const token of required) {
      const value = tmpl.resolveToken(token);
      console.log(`    ${token}: ${value || '(missing)'}`);
    }
  } catch (err) {
    console.error(`\n  ✖ Template error: ${err.message}`);
  }
}

// --- Main Entry ---

const [,, cmd, ...args] = process.argv;

if (!cmd || cmd === 'help' || cmd === '--help') {
  commands.help();
} else if (commands[cmd]) {
  commands[cmd](args).catch(err => {
    console.error(`\n  ✖ Error: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  });
} else {
  console.error(`  Unknown command: ${cmd}`);
  console.log('  Run "node cli.js help" for usage');
  process.exit(1);
}
