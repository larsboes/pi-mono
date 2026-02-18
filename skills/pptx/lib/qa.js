/**
 * QA & Linting Engine for PPTX
 * Runs automated quality checks on presentations
 */

const fs = require('fs');
const path = require('path');

class QAEngine {
  constructor() {
    this.issues = [];
    this.checks = [
      this.checkContrast.bind(this),
      this.checkTextOverflow.bind(this),
      this.checkLayoutRepetition.bind(this),
      this.checkPlaceholders.bind(this),
      this.checkFontConsistency.bind(this),
      this.checkMargins.bind(this),
      this.checkEmptySlides.bind(this),
      this.checkColorOveruse.bind(this)
    ];
  }

  /**
   * Run all QA checks on a slide deck's internal representation
   * @param {Array} slides - Array of slide data objects
   * @param {Object} template - Template engine instance
   */
  runChecks(slides, template) {
    this.issues = [];
    this.template = template;

    for (const check of this.checks) {
      check(slides);
    }

    return this.issues.sort((a, b) => {
      const severity = { error: 0, warning: 1, info: 2 };
      return (severity[a.severity] || 2) - (severity[b.severity] || 2);
    });
  }

  /**
   * Check contrast ratios between text and backgrounds
   */
  checkContrast(slides) {
    const pairs = [
      // [text color, background color, description]
      { text: 'FFFFFF', bg: 'F5F5F7', desc: 'White text on light gray' },
      { text: 'E8E8E8', bg: 'FFFFFF', desc: 'Light gray text on white' },
      { text: '6B7280', bg: '1A1A2E', desc: 'Gray text on dark' },
    ];

    slides.forEach((slide, i) => {
      // Check each text element against slide background
      const bgColor = slide.background || (this.template ? this.template.getColor('background') : 'FFFFFF');

      for (const block of (slide.content || [])) {
        if (block.textColor && block.bgColor) {
          const ratio = this.calculateContrastRatio(block.textColor, block.bgColor);
          if (ratio < 4.5) {
            this.addIssue('error', `Slide ${i + 1}: Low contrast ratio (${ratio.toFixed(1)}:1) - text "${block.text?.substring(0, 30)}..."`, i + 1, 'contrast');
          } else if (ratio < 7) {
            this.addIssue('info', `Slide ${i + 1}: Moderate contrast (${ratio.toFixed(1)}:1) - consider increasing`, i + 1, 'contrast');
          }
        }
      }
    });
  }

  /**
   * Check for potential text overflow
   */
  checkTextOverflow(slides) {
    slides.forEach((slide, i) => {
      for (const block of (slide.content || [])) {
        if (block.type === 'list' && block.items) {
          for (const item of block.items) {
            // Rough estimation: ~10 chars per inch at 14pt
            const estimatedWidth = (item.text || '').length * 0.1;
            if (estimatedWidth > 8.5) { // 8.5 inch content width
              this.addIssue('warning', `Slide ${i + 1}: Text likely overflows - "${item.text.substring(0, 40)}..." (${item.text.length} chars)`, i + 1, 'overflow');
            }
          }
        }
        if (block.type === 'paragraph') {
          const text = block.text || '';
          if (text.length > 200) {
            this.addIssue('warning', `Slide ${i + 1}: Long paragraph (${text.length} chars) may overflow`, i + 1, 'overflow');
          }
        }
      }
    });
  }

  /**
   * Check for repeated layouts
   */
  checkLayoutRepetition(slides) {
    const layoutHistory = [];

    slides.forEach((slide, i) => {
      const layout = slide.layoutType || 'editorial';
      layoutHistory.push(layout);

      // Check last 3 slides for same layout
      if (layoutHistory.length >= 3) {
        const last3 = layoutHistory.slice(-3);
        if (last3.every(l => l === layout)) {
          this.addIssue('warning', `Slides ${i - 1}-${i + 1}: Same layout "${layout}" repeated 3 times - vary for visual interest`, i + 1, 'layout');
        }
      }
    });
  }

