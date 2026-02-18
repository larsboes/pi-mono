# Plan: Notion Skill Upgrade

**PRD:** docs/prd.md  
**Status:** in-progress

## Tasks

### Phase 1: Foundation
- [x] Task 1: Create `references/notion-types.ts` – Core Notion API interfaces
- [x] Task 2: Create `lib/notion-client.ts` – HTTP client with retry + rate limit handling
- [x] Task 3: Create `lib/notion-md.ts` – Block → Markdown converter (paragraph, heading, list, code)

### Phase 2: CLI
- [x] Task 4: Create `scripts/notion.ts` – CLI entry point with argument parsing
- [x] Task 5: Implement `read` command – fetch page blocks, output Markdown
- [x] Task 6: Implement `query` command – database query with pagination

### Phase 3: Polish
- [x] Task 7: Add error handling – 401/403/404 with helpful messages
- [x] Task 8: Create `package.json` with build script
- [x] Task 9: Test manually with real Notion page
- [x] Task 10: Update SKILL.md with new usage examples

## Notes
- Phase 1 & 2 done. Types are comprehensive (400+ lines).
- Client has exponential backoff for rate limits.
- Markdown converter handles all common block types.
- CLI supports: read (with --children), query (with --filter), search.

## Build & Test

```bash
cd ~/.pi/skills/notion
npm install
npm run build

# Test with real page
export NOTION_API_TOKEN=secret_xxx
node dist/scripts/notion.js read <page-id>
```
