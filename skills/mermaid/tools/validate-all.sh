#!/bin/bash
# Batch validate Mermaid diagrams
# Usage: validate-all.sh <pattern> [pattern...]
# Example: validate-all.sh diagrams/*.mmd docs/*.mmd

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ $# -lt 1 ]; then
    echo "Usage: $0 <pattern> [pattern...]"
    echo ""
    echo "Examples:"
    echo "  $0 diagrams/*.mmd"
    echo "  $0 *.mmd docs/*.mmd"
    exit 1
fi

# Collect all files
FILES=()
for pattern in "$@"; do
    # Expand glob
    for file in $pattern; do
        if [ -f "$file" ]; then
            FILES+=("$file")
        fi
    done
done

if [ ${#FILES[@]} -eq 0 ]; then
    echo "No files matched patterns: $@"
    exit 1
fi

echo "Validating ${#FILES[@]} diagram(s)..."
echo ""

VALID=0
INVALID=0
FAILED_FILES=()

for file in "${FILES[@]}"; do
    echo -n "$(basename "$file"): "
    if "$SCRIPT_DIR/validate.sh" "$file" >/dev/null 2>&1; then
        echo "✓"
        ((VALID++))
    else
        echo "✗"
        ((INVALID++))
        FAILED_FILES+=("$file")
    fi
done

echo ""
echo "========================================"
echo "Results: $VALID valid, $INVALID invalid"

if [ $INVALID -gt 0 ]; then
    echo ""
    echo "Failed files:"
    for file in "${FAILED_FILES[@]}"; do
        echo "  - $file"
    done
    exit 1
fi