  /**
   * Check for placeholder/draft text
   */
  checkPlaceholders(slides) {
    const patterns = [
      /lorem\s+ipsum/i,
      /xxxx+/i,
      /TODO/,
      /PLACEHOLDER/i,
      /\[INSERT\]/i,
      /TBD/,
      /FIXME/i,
      /sample\s+text/i
    ];

    slides.forEach((slide, i) => {
      const text = this.extractAllText(slide);
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          this.addIssue('error', `Slide ${i + 1}: Placeholder text found - "${match[0]}"`, i + 1, 'placeholder');
        }
      }
    });
  }

  /**
   * Check font consistency
   */
  checkFontConsistency(slides) {
    const fontUsage = {};

    slides.forEach((slide, i) => {
      for (const block of (slide.content || [])) {
        const font = block.fontFace || 'unknown';
        if (!fontUsage[font]) fontUsage[font] = [];
        fontUsage[font].push(i + 1);
      }
    });

    const fontCount = Object.keys(fontUsage).filter(f => f !== 'unknown').length;
    if (fontCount > 3) {
      this.addIssue('warning', `${fontCount} different fonts used across slides - recommend max 2-3 for consistency`, null, 'fonts');
    }
  }

  /**
   * Check margin violations
   */
  checkMargins(slides) {
    const MIN_MARGIN = 0.4; // inches

    slides.forEach((slide, i) => {
      for (const block of (slide.content || [])) {
        if (block.x !== undefined && block.x < MIN_MARGIN) {
          this.addIssue('warning', `Slide ${i + 1}: Element too close to left edge (${block.x}in < ${MIN_MARGIN}in minimum)`, i + 1, 'margins');
        }
        if (block.y !== undefined && block.y < 0.2) {
          this.addIssue('warning', `Slide ${i + 1}: Element too close to top edge`, i + 1, 'margins');
        }
      }
    });
  }

  /**
   * Check for empty/content-free slides
   */
  checkEmptySlides(slides) {
    slides.forEach((slide, i) => {
      const hasContent = (slide.content || []).length > 0 || slide.title;
      if (!hasContent) {
        this.addIssue('error', `Slide ${i + 1}: Empty slide with no content`, i + 1, 'empty');
      }

      // Check for text-only slides (no visual elements)
      const hasVisual = (slide.content || []).some(b =>
        b.type === 'table' || b.type === 'chart' || b.type === 'image'
      );
      const bulletCount = (slide.content || []).filter(b => b.type === 'list').length;

      if (bulletCount > 0 && !hasVisual && i > 0) {
        this.addIssue('info', `Slide ${i + 1}: Text-only slide - consider adding a visual element`, i + 1, 'visual');
      }
    });
  }

  /**
   * Check accent color overuse
   */
  checkColorOveruse(slides) {
    if (!this.template) return;

    const accent = this.template.getColor('primary');
    let accentUsage = 0;
    let totalElements = 0;

    slides.forEach(slide => {
      for (const block of (slide.content || [])) {
        totalElements++;
        if (block.color === accent || block.bgColor === accent) {
          accentUsage++;
        }
      }
    });

    if (totalElements > 0) {
      const ratio = accentUsage / totalElements;
      if (ratio > 0.3) {
        this.addIssue('warning', `Accent color used on ${Math.round(ratio * 100)}% of elements - recommend max 10-20% for impact`, null, 'color');
      }
    }
  }

  // --- Utility Methods ---

  calculateContrastRatio(hex1, hex2) {
    const l1 = this.relativeLuminance(hex1);
    const l2 = this.relativeLuminance(hex2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  relativeLuminance(hex) {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;

    const toLinear = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  }

  extractAllText(slide) {
    const texts = [slide.title || '', slide.subtitle || ''];
    for (const block of (slide.content || [])) {
      if (block.text) texts.push(block.text);
      if (block.items) {
        for (const item of block.items) {
          texts.push(item.text || item);
        }
      }
    }
    return texts.join(' ');
  }

  addIssue(severity, message, slide = null, category = 'general') {
    this.issues.push({ severity, message, slide, category });
  }

  /**
   * Format issues for console output
   */
  formatReport() {
    if (this.issues.length === 0) {
      return '✓ All checks passed — no issues found.\n';
    }

    const errors = this.issues.filter(i => i.severity === 'error');
    const warnings = this.issues.filter(i => i.severity === 'warning');
    const info = this.issues.filter(i => i.severity === 'info');

    let report = `\n  QA Report: ${errors.length} errors, ${warnings.length} warnings, ${info.length} info\n`;
    report += '  ' + '─'.repeat(60) + '\n';

    for (const issue of this.issues) {
      const icon = issue.severity === 'error' ? '✖' : issue.severity === 'warning' ? '⚠' : 'ℹ';
      const tag = `[${issue.category}]`.padEnd(14);
      report += `  ${icon} ${tag} ${issue.message}\n`;
    }

    report += '\n';
    return report;
  }
}

module.exports = QAEngine;
