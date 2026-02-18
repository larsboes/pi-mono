#!/bin/bash
#
# diff-skill.sh - Show differences between pi and target skill
#
# Usage:
#   ./diff-skill.sh <skill-name> --target claude
#   ./diff-skill.sh <skill-name> --target public
#   ./diff-skill.sh <skill-name> --target antigravity

set -e

# Directories
PI_SKILLS="${HOME}/.pi/skills"
CLAUDE_SKILLS="${HOME}/.claude/skills"
ANTIGRAVITY_SKILLS="${HOME}/.gemini/antigravity/skills"
PUBLIC_SKILLS="${HOME}/Developer/pi-mono/skills"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Arguments
SKILL_NAME=""
TARGET=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --target)
            TARGET="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 <skill-name> --target <claude|antigravity|public>"
            exit 0
            ;;
        -*)
            echo "Unknown option: $1"
            exit 1
            ;;
        *)
            if [[ -z "$SKILL_NAME" ]]; then
                SKILL_NAME="$1"
            fi
            shift
            ;;
    esac
done

# Validate
if [[ -z "$SKILL_NAME" || -z "$TARGET" ]]; then
    echo "Error: Specify skill name and target"
    echo "Usage: $0 <skill-name> --target <claude|antigravity|public>"
    exit 1
fi

# Set target directory
case "$TARGET" in
    claude)
        TARGET_DIR="$CLAUDE_SKILLS"
        ;;
    antigravity)
        TARGET_DIR="$ANTIGRAVITY_SKILLS"
        ;;
    public)
        TARGET_DIR="$PUBLIC_SKILLS"
        ;;
    *)
        echo "Unknown target: $TARGET"
        exit 1
        ;;
esac

# Check directories exist
PI_SKILL_DIR="$PI_SKILLS/$SKILL_NAME"
TARGET_SKILL_DIR="$TARGET_DIR/$SKILL_NAME"

if [[ ! -d "$PI_SKILL_DIR" ]]; then
    echo "${RED}Error: Skill not found in pi:${NC} $PI_SKILL_DIR"
    exit 1
fi

if [[ ! -d "$TARGET_SKILL_DIR" ]]; then
    echo "${YELLOW}Skill not yet synced to $TARGET${NC}"
    echo "Run: ./sync-to-${TARGET}.sh $SKILL_NAME --confirm"
    exit 0
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  DIFF: $SKILL_NAME"
echo "║  pi → $TARGET"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Show file-by-file diff
echo "📁 Files in pi:"
find "$PI_SKILL_DIR" -type f | while read -r file; do
    rel_path="${file#$PI_SKILL_DIR/}"
    target_file="$TARGET_SKILL_DIR/$rel_path"
    
    if [[ -f "$target_file" ]]; then
        if diff -q "$file" "$target_file" > /dev/null 2>&1; then
            echo "  ${GREEN}✓${NC} $rel_path (identical)"
        else
            echo "  ${YELLOW}≠${NC} $rel_path (different)"
        fi
    else
        echo "  ${RED}+${NC} $rel_path (missing in target)"
    fi
done

echo ""
echo "📁 Files only in $TARGET:"
find "$TARGET_SKILL_DIR" -type f 2>/dev/null | while read -r file; do
    rel_path="${file#$TARGET_SKILL_DIR/}"
    pi_file="$PI_SKILL_DIR/$rel_path"
    
    if [[ ! -f "$pi_file" ]]; then
        echo "  ${BLUE}-${NC} $rel_path (extra in target)"
    fi
done

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "DETAILED DIFF (SKILL.md):"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Show SKILL.md diff specifically
if command -v diff >/dev/null; then
    diff -u "$TARGET_SKILL_DIR/SKILL.md" "$PI_SKILL_DIR/SKILL.md" 2>/dev/null || true
else
    echo "diff command not available"
fi

echo ""
echo "To sync: ./sync-to-${TARGET}.sh $SKILL_NAME --confirm"
