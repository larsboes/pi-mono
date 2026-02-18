---
name: debug
description: Systematic root-cause debugging. Use when encountering any bug, test failure, or unexpected behavior — before proposing fixes.
---

<!--
🌐 COMMUNITY SKILL

Part of the pi-mono open skills collection.
- Repository: https://github.com/larsboes/pi-mono
- License: MIT
- Author: {{author}}

Contributions welcome via GitHub issues and PRs.
Last synced: 2026-02-18 21:06:29
-->

# Systematic Debugging

Random fixes waste time and create new bugs. Quick patches mask underlying issues.

**Iron Law: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.**

If you haven't completed Phase 1, you cannot propose fixes. Violating the letter of this process is violating the spirit of debugging.

## When to Use

Any technical issue: test failures, bugs, unexpected behavior, performance problems, build failures, integration issues.

**Especially when:**
- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- You've already tried multiple fixes
- Previous fix didn't work
- You don't fully understand the issue

## The Four Phases

Complete each phase before proceeding to the next.

### Phase 1: Root Cause Investigation

**Before attempting ANY fix:**

1. **Read error messages carefully** — don't skip past errors/warnings. Read stack traces completely. Note line numbers, file paths, error codes. They often contain the exact solution.

2. **Reproduce consistently** — can you trigger it reliably? Exact steps? Every time? If not reproducible → gather more data, don't guess.

3. **Check recent changes** — git diff, recent commits, new dependencies, config changes, environmental differences.

4. **Gather evidence in multi-component systems** — before proposing fixes, add diagnostic instrumentation at every component boundary. Log what enters, what exits, verify env/config propagation. Run once to gather evidence showing WHERE it breaks. Then investigate that specific component.

5. **Trace data flow** — where does bad value originate? What called this with bad value? Keep tracing up until you find the source. Fix at source, not at symptom. See `references/root-cause-tracing.md` for the full technique.

### Phase 2: Pattern Analysis

1. **Find working examples** — locate similar working code in same codebase.
2. **Compare against references** — if implementing a pattern, read reference implementation COMPLETELY. Don't skim.
3. **Identify differences** — list every difference between working and broken, however small.
4. **Understand dependencies** — what components, settings, config, environment does this need?

### Phase 3: Hypothesis and Testing

1. **Form single hypothesis** — state clearly: "I think X is the root cause because Y." Be specific.
2. **Test minimally** — smallest possible change. One variable at a time. Don't fix multiple things at once.
3. **Verify before continuing** — worked? → Phase 4. Didn't work? → new hypothesis. DON'T add more fixes on top.
4. **When you don't know** — say so. Don't pretend. Research more.

### Phase 4: Implementation

1. **Create failing test case** — simplest possible reproduction. Automated test if possible. MUST have before fixing.
2. **Implement single fix** — address root cause. ONE change at a time. No "while I'm here" improvements. No bundled refactoring.
3. **Verify fix** — test passes? No other tests broken? Issue actually resolved?
4. **If fix doesn't work** — count attempts. If < 3: return to Phase 1 with new information. If ≥ 3: STOP.
5. **If 3+ fixes failed** — this is an architectural problem, not a bug. Question fundamentals: Is this pattern sound? Are we persisting through inertia? Should we refactor architecture? Discuss before attempting more fixes.

## After Fixing: Defense in Depth

Don't stop at one validation point. Add checks at every layer data passes through. Make the bug structurally impossible.

See `references/defense-in-depth.md` for the four-layer pattern.

## Red Flags — STOP and Return to Phase 1

If you catch yourself thinking:
- "Quick fix for now, investigate later"
- "Just try changing X and see"
- "I don't fully understand but this might work"
- "It's probably X, let me fix that"
- "One more fix attempt" (when already tried 2+)
- Proposing solutions before tracing data flow
- Each fix reveals new problem in different place

## Common Rationalizations

| Excuse | Reality |
|---|---|
| "Issue is simple" | Simple issues have root causes too. Process is fast for simple bugs. |
| "Emergency, no time" | Systematic is FASTER than guess-and-check thrashing. |
| "Just try this first" | First fix sets the pattern. Do it right from the start. |
| "Multiple fixes saves time" | Can't isolate what worked. Causes new bugs. |
| "I see the problem" | Seeing symptoms ≠ understanding root cause. |

## Quick Reference

| Phase | Key Activities | Gate |
|---|---|---|
| 1. Root Cause | Read errors, reproduce, check changes, trace data | Understand WHAT and WHY |
| 2. Pattern | Find working examples, compare differences | Identify the delta |
| 3. Hypothesis | Form theory, test minimally | Confirmed or new theory |
| 4. Implementation | Failing test → fix → verify | Bug resolved, tests pass |

