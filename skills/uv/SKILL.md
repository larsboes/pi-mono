---
name: uv
description: "Python packaging with uv. Project templates, dependency management, CI/CD patterns, and migration guides. Includes executable scripts for scaffolding."
---

# uv Skill

Python packaging reimagined. Fast, reliable, and universal.

## Scripts

All scaffolding scripts are in `./scripts/`.

### Create Library Package

```bash
./scripts/init-lib.sh mypackage
./scripts/init-lib.sh mypackage --description "My awesome package" --author "John Doe"
./scripts/init-lib.sh mypackage --python ">=3.11"
```

Creates:
```
mypackage/
├── pyproject.toml
├── README.md
├── .gitignore
├── src/
│   └── mypackage/
│       └── __init__.py
└── tests/
    └── test_mypackage.py
```

### Create Application

```bash
./scripts/init-app.sh myapp
./scripts/init-app.sh myapp --description "My CLI tool" --cli
./scripts/init-app.sh myapp --description "My API" --web
./scripts/init-app.sh myapp --cli --author "John Doe"
```

Options:
- `--cli` - Add Click CLI framework
- `--web` - Add FastAPI web framework
- `--description "..."` - Project description
- `--author "Name"` - Author name
- `--python ">=3.11"` - Python version requirement
- `--no-git` - Skip git initialization

### Create Standalone Script

```bash
./scripts/init-script.sh analyze
./scripts/init-script.sh process --deps "requests,pandas,numpy"
./scripts/init-script.sh fetch --python ">=3.12" --deps "httpx"
```

Creates a single-file script with inline metadata.

## Quick Reference

```bash
# Run a script
uv run script.py

# Run with ad-hoc dependency
uv run --with requests script.py

# Add dependency to project
uv add requests

# Create script with inline metadata
uv init --script foo.py
```

## Dependency Management Workflows

### Add Dependencies

```bash
# Add runtime dependency
uv add requests

# Add with version constraint
uv add ">=2.28,<3.0"

# Add dev dependency
uv add pytest --dev

# Add optional dependency group
uv add redis --optional cache
```

### Update Dependencies

```bash
# Update lock file (check for updates)
uv lock --upgrade

# Update specific package
uv lock --upgrade-package requests

# Sync environment with lock file
uv sync
```

### Export Requirements

```bash
# Export to requirements.txt
uv pip compile pyproject.toml -o requirements.txt

# Export with hashes
uv pip compile pyproject.toml --generate-hashes -o requirements.txt
```

## Common Commands

| Command | Description |
|---------|-------------|
| `uv run <script>` | Run script in project environment |
| `uv add <pkg>` | Add dependency |
| `uv add --dev <pkg>` | Add dev dependency |
| `uv sync` | Sync environment with lock file |
| `uv lock` | Update lock file |
| `uv lock --upgrade` | Upgrade all packages |
| `uv build` | Build wheel/sdist |
| `uv publish` | Publish to PyPI |
| `uv pip install` | Low-level pip compatibility |
| `uv venv` | Create virtual environment |

## Advanced Topics

- **[Migrations](references/migrations/)** — From poetry, pip, pipenv
- **[CI/CD Patterns](references/ci-cd/)** — GitHub Actions, caching, publishing
- **[Workspaces](references/workspaces.md)** — Monorepo patterns

## References

- [references/migrations/](references/migrations/) — Migration guides from other tools
- [references/ci-cd/](references/ci-cd/) — Continuous integration patterns
- [references/workspaces.md](references/workspaces.md) — Monorepo workspace setup
- [scripts.md](scripts.md) — Script-specific documentation
- [build.md](build.md) — Build backend details
- https://docs.astral.sh/uv/ — Official documentation
