# Pi Mono Capabilities Reference

Quick reference for what pi-mono provides out of the box. Consult when building skills, extensions, or deciding what already exists vs. what needs building.

## Extension API (ExtensionAPI)

Extensions are TypeScript modules loaded via jiti (no compilation needed).

### Event Hooks

| Event | When | Can Modify? |
|-------|------|-------------|
| `session_start` | Initial session load | No |
| `session_shutdown` | On exit (Ctrl+C, Ctrl+D, SIGTERM) | No |
| `before_agent_start` | After user prompt, before agent loop | System prompt, inject messages |
| `agent_start` / `agent_end` | Per user prompt | agent_end has messages[] |
| `turn_start` / `turn_end` | Per LLM response + tool calls | turn_end has message + toolResults |
| `context` | Before each LLM call | Messages (deep copy, safe to mutate) |
| `message_start` / `message_update` / `message_end` | Message lifecycle | No |
| `tool_call` | Before tool executes | Can block |
| `tool_result` | After tool executes | Can modify result (chains like middleware) |
| `tool_execution_start` / `update` / `end` | Tool execution lifecycle | No |
| `input` | User input received, before expansion | Can transform, handle, or continue |
| `model_select` | Model changed | No |
| `user_bash` | User `!` or `!!` command | Can intercept, provide custom ops |
| `resources_discover` | Startup + reload | Return additional skill/prompt/theme paths |
| `session_before_switch` / `session_switch` | New/resume session | Can cancel |
| `session_before_fork` / `session_fork` | Fork session | Can cancel |
| `session_before_compact` / `session_compact` | Compaction | Can cancel or customize |
| `session_before_tree` / `session_tree` | Tree navigation | Can cancel or customize |

### Registration Methods

| Method | Purpose |
|--------|---------|
| `pi.registerTool(definition)` | LLM-callable tool with TypeBox schema |
| `pi.registerCommand(name, options)` | Slash command (`/name`) with handler |
| `pi.registerShortcut(key, options)` | Keyboard shortcut |
| `pi.registerFlag(name, options)` | CLI flag (`--name`) |
| `pi.registerMessageRenderer(type, renderer)` | Custom message rendering |
| `pi.registerProvider(name, config)` | Custom LLM provider |

### Action Methods

| Method | Purpose |
|--------|---------|
| `pi.sendMessage(message, options)` | Inject custom message (steer/followUp/nextTurn) |
| `pi.sendUserMessage(content, options)` | Send as user message (always triggers turn) |
| `pi.appendEntry(type, data)` | Persist state (NOT sent to LLM) |
| `pi.setSessionName(name)` | Set session display name |
| `pi.exec(command, args, options)` | Execute shell command |
| `pi.getActiveTools()` / `pi.setActiveTools(names)` | Manage active tools |
| `pi.setModel(model)` | Switch model |
| `pi.events` | Shared EventBus for cross-extension communication |

### ExtensionContext (ctx)

Available in all event handlers:

| Property/Method | Purpose |
|-----------------|---------|
| `ctx.ui` | UI methods (select, confirm, input, notify, setStatus, setWidget, setFooter, custom) |
| `ctx.hasUI` | False in print/RPC mode |
| `ctx.cwd` | Current working directory |
| `ctx.sessionManager` | Read-only session access (entries, branch, tree) |
| `ctx.modelRegistry` | Model and API key access |
| `ctx.model` | Current model |
| `ctx.isIdle()` | Whether agent is streaming |
| `ctx.abort()` | Abort current operation |
| `ctx.shutdown()` | Graceful exit |
| `ctx.getContextUsage()` | Token usage stats |
| `ctx.compact(options)` | Trigger compaction |
| `ctx.getSystemPrompt()` | Current system prompt |

### ExtensionCommandContext (command handlers only)

| Method | Purpose |
|--------|---------|
| `ctx.waitForIdle()` | Wait for agent to finish |
| `ctx.newSession(options)` | Create new session |
| `ctx.fork(entryId)` | Fork from entry |
| `ctx.navigateTree(targetId, options)` | Tree navigation |
| `ctx.switchSession(path)` | Switch session |
| `ctx.reload()` | Hot-reload extensions, skills, prompts, themes |

**⚠️ `reload()` is ONLY on ExtensionCommandContext (slash commands), NOT on ExtensionContext (tools, hooks).** To call reload from a tool, capture the reference from a command handler:
```typescript
let reloadFn: (() => Promise<void>) | null = null;
// In every command handler:
const captureReload = (ctx) => { if (!reloadFn) reloadFn = () => ctx.reload(); };
// In tool execute:
if (reloadFn) await reloadFn();
```

