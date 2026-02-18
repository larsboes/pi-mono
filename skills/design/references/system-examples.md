# Design System Examples

## Precision & Density (Dashboard/Admin)

```markdown
# Design System

## Direction
Personality: Precision & Density
Foundation: Cool (slate)
Depth: Borders-only

## Tokens

### Spacing
Base: 4px
Scale: 4, 8, 12, 16, 24, 32

### Colors
--foreground: slate-900
--secondary: slate-600
--muted: slate-400
--faint: slate-200
--border: rgba(0, 0, 0, 0.08)
--accent: blue-600

### Radius
Scale: 4px, 6px, 8px (sharp, technical)

### Typography
Font: system-ui
Scale: 11, 12, 13, 14 (base), 16, 18
Weights: 400, 500, 600
Mono: SF Mono, Consolas (for data)

## Patterns

### Button
- Height: 32px (compact)
- Padding: 8px 12px
- Radius: 4px
- Font: 13px, 500 weight
- Border: 1px solid

### Card
- Border: 0.5px solid (faint)
- Padding: 12px
- Radius: 6px
- No shadow

### Table Cell
- Padding: 8px 12px
- Font: 13px tabular-nums
- Border-bottom: 1px solid (faint)

## Decisions

| Decision | Rationale | Date |
|---|---|---|
| Borders-only | Information density > visual lift | 2026-01-15 |
| Compact sizing | Power users, high information density | 2026-01-15 |
| System fonts | Performance, native feel | 2026-01-15 |
```

---

## Warmth & Approachability (Consumer App)

```markdown
# Design System

## Direction
Personality: Warmth & Approachability
Foundation: Warm (stone)
Depth: Subtle shadows

## Tokens

### Spacing
Base: 4px
Scale: 8, 12, 16, 24, 32, 48 (generous)

### Colors
--foreground: stone-900
--secondary: stone-600
--muted: stone-400
--faint: stone-200
--accent: orange-500
--shadow: 0 1px 3px rgba(0, 0, 0, 0.08)

### Radius
Scale: 8px, 12px, 16px (soft, friendly)

### Typography
Font: Inter (approachable, readable)
Scale: 13, 14, 15, 16 (base), 18, 20, 24
Weights: 400, 500, 600

## Patterns

### Button
- Height: 40px (comfortable)
- Padding: 12px 20px
- Radius: 8px
- Font: 15px, 500 weight
- Shadow: subtle

### Card
- Border: none
- Padding: 20px
- Radius: 12px
- Shadow: 0 1px 3px rgba(0,0,0,0.08)
- Background: white on stone-50

### Input
- Height: 44px
- Padding: 12px 16px
- Radius: 8px
- Border: 1.5px solid (faint)

## Decisions

| Decision | Rationale | Date |
|---|---|---|
| Subtle shadows | Gentle depth, approachable feel | 2026-01-15 |
| Generous spacing | Focused tasks, not cramming info | 2026-01-15 |
| Warm foundation | Human, comfortable, inviting | 2026-01-15 |
```

---

## Sophistication & Trust (Finance/Enterprise)

```markdown
# Design System

## Direction
Personality: Sophistication & Trust
Foundation: Cool (zinc)
Depth: Layered shadows

## Tokens

### Spacing
Base: 4px
Scale: 4, 8, 12, 16, 24, 32, 48

### Colors
--foreground: zinc-900
--secondary: zinc-500
--muted: zinc-400
--faint: zinc-100
--accent: emerald-600
--shadow-sm: 0 1px 2px rgba(0,0,0,0.05)
--shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1)
--shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1)

### Radius
Scale: 4px, 8px, 12px (medium)

### Typography
Font: DM Sans / Source Serif 4
Scale: 12, 14 (base), 16, 20, 28, 36
Weights: 400, 500, 700

## Patterns

### Button
- Height: 44px
- Padding: 12px 24px
- Radius: 8px
- Font: 14px, 500 weight
- Shadow: shadow-sm

### Card
- Border: 1px solid zinc-100
- Padding: 24px
- Radius: 12px
- Shadow: shadow-md
- Background: white

## Decisions

| Decision | Rationale | Date |
|---|---|---|
| Layered shadows | Premium, trustworthy depth perception | 2026-01-15 |
| Serif headings | Authority, established feel | 2026-01-15 |
| Emerald accent | Growth, stability — finance-appropriate | 2026-01-15 |
```

---

## System Template (Blank)

```markdown
# Design System

## Direction
Personality: [chosen direction]
Foundation: [warm/cool/neutral/tinted]
Depth: [borders-only/subtle-shadows/layered-shadows]

## Tokens

### Spacing
Base: [4px/8px]
Scale: [values]

### Colors
--foreground: [value]
--secondary: [value]
--muted: [value]
--faint: [value]
--accent: [value]

### Radius
Scale: [values]

### Typography
Font: [primary / secondary]
Scale: [values]
Weights: [values]

## Patterns

### [Component]
- [properties]

## Decisions

| Decision | Rationale | Date |
|---|---|---|
```
