# Fork Architecture

How this fork differs from upstream `badlogic/pi-mono` in terms of runtime, tooling, and structure.

---

## Runtime

**Agent binary:** Runs under Bun instead of Node.

```bash
# alias in dotfiles
alias pi='bun ~/Developer/pi-mono/packages/coding-agent/dist/cli.js'
```

Bun runs Node.js output natively — no code changes required. All extensions load inside the pi process and therefore also run under Bun.

**Build toolchain:** Still npm. Upstream uses npm workspaces; keeping it avoids lock file conflicts on every upstream merge. One caveat: the `packages/ai` build script uses `tsgo` which resolves differently under bun vs npm — `pi-rebuild` uses `npx tsgo` for that package specifically.

```bash
# pi-rebuild alias handles the mixed toolchain
alias pi-rebuild='cd ~/Developer/pi-mono && cd packages/tui && npm run build && ...'
```

---

## Extensions

Public extensions live in `extensions/` inside this repo — not as separate packages or npm installs. Each is symlinked into `~/.pi/agent/extensions/`:

```
pi-mono/extensions/
  cortex/          # PAI memory + skill tracking
  mitsupi/         # Personal utilities
  pai/             # PAI statusline + skill integration
  ceo-board/       # Multi-agent strategic council
  buddy/           # Companion display
  mcp-adapter/     # Token-efficient MCP proxy
  web-access/      # Web search + content extraction
  markdown-preview/ # Rendered markdown in terminal/browser
  stats/           # SQLite usage dashboard (Bun-only CLI)
  swarm/           # Multi-agent DAG orchestration (planned)
```

`stats` is the one exception — it's a standalone Bun CLI (`bun:sqlite`, `Bun.serve`) invoked directly, not loaded by pi's extension runner.

DT-private extensions live in a separate private repo, symlinked alongside these.

---

## Upstream Sync

```
upstream/main  →  main  →  dev
```

- `main` = upstream + our patches (default working branch)
- `dev` = integration branch for new work before it's stable

Merge upstream into `main` directly:

```bash
git fetch upstream
git checkout main
git merge upstream/main
# resolve conflicts (generate-models.ts is the most likely)
bun run build   # or npm run build
git push origin main
```

Active patches and conflict risk documented in `ADDITIONS.md`.
