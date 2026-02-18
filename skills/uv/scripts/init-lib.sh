#!/bin/bash
# Create a new Python library package
# Usage: init-lib.sh <package-name> [options]
# Options:
#   --description "desc"    Package description
#   --author "Name"         Author name
#   --python ">=3.11"       Python version requirement
#   --no-git                Don't initialize git

set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Usage: $0 <package-name> [options]"
    echo ""
    echo "Options:"
    echo "  --description 'desc'    Package description"
    echo "  --author 'Name'         Author name"
    echo "  --python '>=3.11'       Python version (default: >=3.10)"
    echo "  --no-git                Don't initialize git"
    echo ""
    echo "Example:"
    echo "  $0 mypackage --description 'My awesome package' --author 'John Doe'"
    exit 1
fi

PACKAGE_NAME="$1"
shift

# Defaults
DESCRIPTION="A Python package"
AUTHOR=""
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
if [ -e "$PACKAGE_NAME" ]; then
    echo "Error: $PACKAGE_NAME already exists"
    exit 1
fi

echo "Creating library package: $PACKAGE_NAME"

# Create directory and initialize
mkdir -p "$PACKAGE_NAME"
cd "$PACKAGE_NAME"

# Initialize with uv
uv init --lib --name "$PACKAGE_NAME"

# Update pyproject.toml
cat > pyproject.toml << EOF
[project]
name = "$PACKAGE_NAME"
version = "0.1.0"
description = "$DESCRIPTION"
readme = "README.md"
requires-python = "$PYTHON_VERSION"
license = { text = "MIT" }
authors = [
    { name = "${AUTHOR:-$(git config user.name || echo 'Anonymous')}" }
]
classifiers = [
    "Development Status :: 3 - Alpha",
    "Intended Audience :: Developers",
    "License :: OSI Approved :: MIT License",
    "Programming Language :: Python :: 3",
]
dependencies = []

[project.optional-dependencies]
dev = [
    "pytest>=7.0",
    "pytest-cov>=4.0",
    "ruff>=0.1.0",
    "mypy>=1.0",
]

[project.urls]
Homepage = "https://github.com/username/$PACKAGE_NAME"
Repository = "https://github.com/username/$PACKAGE_NAME"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/$PACKAGE_NAME"]

[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]

[tool.coverage.run]
source = ["src"]

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
# $PACKAGE_NAME

$DESCRIPTION

## Installation

\`\`\`bash
pip install $PACKAGE_NAME
\`\`\`

## Usage

\`\`\`python
from $PACKAGE_NAME import hello

hello()
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
mkdir -p "src/$PACKAGE_NAME"
cat > "src/$PACKAGE_NAME/__init__.py" << EOF
"""$DESCRIPTION"""

__version__ = "0.1.0"


def hello() -> str:
    """Return a greeting."""
    return "Hello from $PACKAGE_NAME!"
EOF

# Create tests
cat > tests/test_$PACKAGE_NAME.py << EOF
"""Tests for $PACKAGE_NAME."""

from $PACKAGE_NAME import hello


def test_hello():
    """Test the hello function."""
    result = hello()
    assert result == "Hello from $PACKAGE_NAME!"
EOF

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
echo "✓ Library package '$PACKAGE_NAME' created"
echo ""
echo "Next steps:"
echo "  cd $PACKAGE_NAME"
echo "  uv run pytest"
echo "  # Start coding in src/$PACKAGE_NAME/"
