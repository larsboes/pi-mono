/**
 * PPTX Generator v5.4.1 - Final Polish
 * Precision alignment, corrected transparency, and cleaner visuals.
 */

const PptxGenJS = require('pptxgenjs');
const TemplateEngine = require('./template-engine');
const MarkdownParser = require('./markdown-parser');
const FontManager = require('./fonts');

class PPTXGenerator {
  constructor(options = {}) {
    this.template = new TemplateEngine(options.template || 'builtin/telekom');
    this.parser = new MarkdownParser();
    this.fonts = new FontManager();
    this.options = options;
    
    const tmp = new PptxGenJS();
    this.ShapeType = tmp.ShapeType;
    
    this.GRID = {
      margin: 0.5,
      colors: {
        magenta: 'E20074',
        charcoal: '1A1A2E',
        surface: 'F5F5F7',
        border: 'E5E7EB',
        text: '262626',
        muted: '9CA3AF',
        white: 'FFFFFF'
      }
    };
  }

  async generateFromMarkdown(markdownContent) {
    const slidesData = this.parser.parse(markdownContent);
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';

    for (let i = 0; i < slidesData.length; i++) {
      await this.generateSlide(pptx, slidesData[i], i, slidesData.length);
    }

    return pptx;
  }

  async generateSlide(pptx, data, index, total) {
    const slide = pptx.addSlide();
    const text = data.rawText.toLowerCase();

    // GLOBAL FOOTER
    slide.addText(`${data.title || 'Praxischeck'} | Slide ${index + 1}`, {
      x: 0.5, y: 5.3, w: 9, h: 0.3, fontSize: 8, color: this.GRID.colors.muted, fontFace: 'Arial'
    });

    if (index === 0) {
      this.renderMasterTitle(slide, data);
      return;
    }

    slide.background = { color: this.GRID.colors.white };
    this.renderHeader(slide, data.title);

    // COMPONENT ROUTING
    if (text.includes('trends') || text.includes('qualifikation')) {
      this.renderModernCards(slide, data.items);
    } else if (text.includes('herausforderung') || text.includes('stats')) {
      this.renderDetailedStats(slide, data);
    } else if (text.includes('lösung') || text.includes('architektur')) {
      this.renderHubSpoke(slide, data.title, data.items);
    } else if (text.includes('organisation') || text.includes('roadmap')) {
      this.renderTimeline(slide, data.items, text.includes('roadmap'));
    } else if (text.includes('shift') || text.includes('legacy')) {
      this.renderComparison(slide, data.items);
    } else if (text.includes('impact') || text.includes('prozesse')) {
      this.renderProcessFlow(slide, data.items);
    } else {
      this.renderEditorial(slide, data.content);
    }
  }

  renderHeader(slide, title) {
    if (!title) return;
    slide.addText("PROJECT STATUS // 2026", {
      x: 0.5, y: 0.3, w: 4, h: 0.2, fontSize: 8, bold: true, color: this.GRID.colors.magenta, charSpacing: 1
    });
    slide.addText(title.toUpperCase(), {
      x: 0.5, y: 0.5, w: 9, h: 0.5, fontSize: 28, bold: true, color: this.GRID.colors.charcoal
    });
    slide.addShape(this.ShapeType.rect, { x: 0.5, y: 1.0, w: 0.6, h: 0.03, fill: { color: this.GRID.colors.magenta } });
  }

  renderMasterTitle(slide, data) {
    slide.background = { color: this.GRID.colors.charcoal };
    slide.addShape(this.ShapeType.rect, { x: 7.5, y: 0, w: 2.5, h: 5.625, fill: { color: this.GRID.colors.magenta, transparency: 85 } });
    
    const titleText = data.title || 'PRAXISCHECK';
    const fontSize = titleText.length > 30 ? 36 : 46;

    slide.addText(titleText, { 
      x: 0.8, y: 1.2, w: 7, h: 1.8, fontSize: fontSize, bold: true, color: 'FFFFFF', valign: 'bottom' 
    });
    slide.addText(data.subtitle || '', { 
      x: 0.8, y: 3.4, w: 7, h: 0.4, fontSize: 20, color: this.GRID.colors.magenta 
    });
    slide.addShape(this.ShapeType.rect, { x: 0.8, y: 4.1, w: 1.5, h: 0.03, fill: { color: 'FFFFFF' } });
  }

