---
name: dev-workflow
description: Stateful development workflow — PRD, planning, TDD execution, review, and finish. Use when starting a new feature, resuming work, or managing the build lifecycle of any project.
---

<!--
🌐 COMMUNITY SKILL

Part of the pi-mono open skills collection.
- Repository: https://github.com/larsboes/pi-mono
- License: MIT
- Author: {{author}}

Contributions welcome via GitHub issues and PRs.
Last synced: 2026-02-18 21:06:30
-->

# Dev Workflow

A stateful project engine. PRD → Plan → Execute → Review → Finish.

## State Detection

On activation, check project state and act accordingly:

```
1. Does docs/prd.md exist?     → No: create PRD
2. Does docs/plan.md exist?    → No: create Plan from PRD
3. Are there unchecked tasks?  → Yes: execute next batch
4. Are all tasks checked?      → Yes: review against PRD
5. Review passed?              → Finish (verify/merge/PR)
```

Always announce current state: "PRD exists, Plan has 4/7 tasks done. Picking up next batch."

## Modes

Detect from context, or the user specifies explicitly:

| Mode | When |
|---|---|
| `prd` | Create or update the PRD |
| `plan` | Create or update the plan from PRD |
| `execute` | Work through next task batch, TDD style |
| `review` | Verify completed work against PRD success criteria |
| `finish` | Run tests → merge/PR → cleanup |
| `status` | Report progress (tasks done/remaining, blockers, next steps) |

If no mode specified, auto-detect from state machine above.

---

## File Structure

```
<project>/
  docs/
    prd.md      # single active PRD
    plan.md     # single active plan
```

One PRD, one Plan per project. Git handles history. No timestamps in filenames.

---

## PRD — `docs/prd.md`

The PRD defines **what** and **why**. It's the anchor — the plan orbits around it.

### Creating a PRD

Collaborative discovery. Ask questions one at a time (prefer multiple choice). Understand:

1. **Problem** — What's broken or missing? Who feels the pain?
2. **Solution** — What are we building? (High-level, not implementation)
3. **Scope** — What's IN and what's OUT
4. **Success criteria** — How do we know it's done? Measurable where possible.
5. **Non-goals** — What we're explicitly NOT doing (prevents scope creep)
6. **Constraints** — Tech limitations, deadlines, dependencies

### PRD Format

```markdown
# PRD: [Feature Name]

## Problem
[What's broken or missing, who it affects, why it matters]

## Solution
[High-level approach — what we're building, not how]

## Scope
### In Scope
- [thing 1]
- [thing 2]

### Out of Scope
- [explicitly excluded thing]

## Success Criteria
- [ ] [Measurable criterion 1]
- [ ] [Measurable criterion 2]

## Non-Goals
- [Thing we're NOT doing and why]

## Constraints
- [Technical, timeline, dependency constraints]

## Open Questions
- [Unresolved decisions]
```

### Updating a PRD

PRD updates are lightweight:
- Adding constraints discovered during execution
- Adjusting success criteria based on reality
- Adding/removing scope items
- Resolving open questions

**Never fully rewrite** unless the project fundamentally pivots. The PRD is the anchor.

---

## Plan — `docs/plan.md`

The Plan defines **how**. Bite-sized, TDD-structured tasks.

### Creating a Plan

Read the PRD. Break the solution into tasks. Each task is ONE focused unit of work (5-15 min).

### Plan Format

```markdown
# Plan: [Feature Name]

**PRD:** docs/prd.md
**Status:** in-progress

## Tasks

- [ ] Task 1: Set up project structure
- [ ] Task 2: Write failing test for [specific behavior]
- [ ] Task 3: Implement [specific behavior] (minimal, pass test)
- [ ] Task 4: Write failing test for [next behavior]
- [ ] Task 5: Implement [next behavior]
- [ ] Task 6: Integration test for [feature]
- [ ] Task 7: Error handling edge cases
- [ ] Task 8: Update docs

## Notes
<!-- Learnings, blockers, decisions made during execution -->
```

### Task Granularity

Each task = one action. Not "build the auth system." Instead:

```markdown
- [ ] Write failing test for login endpoint (valid credentials → 200 + token)
- [ ] Implement login handler (minimal, pass test)
- [ ] Write failing test for login with bad password (→ 401)
- [ ] Add password validation (pass test)
- [ ] Write failing test for token refresh
- [ ] Implement token refresh
```

If you can't describe the task in one line, it's too big. Split it.