## Hook Chaining Behavior

**`before_agent_start` handlers chain sequentially across extensions.** Each handler receives the `systemPrompt` as modified by the previous handler. This means:
- Extension A appends memory context → Extension B sees that appended prompt
- Order depends on extension loading order (directory listing, then settings.json order)
- Return `{}` to pass through without modification
- Return `{ systemPrompt: "..." }` to replace/append

**`tool_result` handlers also chain** — each gets the result from the previous handler (middleware pattern).

Other hooks (`agent_end`, `turn_end`, `session_start`, etc.) fire independently — return values don't chain.

## Built-in Tools

| Tool | Description |
|------|-------------|
| `read` | Read file contents (with offset/limit) |
| `bash` | Execute bash commands |
| `edit` | Surgical find-and-replace edits |
| `write` | Create or overwrite files |
| `grep` | Search file contents (respects .gitignore) |
| `find` | Find files by glob pattern |
| `ls` | List directory contents |

All tools support custom operations for remote execution (SSH, containers).

## Skill System

- Discovery: `~/.pi/agent/skills/`, `.pi/skills/`, packages, settings, CLI
- Format: `SKILL.md` with YAML frontmatter (name + description)
- Progressive disclosure: descriptions always in context, body loaded on-demand via read tool
- Commands: `/skill:name` for explicit invocation
- Hot-reload: `/reload` refreshes all skills
- Spec: [agentskills.io/specification](https://agentskills.io/specification)

## Session System

- Tree structure with id/parentId linking (in-place branching)
- JSONL persistence
- Compaction with configurable token preservation
- Branch summaries for tree navigation
- Labels for bookmarking entries

## Settings

- Global: `~/.pi/agent/settings.json`
- Project: `.pi/settings.json` (overrides global)
- Key settings: model, thinking level, compaction, retry, transport, packages, extensions, skills

## Package System

- Install: `pi install npm:@package` or `pi install git:repo`
- Package.json `pi` field declares extensions, skills, prompts, themes
- Local dev: symlink into `~/.pi/agent/extensions/` or add to settings.json

## Key Directories

| Path | Purpose |
|------|---------|
| `~/.pi/agent/` | Global config (auth, settings, sessions, extensions) |
| `~/.pi/agent/extensions/` | Global extensions (auto-discovers `*.ts` and `*/index.ts`) |
| `~/.pi/agent/extensions/*/index.ts` | Subdirectory extension pattern (used for npm packages + symlinks) |
| `~/.pi/agent/skills/` | Global agent skills |
| `~/.pi/agent/sessions/` | Session files |
| `~/.pi/agent/auth.json` | Credentials |
| `~/.pi/agent/settings.json` | Global settings |
| `~/.pi/memory/` | Memory files (MEMORY.md, IDENTITY.md, SOUL.md, USER.md, daily/) |
| `~/.pi/skills/` | User skills (separate from agent skills, also auto-discovered) |
| `.pi/` | Project-local config |
| `.pi/extensions/` | Project-local extensions (auto-discovers `*.ts` and `*/index.ts`) |
| `.pi/skills/` | Project-local skills |

**Extension auto-discovery paths (in order):**
1. `~/.pi/agent/extensions/*.ts` — global single-file extensions
2. `~/.pi/agent/extensions/*/index.ts` — global subdirectory extensions (symlinks, packages)
3. `.pi/extensions/*.ts` — project-local single-file
4. `.pi/extensions/*/index.ts` — project-local subdirectory
5. `settings.json` → `extensions: ["/path/to/extension.ts"]` — explicit paths
6. `settings.json` → `packages: ["npm:@pkg"]` — installed packages with `pi.extensions` field

**Skill auto-discovery paths:**
1. `~/.pi/agent/skills/*/SKILL.md` — global agent skills
2. `~/.pi/skills/*/SKILL.md` — global user skills
3. `.pi/skills/*/SKILL.md` — project-local skills
4. `settings.json` → `skills: ["/path/to/skills/dir"]` — explicit paths
5. Packages with `pi.skills` field

## Available Imports for Extensions

| Package | Purpose |
|---------|---------|
| `@mariozechner/pi-coding-agent` | Extension types, tool factories, SDK |
| `@sinclair/typebox` | Schema definitions for tool parameters |
| `@mariozechner/pi-ai` | LLM API, StringEnum, Model types |
| `@mariozechner/pi-tui` | TUI components for custom rendering |
| Node.js built-ins | `node:fs`, `node:path`, etc. |
| npm packages | Via package.json in extension directory |
