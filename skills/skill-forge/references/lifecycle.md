# Skill Lifecycle — Audit, Upgrade, Retire

## Audit Deep Dive

### Scoring Rubric (Detailed)

#### Trigger Clarity (3x weight)

| Score | Criteria |
|-------|----------|
| 0 | Description is vague ("helps with X"), doesn't start with "Use when", or summarizes workflow |
| 1 | Starts with "Use when" but triggers are broad ("Use when working with files") |
| 2 | Specific symptoms, situations, and contexts. Technology-appropriate. No workflow summary. |

**Test:** Read only the description. Can you predict exactly when this skill should fire? Can you think of 3 concrete scenarios that should trigger it and 3 that shouldn't?

#### Context Efficiency (3x weight)

| Score | Criteria |
|-------|----------|
| 0 | >500 lines body, verbose prose, no progressive disclosure, information duplicated |
| 1 | Reasonable length, some splitting, minor verbosity |
| 2 | <500 lines body, clean split between body/references, no duplication, tables over prose |

**Test:** Count lines (`wc -l SKILL.md`). Check if any information appears in both SKILL.md and references. Check for prose that could be a table.

#### Actionability (2x weight)

| Score | Criteria |
|-------|----------|
| 0 | Narrative/theoretical, no clear steps, "here's some context about..." |
| 1 | Has steps but mixed with explanation, some ambiguity |
| 2 | Imperative voice, clear numbered steps, explicit gates/criteria, runnable examples |

**Test:** Can an agent follow this without asking clarifying questions? Are there decision points without guidance?

#### Freedom Calibration (2x weight)

| Score | Criteria |
|-------|----------|
| 0 | Exact scripts for judgment tasks OR vague guidelines for fragile operations |
| 1 | Generally appropriate, minor mismatches |
| 2 | High freedom for judgment tasks, low freedom for fragile ops, medium for mixed |

**Test:** For each section, ask: "If Claude deviates from this, will it break something?" If yes → should be low freedom. If no → should be high freedom.

#### Discoverability (1x weight)

| Score | Criteria |
|-------|----------|
| 0 | No symptom keywords, generic terms only |
| 1 | Some relevant keywords in body |
| 2 | Error messages, symptoms, synonyms, tool names throughout. Description covers key triggers. |

**Test:** Think of 5 ways a user might describe the problem this skill solves. Are those words in the skill?

#### Red Flags (1x weight)

| Score | Criteria |
|-------|----------|
| 0 | No red flags section (for discipline skills) or missing entirely |
| 1 | Basic list of violations |
| 2 | Comprehensive red flags + rationalization table built from actual testing |

**Note:** Reference/technique skills may not need red flags. Score N/A and redistribute weight.

#### Examples (1x weight)

| Score | Criteria |
|-------|----------|
| 0 | No examples, or broken/outdated examples |
| 1 | Generic template examples |
| 2 | One excellent, runnable, real-world example per key pattern |

### Audit Report Template

```markdown
## Skill Audit: [skill-name]

**Overall Score:** X/26 (XX%)
**Rating:** [Production-ready / Needs work / Rewrite]

### Per-Criterion Breakdown

| Criterion | Weight | Score | Notes |
|-----------|--------|-------|-------|
| Trigger clarity | 3x | X/2 | [specific feedback] |
| Context efficiency | 3x | X/2 | [specific feedback] |
| Actionability | 2x | X/2 | [specific feedback] |
| Freedom calibration | 2x | X/2 | [specific feedback] |
| Discoverability | 1x | X/2 | [specific feedback] |
| Red flags | 1x | X/2 | [specific feedback] |
| Examples | 1x | X/2 | [specific feedback] |

### Priority Improvements (sorted by impact)

1. [Highest weight × worst score first]
2. ...
3. ...
```

---

## Upgrade Transformations

### Verbose Body → Progressive Disclosure

**Before:** 800-line SKILL.md with inline API docs, long examples, domain reference.

**After:**
1. Extract API docs → `references/api.md`
2. Extract domain knowledge → `references/domain.md`
3. Extract long examples → `references/examples.md`
4. Keep in body: workflow, decision points, quick reference
5. Add clear "when to read" pointers to each reference file

### Bad Description → Proper Triggers

**Before:** "A skill for managing database migrations with support for rollbacks, seeding, and schema validation."

**After:** "Use when creating, running, or rolling back database migrations. Use when schema changes need validation before deployment or when seed data needs to be generated."

**Checklist:**
- [ ] Starts with "Use when..."
- [ ] No workflow summary (no "by doing X then Y")
- [ ] Specific symptoms/situations
- [ ] Third person
- [ ] <1024 chars

### Missing Red Flags → Discipline Enforcement

1. Run the skill's core workflow with a subagent WITHOUT the skill
2. Note every deviation and rationalization (verbatim quotes)
3. Build rationalization table from observations
4. Write red flags list from the rationalizations
5. Add "No exceptions" section closing specific loopholes
6. Re-test with skill installed

### No Progressive Disclosure → Layered Loading

Evaluate each section of SKILL.md:
- **Always needed?** → Keep in body
- **Needed for specific sub-task?** → Move to references/
- **Executable code?** → Move to scripts/
- **Template/asset?** → Move to assets/

### Platform Lock-in → Cross-Platform

1. Remove platform-specific frontmatter fields
2. Replace absolute paths with relative
3. Add compatibility note if dependencies are platform-specific
4. Test on target platforms

---

## Retire Workflows

### Overlap Analysis

For each pair of skills in the inventory:

1. Compare descriptions — do they trigger on similar conditions?
2. Compare core patterns — do they teach similar workflows?
3. Compare references — do they cover similar domains?

**Overlap scoring:**
- >70% overlap → Strong merge candidate
- 30-70% overlap → Review: maybe merge, maybe specialize
- <30% overlap → Keep separate

### Merge Process

1. Identify the stronger skill (higher audit score)
2. Extract unique value from the weaker skill
3. Integrate into the stronger skill
4. Update description to cover both trigger sets
5. Update cross-references in all other skills
6. Delete the weaker skill
7. Test the merged skill

### Deprecation Process

1. Confirm the skill is truly superseded (not just similar)
2. Check for cross-references from other skills
3. Update or remove cross-references
4. Delete the skill
5. If the skill was published: note deprecation in any registry

### Full Inventory Workflow

```markdown
## Skill Inventory: [scope]

| Skill | Audit Score | Overlaps With | Action |
|-------|-------------|---------------|--------|
| skill-a | 85% | — | Keep |
| skill-b | 45% | skill-c (60%) | Merge into skill-c |
| skill-c | 72% | skill-b (60%) | Upgrade (absorb skill-b) |
| skill-d | 30% | — | Retire (superseded by X) |
```
