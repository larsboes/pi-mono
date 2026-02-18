---
name: skill-forge
description: "Use when building new skills, auditing existing ones, upgrading them to better standards, or retiring/merging redundant skills. Use for any skill lifecycle task: create, audit, upgrade, retire."
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

# Skill Forge

Full-lifecycle skill engineering: create → audit → upgrade → retire.

## Modes

| Mode | When to Use | Output |
|------|------------|--------|
| **Create** | "Build a skill for X" | New SKILL.md with directory structure |
| **Audit** | "How good is this skill?" | Score (0-100%) + improvement list |
| **Upgrade** | "Make this skill better" | Revised SKILL.md with fixes applied |
| **Retire** | "Clean up redundant skills" | Merge/deprecate plan + cleanup |

---

## Create Mode

### Phase 1: Discovery

Ask targeted questions. Stop when you have clarity on:

1. **What's the workflow?** — Concrete use case ("I do X three times a week")
2. **What triggers it?** — Error messages, symptoms, keywords
3. **What type of skill?** — Knowledge/workflow guidance, not code execution
4. **Freedom level?** — High (principles), Medium (structured steps), Low (exact instructions)

**Key clarifications:**
- **Knowledge skill** — Guidance, patterns, decision flows. Covers >80% of what you build.
- **Not a skill:** Deterministic scripts, one-off tasks, platform internals.

### Phase 2: Design

Before writing, define:

1. **Context budget** — Token cost per session?
   - Frontmatter: ~100 words (always loaded)
   - Body: <500 lines, <5k words (on-demand)
   - References: unlimited (lazy-loaded)

2. **Progressive disclosure:**
   - Frontmatter: name + description only
   - Body: core workflow + decision points
   - references/: heavy docs, examples, deep knowledge
   - scripts/: executable code (if needed)

3. **Trigger description:**
   - Start with "Use when..."
   - List specific situations, error patterns, keywords
   - No workflow summary in description

### Phase 3: Build

**Directory structure:**
```
skill-name/
├── SKILL.md                # Required. Core instructions.
├── references/             # Optional. Heavy docs, loaded as-needed.
│   ├── example-1.md
│   └── deep-ref.md
├── scripts/                # Optional. Executable code.
└── assets/                 # Optional. Templates, images (not loaded).
```

**SKILL.md template:**
```yaml
---
name: kebab-case-name
description: "Use when [specific triggers/situations]. Do NOT say what it does here."
---

# Skill Name

## Overview
One sentence: what problem it solves.

## When to Use
- Situation A (symptom/error pattern)
- Situation B (keyword trigger)
- Situation C (decision point)

## Core Pattern
The workflow in imperative voice. Steps are action-oriented, not explanatory.

## Quick Reference
Table, checklist, or decision tree for scanning.

## Common Mistakes
What goes wrong + how to fix it.

## Red Flags
Thoughts/rationalizations that mean "use this skill properly" (discipline checks).


## References
- [reference-name](references/file.md) — When to read this
```

**Critical rules:**
- Description = WHEN to use (triggers only), NOT what it does
- Start description with "Use when..."
- Write imperative (do X, then Y), not explanatory
- One excellent example > many mediocre ones
- No narrative filler, README, CHANGELOG
- Cross-reference other skills by name: "See brainstorm skill before starting"
- Keywords help discovery: error messages, tool names, domain terms

### Phase 4: Validate

**Test with TDD:**

1. **RED** — Run scenario WITHOUT the skill. Document what went wrong.
2. **GREEN** — Install skill. Run same scenario. Verify correct behavior.
3. **REFACTOR** — Find edge cases. Strengthen red flags. Re-test.

**Quality checklist:**
- [ ] Frontmatter: only `name` + `description` (<256 chars)
- [ ] Description: "Use when..." format, no workflow summary
- [ ] Body: <500 lines, <5k words
- [ ] References: linked with "when to read" guidance
- [ ] Examples: one complete, runnable example per major workflow
- [ ] No narrative, no filler, no philosophy
- [ ] Keywords present for discovery
- [ ] Red flags included for discipline-enforcing skills

---

## Audit Mode

Score an existing skill against quality criteria. Read the skill first.

**Scoring rubric:**

