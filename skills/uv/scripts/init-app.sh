#!/bin/bash
# Create a new Python application
# Usage: init-app.sh <app-name> [options]
# Options:
#   --description "desc"    App description
#   --author "Name"         Author name
#   --cli                   Add CLI framework (click)
#   --web                   Add web framework (fastapi)
#   --python ">=3.11"       Python version requirement
#   --no-git                Don't initialize git

set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Usage: $0 <app-name> [options]"
    echo ""
    echo "Options:"
    echo "  --description 'desc'    App description"
    echo "  --author 'Name'         Author name"
    echo "  --cli                   Add CLI framework (click)"
    echo "  --web                   Add web framework (fastapi)"
    echo "  --python '>=3.11'       Python version (default: >=3.10)"
    echo "  --no-git                Don't initialize git"
    echo ""
    echo "Examples:"
    echo "  $0 myapp --description 'My awesome app' --cli"
    echo "  $0 api-server --description 'REST API' --web"
    exit 1
fi

APP_NAME="$1"
shift

# Defaults
DESCRIPTION="A Python application"
AUTHOR=""
ADD_CLI=false
ADD_WEB=false
PYTHON_VERSION=">=3.10"
INIT_GIT=true

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --description)
            DESCRIPTION="$2"
            shift 2
            ;;
        --author)
            AUTHOR="$2"
            shift 2
            ;;
        --cli)
            ADD_CLI=true
            shift
            ;;
        --web)
            ADD_WEB=true
            shift
            ;;
        --python)
            PYTHON_VERSION="$2"
            shift 2
            ;;
        --no-git)
            INIT_GIT=false
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check if directory exists
if [ -e "$APP_NAME" ]; then
    echo "Error: $APP_NAME already exists"
    exit 1
fi

echo "Creating application: $APP_NAME"

# Create directory and initialize
mkdir -p "$APP_NAME"
cd "$APP_NAME"

# Initialize with uv
uv init --app --name "$APP_NAME"

# Build dependencies string
DEPS=""
[ "$ADD_CLI" = true ] && DEPS="click>=8.0"
if [ "$ADD_WEB" = true ]; then
    [ -n "$DEPS" ] && DEPS="$DEPS, "
    DEPS="${DEPS}fastapi>=0.100, uvicorn[standard]>=0.23"
fi

# Update pyproject.toml
cat > pyproject.toml << EOF
[project]
name = "$APP_NAME"
version = "0.1.0"
description = "$DESCRIPTION"
readme = "README.md"
requires-python = "$PYTHON_VERSION"
license = { text = "MIT" }
authors = [
    { name = "${AUTHOR:-$(git config user.name || echo 'Anonymous')}" }
]
dependencies = [$([ -n "$DEPS" ] && echo "\"$DEPS\"")]

[project.optional-dependencies]
dev = [
    "pytest>=7.0",
    "pytest-cov>=4.0",
    "ruff>=0.1.0",
    "mypy>=1.0",
]

[project.scripts]
$APP_NAME = "$APP_NAME.cli:main"

[project.urls]
Homepage = "https://github.com/username/$APP_NAME"
Repository = "https://github.com/username/$APP_NAME"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.pytest.ini_options]
testpaths = ["tests"]

[tool.ruff]
line-length = 100
target-version = "py310"

[tool.ruff.lint]
select = ["E", "F", "I", "N", "W", "UP"]

[tool.mypy]
python_version = "3.10"
warn_return_any = true
warn_unused_configs = true
EOF

# Create README
cat > README.md << EOF
# $APP_NAME

$DESCRIPTION

## Installation

\`\`\`bash
pip install $APP_NAME
\`\`\`

## Usage

\`\`\`bash
# Run the application
uv run $APP_NAME
\`\`\`

## Development

\`\`\`bash
# Install dependencies
uv sync --all-extras --dev

# Run tests
uv run pytest

# Run linting
uv run ruff check .
uv run ruff format .
uv run mypy src/
\`\`\`

## License

MIT
EOF

# Create src structure
mkdir -p "src/$APP_NAME"

# Main module
if [ "$ADD_CLI" = true ]; then
    cat > "src/$APP_NAME/cli.py" << 'EOF'
"""CLI for the application."""

import click


@click.command()
@click.option("--name", default="World", help="Name to greet")
@click.version_option(version="0.1.0")
def main(name: str) -> None:
    """CLI entry point."""
    click.echo(f"Hello, {name}!")


if __name__ == "__main__":
    main()
EOF
elif [ "$ADD_WEB" = true ]; then
    cat > "src/$APP_NAME/main.py" << 'EOF'
"""FastAPI application."""

from fastapi import FastAPI

app = FastAPI(title="API", version="0.1.0")


@app.get("/")
async def root():
    """Root endpoint."""
    return {"message": "Hello, World!"}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}
EOF
else
    cat > "src/$APP_NAME/__main__.py" << 'EOF'
"""Application entry point."""


def main() -> None:
    """Run the application."""
    print("Hello, World!")


if __name__ == "__main__":
    main()
EOF
fi

# __init__.py
cat > "src/$APP_NAME/__init__.py" << EOF
"""$DESCRIPTION"""

__version__ = "0.1.0"
EOF

# Create tests
mkdir -p tests
if [ "$ADD_CLI" = true ]; then
    cat > tests/test_cli.py << 'EOF'
"""Tests for CLI."""

from click.testing import CliRunner
from myapp.cli import main


def test_cli():
    """Test CLI basic invocation."""
    runner = CliRunner()
    result = runner.invoke(main)
    assert result.exit_code == 0
    assert "Hello" in result.output


def test_cli_with_name():
    """Test CLI with name option."""
    runner = CliRunner()
    result = runner.invoke(main, ["--name", "Test"])
    assert result.exit_code == 0
    assert "Hello, Test!" in result.output
EOF
elif [ "$ADD_WEB" = true ]; then
    cat > tests/test_main.py << 'EOF'
"""Tests for FastAPI app."""

from fastapi.testclient import TestClient
from myapp.main import app

client = TestClient(app)


def test_root():
    """Test root endpoint."""
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Hello, World!"}


def test_health():
    """Test health endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
EOF
else
    cat > tests/test_app.py << 'EOF'
"""Tests for the application."""


def test_placeholder():
    """A placeholder test."""
    assert True
EOF
fi

# Create additional files
cat > .gitignore << 'EOF'
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
*.egg-info/
.installed.cfg
*.egg

# Virtual environments
venv/
ENV/
env/
.venv

# IDE
.idea/
.vscode/
*.swp
*.swo
*~

# Testing
.pytest_cache/
.coverage
htmlcov/

# uv
.uv/

# Environment
.env
.env.local
EOF

# Initialize git if requested
if [ "$INIT_GIT" = true ]; then
    git init
    git add .
    git commit -m "Initial commit"
fi

# Sync dependencies
echo "Installing dependencies..."
uv sync --all-extras --dev

echo ""
echo "✓ Application '$APP_NAME' created"
echo ""
echo "Next steps:"
echo "  cd $APP_NAME"
echo "  uv run $APP_NAME"
echo "  # Start coding in src/$APP_NAME/"
