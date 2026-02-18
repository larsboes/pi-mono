# PRD: Notion Skill Upgrade

## Problem
Der aktuelle Notion Skill ist auf Tutorial-Level – curl-Beispiele ohne funktionierende Tools. Für produktive Arbeit fehlt:
- Pagination bei großen Databases
- Markdown↔Notion Konvertierung
- Error Handling / Retry Logic
- TypeScript-Typen

## Solution
Production-ready Notion Skill mit:
1. **TypeScript CLI** (`scripts/notion.ts`) – statt curl
2. **Markdown Export** – Page → Markdown mit korrekter Formatierung
3. **Database Query** – mit Pagination, Filter, Sort
4. **Type-Safe API** – Notion API Types
5. **Robust Error Handling** – Rate limits, retries

## Scope

### In Scope
- `scripts/notion.ts` – CLI für read/query/create
- `lib/notion-client.ts` – HTTP client mit retry logic
- `lib/notion-md.ts` – Block → Markdown Konvertierung
- `references/notion-types.ts` – API Type definitions
- Pagination für Database Queries
- Environment check (NOTION_API_TOKEN)

### Out of Scope
- Two-way sync (Notion ← Markdown import)
- Real-time Webhooks
- Database Schema Management
- Rich-text editing in Notion

## Success Criteria
- [ ] `notion read <page-id>` → Markdown Output
- [ ] `notion query <db-id> --filter "Status=Done"` → JSON/Table
- [ ] Pagination automatisch (keine 100-Eintrag Limit)
- [ ] Klare Fehlermeldungen bei 401/403/404
- [ ] TypeScript strict mode, keine `any`

## Non-Goals
- Keine GUI/Interactive Mode
- Keine Backup/Restore Funktionalität
- Keine komplexe Filter-Syntax (nur einfache Key=Value)

## Constraints
- Node.js + TypeScript
- Zero external runtime dependencies (nur dev deps)
- Eigener Code statt `notion-to-md` library

## Open Questions
- Soll der CLI als global installierbares Binary dienen oder nur lokal?
