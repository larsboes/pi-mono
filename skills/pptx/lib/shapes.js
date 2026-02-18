/**
 * Neumorphism & Advanced Shape Effects for PPTX
 * Workarounds for PptxGenJS shadow limitations
 */

class ShapeEffects {
  constructor(template) {
    this.template = template;
    // PptxGenJS ShapeType is on instances, cache it
    const PptxGenJS = require('pptxgenjs');
    const tmp = new PptxGenJS();
    this.ShapeType = tmp.ShapeType;
  }

  /**
   * Add a neumorphic card (dual-shadow effect via stacked shapes)
   * Creates the illusion of a pressed/extruded surface
   */
  addNeumorphicCard(slide, x, y, w, h, options = {}) {
    const bgColor = options.bgColor || (this.template ? this.template.getColor('surface') : 'F5F5F7');
    const radius = options.radius || 0.15;

    // Layer 1: Light shadow (top-left highlight)
    slide.addShape(this.ShapeType.roundRect, {
      x, y, w, h,
      fill: { color: bgColor },
      rectRadius: radius,
      shadow: {
        type: 'outer',
        color: 'FFFFFF',
        blur: 12,
        offset: 6,
        angle: 135,
        opacity: 0.6
      }
    });

    // Layer 2: Dark shadow (bottom-right depth)
    slide.addShape(this.ShapeType.roundRect, {
      x, y, w, h,
      fill: { color: bgColor },
      rectRadius: radius,
      shadow: {
        type: 'outer',
        color: '000000',
        blur: 12,
        offset: 6,
        angle: 315,
        opacity: 0.12
      }
    });

    // Layer 3: Clean surface (no shadow, final visual)
    slide.addShape(this.ShapeType.roundRect, {
      x: x + 0.02, y: y + 0.02, w: w - 0.04, h: h - 0.04,
      fill: { color: bgColor },
      rectRadius: radius
    });
  }

  /**
   * Add a glassmorphism card (frosted glass effect)
   * Uses semi-transparent fill + subtle border
   */
  addGlassCard(slide, x, y, w, h, options = {}) {
    const bgColor = options.bgColor || (this.template ? this.template.getColor('surface') : 'F5F5F7');
    const borderColor = options.borderColor || 'FFFFFF';
    const radius = options.radius || 0.15;

    // Background blur simulation (darker base)
    slide.addShape(this.ShapeType.roundRect, {
      x: x - 0.03, y: y - 0.03, w: w + 0.06, h: h + 0.06,
      fill: { color: '000000', transparency: 95 },
      rectRadius: radius
    });

    // Main glass surface
    slide.addShape(this.ShapeType.roundRect, {
      x, y, w, h,
      fill: { color: bgColor, transparency: 85 },
      line: { color: borderColor, width: 1, transparency: 70 },
      rectRadius: radius,
      shadow: {
        type: 'outer',
        color: '000000',
        blur: 20,
        offset: 4,
        angle: 315,
        opacity: 0.08
      }
    });

    // Top edge highlight (light refraction sim)
    slide.addShape(this.ShapeType.rect, {
      x: x + 0.1, y: y + 0.05, w: w - 0.2, h: 0.03,
      fill: { color: 'FFFFFF', transparency: 60 }
    });
  }

  /**
   * Add an elevated card (Material Design style)
   */
  addElevatedCard(slide, x, y, w, h, options = {}) {
    const bgColor = options.bgColor || 'FFFFFF';
    const elevation = options.elevation || 2; // 1-3
    const radius = options.radius || 0.1;

    const shadowConfigs = {
      1: { blur: 4, offset: 2, opacity: 0.12 },
      2: { blur: 8, offset: 4, opacity: 0.1 },
      3: { blur: 16, offset: 8, opacity: 0.08 }
    };

    const shadow = shadowConfigs[elevation] || shadowConfigs[2];

    slide.addShape(this.ShapeType.roundRect, {
      x, y, w, h,
      fill: { color: bgColor },
      rectRadius: radius,
      shadow: {
        type: 'outer',
        color: '000000',
        blur: shadow.blur,
        offset: shadow.offset,
        angle: 270,
        opacity: shadow.opacity
      }
    });
  }

