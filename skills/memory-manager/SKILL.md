---
name: memory-manager
description: Manage long-term and daily memory with semantic search. Use to save new information or search past context. Memory reading is handled by the memory-bootstrap extension.
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

# Memory Manager

Semantic memory system for pi. Stores memories in Markdown, searches with Gemini vector embeddings + keyword fallback.

## Commands

### Search memories
```bash
cd ~/.pi/skills/memory-manager && node src/cli.js search "<query>"
```

### Add to long-term memory
```bash
cd ~/.pi/skills/memory-manager && node src/cli.js add "<text>"
```

### Add to daily log
```bash
cd ~/.pi/skills/memory-manager && node src/cli.js add --daily "<text>"
```

### Read a memory file
```bash
cd ~/.pi/skills/memory-manager && node src/cli.js get <filename>
```
Files: `MEMORY.md`, `IDENTITY.md`, `USER.md`, `daily/YYYY-MM-DD.md`

### List all memory files
```bash
cd ~/.pi/skills/memory-manager && node src/cli.js list
```

### Rebuild vector index
```bash
cd ~/.pi/skills/memory-manager && node src/cli.js reindex
```

### Check status
```bash
cd ~/.pi/skills/memory-manager && node src/cli.js status
```

## Storage

- **Long-term**: `~/.pi/memory/MEMORY.md`
- **Identity**: `~/.pi/memory/IDENTITY.md`
- **User Profile**: `~/.pi/memory/USER.md`
- **Daily Logs**: `~/.pi/memory/daily/YYYY-MM-DD.md`
- **Vector Index**: `~/.pi/memory/index/`

## When to Use

- **Search**: When user asks about past context, preferences, projects, or anything discussed before.
- **Add**: When user shares important facts, preferences, or project details worth remembering.
- **Add --daily**: For session summaries, decisions made today, running notes.
- **Reindex**: After manually editing memory files.

