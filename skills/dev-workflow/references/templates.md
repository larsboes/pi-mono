# Templates

## PRD Template

```markdown
# PRD: [Feature Name]

## Problem
[What's broken or missing, who it affects, why it matters now]

## Solution
[High-level approach — WHAT we're building, not HOW]

## Scope

### In Scope
- [Concrete deliverable 1]
- [Concrete deliverable 2]

### Out of Scope
- [Explicitly excluded — and why]

## Success Criteria
- [ ] [Measurable: "User can X and sees Y"]
- [ ] [Measurable: "API returns Z in <100ms"]
- [ ] [Measurable: "All existing tests still pass"]

## Non-Goals
- [What we're NOT optimizing for this round]

## Constraints
- [Tech: "Must use existing auth system"]
- [Timeline: "Needed before March release"]
- [Dependencies: "Blocked on API v2 from team X"]

## Open Questions
- [Decision not yet made]
- [Trade-off not yet resolved]
```

## Plan Template

```markdown
# Plan: [Feature Name]

**PRD:** docs/prd.md
**Status:** not-started | in-progress | review | complete

## Tasks

### Phase 1: Foundation
- [ ] [Setup/scaffold task]
- [ ] [Config task — no test needed]

### Phase 2: Core
- [ ] Write failing test for [behavior A]
- [ ] Implement [behavior A] (pass test)
- [ ] Write failing test for [behavior B]
- [ ] Implement [behavior B] (pass test)

### Phase 3: Edge Cases & Polish
- [ ] Write failing test for [edge case]
- [ ] Handle [edge case] (pass test)
- [ ] Error handling for [scenario]
- [ ] Update docs (no test needed)

## Notes
<!-- Updated during execution -->
<!-- Format: YYYY-MM-DD: [learning/decision/blocker] -->
```

## Status Template

```
## Status: [Feature Name]

**PRD:** ✓/✗ (docs/prd.md)
**Plan:** ✓/✗ (docs/plan.md)
**Progress:** N/M tasks (X%)
**Phase:** PRD | Planning | Executing | Review | Finishing

### Last Batch
- [x] What was just completed

### Next Up
- [ ] What's coming next (3 tasks)

### Blockers
- None | [description]

### Notes
- [Recent learnings or decisions]
```
