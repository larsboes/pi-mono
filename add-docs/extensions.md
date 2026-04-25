# Adding an Extension

How to add a new extension to `extensions/` and wire it into the local pi setup.

---

## Structure

Every extension needs at minimum:

```
extensions/my-extension/
  index.ts          # Entry point — exports default function(pi: ExtensionAPI)
  package.json      # name, version, dependencies
  tsconfig.json     # extends ../../tsconfig.base.json
  .gitignore        # node_modules/
```

### `index.ts`

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // register tools, providers, hooks, slash commands
}
```

### `package.json`

```json
{
  "name": "@larsboes/pi-my-extension",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@mariozechner/pi-coding-agent": "*"
  }
}
```

### `tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["./**/*.ts"]
}
```

---

## Symlink into pi

```bash
ln -s ~/Developer/pi-mono/extensions/my-extension ~/.pi/agent/extensions/my-extension
```

pi loads all directories in `~/.pi/agent/extensions/` on startup.

---

## Install dependencies

Extensions use the `@mariozechner/pi-coding-agent` package from pi-mono's workspace. Install with npm from the extension directory:

```bash
cd extensions/my-extension
npm install
```

Or symlink directly to pi-mono's node_modules if the extension only needs `@mariozechner/*` packages (which are already in the workspace).

---

## ExtensionAPI surface

Key methods available on the `pi` object:

| Method | Purpose |
|--------|---------|
| `pi.registerTool(name, schema, handler)` | Add a new tool the model can call |
| `pi.registerProvider(name, config)` | Register an LLM provider or override an existing one |
| `pi.registerSlashCommand(name, handler)` | Add a `/command` |
| `pi.on("session_start", handler)` | Hook into session lifecycle |
| `pi.on("message", handler)` | Hook into message events |
| `pi.ui.notify(msg)` | Show a notification in the TUI |
| `pi.ui.setFooter(text)` | Set the status footer line |
| `pi.ui.setWidget(render)` | Render a widget below the editor |

Full API: `packages/coding-agent/src/core/extensions/types.ts`

---

## Exception: standalone CLI extensions

`stats` is not loaded by pi's extension runner — it's a standalone Bun CLI that uses `bun:sqlite` and `Bun.serve`. It lives in `extensions/` for co-location but doesn't follow the `ExtensionAPI` pattern. Run it directly:

```bash
bun ~/Developer/pi-mono/extensions/stats/src/index.ts
```

---

## Attribution

If porting from another repo, credit the source in `extensions/README.md` under the extension's entry.
