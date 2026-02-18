---
name: skill-sync
description: "Use when managing skills across multiple agent platforms (pi, Claude Code, Antigravity) or syncing skills to the public pi-mono repository. Handles transformations, synchronization, and maintenance of skill ecosystems."
# @sync: public
---

<!--
🌐 COMMUNITY SKILL

Part of the pi-mono open skills collection.
- Repository: https://github.com/larsboes/pi-mono
- License: MIT
- Author: {{author}}

Last synced: 2026-02-18 21:34:13
-->

# Skill Sync

Multi-platform skill synchronization and management. Maintains skills across pi (source of truth), Claude Code, Antigravity, and the public pi-mono repository.

## Overview

This skill manages the flow of skills from **pi** (single source of truth) to:
- **~/.claude/skills/** — Personal Claude Code skills (tool name adaptations)
- **~/.gemini/antigravity/skills/** — Antigravity skills (when available)
- **~/Developer/pi-mono/skills/** — Public community skills (de-personalized)

## Directory Structure

| Location | Purpose | Privacy |
|----------|---------|---------|
| `~/.pi/skills/` | Source of truth | Personal |
| `~/.claude/skills/` | Claude Code adapted | Personal |
| `~/.gemini/antigravity/skills/` | Antigravity adapted | Personal |
| `~/Developer/pi-mono/skills/` | Community skills | Public |

## When to Use

- Adding a new skill and need to sync to other platforms
- Updating an existing skill across all locations
- Checking drift between skill versions
- Preparing skills for public release
- Removing deprecated skills

## Commands

### Status & Discovery

```bash
./scripts/sync-status.sh                    # Show sync status for all skills
./scripts/sync-status.sh --skill github     # Show status for specific skill
./scripts/list-skills.sh --location pi      # List skills in location
```

### Synchronization

```bash
# Sync to Claude Code (personal)
./scripts/sync-to-claude.sh github --dry-run
./scripts/sync-to-claude.sh github --confirm
./scripts/sync-to-claude.sh --all --confirm

# Sync to Antigravity (personal)
./scripts/sync-to-antigravity.sh github --dry-run
./scripts/sync-to-antigravity.sh --all --confirm

# Sync to public repo (de-personalized)
./scripts/sync-to-public.sh github --dry-run
./scripts/sync-to-public.sh github --confirm
./scripts/sync-to-public.sh --all --confirm
```

### Diffs & Comparison

```bash
./scripts/diff-skill.sh github --target claude
./scripts/diff-skill.sh github --target public
./scripts/diff-all.sh --target claude       # Diff all skills
```

### Maintenance

```bash
./scripts/clean-skills.sh                   # Remove skills not in pi
./scripts/validate-public.sh                # Check public skills have no PII
./scripts/update-adapters.sh                # Update adapter configs
```

## Skill Classification

Skills are tagged for distribution:

| Tag | Meaning | Sync Targets |
|-----|---------|--------------|
| `personal` | Contains personal references, scripts, or API keys | pi only |
| `private` | Sensitive workflows, company-specific | pi only |
| `public` | Generic, reusable, no PII | pi + claude + antigravity + public |
| `community` | Built for sharing | pi + claude + antigravity + public |

### Tagging Skills

Add a comment to SKILL.md frontmatter:
```yaml
---
name: github
description: "..."
# @sync: public
---
```

Or mark as personal:
```yaml
# @sync: personal - contains API keys and personal workflows
```

## Transformations by Target

### Claude Code Adaptations

**Tool Names:** PascalCase → PascalCase (already compatible)
**Unsupported Tools:** Strip or warn
**Path Patterns:** `{baseDir}/` → `./`

### Antigravity Adaptations

**Tool Names:** TBD (research needed)
**Memory System:** Native (they have memory)
**Path Patterns:** TBD

### Public Repo Adaptations

**PII Removal:**
- Remove personal API keys, tokens, passwords
- Remove personal directory paths
- Remove company-specific references
- Generalize examples

**Content Cleanup:**
- Add license header
- Add contribution guide reference
- Neutralize personal opinions
- Remove internal todo items

## Workflow: Add New Skill

1. **Create in pi**: Build skill in `~/.pi/skills/<name>/`
2. **Tag it**: Add `@sync: public` or `@sync: personal` comment
3. **Test**: Verify skill works in pi
4. **Sync personal** (if applicable):
   ```bash
   ./scripts/sync-to-claude.sh <name> --confirm
   ./scripts/sync-to-antigravity.sh <name> --confirm
   ```
5. **Sync public** (if tagged public):
   ```bash
   ./scripts/sync-to-public.sh <name> --confirm
   ```
6. **Validate**: Run public validation checks

## Workflow: Update Existing Skill

1. **Edit in pi**: Make changes in `~/.pi/skills/<name>/`
2. **Check status**:
   ```bash
   ./scripts/sync-status.sh --skill <name>
   ```
3. **Review diffs**:
   ```bash
   ./scripts/diff-skill.sh <name> --target claude
   ./scripts/diff-skill.sh <name> --target public
   ```
4. **Sync to targets**:
   ```bash
   ./scripts/sync-to-claude.sh <name> --confirm
   ./scripts/sync-to-public.sh <name> --confirm
   ```

## Workflow: Deprecate/Remove Skill

1. **Mark deprecated** in pi version:
   ```yaml
   # @sync: deprecated - use new-skill-name instead
   ```
2. **Sync** (marking deprecated elsewhere)
3. **After 30 days**: Remove from all locations

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Editing in .claude directly | Always edit in pi, sync out |
| Forgetting to tag public skills | Add `@sync: public` comment |
| Including API keys in public | Run `./scripts/validate-public.sh` |
| Syncing without dry-run | Always `--dry-run` first |
| Not updating adapters | Run `./scripts/update-adapters.sh` monthly |

## Red Flags

- "I'll just quickly edit it in Claude" → Stop. Edit in pi.
- "This skill has my name in examples" → Mark personal, don't sync public
- "I don't need to check, I know what changed" → Run diff anyway
- "Sync all at once without review" → Dry-run first, always

## Adapter Configs

See `adapters/` for platform-specific transformations:
- `claude-adapter.yaml` — Tool mappings for Claude Code
- `antigravity-adapter.yaml` — Tool mappings for Antigravity
- `public-adapter.yaml` — PII removal patterns

## References

- [pi Capabilities](../../../pi-extender/references/pi-capabilities.md) — For understanding pi-specific tools
- [Antigravity Docs](https://antigravity.google/docs/skills) — Target platform specs
