# Mode: review

Perform a comprehensive architecture review of the codebase.

## Step 0 — Discover Project Structure

Before scanning, determine the actual directory layout:

1. Glob for `**/domain/**/*.py`, `**/services/**/*.py`, `**/infrastructure/**/*.py`, `**/api/**/*.py`, `**/agents/**/*.py`
2. Identify the root package and layer directories
3. Map which layers exist and where they live

## Review Checklist

### 1. Layer Boundary Analysis

Check each layer for forbidden imports:

**DOMAIN layer — Must be PURE**
- Allowed: `dataclass`, `typing`, `uuid`, `datetime`, `decimal`, `abc`, `enum`
- Forbidden: web frameworks (`fastapi`, `flask`, `django`), ORMs (`sqlalchemy`, `tortoise`, `peewee`), validation frameworks (`pydantic`), infrastructure imports, ORM model imports

**SERVICE layer — Orchestration only**
- Allowed: domain imports, abstract adapter/repository interfaces, abstract unit of work
- Forbidden: ORM model imports, concrete repository imports, direct infrastructure access

**AGENT / WORKFLOW layer**
- Should inject: adapters and services via parameters or constructor
- Avoid: direct instantiation of concrete adapters or infrastructure

**INFRASTRUCTURE layer (repositories, adapters, etc.)**
- Implements domain interfaces
- Can import: domain layer, external libraries

**API / PRESENTATION layer**
- Should call services, not bypass them for direct DB/infrastructure access
- Should not import concrete repositories

### 2. Pattern Compliance

- [ ] **Repository Pattern**: Repos return domain entities, not ORM models
- [ ] **Unit of Work**: Services use abstract UoW for transactions
- [ ] **Dependency Injection**: Services accept dependencies via constructor
- [ ] **Factory Methods**: Domain entities use `Entity.create()` not direct `__init__`
- [ ] **Interface Segregation**: Adapter interfaces are narrow and role-specific

### 3. SOLID Violations

- **SRP**: Classes with multiple responsibilities
- **OCP**: Code requiring modification to extend (instead of new implementations)
- **LSP**: Implementations not satisfying interface contracts
- **ISP**: Fat interfaces forcing unused implementations
- **DIP**: High-level modules depending on low-level details

## Output Format

```markdown
## Architecture Review Summary

### Critical Violations (Must Fix)
| File | Line | Violation | Fix |
|------|------|-----------|-----|

### Warnings (Should Fix)
| File | Issue | Suggestion |
|------|-------|------------|

### Good Practices Found
- ...

### Recommendations
1. ...
```

## Execution

Use Grep to scan for violations. Check files specified in arguments, or do a full review if none specified.
