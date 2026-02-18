# Skill Anatomy — Full Specification

## Directory Structure

```
skill-name/
├── SKILL.md                 # Required
│   ├── YAML frontmatter     # Always loaded (~100 words)
│   └── Markdown body        # Loaded on-demand when skill triggers
├── scripts/                 # Optional — deterministic, executable
├── references/              # Optional — loaded as-needed into context
└── assets/                  # Optional — used in output, never loaded into context
```

## YAML Frontmatter

**Required fields:**
- `name` — kebab-case, letters/numbers/hyphens only. No spaces, underscores, or special chars.
- `description` — <1024 chars. ONLY triggering conditions. Start with "Use when...". Third person. Never summarize the workflow.

**Optional fields:**
- `license` — e.g., MIT, Apache-2.0
- `metadata` — author, version, tags
- `disable-model-invocation: true` — only user can invoke (not Claude)
- `user-invocable: false` — only Claude invokes (not user via `/skill`)
- `context: fork` — runs in subagent (own context window)
- `allowed-tools` — restrict which tools the skill can use
- `compatibility` — environment requirements (rarely needed)

**Why description matters:** Claude reads ALL skill descriptions at session start to decide which to load. A bad description = skill never triggers or triggers incorrectly. A description that summarizes workflow = Claude follows the description shortcut instead of reading the full body.

## Body Structure

Imperative voice throughout. Target <500 lines.

**Sections (in order):**
1. **Overview** — What + core principle. 1-2 sentences.
2. **When to Use** (optional) — Only if decision is non-obvious. Small inline flowchart for branching decisions.
3. **Core Pattern** — The actual workflow/technique. This is the meat.
4. **Quick Reference** — Table or bullets for scanning common operations.
5. **Common Mistakes** — What goes wrong + how to fix.
6. **Red Flags** (for discipline skills) — Thoughts that mean "stop and comply."
7. **Rationalization Table** (for discipline skills) — Excuse → Reality mapping.

## Scripts Directory

**When to use:** Code that gets rewritten repeatedly OR requires deterministic reliability.

- Can be executed without loading into context (token-efficient)
- May still need to be read for patching or environment adjustments
- Test by running. Always.

**Examples:**
- `scripts/rotate_pdf.py` — PDF operations
- `scripts/recalc.py` — Spreadsheet formula recalculation
- `scripts/init-artifact.sh` — Project scaffolding
- `scripts/bundle-artifact.sh` — Build/package

## References Directory

**When to use:** Documentation Claude should reference while working. Too large for SKILL.md body.

- Loaded only when Claude determines it's needed
- Keep one level deep from SKILL.md (no nesting)
- Files >100 lines: include table of contents at top
- Files >10k words: include grep search patterns in SKILL.md
- Information lives in EITHER SKILL.md OR references, never both

**Examples:**
- `references/api_docs.md` — API specifications
- `references/finance.md` — Domain-specific schemas
- `references/aws.md` — Platform-variant details

## Assets Directory

**When to use:** Files used in the output Claude produces. Not documentation.

- Never loaded into context
- Templates, images, icons, fonts, boilerplate

**Examples:**
- `assets/logo.png` — Brand assets
- `assets/template/` — Project scaffolding
- `assets/font.ttf` — Typography

## Progressive Disclosure — Three Levels

| Level | What | When Loaded | Cost |
|-------|------|-------------|------|
| 1. Metadata | name + description | Every session | ~100 words |
| 2. Body | SKILL.md markdown | When skill triggers | <5k words |
| 3. Resources | scripts/, references/, assets/ | As-needed by Claude | Unlimited* |

*Scripts can execute without reading into context. References load into context. Assets never load.

## Disclosure Patterns

**Pattern 1: High-level guide with references**
```markdown
## Quick Start
[core workflow inline]

## Advanced
- **Feature A**: See [references/feature-a.md](references/feature-a.md) when working with X
- **Feature B**: See [references/feature-b.md](references/feature-b.md) when working with Y
```

**Pattern 2: Domain-specific organization**
```
skill/
├── SKILL.md (overview + navigation)
└── references/
    ├── domain-a.md
    ├── domain-b.md
    └── domain-c.md
```
Claude loads only the relevant domain file.

**Pattern 3: Framework variants**
```
skill/
├── SKILL.md (workflow + selection logic)
└── references/
    ├── react.md
    ├── vue.md
    └── svelte.md
```
Claude loads only the chosen framework.

## What NOT to Include

- README.md, CHANGELOG.md, INSTALLATION_GUIDE.md
- User-facing documentation about the skill creation process
- Auxiliary context about how the skill was developed
- Setup/testing procedures
- Multiple examples of the same pattern
- Multi-language implementations of the same thing
