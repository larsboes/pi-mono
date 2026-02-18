# Migration: From Poetry to uv

```bash
# poetry → uv

# 1. Export poetry.lock to requirements
poetry export -o requirements.txt

# 2. Create new uv project
uv init

# 3. Add dependencies from requirements
while read dep; do
    uv add "$dep"
done < requirements.txt

# Or manually add from pyproject.toml [tool.poetry.dependencies]
# Convert:
#   [tool.poetry.dependencies]
#   requests = "^2.28"
# To:
#   uv add ">=2.28,<3.0"
```
