/**
 * Semantic Iconography Resolver
 * Maps text keywords to SVG icon names
 */

class IconResolver {
  constructor() {
    this.map = {
      // Infrastructure & Tech
      'cloud': 'cloud',
      'server': 'server',
      'network': 'network',
      'database': 'database',
      'storage': 'hard-drive',
      'api': 'code',
      'code': 'code',
      'software': 'layers',
      'hardware': 'monitor',
      'mobile': 'smartphone',
      
      // AI & Data
      'ai': 'cpu',
      'intelligence': 'brain',
      'machine learning': 'cpu',
      'data': 'bar-chart',
      'analytics': 'pie-chart',
      'graph': 'share-2',
      'search': 'search',
      
      // Business & Finance
      'cost': 'banknote',
      'price': 'banknote',
      'money': 'dollar-sign',
      'budget': 'wallet',
      'profit': 'trending-up',
      'growth': 'trending-up',
      'market': 'globe',
      'sales': 'shopping-cart',
      
      // Security & Trust
      'security': 'shield',
      'safety': 'shield-check',
      'lock': 'lock',
      'privacy': 'eye-off',
      'trust': 'heart',
      
      // Organization & People
      'team': 'users',
      'people': 'user',
      'customer': 'user-check',
      'user': 'user',
      'communication': 'message-square',
      'collab': 'users',
      
      // Performance & Stats
      'efficiency': 'zap',
      'speed': 'gauge',
      'performance': 'activity',
      'time': 'clock',
      'deadline': 'calendar',
      
      // Abstract
      'problem': 'alert-circle',
      'warning': 'alert-triangle',
      'check': 'check-circle',
      'target': 'target',
      'goal': 'flag',
      'idea': 'lightbulb',
      'light': 'sun'
    };
  }

  /**
   * Resolve a keyword or string to an icon name
   */
  resolve(text) {
    if (!text) return null;
    const tokens = text.toLowerCase().split(/[\s,.\-\/]+/);
    
    // Check for exact matches
    for (const token of tokens) {
      if (this.map[token]) return this.map[token];
    }

    // Check for partial matches/containment
    const fullText = text.toLowerCase();
    for (const [key, icon] of Object.entries(this.map)) {
      if (fullText.includes(key)) return icon;
    }

    return null;
  }

  /**
   * Suggest an icon based on slide title
   */
  suggestForSlide(slide) {
    return this.resolve(slide.title) || this.resolve(slide.subtitle);
  }
}

module.exports = IconResolver;
