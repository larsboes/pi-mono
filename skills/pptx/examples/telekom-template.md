---
name: "Telekom Corporate Modern"
version: "2.0.0"
description: "Official Telekom CI-compliant presentation template"
author: "Lars Boes"

design_system:
  type: "corporate"
  philosophy: "Clean, confident, digital"

colors:
  # Brand Colors
  primary: "E20074"        # Telekom Magenta
  secondary: "262626"      # Dark Gray (near black)
  tertiary: "6B7280"       # Medium Gray
  
  # Backgrounds
  background: "FFFFFF"     # White slides
  surface: "F5F5F7"        # Card backgrounds
  surfaceDark: "1A1A2E"    # Dark mode background
  
  # Text
  text: "262626"           # Primary text
  textSecondary: "6B7280"  # Muted text
  textInverse: "FFFFFF"    # Text on dark backgrounds
  
  # States
  success: "059669"
  warning: "D97706"
  error: "DC2626"
  info: "2563EB"
  
  # Accents
  accentLight: "FCE7F3"    # 10% Magenta
  accentDark: "9A0050"     # Dark Magenta

typography:
  heading:
    font: "Helvetica Neue"
    fallback: "Arial"
    weights:
      normal: 400
      medium: 500
      bold: 700
    sizes:
      display: 72      # Hero numbers
      h1: 44           # Slide titles
      h2: 32           # Section headers
      h3: 24           # Subsection
      eyebrow: 12      # Small caps labels
  
  body:
    font: "Arial"
    fallback: "Helvetica"
    sizes:
      large: 16
      normal: 14
      small: 12
      caption: 11
    line_height: 1.5

spacing:
  base: 0.25           # 0.25 inches
  scale:
    xs: 0.125          # 4px
    sm: 0.25           # 8px
    md: 0.5            # 16px
    lg: 1.0            # 32px
    xl: 1.5            # 48px
    xxl: 2.0           # 64px
  
  margins:
    slide: 0.5         # 0.5 inch slide margin
    content: 0.4       # Between content blocks
    card: 0.3          # Card padding
    grid: 0.3          # Grid gap

shapes:
  card_style: "elevated"
  corner_radius: 4     # px
  
  shadows:
    elevation_1:
      x: 0
      y: 1
      blur: 3
      spread: 0
      opacity: 0.12
    elevation_2:
      x: 0
      y: 4
      blur: 6
      spread: 0
      opacity: 0.1
    elevation_3:
      x: 0
      y: 8
      blur: 16
      spread: 0
      opacity: 0.08

layouts:
  # Title slide for section starters
  title:
    background: "secondary"
    text_color: "textInverse"
    accent: "primary"
    elements:
      - type: "accent_bar"
        position: "bottom_left"
        width: 120
        height: 4
        color: "primary"
      - type: "eyebrow"
        position: "top_left"
        text: "{{metadata.section}}"
        color: "textInverse"
        opacity: 0.7
  
  # Content slides
  content:
    background: "background"
    text_color: "text"
    max_items: 4
    prefer_visuals: true
    
  # Data/Stats slides
  stats:
    background: "surface"
    card_style: "elevated"
    number_size: "display"
    number_color: "primary"
    
  # Comparison slides
  compare:
    background: "background"
    split_ratio: "50/50"
    left_color: "surface"
    right_color: "primary"
    left_text: "text"
    right_text: "textInverse"

animations:
  enabled: false       # PptxGenJS limitation
  transitions:
    default: "fade"
    alternatives: ["push", "wipe", "split"]

grid:
  columns: 12
  gutter: 0.3
  max_width: 10        # inches

# Breakpoints for responsive thinking
# (Presentations are fixed size, but this helps with layout logic)
breakpoints:
  mobile: 4            # 4:3 aspect ratio thinking
  desktop: 16          # 16:9 standard
---

# Telekom Corporate Modern Template

## Usage Guidelines

### Do's
- Use Magenta sparingly (10-20% of slide)
- Maintain generous whitespace
- Left-align text, never justify
- Use Helvetica Neue for headlines, Arial for body

### Don'ts
- Never use Magenta for body text
- Avoid centered text blocks
- Don't exceed 4 visual elements per slide
- Never use stock PowerPoint templates

## Slide Master Examples

### Title Slide
```yaml
master: title
config:
  section: "01"
  background: secondary
```
Layout:
- Section number top-left (muted)
- Title centered, large
- Accent bar bottom-left
- Subtitle below title, magenta

### Content Slide
```yaml
master: content
config:
  max_bullets: 4
  card_layout: true
```
Layout:
- Title top, left-aligned
- Content in cards or clean bullets
- Magenta accent line under title

### Stats Slide
```yaml
master: stats
config:
  card_style: elevated
```
Layout:
- 2-4 stat cards in grid
- Large numbers (magenta)
- Labels below numbers
- Cards with subtle shadow
