#!/bin/bash
# Create a new standalone Python script with uv
# Usage: init-script.sh <script-name> [options]
# Options:
#   --python ">=3.11"       Python version requirement
#   --deps "pkg1,pkg2"      Dependencies (comma-separated)

set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Usage: $0 <script-name> [options]"
    echo ""
    echo "Options:"
    echo "  --python '>=3.11'       Python version (default: >=3.10)"
    echo "  --deps 'pkg1,pkg2'      Dependencies (comma-separated)"
    echo ""
    echo "Example:"
    echo "  $0 analyze --python '>=3.11' --deps 'requests,pandas'"
    exit 1
fi

SCRIPT_NAME="$1"
shift

# Add .py extension if not present
[[ "$SCRIPT_NAME" != *.py ]] && SCRIPT_NAME="$SCRIPT_NAME.py"

# Defaults
PYTHON_VERSION=">=3.10"
DEPS=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --python)
            PYTHON_VERSION="$2"
            shift 2
            ;;
        --deps)
            DEPS="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check if file exists
if [ -e "$SCRIPT_NAME" ]; then
    echo "Error: $SCRIPT_NAME already exists"
    exit 1
fi

echo "Creating script: $SCRIPT_NAME"

# Build dependencies list for script
SCRIPT_DEPS=""
if [ -n "$DEPS" ]; then
    # Convert comma-separated to JSON array
    IFS=',' read -ra DEP_ARRAY <<< "$DEPS"
    for dep in "${DEP_ARRAY[@]}"; do
        dep=$(echo "$dep" | xargs) # trim whitespace
        [ -n "$SCRIPT_DEPS" ] && SCRIPT_DEPS="$SCRIPT_DEPS, "
        SCRIPT_DEPS="$SCRIPT_DEPS\"$dep\""
    done
fi

# Create script
cat > "$SCRIPT_NAME" << EOF
# /// script
# requires-python = "$PYTHON_VERSION"
$(if [ -n "$SCRIPT_DEPS" ]; then echo "# dependencies = [$SCRIPT_DEPS]"; fi)
# ///

"""
$SCRIPT_NAME - Description of what this script does.

Usage:
    uv run $SCRIPT_NAME [options]

Examples:
    uv run $SCRIPT_NAME --help
"""

import sys


def main() -> int:
    """Main entry point."""
    print("Hello from $SCRIPT_NAME!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
EOF

chmod +x "$SCRIPT_NAME"

echo ""
echo "✓ Script '$SCRIPT_NAME' created"
echo ""
echo "Run with: uv run $SCRIPT_NAME"
