---
name: pi-extender
description: "Use when building pi extensions or skills that need to understand pi-mono's capabilities. Provides technical reference for the extension API, skill system, hooks, tools, and package structure."
---

<!--
🌐 COMMUNITY SKILL

Part of the pi-mono open skills collection.
- Repository: https://github.com/larsboes/pi-mono
- License: MIT
- Author: {{author}}

Contributions welcome via GitHub issues and PRs.
Last synced: 2026-02-18 21:06:31
-->

# Pi Extender

Technical reference skill for building pi extensions and skills. Consult before writing any extension or skill that interacts with pi-mono internals.

## When to Use

- Building a new pi extension (TypeScript module with lifecycle hooks)
- Creating a skill that needs to know what pi already provides
- Designing an installable npm package for pi (like sub-bar)
- Deciding whether something should be an extension vs. a skill
- Needing to understand available hooks, tools, or registration methods

## Extension vs. Skill Decision

| Build an **Extension** when... | Build a **Skill** when... |
|-------------------------------|--------------------------|
| Need lifecycle hooks (before_agent_start, agent_end, etc.) | Providing workflow guidance or domain knowledge |
| Registering LLM-callable tools | Task-specific instructions loaded on-demand |
| Modifying system prompt dynamically | Reference documentation for a tool/library |
| Intercepting/modifying tool calls | Decision trees, checklists, patterns |
| Custom UI widgets or commands | No runtime code needed |
| Cross-session state or persistence | One-off or infrequent workflows |

## Quick Reference

### Extension Entry Point

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function (pi: ExtensionAPI) {
  // hooks, tools, commands go here
}
```

### Installable Package Structure (npm)

```json
{
  "name": "@scope/pi-extension-name",
  "version": "0.1.0",
  "pi": {
    "extensions": ["index.ts"]
  },
  "keywords": ["pi-package"],
  "dependencies": {}
}
```

Install: `pi install npm:@scope/pi-extension-name`
Local dev: symlink into `~/.pi/agent/extensions/` or add path to settings.json

### Skill Structure

```
skill-name/
├── SKILL.md                # Required. YAML frontmatter + instructions.
├── references/             # Optional. Heavy docs, loaded on-demand.
├── scripts/                # Optional. Executable code.
└── assets/                 # Optional. Templates, images.
```


## References

- [pi-capabilities.md](references/pi-capabilities.md) — Full API reference: all hooks, registration methods, action methods, built-in tools, session system, settings, directories
- [pi-mono extensions docs](~/Developer/pi/pi-mono/packages/coding-agent/docs/extensions.md) — Official extension documentation with examples
- [pi-mono skills docs](~/Developer/pi/pi-mono/packages/coding-agent/docs/skills.md) — Official skill specification
- [pi-mono SDK docs](~/Developer/pi/pi-mono/packages/coding-agent/docs/sdk.md) — SDK for programmatic access
- [pi-mono examples](~/Developer/pi/pi-mono/packages/coding-agent/examples/extensions/) — Working extension examples
- [sub-bar example](https://github.com/marckrenn/pi-sub) — Reference installable extension package

## Common Patterns

### Register an LLM-callable tool
```typescript
pi.registerTool({
  name: "my_tool",
  description: "What it does",
  parameters: Type.Object({ arg: Type.String() }),
  async execute(_, params, signal, onUpdate, ctx) {
    return { content: [{ type: "text", text: "result" }], details: {} };
  }
});
```

### Inject context into system prompt
```typescript
pi.on("before_agent_start", async (event, ctx) => {
  return { systemPrompt: event.systemPrompt + "\n\n## Extra Context\n..." };
});
```

### Analyze session after agent loop
```typescript
pi.on("agent_end", async (event, ctx) => {
  const messages = event.messages;
  // extract patterns, store learnings, etc.
});
```

### Hot-reload after creating new skill/extension
```typescript
// In a command handler:
await ctx.reload(); // reloads extensions, skills, prompts, themes
```

### Persist state across restarts
```typescript
pi.appendEntry("my-extension:state", { key: "value" });
// Read back via ctx.sessionManager
```

### Cross-extension communication
```typescript
pi.events.emit("my-extension:event", data);
pi.events.on("other-extension:event", handler);
```

## Red Flags

| Thought | Reality |
|---------|---------|
| "I'll put all logic in SKILL.md" | If it needs hooks or tools, it's an extension |
| "I'll modify pi-mono source" | Extensions exist so you don't have to. Use hooks. |
| "I need compilation/build step" | Extensions use jiti — raw TypeScript, no build needed |
| "I'll register 20 tools" | Keep tool count minimal. Each tool costs context tokens. |
| "I'll intercept every tool call" | Use targeted filtering. Broad interception kills performance. |
