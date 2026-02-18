# Shape Library

Modern shape styles for presentations.

## Shape Styles

### neumorphic
Soft, extruded look
- **Shadow Light:** `-6px -6px 12px rgba(255,255,255,0.8)`
- **Shadow Dark:** `6px 6px 12px rgba(0,0,0,0.1)`
- **Background:** `{{surface}}`
- **Border:** none

### glassmorphism
Frosted glass effect
- **Background:** `rgba(255,255,255,0.1)`
- **Backdrop Filter:** `blur(10px)`
- **Border:** `1px solid rgba(255,255,255,0.2)`

### outlined
Clean outline only
- **Background:** `transparent`
- **Border:** `2px solid {{primary}}`
- **Border Radius:** `4px`

### elevated
Elevated card
- **Shadow:** `0 4px 20px rgba(0,0,0,0.15)`
- **Background:** `white`
- **Border Radius:** `8px`

### brutalist
Brutalist block
- **Background:** `{{primary}}`
- **Border:** `3px solid {{secondary}}`
- **Offset Shadow:** `4px 4px 0 {{secondary}}`

## Visual Elements

### accent_line
- **Type:** rectangle
- **Height:** 4px
- **Width:** 20%
- **Color:** `{{accent}}`

### ghost_number
- **Type:** text
- **Size:** 120pt
- **Opacity:** 0.05
- **Position:** background

### connector_arrow
- **Type:** shape
- **Style:** right-arrow
- **Color:** `{{muted}}`

### badge
- **Type:** round-rect
- **Padding:** 4px 12px
- **Radius:** 12px
- **Background:** `{{primary}}`
- **Text Color:** white
