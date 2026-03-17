---
name: skill-sync
description: "Use when managing skills across multiple agent platforms (pi, Claude Code, Antigravity) or syncing skills to the public pi-mono repository. Handles transformations, synchronization, and maintenance of skill ecosystems."
# @sync: public
---

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

**Drift Detection:** `sync-status` warns when pi-mono is ahead (rare case when source was updated externally):
```
skill-forge: MONO AHEAD (local: 264 lines, mono: 149 lines)
  → Run: ./scripts/pull-from-mono.sh skill-forge
```

### Safety Scans (Before Public Sync)

```bash
./scripts/scan-personality.sh github         # PII/personal-context scan (pi source)
./scripts/scan-security.sh github            # Secrets/security-pattern scan (pi source)
./scripts/scan-personality.sh github --target public
./scripts/scan-security.sh github --target public
./scripts/scan-personality.sh --all
./scripts/scan-security.sh --all
```

### Synchronization

**Push from pi (normal workflow):**
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

**Pull from pi-mono (exceptional case):**
```bash
# When pi-mono was updated directly (rare), pull changes back to local
./scripts/pull-from-mono.sh skill-forge --dry-run
./scripts/pull-from-mono.sh skill-forge --confirm
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
5. **Run safety gates** (mandatory for public skills):
   ```bash
   ./scripts/scan-personality.sh <name>
   ./scripts/scan-security.sh <name>
   ```
6. **Sync public** (if tagged public):
   ```bash
   ./scripts/sync-to-public.sh <name> --confirm
   ```
7. **Validate output**: Re-scan public copy
   ```bash
   ./scripts/scan-personality.sh <name> --target public
   ./scripts/scan-security.sh <name> --target public
   ```

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
4. **Run public safety gates** (if sync target includes public):
   ```bash
   ./scripts/scan-personality.sh <name>
   ./scripts/scan-security.sh <name>
   ```

## Workflow: Pull from pi-mono (Exceptional)

**Use when:** pi-mono was updated directly (e.g., via PR merge, upstream changes, or manual edit) and local `.pi/skills/` needs to catch up. This is **not** the normal workflow — pi should remain source of truth.

1. **Check drift detection**:
   ```bash
   ./scripts/sync-status.sh --skill <name>
   # Look for: "MONO AHEAD: local X lines, mono Y lines"
   ```

2. **Review what you'll receive**:
   ```bash
   ./scripts/diff-skill.sh <name> --source mono
   # Shows: what pi-mono has that local lacks
   ```

3. **Pull (destructive — overwrites local)**:
   ```bash
   ./scripts/pull-from-mono.sh <name> --dry-run
   ./scripts/pull-from-mono.sh <name> --confirm
   ```

4. **Verify**: Test skill in pi after pull

**Warning:** This destroys local changes. If you've edited the skill locally since the mono update, those changes will be lost. Handle conflicts manually or commit local first.

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
| Including API keys in public | Run `./scripts/scan-security.sh <skill>` before sync |
| Personal examples leaking into public | Run `./scripts/scan-personality.sh <skill>` before sync |
| Syncing without dry-run | Always `--dry-run` first |
| Not updating adapters | Run `./scripts/update-adapters.sh` monthly |
| Using `pull-from-mono` routinely | This is for exceptions only. pi remains source of truth. |

## Red Flags

- "I'll just quickly edit it in Claude" → Stop. Edit in pi.
- "This skill has my name in examples" → Mark personal, don't sync public
- "I don't need to check, I know what changed" → Run diff anyway
- "Sync all at once without review" → Dry-run first, always
- "I'll skip scanners this time" → No. Run personality + security scans before public sync.

## Adapter Configs

See `adapters/` for platform-specific transformations:
- `claude-adapter.yaml` — Tool mappings for Claude Code
- `antigravity-adapter.yaml` — Tool mappings for Antigravity
- `public-adapter.yaml` — PII removal patterns

## References

- [pi Capabilities](../../../pi-extender/references/pi-capabilities.md) — For understanding pi-specific tools
- [Antigravity Docs](https://antigravity.google/docs/skills) — Target platform specs
