# Workspace/Monorepo Patterns

## Structure

```
monorepo/
├── pyproject.toml          # Workspace root
├── uv.lock                 # Unified lock file
├── packages/
│   ├── core/
│   │   ├── pyproject.toml
│   │   └── src/core/
│   └── utils/
│       ├── pyproject.toml
│       └── src/utils/
└── apps/
    └── api/
        ├── pyproject.toml
        └── src/api/
```

## Root pyproject.toml

```toml
[project]
name = "monorepo"
version = "0.1.0"
requires-python = ">=3.11"

[tool.uv.workspace]
members = ["packages/*", "apps/*"]
```

## Cross-Package Dependencies

```toml
# packages/utils/pyproject.toml
[project]
name = "utils"
version = "0.1.0"
dependencies = ["core"]  # References packages/core

[tool.uv.sources]
core = { workspace = true }
```

## Running Commands Across Packages

```bash
# Run tests for all packages
uv run --all-packages pytest

# Run specific package
uv run --package core pytest

# Sync all dependencies
uv sync --all-packages
```
