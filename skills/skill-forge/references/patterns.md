# Battle-Tested Skill Patterns

Patterns extracted from production skills across superpowers (obra), Anthropic's reference skills, and agent-stuff (Armin Ronacher).

## Table of Contents

1. [Workflow Orchestration](#workflow-orchestration)
2. [Discipline Enforcement](#discipline-enforcement)
3. [Progressive Interview](#progressive-interview)
4. [Two-Stage Review](#two-stage-review)
5. [Subagent Dispatch](#subagent-dispatch)
6. [Domain Expert Distillation](#domain-expert-distillation)
7. [Tool Wrapping](#tool-wrapping)
8. [Template-First Creation](#template-first-creation)
9. [Claude Search Optimization](#claude-search-optimization)
10. [Context Compression](#context-compression)

---

## Workflow Orchestration

**Source:** superpowers (subagent-driven-development, executing-plans)

**Pattern:** Sequential steps with explicit gates between phases.

```markdown
## Core Workflow

### Phase 1: [Name]
[Instructions]
**Gate:** [What must be true before proceeding]

### Phase 2: [Name]
[Instructions]
**Gate:** [Verification criteria]

### Phase 3: [Name]
[Instructions]
**Done when:** [Completion criteria]
```

**Key insight:** Explicit gates prevent Claude from rushing through phases. Without gates, agents tend to compress multi-phase workflows into a single pass.

**Anti-pattern:** Describing the workflow in the description field. Claude will follow the description shortcut instead of reading the full body.

---

## Discipline Enforcement

**Source:** superpowers (test-driven-development, verification-before-completion)

**Pattern:** Rule + explicit loophole closures + rationalization table + red flags.

```markdown
## The Rule
[Clear, unambiguous statement]

**Violating the letter of the rules is violating the spirit of the rules.**

## No Exceptions
- Not for "simple" cases
- Not for "just this once"
- Not for "I already know the answer"
- [Every rationalization observed in testing]

## Red Flags — STOP
If you think any of these, stop and comply:
- [Thought 1]
- [Thought 2]

## Rationalization Table
| Excuse | Reality |
|--------|---------|
| "[verbatim agent excuse]" | [Why it's wrong] |
```

**Key insight:** Agents are smart rationalizers. You must explicitly close every loophole you observe. Build the rationalization table from actual baseline testing, not imagination.

---

## Progressive Interview

**Source:** superpowers (brainstorming), Anthropic (skill-creator)

**Pattern:** Ask targeted questions one at a time. Converge, don't diverge.

```markdown
## Discovery

Ask ONE question at a time. Wait for response.

**Question priority:**
1. What specific task/workflow?
2. What triggers it? (symptoms, situations)
3. What's the expected output?
4. What goes wrong without guidance?

**Stop when:** You can describe the skill in one sentence covering what + when + why.

**Do NOT:**
- Ask more than 3 questions in one message
- Ask hypothetical "what about..." questions
- Over-explore edge cases before core is clear
```

**Key insight:** Users lose patience with long interview sequences. Front-load the most important questions. Get to building fast, iterate later.

---

## Two-Stage Review

**Source:** superpowers (subagent-driven-development)

**Pattern:** Spec compliance BEFORE code quality. Prevents gold-plating.

```markdown
## Review Process

### Stage 1: Spec Compliance
Does the output match the requirements exactly?
- All required elements present?
- Constraints satisfied?
- Nothing missing?

**If non-compliant:** Fix first. Do NOT proceed to Stage 2.

### Stage 2: Quality Review
Is the implementation good?
- Architecture sound?
- Patterns followed?
- Tests adequate?
- No unnecessary complexity?
```

**Key insight:** Reviewing quality before spec compliance leads to polished implementations that don't actually meet requirements. Always check "does it work?" before "is it elegant?"

---

## Subagent Dispatch

**Source:** superpowers (subagent-driven-development, dispatching-parallel-agents)

**Pattern:** Fresh subagent per independent task. Full context in dispatch, not file references.

```markdown
## Dispatch Rules

1. One subagent per independent task
2. Provide COMPLETE task description in the dispatch (not file paths to read)
3. Subagent implements → self-reviews → commits
4. Controller reviews output, never re-implements
5. If issues found: same subagent fixes, reviewer re-checks
```

**Key insight:** Subagents start with clean context. If you say "read the plan at docs/plan.md", the subagent wastes tokens discovering context. Inline the relevant task text directly.

---

## Domain Expert Distillation

**Source:** Swift-Concurrency-Agent-Skill, Anthropic (MCP-builder)

**Pattern:** Distill deep expertise into decision trees + reference material.

```markdown
## Triage

[Decision flowchart: symptom → recommended approach]

## Patterns

### Pattern A: [Name]
**When:** [condition]
**How:** [concise implementation]
**Pitfall:** [common mistake]

### Pattern B: [Name]
...

## Deep Reference
See [references/detailed-guide.md](references/detailed-guide.md) for full API/specification.
```

**Key insight:** Domain skills work best as decision support, not textbooks. The triage/decision tree is the most valuable part. Detailed reference goes in references/.

---

## Tool Wrapping

**Source:** agent-stuff (commit, github, uv, mermaid, summarize)

**Pattern:** Wrap a CLI tool with workflow intelligence.

```markdown
## [Tool Name]

### When to Use
[Specific triggers — not "when you need to use [tool]"]

### Workflow
1. [Pre-condition check]
2. [Tool invocation with correct flags]
3. [Post-processing / validation]

### Common Flags
| Flag | Purpose | When |
|------|---------|------|
| `--flag` | [what] | [when] |

### Gotchas
- [Non-obvious behavior 1]
- [Non-obvious behavior 2]
```

**Key insight:** The value isn't teaching Claude the tool exists (it already knows). The value is encoding YOUR preferred workflow, flags, and post-processing. Make it opinionated.

---

## Template-First Creation

**Source:** Anthropic (algorithmic-art, web-artifacts-builder, frontend-design)

**Pattern:** Start from a concrete template, modify specific sections.

```markdown
## Creation Workflow

1. Copy template from `assets/template/`
2. Modify ONLY these sections:
   - [Section A]: [What goes here]
   - [Section B]: [What goes here]
3. Keep these sections UNCHANGED:
   - [Fixed section 1]
   - [Fixed section 2]
4. Validate output
```

**Key insight:** Templates prevent Claude from reinventing boilerplate. Be explicit about what to change vs. what to preserve. Without this, Claude tends to "improve" the template.

---

## Claude Search Optimization (CSO)

**Source:** superpowers (writing-skills)

**Pattern:** Optimize skill for discovery by future Claude instances.

**Description field:**
- Start with "Use when..."
- Include symptoms, not solutions
- Technology-agnostic unless skill IS technology-specific
- NEVER summarize workflow

**Body keywords:**
- Error messages: "ENOTEMPTY", "race condition", "timeout"
- Symptoms: "flaky", "inconsistent", "slow"
- Synonyms: "timeout/hang/freeze", "cleanup/teardown"
- Tool names: actual commands, library names

**Naming:**
- Verb-first, active voice: `creating-skills` not `skill-creation`
- Gerunds for processes: `debugging-with-logs`
- Name the core insight: `condition-based-waiting` not `async-helpers`

---

## Context Compression

**Source:** Anthropic (skill-creator), superpowers (writing-skills)

**Techniques:**

1. **Reference --help instead of documenting flags**
   ```markdown
   # Bad: Document all flags in SKILL.md
   # Good: "Run --help for flag details"
   ```

2. **Cross-reference instead of repeating**
   ```markdown
   # Bad: Repeat workflow from another skill
   # Good: **REQUIRED:** Use superpowers:test-driven-development
   ```

3. **One example, not many**
   - Pick the most representative scenario
   - Make it complete and runnable
   - Trust Claude to port to other contexts

4. **Tables over prose**
   - Decisions → table with conditions
   - Options → comparison table
   - Flags → quick reference table

5. **Progressive disclosure splits**
   - Core workflow: SKILL.md body
   - API details: references/api.md
   - Examples: references/examples.md
   - Heavy specs: references/spec.md
