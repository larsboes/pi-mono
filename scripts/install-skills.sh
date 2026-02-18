#!/bin/bash
#
# install-skills.sh - Install pi-mono skills to your local pi setup
#
# Usage:
#   ./scripts/install-skills.sh              # Install all skills
#   ./scripts/install-skills.sh skill-name   # Install specific skill
#   ./scripts/install-skills.sh --list       # List available skills
#   ./scripts/install-skills.sh --dry-run    # Preview what would be installed
#
# This script copies skills from the pi-mono repository to your local
# ~/.pi/skills/ directory where pi can discover and use them.

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
SKILLS_DIR="$REPO_ROOT/skills"
PI_SKILLS="${HOME}/.pi/skills"

# Arguments
SPECIFIC_SKILL=""
DRY_RUN=false
LIST_MODE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --list)
            LIST_MODE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS] [SKILL_NAME]"
            echo ""
            echo "Install pi-mono skills to your local pi setup"
            echo ""
            echo "Options:"
            echo "  --dry-run    Preview what would be installed"
            echo "  --list       List all available skills"
            echo "  --help       Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                    # Install all skills"
            echo "  $0 github             # Install only github skill"
            echo "  $0 --dry-run          # Preview installation"
            exit 0
            ;;
        -*)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
        *)
            SPECIFIC_SKILL="$1"
            shift
            ;;
    esac
done

# Check if skills directory exists
if [[ ! -d "$SKILLS_DIR" ]]; then
    echo "${RED}Error: Skills directory not found: $SKILLS_DIR${NC}"
    exit 1
fi

# List mode
if [[ "$LIST_MODE" == true ]]; then
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║              AVAILABLE SKILLS                              ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    
    for skill_dir in "$SKILLS_DIR"/*; do
        if [[ -d "$skill_dir" ]]; then
            skill_name=$(basename "$skill_dir")
            skill_file="$skill_dir/SKILL.md"
            
            if [[ -f "$skill_file" ]]; then
                # Extract description from frontmatter
                description=$(head -10 "$skill_file" | grep "^description:" | sed 's/description: "//; s/"$//' | cut -c1-50)
                if [[ -n "$description" ]]; then
                    printf "  %-20s %s\n" "$skill_name" "$description..."
                else
                    echo "  $skill_name"
                fi
            else
                echo "  $skill_name (no SKILL.md)"
            fi
        fi
    done
    
    echo ""
    echo "Total: $(ls -1 "$SKILLS_DIR" | wc -l) skills available"
    echo ""
    exit 0
fi

# Create pi skills directory if it doesn't exist
if [[ ! -d "$PI_SKILLS" ]]; then
    echo "Creating pi skills directory: $PI_SKILLS"
    if [[ "$DRY_RUN" == false ]]; then
        mkdir -p "$PI_SKILLS"
    fi
fi

# Get list of skills to install
if [[ -n "$SPECIFIC_SKILL" ]]; then
    # Install specific skill
    if [[ ! -d "$SKILLS_DIR/$SPECIFIC_SKILL" ]]; then
        echo "${RED}Error: Skill not found: $SPECIFIC_SKILL${NC}"
        echo "Use --list to see available skills"
        exit 1
    fi
    SKILLS=("$SPECIFIC_SKILL")
else
    # Install all skills
    SKILLS=()
    for skill_dir in "$SKILLS_DIR"/*; do
        if [[ -d "$skill_dir" ]]; then
            SKILLS+=("$(basename "$skill_dir")")
        fi
    done
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║         INSTALLING SKILLS TO ~/.pi/skills/                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

if [[ "$DRY_RUN" == true ]]; then
    echo "${YELLOW}Mode: DRY RUN (preview only)${NC}"
fi

echo "Source: $SKILLS_DIR"
echo "Target: $PI_SKILLS"
echo ""

# Track statistics
INSTALLED=0
UPDATED=0
SKIPPED=0
FAILED=0

for skill in "${SKILLS[@]}"; do
    src_dir="$SKILLS_DIR/$skill"
    dst_dir="$PI_SKILLS/$skill"
    
    # Check if already exists
    if [[ -d "$dst_dir" ]]; then
        action="${YELLOW}UPDATE${NC}"
        ((UPDATED++)) || true
    else
        action="${GREEN}INSTALL${NC}"
        ((INSTALLED++)) || true
    fi
    
    echo "[$action] $skill"
    
    if [[ "$DRY_RUN" == false ]]; then
        # Remove existing if present
        if [[ -d "$dst_dir" ]]; then
            rm -rf "$dst_dir"
        fi
        
        # Copy skill
        if cp -r "$src_dir" "$dst_dir" 2>/dev/null; then
            echo "  ${GREEN}✓${NC} Success"
        else
            echo "  ${RED}✗${NC} Failed"
            ((FAILED++)) || true
        fi
    fi
done

echo ""
echo "═══════════════════════════════════════════════════════════════"

if [[ "$DRY_RUN" == true ]]; then
    echo "${YELLOW}DRY RUN - no changes made${NC}"
    echo "Run without --dry-run to install"
else
    echo "Installation complete!"
    echo ""
    echo "Summary:"
    echo "  ${GREEN}Installed:${NC} $INSTALLED"
    echo "  ${YELLOW}Updated:${NC}   $UPDATED"
    if [[ $FAILED -gt 0 ]]; then
        echo "  ${RED}Failed:${NC}    $FAILED"
    fi
fi

echo ""
echo "Next steps:"
echo "  1. Start a new pi session"
echo "  2. Your skills will be automatically loaded"
echo "  3. Use 'pi skills' or similar to see available skills"
echo ""
