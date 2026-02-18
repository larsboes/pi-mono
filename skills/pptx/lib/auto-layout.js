/**
 * Auto-Layout Engine
 * Analyzes content and selects optimal slide layout
 */

class AutoLayoutEngine {
  constructor() {
    this.layouts = {
      'stat-cards': {
        name: 'Stat Cards',
        pattern: 'stats',
        maxItems: 4,
        structure: 'grid',
        priority: 10
      },
      'card-grid': {
        name: 'Card Grid',
        pattern: 'bullets',
        minItems: 3,
        maxItems: 4,
        structure: 'grid',
        priority: 8
      },
      'split-compare': {
        name: 'Split Compare',
        pattern: 'comparison',
        structure: 'asymmetric',
        ratio: '50/50',
        priority: 9
      },
      'process-flow': {
        name: 'Process Flow',
        pattern: 'sequential',
        structure: 'linear',
        direction: 'horizontal',
        priority: 8
      },
      'hero-stat': {
        name: 'Hero Stat',
        pattern: 'single-number',
        structure: 'centered',
        priority: 7
      },
      'editorial': {
        name: 'Editorial',
        pattern: 'mixed',
        structure: 'asymmetric',
        textColumn: '60%',
        priority: 5
      },
      'timeline': {
        name: 'Timeline',
        pattern: 'time-based',
        structure: 'linear',
        direction: 'horizontal',
        priority: 8
      },
      'hub-spoke': {
        name: 'Hub and Spoke',
        pattern: 'central-concept',
        structure: 'radial',
        priority: 6
      }
    };
  }

  analyzeContent(content) {
    const analysis = {
      itemCount: content.items?.length || 0,
      hasNumbers: false,
      hasComparison: false,
      hasSequential: false,
      hasTimeMarkers: false,
      hasKeyValuePairs: false,
      contentTypes: []
    };

    // Check for numbers (stats)
    const numberPattern = /\d+%|\d+M|\d+K|\$\d+|\d+\s*(million|billion|thousand)/i;
    if (content.text && numberPattern.test(content.text)) {
      analysis.hasNumbers = true;
      analysis.contentTypes.push('stats');
    }

    // Check for comparison words
    const comparisonWords = ['vs', 'versus', 'vs.', 'gegenüber', 'alt vs', 'neu vs', 'before/after', 'legacy vs'];
    if (content.text && comparisonWords.some(w => content.text.toLowerCase().includes(w))) {
      analysis.hasComparison = true;
      analysis.contentTypes.push('comparison');
    }

    // Check for sequential indicators
    const sequentialWords = ['→', '->', 'schritt', 'step', 'phase', 'prozess', 'workflow', 'pipeline'];
    const arrowPattern = /[→\-\>]\s*\w/;
    if ((content.text && sequentialWords.some(w => content.text.toLowerCase().includes(w))) ||
        (content.text && arrowPattern.test(content.text))) {
      analysis.hasSequential = true;
      analysis.contentTypes.push('sequential');
    }

    // Check for time markers
    const timeWords = ['q1', 'q2', 'q3', 'q4', '2024', '2025', '2026', 'januar', 'februar', 'timeline', 'roadmap'];
    if (content.text && timeWords.some(w => content.text.toLowerCase().includes(w))) {
      analysis.hasTimeMarkers = true;
      analysis.contentTypes.push('time-based');
    }

    // Check for key-value pairs (metric: value)
    const kvPattern = /\w+:\s*\d+/;
    if (content.text && kvPattern.test(content.text)) {
      analysis.hasKeyValuePairs = true;
      analysis.contentTypes.push('stats');
    }

    // Determine dominant content type
    if (analysis.itemCount === 1 && analysis.hasNumbers) {
      analysis.dominantType = 'single-number';
    } else if (analysis.hasComparison) {
      analysis.dominantType = 'comparison';
    } else if (analysis.hasTimeMarkers && analysis.hasSequential) {
      analysis.dominantType = 'time-based';
    } else if (analysis.hasSequential) {
      analysis.dominantType = 'sequential';
    } else if (analysis.hasNumbers && analysis.itemCount <= 4) {
      analysis.dominantType = 'stats';
    } else if (analysis.itemCount >= 3 && analysis.itemCount <= 4) {
      analysis.dominantType = 'bullets';
    } else {
      analysis.dominantType = 'mixed';
    }

    return analysis;
  }

  selectLayout(content) {
    const analysis = this.analyzeContent(content);
    
    // Find matching layouts
    const candidates = Object.entries(this.layouts)
      .filter(([key, layout]) => {
        // Check pattern match
        if (layout.pattern !== analysis.dominantType) {
          return false;
        }
        
        // Check item count constraints
        if (layout.minItems && analysis.itemCount < layout.minItems) {
          return false;
        }
        if (layout.maxItems && analysis.itemCount > layout.maxItems) {
          return false;
        }
        
        return true;
      })
      .sort((a, b) => b[1].priority - a[1].priority);

    if (candidates.length > 0) {
      return candidates[0][0]; // Return layout key
    }

    // Default fallback
    return 'editorial';
  }

  getLayoutConfig(layoutKey) {
    return this.layouts[layoutKey] || this.layouts['editorial'];
  }

  suggestVisuals(layoutKey, content) {
    const suggestions = [];
    
    switch (layoutKey) {
      case 'stat-cards':
        suggestions.push('ghost_number_background', 'accent_bars', 'large_typography');
        break;
      case 'split-compare':
        suggestions.push('central_arrow', 'color_coding_left_right', 'icon_pairs');
        break;
      case 'process-flow':
        suggestions.push('connector_arrows', 'numbered_nodes', 'progressive_color');
        break;
      case 'timeline':
        suggestions.push('horizontal_line', 'milestone_dots', 'quarter_labels');
        break;
      case 'hub-spoke':
        suggestions.push('central_circle', 'orbital_cards', 'connection_lines');
        break;
      default:
        suggestions.push('accent_line', 'subtle_shadows', 'generous_whitespace');
    }
    
    return suggestions;
  }
}

module.exports = AutoLayoutEngine;