  renderDetailedStats(slide, data) {
    const stats = this.extractStatItems(data);
    const count = Math.min(stats.length, 3);
    
    stats.slice(0, count).forEach((item, i) => {
      const x = 0.5 + (i * 3.2);
      slide.addShape(this.ShapeType.roundRect, { x, y: 1.5, w: 3.0, h: 3.5, fill: { color: this.GRID.colors.white }, line: { color: this.GRID.colors.border, width: 1 }, rectRadius: 0.05 });
      slide.addShape(this.ShapeType.rect, { x: x, y: 1.5, w: 3.0, h: 0.08, fill: { color: this.GRID.colors.magenta } });
      
      slide.addText(item.number, { x: x + 0.15, y: 1.8, w: 2.7, h: 0.7, fontSize: 44, bold: true, color: this.GRID.colors.charcoal });
      slide.addText(item.label.toUpperCase(), { x: x + 0.15, y: 2.6, w: 2.7, h: 0.3, fontSize: 11, bold: true, color: this.GRID.colors.magenta, charSpacing: 1 });
      if (item.description) {
        slide.addText(item.description, { x: x + 0.15, y: 3.0, w: 2.7, h: 1.8, fontSize: 12, color: this.GRID.colors.text, valign: 'top' });
      }
    });
  }

  renderModernCards(slide, items) {
    items.slice(0, 3).forEach((item, i) => {
      const x = 0.5 + (i * 3.2);
      // Ghost background number - Corrected to use transparency (0-100)
      slide.addText((i + 1).toString(), { 
        x: x + 1.8, y: 0.8, w: 1.5, h: 1.5, 
        fontSize: 120, bold: true, color: this.GRID.colors.charcoal, transparency: 92 
      });
      
      const parts = item.split(':');
      const title = parts[0].trim().toUpperCase();
      const desc = parts.length > 1 ? parts[1].trim() : '';

      slide.addText(title, { 
        x: x, y: 1.8, w: 3, h: 0.4, fontSize: 18, bold: true, color: this.GRID.colors.magenta, 
        fontFace: 'Helvetica Neue', charSpacing: 1 
      });
      slide.addText(desc, { 
        x: x, y: 2.3, w: 3, h: 2.5, fontSize: 13, color: this.GRID.colors.charcoal, 
        valign: 'top', fontFace: 'Arial', lineSpacing: 20 
      });
    });
  }