### Task Types

Most tasks follow TDD rhythm. Some don't need tests — mark them explicitly:

```markdown
- [ ] Configure ESLint + Prettier (no test needed)
- [ ] Write failing test for user creation
- [ ] Implement user creation (pass test)
- [ ] Update README with setup instructions (no test needed)
```

### Updating a Plan

Three modes depending on scope:

| Mode | When | What Happens |
|---|---|---|
| Append | Small addition mid-flight | Add new tasks, keep checked items |
| Partial rewrite | Direction shift, foundation holds | Keep completed as history, rewrite remaining |
| Full rewrite | New phase, clean slate | Commit current plan, write fresh from PRD |

After review, ask: "Append new tasks, partial rewrite, or fresh plan?"

---

## Execute

Work through tasks in batches. Default batch size: 3 tasks.

### Per Task (TDD Rhythm)

For tasks that need tests:

1. **Write failing test** — simplest possible test for the behavior
2. **Run it** — confirm it fails for the RIGHT reason
3. **Write minimal implementation** — just enough to pass
4. **Run it** — confirm it passes. No other tests broken.
5. **Refactor if needed** — clean up while green
6. **Mark task `[x]`** in plan.md

For tasks without tests (config, docs, etc.):
1. Do the thing
2. Verify it works
3. Mark task `[x]`

### Batch Checkpoint

After each batch:
- Show what was implemented
- Show test results
- Update plan.md with checked tasks
- Add any learnings to Notes section
- Report: "Batch done. 5/8 tasks complete. Ready for feedback."

Wait for feedback before next batch.

### When to Stop

**Stop executing immediately when:**
- Test fails for unexpected reason
- Missing dependency or unclear requirement
- Task reveals a gap in the PRD
- 3+ attempts at same fix (→ use debug skill)
- Scope creep detected (→ update PRD first)

Don't force through blockers. Surface them.

---

## Review

When all tasks are checked, review against PRD.

### Process

1. Read `docs/prd.md` success criteria
2. Verify each criterion is met — run tests, check behavior, inspect output
3. Check for regressions
4. Report:

```
## Review: [Feature Name]

### Success Criteria
- [x] Criterion 1 — verified by [test/behavior]
- [x] Criterion 2 — verified by [test/behavior]
- [ ] Criterion 3 — NOT MET: [reason]

### Test Results
[full test suite output]

### Issues Found
- [any problems discovered]

### Recommendation
[Ship it / More work needed / Scope adjustment needed]
```

### After Review

- **Ship it** → move to Finish
- **More work** → update plan (append/rewrite), continue executing
- **Scope changed** → update PRD first, then update plan

---

## Finish

Final phase. Only after review passes.

### Process

1. **Run full test suite** — everything must pass
2. **Present options:**
   ```
   All tests pass. Options:
   1. Merge to [base-branch] locally
   2. Push and create Pull Request
   3. Keep branch as-is (handle later)
   ```
3. **Execute chosen option**
4. **Clean up** — remove worktrees if applicable

### Merge Locally

```bash
git checkout [base-branch]
git pull
git merge [feature-branch]
# verify tests on merged result
```

### Pull Request

```bash
git push -u origin [feature-branch]
# create PR with PRD summary as description
```

---

## Status

Quick progress report at any time:

```
## Status: [Feature Name]

**PRD:** ✓ exists (docs/prd.md)
**Plan:** ✓ exists (docs/plan.md)
**Progress:** 5/8 tasks (62%)

### Completed
- [x] Task 1
- [x] Task 2
...

### Next Up
- [ ] Task 6
- [ ] Task 7

### Blockers
- [any blockers from Notes]
```

---

## Lifecycle Summary

```
┌─────────┐     ┌──────┐     ┌─────────┐     ┌────────┐     ┌────────┐
│   PRD   │────→│ Plan │────→│ Execute │────→│ Review │────→│ Finish │
│ what+why│     │ how  │     │ TDD do  │     │ verify │     │ ship   │
└─────────┘     └──────┘     └─────────┘     └────────┘     └────────┘
     ↑               ↑            │               │
     │               │            │               │
     └───────────────┴────────────┘               │
           scope change / more work ←─────────────┘
```

PRD is the anchor. Plan orbits it. Execute follows the plan. Review validates against PRD. Finish ships it. Feedback loops back to PRD or Plan as needed.

---

## Quick Start

Copy-paste-ready templates for PRD, Plan, and Status: `references/templates.md`

