# Migration: From pip + requirements.txt

```bash
# pip → uv

# 1. Create uv project
uv init --app

# 2. Add from requirements.txt
cat requirements.txt | xargs -I {} uv add "{}"

# 3. Remove requirements.txt
rm requirements.txt
```
