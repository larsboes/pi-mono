#!/bin/bash
# Lint Mermaid diagrams for best practices
# Usage: lint.sh <diagram.mmd> [--fix]

set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Usage: $0 <diagram.mmd> [--fix]"
    echo ""
    echo "Checks for best practices:"
    echo "  - Consistent direction (TD, LR, etc.)"
    echo "  - Node labels present"
    echo "  - No overly long lines"
    echo "  - Proper styling consistency"
    echo "  - Subgraph labels"
    exit 1
fi

INPUT="$1"
FIX=false

if [ $# -ge 2 ] && [ "$2" = "--fix" ]; then
    FIX=true
fi

if [ ! -f "$INPUT" ]; then
    echo "Error: File not found: $INPUT"
    exit 1
fi

DIAGRAM_TYPE=""
ISSUES=0
WARNINGS=0

echo "Linting: $INPUT"
echo ""

# Detect diagram type
if head -20 "$INPUT" | grep -q "^graph\|^flowchart"; then
    DIAGRAM_TYPE="flowchart"
elif head -20 "$INPUT" | grep -q "^sequenceDiagram"; then
    DIAGRAM_TYPE="sequence"
elif head -20 "$INPUT" | grep -q "^classDiagram"; then
    DIAGRAM_TYPE="class"
elif head -20 "$INPUT" | grep -q "^erDiagram"; then
    DIAGRAM_TYPE="er"
elif head -20 "$INPUT" | grep -q "^stateDiagram"; then
    DIAGRAM_TYPE="state"
elif head -20 "$INPUT" | grep -q "^gantt"; then
    DIAGRAM_TYPE="gantt"
elif head -20 "$INPUT" | grep -q "^pie"; then
    DIAGRAM_TYPE="pie"
elif head -20 "$INPUT" | grep -q "^journey"; then
    DIAGRAM_TYPE="journey"
fi

if [ -n "$DIAGRAM_TYPE" ]; then
    echo "Detected type: $DIAGRAM_TYPE"
    echo ""
fi

# Check 1: Direction consistency (flowcharts)
if [ "$DIAGRAM_TYPE" = "flowchart" ]; then
    DIRECTIONS=$(grep -oE "^(flowchart|graph)\s+(TD|TB|BT|RL|LR)" "$INPUT" | wc -l)
    if [ "$DIRECTIONS" -eq 0 ]; then
        echo "⚠ WARNING: No explicit direction specified (add TD, LR, etc.)"
        ((WARNINGS++))
    fi
fi

# Check 2: Overly long lines
LONG_LINES=$(awk 'length > 100 {print NR": "substr($0, 1, 50)"..."}' "$INPUT" | head -5)
if [ -n "$LONG_LINES" ]; then
    echo "⚠ WARNING: Long lines detected (>100 chars):"
    echo "$LONG_LINES" | sed 's/^/  /'
    ((WARNINGS++))
fi

# Check 3: Node labels (flowcharts)
if [ "$DIAGRAM_TYPE" = "flowchart" ]; then
    # Check for unlabeled nodes
    UNLABELED=$(grep -oE '\b[0-9a-zA-Z_]+\b(?=\s*-->)' "$INPUT" | sort -u | while read node; do
        if ! grep -qE "$node\[" "$INPUT"; then
            echo "  - $node"
        fi
    done)
    
    if [ -n "$UNLABELED" ]; then
        echo "⚠ WARNING: Nodes without labels:"
        echo "$UNLABELED"
        ((WARNINGS++))
    fi
fi

# Check 4: Subgraph labels
if [ "$DIAGRAM_TYPE" = "flowchart" ]; then
    SUBGRAPHS=$(grep -c "subgraph" "$INPUT" || true)
    if [ "$SUBGRAPHS" -gt 0 ]; then
        UNLABELED_SUB=$(grep -E "^\s*subgraph\s*$" "$INPUT" | wc -l)
        if [ "$UNLABELED_SUB" -gt 0 ]; then
            echo "⚠ WARNING: $UNLABELED_SUB subgraph(s) without labels"
            ((WARNINGS++))
        fi
    fi
fi

# Check 5: Click/link syntax
if grep -q "click " "$INPUT"; then
    INVALID_CLICK=$(grep "click " "$INPUT" | grep -vE "click\s+\w+\s+(call|href)" || true)
    if [ -n "$INVALID_CLICK" ]; then
        echo "⚠ WARNING: Click handlers may have invalid syntax"
        ((WARNINGS++))
    fi
fi

# Check 6: Comment usage
COMMENTS=$(grep -c "%%" "$INPUT" || true)
if [ "$COMMENTS" -eq 0 ]; then
    echo "ℹ INFO: No comments found (consider adding for complex diagrams)"
fi

# Check 7: Styling consistency
STYLES=$(grep -c "style " "$INPUT" || true)
CLASSES=$(grep -c "classDef" "$INPUT" || true)
if [ "$STYLES" -gt 0 ] && [ "$CLASSES" -gt 0 ]; then
    echo "⚠ WARNING: Mixing inline styles and class definitions (prefer classes for consistency)"
    ((WARNINGS++))
fi

# Summary
echo ""
echo "========================================"
if [ $ISSUES -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo "✓ No issues found"
    exit 0
else
    echo "Issues: $ISSUES, Warnings: $WARNINGS"
    if [ $ISSUES -gt 0 ]; then
        exit 1
    fi
    exit 0
fi
