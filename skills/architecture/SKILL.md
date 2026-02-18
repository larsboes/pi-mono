---
name: architecture
description: >
  Unified Clean Architecture skill with 5 modes: review (comprehensive architecture review),
  check (quick boundary violation scan), fix (guided violation remediation),
  design-module (design new modules following Clean Architecture), and
  design-workflow (design agent workflows with dependency injection).
  Invoke with mode as first argument, e.g. /architecture review or /architecture fix <file>.
allowed-tools: Read, Edit, Write, Grep, Glob
---

# Clean Architecture Skill

Unified skill for reviewing, enforcing, fixing, and designing Clean Architecture codebases.

## Mode Selection

Pass the mode as the first argument:

| Mode | Usage | Purpose |
|------|-------|---------|
| `review` | `/architecture review [files...]` | Comprehensive architecture review |
| `check` | `/architecture check` | Quick boundary violation scan |
| `fix` | `/architecture fix [file or violation type]` | Guided violation remediation |
| `design-module` | `/architecture design-module [description]` | Design a new module |
| `design-workflow` | `/architecture design-workflow [description]` | Design an agent workflow |

$ARGUMENTS

---

## Quick Reference

### Layer Boundaries

| Layer | Can Import | Must Not Import |
|-------|-----------|-----------------|
| **Domain** | `dataclasses`, `typing`, `uuid`, `datetime`, `abc`, `enum` | Web frameworks, ORMs, validation libs |
| **Service** | Domain, abstract interfaces | ORM models, concrete repos, direct infra |
| **Agent/Workflow** | Injected adapters/services | Direct adapter instantiation |
| **Infrastructure** | Domain, external libs | - |
| **API** | Services | Concrete repos, direct DB access |

### Common Fixes

| Violation | Fix Pattern |
|-----------|-------------|
| Domain imports framework | Replace with pure Python (dataclasses) |
| Service imports ORM model | Use repository abstraction |
| Repository calls `commit()` | Use `flush()`, let UoW commit |
| Workflow hardcodes adapter | Inject via `functools.partial` |
| Prompt embedded in node | Externalize to prompts/ directory |

---

## Mode Details

See references for detailed mode documentation:

- **[review](references/modes/review.md)** — Comprehensive architecture review with layer analysis, pattern compliance, SOLID checks
- **[check](references/modes/check.md)** — Quick automated boundary violation scanning with grep patterns
- **[fix](references/modes/fix.md)** — Common refactoring patterns for violations
- **[design-module](references/modes/design-module.md)** — Design new modules following Clean Architecture
- **[design-workflow](references/modes/design-workflow.md)** — Design agent workflows with dependency injection

---

## Philosophy

**Good architecture is:**
- **Boundary-respecting** — Domain stays pure
- **Dependency-inverted** — Services depend on abstractions
- **Testable** — Dependencies injected, not hardcoded
- **Explicit** — Violations caught early, fixed systematically

**Not Clean Architecture:**
- Framework dependencies in domain
- Direct DB access from API layer
- Hardcoded infrastructure in workflows
- Transaction control in repositories
