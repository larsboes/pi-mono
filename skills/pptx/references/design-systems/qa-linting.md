# QA & Linting

## Automated Quality Checks

```bash
# Run QA before finalizing
pi pptx lint deck.pptx --fix
```

## Checks Performed

| Check | Severity | Auto-Fix |
|-------|----------|----------|
| Contrast ratio < 4.5:1 | Error | Suggest colors |
| Text overflow | Error | Reduce font size |
| Bullet-only slide | Warning | Suggest visual |
| Same layout repeated | Warning | Suggest variation |
| Placeholder text (lorem, xxx) | Error | Flag for edit |
| Font inconsistency | Warning | Standardize |
| Margin violation (< 0.5in) | Error | Adjust position |
| Accent color overuse | Warning | Reduce to 10% |

## Visual QA Commands

```bash
# Generate inspection grid
pi pptx qa --visual deck.pptx

# Check specific slide
pi pptx qa --slide 5 deck.pptx

# Compare two versions
pi pptx qa --diff deck-v1.pptx deck-v2.pptx
```
