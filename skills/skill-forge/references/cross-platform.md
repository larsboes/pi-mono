# Cross-Platform Skill Compatibility

Skills for Claude Code, Antigravity (Google), Pi, Codex, and OpenCode.

## Format Compatibility

All platforms use SKILL.md with YAML frontmatter. The core format is portable.

| Feature | Claude Code | Antigravity | Pi | Codex | OpenCode |
|---------|------------|-------------|-----|-------|----------|
| SKILL.md format | Yes | Yes | Yes | Yes | Yes |
| YAML frontmatter | name, description + optional | name, description | name, description | name, description | name, description |
| scripts/ | Yes | Yes | Yes | Yes | Yes |
| references/ | Yes | Yes (as resources/) | Yes | Yes | Yes |
| assets/ | Yes | Yes (as resources/) | Yes | Yes | Yes |
| Subagents | .claude/agents/ | Parallel conversations | Extensions | N/A | N/A |
| Hooks/Rules | .claude/settings.json | .agent/rules/ | Event listeners | N/A | N/A |
| Commands/Workflows | .claude/commands/ | .agent/workflows/ | Extensions | N/A | N/A |
| Plugins | .claude-plugin/ | N/A | npm package | N/A | Native skills |

## Installation Paths

### Claude Code
```
# Global
~/.claude/skills/skill-name/SKILL.md

# Project-specific
.claude/skills/skill-name/SKILL.md

# Via plugin
.claude-plugin/plugin.json → skills/skill-name/SKILL.md
```

### Antigravity
```
# Global
~/.gemini/antigravity/skills/skill-name/SKILL.md

# Project-specific (workspace)
.agent/skills/skill-name/SKILL.md
```

### Pi
```
# Global
~/.pi/agent/skills/skill-name/SKILL.md

# Project-specific
.pi/skills/skill-name/SKILL.md

# Via npm package (pi install)
npm install package-name
```

### Codex
```
.codex/skills/skill-name/SKILL.md
```

### OpenCode
```
~/.config/opencode/skills/skill-name/SKILL.md
```

## Cross-Platform SKILL.md Template

Stick to the common subset for maximum portability:

```yaml
---
name: skill-name
description: "Use when [triggers]"
---

# Skill Name

## Overview
[What + when]

## Core Pattern
[The workflow]

## Quick Reference
[Scannable reference]
```

**Avoid platform-specific fields** in frontmatter unless the skill IS platform-specific:
- `context: fork` — Claude Code only
- `allowed-tools` — Claude Code only
- `disable-model-invocation` — Claude Code only
- `user-invocable` — Claude Code only

## Platform-Specific Considerations

### Claude Code
- Subagents in `.claude/agents/` for isolated workers
- Hooks in `.claude/settings.json` for deterministic automation
- Commands in `.claude/commands/` for `/command` shortcuts
- Plugin system (`.claude-plugin/`) for bundled distribution
- `context: fork` runs skill in its own subagent automatically
- CLAUDE.md for always-on project context

### Antigravity (Google)
- Rules in `.agent/rules/` for workspace-specific guidance (12k char limit per file)
  - Activation modes: Manual (@mention), Always On, Model Decision, Glob pattern
- Workflows in `.agent/workflows/` for repeatable step sequences (invoked via `/workflow-name`)
  - Workflows can call other workflows
  - Agent can generate workflows from conversation history
- Global rules in `~/.gemini/GEMINI.md` (equivalent to CLAUDE.md)
- @ mentions in rules files reference other files relatively or absolutely
- Skills use same SKILL.md format (Agent Skills open standard)
- Resource subdirectories: `scripts/`, `examples/`, `resources/` (vs Claude's `scripts/`, `references/`, `assets/`)

### Pi
- Extensions (TypeScript) for tools, commands, TUI, events, inter-session comms
- Hot-reload via `/reload` — no compile step
- Session branching for debugging extensions without polluting main context
- npm-based distribution (`pi install`)
- Prompt templates in `~/.pi/agent/prompts/`
- Themes in `~/.pi/agent/themes/`
- Self-extending: agent writes its own extensions

### Equivalent Concepts Across Platforms

| Purpose | Claude Code | Antigravity | Pi |
|---------|------------|-------------|-----|
| Always-on context | `CLAUDE.md` | `GEMINI.md` + Always-On rules | System prompt + prompts/ |
| Per-file rules | N/A | Glob-activated rules | N/A |
| User-invoked process | `/command` (commands/) | `/workflow` (workflows/) | `/command` (extensions) |
| Conditional guidance | Skill (model decides) | Model Decision rule | Skill (model decides) |
| Deterministic gate | Hook (PreToolUse) | N/A | `pi.on("tool_call")` |
| Isolated worker | Subagent (.claude/agents/) | Parallel conversation | Extension (/control) |

### Writing Portable Skills

1. **Use generic paths** — Reference `scripts/tool.py` not platform-specific absolute paths
2. **Don't assume shell** — Use `python3` not `python`, use `#!/usr/bin/env bash`
3. **Document dependencies** — List required tools (e.g., "Requires: Node.js 18+, Python 3.10+")
4. **Test on target platforms** — At minimum, test on your primary. Test others if claiming compatibility.
5. **Avoid platform-specific frontmatter** — Keep to `name` and `description` for the common case
6. **Use `scripts/` not `examples/` or `resources/`** — `scripts/` is universal. Antigravity accepts `examples/` and `resources/` too but `scripts/` + `references/` works everywhere.
7. **Keep rules/context separate from skills** — A skill teaches a workflow. Always-on context (CLAUDE.md / GEMINI.md) sets project conventions. Don't conflate them.
