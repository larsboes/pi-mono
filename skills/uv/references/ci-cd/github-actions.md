# GitHub Actions

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install uv
        uses: astral-sh/setup-uv@v3
        with:
          version: "0.5.x"
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      
      - name: Install dependencies
        run: uv sync --all-extras --dev
      
      - name: Run tests
        run: uv run pytest
      
      - name: Type check
        run: uv run mypy src/
```

## Lock File Caching

```yaml
- uses: actions/cache@v4
  with:
    path: .venv
    key: ${{ runner.os }}-venv-${{ hashFiles('uv.lock') }}
```

## Publishing to PyPI

```yaml
- name: Build
  run: uv build

- name: Publish
  env:
    UV_PUBLISH_TOKEN: ${{ secrets.PYPI_TOKEN }}
  run: uv publish
```