| Criterion | Weight | 0 (Bad) | 1 (OK) | 2 (Good) |
|-----------|--------|---------|--------|----------|
| **Trigger clarity** | 3x | Vague description | Decent triggers | Specific symptoms + contexts |
| **Context efficiency** | 3x | >500 lines, verbose | Reasonable | Lean, progressive disclosure |
| **Actionability** | 2x | Theory/narrative | Some guidance | Clear imperative steps |
| **Freedom calibration** | 2x | Wrong level (too rigid or too vague) | Acceptable | Matched to task fragility |
| **Discoverability** | 1x | No keywords | Some keywords | Rich symptom/error coverage |
| **Red flags** | 1x | Missing | Basic | Comprehensive with counters |
| **Examples** | 1x | None or bad | Acceptable template | One excellent, runnable |

**Score calculation:**
```
(sum of weighted scores) / (sum of weights) × 100%
```

**Interpretation:**
- 80%+ → Production-ready
- 60-79% → Needs work (can be used with caution)
- <60% → Rewrite recommended

**Output format:**
```
## Audit: [Skill Name]

**Score: XX%** [Rating]

### Per-Criterion Breakdown
| Criterion | Score | Notes |
|-----------|-------|-------|
| Trigger clarity | 1/2 | Description mentions X but not Y trigger |
| Context efficiency | 2/2 | Well-structured with progressive disclosure |
...

### Top 3 Improvements (by impact)
1. [Highest impact fix]
2. [Second highest]
3. [Third]
```

---

## Upgrade Mode

1. Run **Audit Mode** → get score + improvement list
2. Fix issues in order of impact (weight × gap)
3. **Upgrade patterns:**

| Problem | Fix |
|---------|-----|
| Verbose body (>500 lines) | Extract sections to references/, keep SKILL.md lean |
| Bad description | Rewrite as "Use when [triggers]", remove workflow summary |
| Missing red flags | Run pressure test, capture rationalizations, build table |
| No progressive disclosure | Separate frontmatter / body / references layers |
| Poor examples | Build one complete, runnable example per workflow |
| Scattered triggers | Consolidate into "When to Use" bullets |

4. Re-audit after changes. Score should improve by 20%+ per fix.

---

## Retire Mode

1. **Inventory** — List all skills in the location (e.g., `~/.claude/skills/`, project `.claude/skills/`)
2. **Overlap analysis** — Find skills with overlapping triggers or functionality
3. **Decision per overlap:**
   - **Merge** — Combine if >60% functional overlap
   - **Deprecate** — Remove if superseded by better alternative
   - **Keep both** — If they serve genuinely different use cases
4. **Dependency check** — Search for cross-references in remaining skills
5. **Execute** — Delete files, update backlinks

**Output:**
```
## Retire Plan

### To Merge
- skill-a + skill-b → merged-skill (conflicts: [list])

### To Deprecate
- skill-c → reason: superseded by skill-d

### Kept As-Is
- skill-e → reason: distinct use case

### Cleanup Required
- Update references in: [list of files]
```

---

## Philosophy

**Good skills are:**
- **Triggerable** — You know exactly when to use it (clear symptoms/situations)
- **Lean** — <500 lines, progressive disclosure, no filler
- **Actionable** — Clear imperative steps, not theory
- **Disciplined** — Red flags prevent misuse

**Not skills:**
- Deterministic scripts (put in scripts/ folders, not skills/)
- One-off tasks (just do them)
- Platform internals (don't customize core)
- Experimental ideas without a pattern yet (wait for repetition)

---

## Common Patterns

**When users get stuck:**
- Missing trigger clarity → Rewrite "Use when..." section with symptom examples
- Too much detail → Move to references/, keep SKILL.md to workflow only
- Vague steps → Use imperative voice ("Do X", "Then Y") instead of explanatory prose
- No red flags → Ask "What would someone do wrong here?" Build a table

**When retiring:**
- Two skills with same trigger → Merge into one with multiple workflows
- Skill broken/outdated → Deprecate, point users to replacement
- Skill rarely used (30+ days) → Audit first; may just need discovery improvement

---

## Quick Start: Create a Skill

1. Clarify: What triggers it? (Phase 1)
2. Plan progressive disclosure (Phase 2)
3. Write SKILL.md + references/ (Phase 3)
4. Test with TDD (Phase 4)
5. Ship it
