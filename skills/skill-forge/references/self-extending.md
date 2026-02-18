# The Self-Extending Loop

## Philosophy

From Armin Ronacher's "Software Building Software" pattern: the agent builds and maintains its own capabilities. Skills aren't downloaded from marketplaces — they're written by the agent to your specifications, tested, and thrown away when stale.

**The core idea:** You don't configure your agent. You tell it what you need and it configures itself.

This works because:
- LLMs are good at writing code and documentation
- Skills are just markdown + scripts — trivial for an agent to produce
- Hot-reload (Pi) or session restart (Claude Code) makes iteration fast
- The agent knows its own tool surface better than any template

## The Loop in Practice

```
NOTICE → PROPOSE → BUILD → TEST → INSTALL → ITERATE → (optionally) RETIRE
```

### 1. Notice

Patterns that signal a self-extension opportunity:
- User does the same 3+ step process more than twice
- User says "every time I...", "I always have to...", "again..."
- Agent rewrites the same code/command across sessions
- An existing skill is close but the user keeps overriding parts of it

### 2. Propose

**Always ask before building.** Never silently create skills.

Good: "I notice you format commits the same way every time. Want me to make a skill for your commit conventions?"

Bad: Silently creating a commit skill and installing it.

### 3. Build

Use Create Mode from the main SKILL.md. The only difference: the agent is both author and consumer. This means:
- The agent knows exactly what information it lacks (write that down)
- The agent knows what rationalizations it makes (build red flags from self-knowledge)
- The agent can test immediately (no human-mediated testing loop)

### 4. Test

**For skills (all platforms):**
- Run the workflow without the skill → note where the agent deviates
- Install the skill → run again → verify compliance
- Edge cases → verify the skill handles them

**For Pi extensions:**
- Write the extension → `/reload` → test the command/tool
- If broken → fix → `/reload` → test again
- Use session branching to debug without polluting main context

### 5. Install

Per Sync Mode in the main SKILL.md. Place the skill in the right directory for each target platform.

### 6. Iterate

After real usage:
- User feedback → refine instructions or scripts
- New edge cases → add to skill
- Stale/unused → retire (Retire Mode)

---

## Pi Extension Patterns

Pi's extension system is the most powerful self-extension mechanism. Skills cover knowledge; extensions cover tools, TUI, events, and inter-session communication.

### Extension API Quick Reference

```typescript
export default function(pi: ExtensionAPI) {
  // Commands (user-invoked via /command)
  pi.registerCommand("name", {
    description: "...",
    handler: async (args: string | undefined, ctx: ExtensionContext) => { ... },
    getArgumentCompletions?: async (partial) => [...],
  });

  // Tools (LLM-callable)
  pi.registerTool({
    name: "tool-name",
    label: "Display Name",
    description: "When to use this tool",
    parameters: Type.Object({ ... }),  // TypeBox schema
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return { content: [{ type: "text", text: "result" }] };
    },
    renderCall(args, theme) { ... },    // optional TUI
    renderResult(result, opts, theme) { ... },  // optional TUI
  });

  // Events
  pi.on("session_start", async (event, ctx) => { ... });
  pi.on("agent_end", async (event, ctx) => { ... });
  pi.on("tool_call", async (event, ctx) => {
    // Return { block: true, reason: "..." } to prevent
  });

  // Shortcuts
  pi.registerShortcut("ctrl+.", {
    description: "...",
    handler: async (ctx) => { ... },
  });

  // State persistence (survives restarts)
  pi.appendEntry("my-state", { key: "value" });

  // Shell execution
  pi.exec("command", ["arg1", "arg2"], { cwd: "..." });

  // Messages
  pi.sendUserMessage("text");
  pi.sendMessage({ customType: "...", content: "..." }, { triggerTurn: true });
}
```

### ExtensionContext (ctx)

```typescript
ctx.hasUI                    // interactive mode?
ctx.model                    // current LLM model
ctx.cwd                      // working directory
ctx.isIdle()                 // agent idle?
ctx.sessionManager           // session tree access
ctx.ui.confirm(title, msg)   // yes/no dialog
ctx.ui.select(title, opts)   // choice picker
ctx.ui.editor(prompt, init?) // text editor
ctx.ui.notify(msg, level)    // notification
ctx.ui.custom<T>(component)  // full TUI component
ctx.ui.setWidget(key, comp)  // persistent widget
ctx.ui.setStatus(key, text)  // status line
```

### Common Extension Archetypes

| Type | What | Example |
|------|------|---------|
| **Command** | User-invoked action | /review, /answer, /todos |
| **Tool** | LLM-callable capability | todo management, file ops |
| **Event hook** | React to agent lifecycle | auto-commit, notifications |
| **State machine** | Persistent mode with UI | loop mode, plan mode |
| **Inter-session** | Cross-session communication | /control (RPC via Unix sockets) |
| **Interceptor** | Redirect/block tool calls | pip→uv redirect, path protection |

### Extension Locations

```
~/.pi/agent/extensions/     # Global (auto-discovered)
.pi/extensions/             # Project-local (auto-discovered)
```

Extensions can be single `.ts` files or directories with `index.ts` + `package.json` for dependencies.

### Hot-Reload Workflow

```
1. Agent writes extension to ~/.pi/agent/extensions/my-ext.ts
2. User runs /reload
3. Extension loads via jiti (TypeScript runtime, no compile)
4. If broken: agent fixes, user runs /reload again
5. Use session branching to debug without polluting main context
```

---

## Self-Extension by Platform

### Claude Code

**What the agent can create:**
- Skills (`~/.claude/skills/name/SKILL.md`)
- Commands (`~/.claude/commands/name.md`)
- Subagent definitions (`~/.claude/agents/name.md`)

**What the agent cannot create (needs user):**
- Hooks (`.claude/settings.json` — security-sensitive, always confirm)
- Plugin manifests (`.claude-plugin/plugin.json`)
- MCP server configs

**Testing:** Use a subagent to test the skill in isolation before installing.

### Antigravity

**What the agent can create:**
- Skills (`.agent/skills/name/SKILL.md` or `~/.gemini/antigravity/skills/name/SKILL.md`)
- Rules (`.agent/rules/name.md`)
- Workflows (`.agent/workflows/name.md`)

**Testing:** Ask the user to invoke the workflow/skill in a new conversation to verify.

### Pi

**What the agent can create:**
- Skills (`~/.pi/agent/skills/name/SKILL.md`)
- Extensions (`~/.pi/agent/extensions/name.ts`) — tools, commands, TUI, events
- Prompt templates (`~/.pi/agent/prompts/name.md`)
- Themes (`~/.pi/agent/themes/name.json`)

**Testing:** Write → `/reload` → test → fix → `/reload`. Session branching for debugging.

Pi has the richest self-extension surface because extensions can add tools, intercept events, render custom TUI, persist state, and communicate across sessions. Skills alone can't do this on any platform — Pi's extension API fills the gap.

---

## When Self-Extension Is Wrong

- **One-off task** — Just do it. Don't automate what happens once.
- **No clear pattern yet** — Wait for 3+ repetitions before proposing.
- **Security-sensitive** — Never silently create hooks, modify git configs, or touch credentials.
- **Platform internals** — Don't modify core agent configs without explicit user approval.
- **Premature abstraction** — Three similar manual steps are fine. Only automate when the pattern is stable and clear.