  /**
   * Add a brutalist card (bold, offset shadow)
   */
  addBrutalistCard(slide, x, y, w, h, options = {}) {
    const bgColor = options.bgColor || 'FFFFFF';
    const shadowColor = options.shadowColor || (this.template ? this.template.getColor('secondary') : '262626');
    const borderColor = options.borderColor || shadowColor;
    const offset = options.offset || 0.08;

    // Offset shadow (hard, no blur)
    slide.addShape(this.ShapeType.rect, {
      x: x + offset, y: y + offset, w, h,
      fill: { color: shadowColor }
    });

    // Main shape
    slide.addShape(this.ShapeType.rect, {
      x, y, w, h,
      fill: { color: bgColor },
      line: { color: borderColor, width: 3 }
    });
  }

  /**
   * Add an outlined card (clean border only)
   */
  addOutlinedCard(slide, x, y, w, h, options = {}) {
    const borderColor = options.borderColor || (this.template ? this.template.getColor('primary') : 'E20074');
    const borderWidth = options.borderWidth || 2;
    const radius = options.radius || 0.05;

    slide.addShape(this.ShapeType.roundRect, {
      x, y, w, h,
      fill: { color: 'FFFFFF', transparency: 100 },
      line: { color: borderColor, width: borderWidth },
      rectRadius: radius
    });
  }

  /**
   * Add a ghost number (large faded background number)
   */
  addGhostNumber(slide, number, x, y, options = {}) {
    const color = options.color || (this.template ? this.template.getColor('surface') : 'F0F0F0');
    const size = options.size || 120;

    slide.addText(number.toString(), {
      x: x || 0, y: y || 0.5,
      w: 4, h: 3,
      fontSize: size,
      bold: true,
      color: color,
      fontFace: options.font || 'Helvetica Neue',
      transparency: options.transparency || 90
    });
  }

  /**
   * Add an accent bar (horizontal or vertical)
   */
  addAccentBar(slide, x, y, options = {}) {
    const color = options.color || (this.template ? this.template.getColor('primary') : 'E20074');
    const direction = options.direction || 'horizontal';
    const width = options.width || 1.5;
    const thickness = options.thickness || 0.06;

    slide.addShape(this.ShapeType.rect, {
      x, y,
      w: direction === 'horizontal' ? width : thickness,
      h: direction === 'horizontal' ? thickness : width,
      fill: { color }
    });
  }

  /**
   * Add a badge (pill-shaped label)
   */
  addBadge(slide, text, x, y, options = {}) {
    const bgColor = options.bgColor || (this.template ? this.template.getColor('primary') : 'E20074');
    const textColor = options.textColor || 'FFFFFF';
    const fontSize = options.fontSize || 11;
    const w = Math.max(text.length * 0.08 + 0.3, 1);
    const h = 0.35;

    slide.addShape(this.ShapeType.roundRect, {
      x, y, w, h,
      fill: { color: bgColor },
      rectRadius: 0.175
    });

    slide.addText(text, {
      x, y: y + 0.05, w, h: h - 0.1,
      fontSize, bold: true, color: textColor,
      align: 'center', fontFace: 'Arial'
    });
  }

  /**
   * Auto-select card style based on template setting
   */
  addCard(slide, x, y, w, h, options = {}) {
    const style = options.style || (this.template ? this.template.getShapeStyle() : 'elevated');

    switch (style) {
      case 'neumorphic':
        this.addNeumorphicCard(slide, x, y, w, h, options);
        break;
      case 'glassmorphism':
        this.addGlassCard(slide, x, y, w, h, options);
        break;
      case 'elevated':
        this.addElevatedCard(slide, x, y, w, h, options);
        break;
      case 'brutalist':
        this.addBrutalistCard(slide, x, y, w, h, options);
        break;
      case 'outlined':
        this.addOutlinedCard(slide, x, y, w, h, options);
        break;
      default:
        this.addElevatedCard(slide, x, y, w, h, options);
    }
  }
}

module.exports = ShapeEffects;
