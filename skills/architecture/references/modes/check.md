# Mode: check

Quick automated scan for Clean Architecture boundary violations.

## Step 0 — Discover Project Structure

1. Glob to find the actual layer directories (domain, services, infrastructure, api, agents)
2. Note the root package name and path prefixes

## Checks to Run (in parallel where possible)

### 1. Domain Layer Purity (CRITICAL)
```
Grep in <domain_dir>/ for:
- "from fastapi"
- "from flask"
- "from django"
- "from sqlalchemy"
- "from pydantic"
- "from <root_pkg>\.models"
- "from <root_pkg>\.infrastructure"
```
Expected: **0 matches**

### 2. Service Layer Isolation (WARNING)
```
Grep in <services_dir>/ for:
- "from <root_pkg>\.models\."
- "from <root_pkg>\.infrastructure\.repositories"
```
Expected: **0 matches**

### 3. Repository Pattern (WARNING)
```
Grep in <infrastructure_dir>/repositories/ for:
- "session\.commit\(\)"
- "\.commit\(\)"
```
Expected: **0 matches** (repositories should use `flush()`, UoW controls commit)

### 4. API Layer (WARNING)
```
Grep in <api_dir>/ for:
- "from <root_pkg>\.infrastructure\.repositories"
- "AsyncSession"
```
Expected: **0 matches**

### 5. Agent / Workflow Coupling (INFO)
```
Grep in <agents_dir>/ for:
- Direct instantiation of concrete adapters (e.g., "SomeAdapter()")
- Hardcoded infrastructure calls
```
Expected: **Minimal** (should inject adapters via DI)

## Output Format

```
## Boundary Check Results

| Check | Status | Violations |
|-------|--------|------------|
| Domain purity | PASS/FAIL | X files |
| Service isolation | PASS/FAIL | X files |
| Repository pattern | PASS/FAIL | X files |
| API layer | PASS/FAIL | X files |
| Agent coupling | PASS/WARN | X files |

### Violations Found
[List each with file:line]

### Summary
- X checks passed
- Y warnings
- Z critical violations
```

Run all Grep searches in parallel for speed.
