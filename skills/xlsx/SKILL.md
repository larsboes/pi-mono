---
name: xlsx
description: Use when working with spreadsheet files — create, read, edit, or analyze .xlsx, .xlsm, .csv, or .tsv files. Includes formatting, formulas, charting, and data cleaning.
---

<!--
🌐 COMMUNITY SKILL

Part of the pi-mono open skills collection.
- Repository: https://github.com/larsboes/pi-mono
- License: MIT
- Author: {{author}}

Contributions welcome via GitHub issues and PRs.
Last synced: 2026-02-18 21:06:32
-->

# Spreadsheet Processing

## Tool Selection

| Task | Tool |
|---|---|
| Data analysis, bulk ops, simple export | pandas |
| Formulas, formatting, Excel-specific features | openpyxl |
| Formula recalculation | LibreOffice via `scripts/recalc.py` |

## Core Rule: Formulas, Not Hardcoded Values

```python
# ❌ WRONG — calculating in Python
sheet['B10'] = df['Sales'].sum()

# ✅ CORRECT — let Excel calculate
sheet['B10'] = '=SUM(B2:B9)'
```

All calculations must be Excel formulas so the spreadsheet stays dynamic.

## pandas — Data Analysis

```python
import pandas as pd

df = pd.read_excel('file.xlsx')                          # first sheet
all_sheets = pd.read_excel('file.xlsx', sheet_name=None) # all sheets as dict
df = pd.read_excel('file.xlsx', dtype={'id': str}, usecols=['A', 'C'], parse_dates=['date'])

df.describe()  # statistics
df.to_excel('output.xlsx', index=False)
```

## openpyxl — Create & Edit

### Create
```python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

wb = Workbook()
ws = wb.active

ws['A1'] = 'Revenue'
ws['A1'].font = Font(bold=True, color='FF0000')
ws['A1'].fill = PatternFill('solid', start_color='FFFF00')
ws['A1'].alignment = Alignment(horizontal='center')
ws.column_dimensions['A'].width = 20

ws['B2'] = '=SUM(B3:B10)'
ws.append(['Row', 'of', 'data'])
wb.save('output.xlsx')
```

### Edit
```python
from openpyxl import load_workbook

wb = load_workbook('existing.xlsx')  # preserves formulas
ws = wb['SheetName']

ws['A1'] = 'New Value'
ws.insert_rows(2)
ws.delete_cols(3)

new_sheet = wb.create_sheet('NewSheet')
wb.save('modified.xlsx')
```

**Warning:** `load_workbook('file.xlsx', data_only=True)` reads calculated values but **permanently loses formulas** if saved.

## Formula Recalculation (Mandatory)

openpyxl writes formulas as strings without calculating values. Always recalculate:

```bash
python scripts/recalc.py output.xlsx [timeout_seconds]
```

Returns JSON:
```json
{
  "status": "success",
  "total_errors": 0,
  "total_formulas": 42,
  "error_summary": {}
}
```

If `errors_found`: fix errors, recalculate again. Zero formula errors required.

## Financial Model Standards

### Color Coding
- **Blue text** (0,0,255): Hardcoded inputs / scenario variables
- **Black text** (0,0,0): All formulas and calculations
- **Green text** (0,128,0): Links from other worksheets
- **Red text** (255,0,0): External file links
- **Yellow background** (255,255,0): Key assumptions needing attention

### Number Formatting
- Years: text strings ("2024" not "2,024")
- Currency: `$#,##0` with units in headers ("Revenue ($mm)")
- Zeros: format as "-" including percentages (`$#,##0;($#,##0);-`)
- Percentages: `0.0%`
- Multiples: `0.0x`
- Negatives: parentheses `(123)` not `-123`

### Formula Rules
- ALL assumptions in separate cells, not hardcoded in formulas
- `=B5*(1+$B$6)` not `=B5*1.05`
- Document hardcodes: "Source: [System], [Date], [Reference], [URL]"

## Verification Checklist

- [ ] Test 2-3 sample references before building full model
- [ ] Column mapping correct (column 64 = BL, not BK)
- [ ] Row offset: DataFrame row 5 = Excel row 6 (1-indexed)
- [ ] NaN handling with `pd.notna()`
- [ ] Division by zero checks
- [ ] Cross-sheet refs use `Sheet1!A1` format
- [ ] Edge cases: zero, negative, large values

## Quality Rules

- Professional font (Arial, Times New Roman) unless instructed otherwise
- When editing templates: EXACTLY match existing format/style/conventions
- Template conventions always override these guidelines
- Minimal Python code — no verbose comments or redundant operations

