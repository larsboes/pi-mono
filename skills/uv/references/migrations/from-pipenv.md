# Migration: From Pipenv to uv

```bash
# pipenv → uv

# 1. Export Pipfile.lock
pipenv lock -r > requirements.txt

# 2. Create uv project
uv init

# 3. Import dependencies
cat requirements.txt | xargs -I {} uv add "{}"

# Convert dev dependencies:
pipenv lock -r --dev > dev-requirements.txt
cat dev-requirements.txt | xargs -I {} uv add --dev "{}"
```
