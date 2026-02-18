# Layout Types

Complete layout specifications for the auto-layout engine.

## Available Layouts

### card-grid
- **Description:** 2-4 cards in grid
- **Structure:** grid
- **Max Items:** 4
- **Card Style:** neumorphic

### split-compare
- **Description:** 50/50 or 60/40 split
- **Structure:** asymmetric
- **Ratio:** 60/40
- **Divider:** arrow

### process-flow
- **Description:** Horizontal or vertical flow
- **Structure:** linear
- **Direction:** horizontal
- **Connectors:** arrows

### hero-stat
- **Description:** Big number + context
- **Structure:** centered
- **Number Size:** 72pt

### editorial
- **Description:** Text-heavy with side elements
- **Structure:** asymmetric
- **Text Column:** 60%
- **Visual Column:** 40%

### timeline
- **Description:** Time-based progression
- **Structure:** linear
- **Nodes:** circles
- **Connectors:** line

### hub-spoke
- **Description:** Central element with orbitals
- **Structure:** radial
- **Center Size:** 40%

## Layout Selection Logic

```javascript
// Pseudocode for auto-selection
function selectLayout(content) {
  if (content.hasNumbers && content.items.length <= 3) {
    return 'stat-cards';
  }
  if (content.hasComparisonWords(['vs', 'versus', 'alt vs neu'])) {
    return 'split-compare';
  }
  if (content.hasSequentialIndicators(['→', '->', 'schritt', 'phase'])) {
    return 'process-flow';
  }
  if (content.items.length >= 3 && content.items.length <= 4) {
    return 'card-grid';
  }
  return 'editorial';
}
```
