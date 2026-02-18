/**
 * Template Engine for PPTX Skill
 * Parses YAML templates, resolves design tokens, applies layouts
 */

const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

class TemplateEngine {
  constructor(templatePath) {
    this.template = this.loadTemplate(templatePath);
    this.tokens = this.template || {};
  }

  loadTemplate(templatePath) {
    // Support Vault: prefix for Obsidian integration
    if (templatePath.startsWith('Vault:')) {
      const vaultPath = process.env.OBSIDIAN_VAULT || '/Users/larsboes/Developer/Knowledge-Base';
      templatePath = path.join(vaultPath, templatePath.replace('Vault:', ''));
    }
    
    // Support builtin: prefix
    if (templatePath.startsWith('builtin/')) {
      const builtinName = templatePath.replace('builtin/', '');
      return this.getBuiltinTemplate(builtinName);
    }

    // Short name without prefix → treat as builtin
    const builtinNames = ['minimal', 'dark', 'corporate', 'editorial', 'telekom'];
    if (builtinNames.includes(templatePath.toLowerCase())) {
      return this.getBuiltinTemplate(templatePath.toLowerCase());
    }

    // Load from file
    const content = fs.readFileSync(templatePath, 'utf8');
    return yaml.load(content);
  }

  getBuiltinTemplate(name) {
    const builtins = {
      minimal: {
        name: 'Minimal',
        colors: {
          primary: '1A1A2E',
          secondary: '16213E',
          background: 'FFFFFF',
          surface: 'F5F5F7',
          text: '1A1A2E',
          accent: 'E94560'
        },
        typography: {
          heading: 'Helvetica Neue',
          body: 'Arial',
          sizes: { h1: 44, body: 14 }
        },
        shapes: {
          card_style: 'flat',
          corner_radius: 4
        }
      },
      dark: {
        name: 'Dark Mode',
        colors: {
          primary: 'E20074',
          secondary: 'FFFFFF',
          background: '0F0F0F',
          surface: '1A1A1A',
          text: 'FFFFFF',
          accent: 'E20074'
        },
        typography: {
          heading: 'Helvetica Neue',
          body: 'Arial',
          sizes: { h1: 44, body: 14 }
        },
        shapes: {
          card_style: 'glassmorphism',
          corner_radius: 8
        }
      },
      corporate: {
        name: 'Corporate',
        colors: {
          primary: 'E20074',
          secondary: '262626',
          background: 'FFFFFF',
          surface: 'F5F5F7',
          text: '262626',
          accent: 'E20074'
        },
        typography: {
          heading: 'Helvetica Neue',
          body: 'Arial',
          sizes: { h1: 40, body: 14 }
        },
        shapes: {
          card_style: 'elevated',
          corner_radius: 4
        }
      }
    };
    
    // Telekom theme (based on corporate with Magenta accent)
    builtins.telekom = {
      name: 'Telekom',
      colors: {
        primary: 'E20074',
        secondary: '1A1A2E',
        background: 'FFFFFF',
        surface: 'F5F5F7',
        text: '262626',
        textMuted: '6B7280',
        accent: 'E20074',
        success: '059669',
        warning: 'D97706',
        error: 'DC2626'
      },
      typography: {
        heading: 'Helvetica Neue',
        body: 'Arial',
        mono: 'Menlo',
        sizes: { h1: 44, h2: 32, body: 14 }
      },
      shapes: {
        card_style: 'elevated',
        corner_radius: 4
      }
    };

    return builtins[name] || builtins.minimal;
  }

  resolveToken(tokenPath) {
    const parts = tokenPath.split('.');
    let value = this.tokens;
    
    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return null;
      }
    }
    
    return value;
  }

  getColor(name) {
    return this.resolveToken(`colors.${name}`) || '000000';
  }

  getFont(type = 'body') {
    return this.resolveToken(`typography.${type}`) || 'Arial';
  }

  getFontSize(type = 'body') {
    const sizes = this.resolveToken('typography.sizes') || {};
    return sizes[type] || 14;
  }

  getShapeStyle() {
    return this.resolveToken('shapes.card_style') || 'flat';
  }

  getShadows() {
    const style = this.getShapeStyle();
    const shadows = this.resolveToken('shadows') || {};
    return shadows[style] || shadows.elevated || { enabled: false };
  }

  applyToShape(shape, shapeType = 'rect') {
    const style = this.getShapeStyle();
    const config = {};

    switch (style) {
      case 'neumorphic':
        config.fill = { color: this.getColor('surface') };
        // PptxGenJS doesn't support complex shadows, fallback to flat
        break;
      case 'glassmorphism':
        config.fill = { color: this.getColor('surface') };
        config.line = { color: this.getColor('surface'), width: 1 };
        break;
      case 'elevated':
        config.fill = { color: 'FFFFFF' };
        config.line = { color: this.getColor('surface'), width: 1 };
        break;
      case 'outlined':
        config.fill = { color: 'FFFFFF' };
        config.line = { color: this.getColor('primary'), width: 2 };
        break;
      default:
        config.fill = { color: 'FFFFFF' };
    }

    return config;
  }
}

module.exports = TemplateEngine;
