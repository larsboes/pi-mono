---
name: context7
description: Search documentation using Context7's vector embeddings. Provides semantic search over code documentation (libraries, frameworks, APIs) via the c7 CLI.
---

<!--
🌐 COMMUNITY SKILL

Part of the pi-mono open skills collection.
- Repository: https://github.com/larsboes/pi-mono
- License: MIT
- Author: {{author}}

Contributions welcome via GitHub issues and PRs.
Last synced: 2026-02-18 21:06:29
-->

# Context7 Documentation Search

Use when searching documentation using Context7's vector embeddings. Provides semantic search over code documentation (libraries, frameworks, APIs).

## Quick Start

```bash
# Search for a project
c7 search react

# Query documentation vectors
c7 mdn fetch API
c7 python requests authentication
c7 nodejs file system

# Get project info
c7 info mdn

# Save results to file
c7 react hooks --save
```

## CLI Reference

### Search Projects
Find available documentation projects:
```bash
npx context7 search <term>
# or
c7 search <term>
```

Returns: List of projects with identifiers (paths like `mdn/mdn`, `pandas-dev/pandas`, etc.)

### Query Vectors
Search documentation using natural language:
```bash
npx context7 <projectIdentifier> <query...>
# or  
c7 <project> "how to use hooks"
c7 <project> error handling patterns
c7 <project> async await examples
```

**Parameters:**
- `projectIdentifier`: Project path (`mdn/mdn`), partial path (`react`), or unique name
- `query`: Natural language question or topic

**Options:**
- `-t, --type`: Output format (`txt` | `json`) — default: `txt`
- `-k, --tokens`: Max tokens — default: `5000`
- `-s, --save`: Save output to file — default: `false`

### Project Info
Display metadata about a project:
```bash
c7 info <projectIdentifier>
```

## Common Patterns

### Quick API Lookup
```bash
c7 lodash debounce throttle
c7 axios interceptors error handling
c7 typescript generic constraints
```

### Deep Dive (JSON for parsing)
```bash
c7 pandas dataframe filtering -t json -k 10000
```

### Save for Reference
```bash
c7 nextjs app router -s -k 8000
# Saves to file in current directory
```

### Multi-Project Search
```bash
# Find the right project first
c7 search python data
# Then query the specific one
c7 pandas-dev/pandas groupby aggregation
```

## Project Identifiers

Common patterns:
- `mdn/mdn` — MDN Web Docs
- `facebook/react` — React
- `microsoft/TypeScript` — TypeScript
- `python/cpython` — Python standard library
- `pandas-dev/pandas` — Pandas
- `numpy/numpy` — NumPy

Use `c7 search <term>` to find the exact identifier.

## Tips

- **Be specific**: "react useEffect cleanup" > "react hooks"
- **Include error context**: "axios network error handling" > "axios errors"
- **Use JSON for piping**: `-t json | jq '.results[]'`
- **Token budget**: Default 5000 is ~3750 words; increase for deep dives

## When to Use

✅ **Use Context7 when:**
- You need semantic search over docs (not just keyword)
- The topic is API/library usage
- You want curated, high-quality doc sources
- You need code examples with explanations

❌ **Don't use when:**
- You need real-time/package-specific info (use brave-search)
- The library isn't indexed in Context7
- You need version-specific docs (Context7 may lag)

## Usage in pi

Since pi doesn't have MCP client support, use the `bash` tool:

```bash
# Basic query
bash: c7 mdn fetch API

# Save JSON for processing
bash: c7 pandas groupby -t json -s
read: pandas-groupby.json

# Search then query (two-step)
bash: c7 search numpy
bash: c7 numpy array broadcasting -k 3000
```

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `Project not found` | Wrong identifier | Run `c7 search <name>` first |
| `Command not found` | c7 not installed | Run `npm install -g context7` or use `npx context7` |
| Empty results | Query too vague | Add specificity: "react useEffect" > "react" |
| Timeout | Large token request | Reduce `-k` value |

### Parsing JSON Output

Save JSON, then extract code examples:

```bash
# Query and save JSON
bash: c7 typescript generics -t json -s -k 2000

# Extract all code blocks
bash: uv run ~/.pi/skills/context7/scripts/extract_code.py typescript-generics.json

# Filter by language
bash: uv run ~/.pi/skills/context7/scripts/extract_code.py typescript-generics.json -l typescript

# Output as JSON for further processing
bash: uv run ~/.pi/skills/context7/scripts/extract_code.py typescript-generics.json -f json

# Pipe directly (no file)
bash: c7 pandas groupby -t json | uv run ~/.pi/skills/context7/scripts/extract_code.py -l python
```

**extract_code.py options:**
| Option | Description |
|--------|-------------|
| `-f list` | Human-readable numbered list (default) |
| `-f merged` | Single merged markdown block |
| `-f json` | JSON array with metadata |
| `-l LANG` | Filter by language (python, javascript, etc.) |
| `-n 10` | Limit to N blocks (default: 50) |

