---
name: notion
description: "Use when interacting with Notion workspaces - reading pages, writing content, querying databases, and basic page/database operations via the Notion API."
---

<!--
🌐 COMMUNITY SKILL

Part of the pi-mono open skills collection.
- Repository: https://github.com/larsboes/pi-mono
- License: MIT
- Author: {{author}}

Contributions welcome via GitHub issues and PRs.
Last synced: 2026-02-18 21:06:30
-->

# Notion Skill

Production-ready Notion CLI und Library für Lesen, Schreiben, Exportieren und Schema-Inspektion.

## Overview

- **TypeScript CLI** für alle CRUD-Operationen
- **Auto-Token-Load** aus `.zshrc` / `.bashrc`
- **Pagination automatisch** (keine 100-Eintrag Limit)
- **Markdown Export** mit Attachments
- **CSV Export** für Databases
- **Schema Inspection** für Database-Struktur

## Requirements

- Node.js ≥18
- `NOTION_API_TOKEN` in Environment oder Shell-Config
- Notion Integration mit Zugriff auf den Workspace

### Setup

```bash
# 1. Token einmalig setzen (wird automatisch gefunden)
echo 'export NOTION_API_TOKEN=secret_xxx' >> ~/.zshrc

# 2. Build
cd ~/.pi/skills/notion && npm install && npm run build

# 3. Alias (optional)
alias notion='node ~/.pi/skills/notion/dist/scripts/notion.js'
```

## CLI Usage

### Read (Markdown Export)

```bash
notion read <page-id-or-url>
notion read <id> --children                    # Mit verschachtelten Blöcken
notion read <id> --download=./images           # Attachments herunterladen
```

### Query Database

```bash
notion query <database-id-or-url>
notion query <id> --filter="Status=Done"
notion query <id> --format=json --limit=50
```

### Search

```bash
notion search "Keyword"
notion search "Project" --filter=page
notion search "Tasks" --filter=database
```

### Create

```bash
# Als Child-Page
notion create --parent=<page-id> --title="New Page"

# Als Database-Eintrag
notion create --database=<db-id> --props="Name=Task,Status=To Do,Priority=High"
```

### Update

```bash
notion update <page-id> --props="Status=Done,Priority=Low"
```

### Schema (Database-Struktur)

```bash
notion schema <database-id-or-url>
# Zeigt: Properties, Types, Select-Optionen, Formeln
```

### Export (CSV)

```bash
notion export <database-id-or-url>
notion export <id> --output=mydata.csv
```

## Library Usage

```typescript
import { NotionClient } from "./lib/notion-client.js";

const client = new NotionClient({ token: process.env.NOTION_API_TOKEN });

// Page erstellen
const page = await client.createPage({
  parent: { database_id: "db-id" },
  properties: {
    Name: { title: [{ text: { content: "New Task" } }] },
    Status: { select: { name: "To Do" } },
  },
});

// Page updaten
await client.updatePage("page-id", {
  Status: { select: { name: "Done" } },
});

// File URL holen
const url = await client.getFileUrl("block-id");
```

## IDs finden

### Page/Database ID aus URL
```
https://www.notion.so/Workspace/Title-1a2b3c4d5e6f7g8h9i0j1k2l
                          ^^^^^^^^^^^^^^^^^^^^^^^^
                          ID (32 chars)
```

### Integration Zugriff gewähren
1. Page/Database öffnen
2. Share → Add connections
3. Deine Integration auswählen

## Error Handling

| Status | Bedeutung | Lösung |
|--------|-----------|--------|
| 401 | Ungültiger Token | `NOTION_API_TOKEN` prüfen |
| 403 | Kein Zugriff | Integration mit Page verbinden |
| 404 | Nicht gefunden | ID prüfen |
| 429 | Rate limit | Automatisch retry nach 1s, 2s, 4s |
| 400 | Validation Error | Property-Namen prüfen (Case-sensitive!) |

## Project Structure

```
~/.pi/skills/notion/
├── docs/
│   ├── prd.md              # Product Requirements
│   └── plan.md             # Implementation Plan
├── lib/
│   ├── notion-client.ts    # HTTP client + retry logic
│   └── notion-md.ts        # Markdown converter
├── scripts/
│   └── notion.ts           # CLI entry point
├── references/
│   └── notion-types.ts     # Complete API types
├── package.json
└── tsconfig.json
```

## Development

```bash
cd ~/.pi/skills/notion
npm run dev      # Watch mode
npm run build    # Compile
```


## References

- Notion API Docs: https://developers.notion.com/reference/intro
- Integration Setup: https://www.notion.so/my-integrations

---
*Crystallized by Cortex on 2026-02-18*
