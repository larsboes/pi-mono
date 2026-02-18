# Charts & Data Visualization

## Chart from CSV/Inline Data

```bash
# Inline data
pi pptx chart --type bar --data "Q1:45,Q2:67,Q3:89,Q4:120" --slide

# From CSV
pi pptx chart --type line --from data.csv --x month --y revenue

# From Obsidian table
pi pptx chart --from "Vault:Resources/Data/Metrics.md" --type pie
```

## Markdown Table → Chart

```markdown
## Quarterly Performance

| Quarter | Revenue | Growth |
|---------|---------|--------|
| Q1      | 45M     | +5%    |
| Q2      | 67M     | +49%   |
| Q3      | 89M     | +33%   |
| Q4      | 120M    | +35%   |
```

Auto-detects: 3+ columns with numbers → suggests `line` or `bar` chart.

## Chart Types

| Type | Description | Best For |
|------|-------------|----------|
| `bar` | Vertical/horizontal bars | Comparisons, rankings |
| `line` | Trend lines with points | Time series, trends |
| `pie` | Segmented circle | Composition, parts of whole |
| `doughnut` | Pie with center hole | Composition (modern look) |
| `radar` | Spider chart | Multi-dimensional comparison |
| `stacked` | Stacked bars | Composition over time |
