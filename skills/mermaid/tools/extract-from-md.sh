#!/bin/bash
# Extract Mermaid diagrams from Markdown files and validate them
# Usage: extract-from-md.sh <markdown-file> [--validate]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ $# -lt 1 ]; then
    echo "Usage: $0 <markdown-file> [--validate]"
    echo ""
    echo "Extracts mermaid code blocks from Markdown files."
    echo "With --validate, runs each diagram through validation."
    exit 1
fi

INPUT="$1"
VALIDATE=false

if [ $# -ge 2 ] && [ "$2" = "--validate" ]; then
    VALIDATE=true
fi

if [ ! -f "$INPUT" ]; then
    echo "Error: File not found: $INPUT"
    exit 1
fi

# Extract mermaid blocks and save to temp files
TMPDIR=$(mktemp -d /tmp/mermaid_extract.XXXXXX)
trap "rm -rf $TMPDIR" EXIT

echo "Extracting Mermaid diagrams from: $INPUT"
echo ""

# Parse markdown and extract mermaid blocks
awk '
/^```mermaid$/ {
    in_block = 1
    count++
    filename = sprintf("'$TMPDIR'/diagram_%02d.mmd", count)
    next
}
/^```$/ && in_block {
    in_block = 0
    print "Extracted: " filename
    next
}
in_block {
    print > filename
}
' "$INPUT"

# Count extracted diagrams
DIAGRAM_COUNT=$(ls -1 "$TMPDIR"/*.mmd 2>/dev/null | wc -l)

echo ""
echo "Found $DIAGRAM_COUNT Mermaid diagram(s)"

if [ "$DIAGRAM_COUNT" -eq 0 ]; then
    echo "No mermaid diagrams found in file"
    exit 0
fi

# Validate if requested
if [ "$VALIDATE" = true ]; then
    echo ""
    echo "Validating diagrams..."
    echo ""
    
    VALID=0
    INVALID=0
    
    for diagram in "$TMPDIR"/*.mmd; do
        name=$(basename "$diagram")
        echo "--- $name ---"
        if "$SCRIPT_DIR/validate.sh" "$diagram" 2>&1 | head -20; then
            ((VALID++))
        else
            ((INVALID++))
            echo "✗ Validation failed for $name"
        fi
        echo ""
    done
    
    echo "========================================"
    echo "Results: $VALID valid, $INVALID invalid"
    
    if [ $INVALID -gt 0 ]; then
        exit 1
    fi
fi

# Copy valid diagrams to output if user wants
OUTPUT_DIR="${INPUT%.md}_diagrams"
echo ""
read -p "Copy diagrams to $OUTPUT_DIR? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    mkdir -p "$OUTPUT_DIR"
    cp "$TMPDIR"/*.mmd "$OUTPUT_DIR/"
    echo "Copied to: $OUTPUT_DIR/"
fi