  renderHubSpoke(slide, center, items) {
    const cX = 3.8, cY = 2.2, cW = 2.4;
    slide.addShape(this.ShapeType.ellipse, { x: cX - 0.05, y: cY - 0.05, w: cW + 0.1, h: cW + 0.1, fill: { color: this.GRID.colors.magenta } });
    slide.addShape(this.ShapeType.ellipse, { x: cX, y: cY, w: cW, h: cW, fill: { color: this.GRID.colors.charcoal } });
    
    const centerTitle = (center || 'SOLUTION').split(':')[0].toUpperCase();
    slide.addText(centerTitle, { x: cX, y: cY + 0.8, w: cW, h: 0.8, fontSize: 14, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Helvetica Neue' });
    
    const pos = [{x:0.8, y:1.5}, {x:7.2, y:1.5}, {x:0.8, y:4.0}, {x:7.2, y:4.0}];
    items.slice(0, 4).forEach((t, i) => {
      slide.addShape(this.ShapeType.roundRect, { x: pos[i].x, y: pos[i].y, w: 2, h: 0.8, fill: { color: 'FFFFFF' }, line: { color: this.GRID.colors.border, width: 1 }, rectRadius: 0.05 });
      slide.addText(t.toUpperCase(), { x: pos[i].x, y: pos[i].y, w: 2, h: 0.8, fontSize: 10, bold: true, align: 'center', color: this.GRID.colors.charcoal, charSpacing: 1 });
      
      const isLeft = pos[i].x < 4;
      const startX = isLeft ? pos[i].x + 2 : pos[i].x;
      const startY = pos[i].y + 0.4;
      const endX = isLeft ? cX : cX + cW;
      const endY = cY + (cW / 2);

      slide.addShape(this.ShapeType.line, { 
        x: startX, y: startY, w: endX - startX, h: endY - startY,
        line: { color: this.GRID.colors.magenta, width: 1, dashType: 'dash', transparency: 60 } 
      });
    });
  }

  renderTimeline(slide, items, isDark = false) {
    if (isDark) slide.background = { color: this.GRID.colors.charcoal };
    slide.addShape(this.ShapeType.rect, { x: 0.8, y: 3.2, w: 8.4, h: 0.02, fill: { color: this.GRID.colors.magenta } });
    const step = 8.4 / items.length;
    items.forEach((item, i) => {
      const x = 0.8 + (i * step);
      slide.addShape(this.ShapeType.ellipse, { x: x + (step/2) - 0.1, y: 3.1, w: 0.2, h: 0.2, fill: { color: this.GRID.colors.magenta } });
      const parts = item.split(':');
      slide.addText(parts[0].trim(), { x, y: 2.7, w: step, h: 0.4, fontSize: 16, bold: true, color: this.GRID.colors.magenta, align: 'center' });
      if (parts.length > 1) slide.addText(parts[1].trim(), { x, y: 3.5, w: step, h: 1.2, fontSize: 11, color: isDark ? '#BBBBBB' : this.GRID.colors.text, align: 'center' });
    });
  }

  renderComparison(slide, items) {
    const mid = Math.ceil(items.length / 2);
    const left = items.slice(0, mid);
    const right = items.slice(mid);
    slide.addShape(this.ShapeType.roundRect, { x: 0.5, y: 1.5, w: 4.3, h: 3.5, fill: { color: this.GRID.colors.surface }, rectRadius: 0.05 });
    slide.addShape(this.ShapeType.roundRect, { x: 5.2, y: 1.5, w: 4.3, h: 3.5, fill: { color: this.GRID.colors.charcoal }, rectRadius: 0.05 });
    left.forEach((t, i) => slide.addText(`× ${t}`, { x: 0.7, y: 1.8 + i * 0.6, w: 3.9, h: 0.5, fontSize: 15, color: this.GRID.colors.charcoal }));
    right.forEach((t, i) => slide.addText(`✓ ${t}`, { x: 5.4, y: 1.8 + i * 0.6, w: 3.9, h: 0.5, fontSize: 15, bold: true, color: 'FFFFFF' }));
  }

  renderProcessFlow(slide, items) {
    const count = Math.min(items.length, 4);
    const nodeW = 2.0;
    const gutter = 0.4;
    const startX = (10 - (count * nodeW + (count - 1) * gutter)) / 2;

    items.slice(0, count).forEach((item, i) => {
      const x = startX + i * (nodeW + gutter);
      const y = 2.5;

      slide.addShape(this.ShapeType.roundRect, { x, y, w: nodeW, h: 1.0, fill: { color: i === count - 1 ? this.GRID.colors.magenta : this.GRID.colors.charcoal }, rectRadius: 0.05 });
      slide.addText(`STEP 0${i+1}`, { x, y: y - 0.3, w: nodeW, h: 0.2, fontSize: 8, bold: true, color: this.GRID.colors.muted, align: 'center', charSpacing: 1 });
      slide.addText(item.toUpperCase(), { x: x + 0.1, y, w: nodeW - 0.2, h: 1.0, fontSize: 10, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Helvetica Neue' });

      if (i < count - 1) {
        slide.addShape(this.ShapeType.rightArrow, { x: x + nodeW + 0.05, y: y + 0.35, w: 0.3, h: 0.3, fill: { color: this.GRID.colors.border } });
      }
    });
  }

  renderEditorial(slide, content) {
    let y = 1.5;
    content.forEach(block => {
      if (block.type === 'list') {
        block.items.forEach(item => {
          slide.addShape(this.ShapeType.ellipse, { x: 0.8, y: y + 0.18, w: 0.08, h: 0.08, fill: { color: this.GRID.colors.magenta } });
          slide.addText(item.text, { x: 1.0, y, w: 8.5, h: 0.5, fontSize: 16, color: this.GRID.colors.charcoal });
          y += 0.6;
        });
      }
    });
  }

  extractStatItems(data) {
    const items = [];
    const pattern = /^(\d+[%MKk]?)\s*[:\-–]?\s*(.+)$/i;
    for (const item of data.items || []) {
      const m = item.match(pattern);
      if (m) {
        const rest = m[2];
        const colonIdx = rest.indexOf(':');
        items.push({
          number: m[1],
          label: colonIdx > 0 ? rest.substring(0, colonIdx).trim() : rest.trim(),
          description: colonIdx > 0 ? rest.substring(colonIdx + 1).trim() : ''
        });
      }
    }
    return items.length ? items : (data.items || []).map((t, i) => ({ number: (i+1).toString(), label: t, description: '' }));
  }
}

module.exports = PPTXGenerator;
