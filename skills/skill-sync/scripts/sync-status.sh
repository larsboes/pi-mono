#!/bin/bash
#
# sync-status.sh - Show synchronization status across all skill locations
#
# Usage:
#   ./sync-status.sh                    # Show status for all skills
#   ./sync-status.sh --skill github     # Show status for specific skill
#   ./sync-status.sh --target claude    # Show only claude sync status
#

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
NC='\033[0m' # No Color

# Parse arguments
SPECIFIC_SKILL=""
TARGET_FILTER=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --skill)
            SPECIFIC_SKILL="$2"
            shift 2
            ;;
        --target)
            TARGET_FILTER="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [--skill <name>] [--target <claude|antigravity|public>]"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Function to check if directory exists
dir_exists() {
    [[ -d "$1" ]]
}

# Function to get sync tag from skill
get_sync_tag() {
    local skill_file="$1"
    if [[ -f "$skill_file" ]]; then
        local tag=$(head -20 "$skill_file" | grep "^# @sync:" | head -1 | cut -d: -f2 | tr -d ' ')
        if [[ -n "$tag" ]]; then
            echo "$tag"
        else
            echo "implicit"
        fi
    else
        echo "implicit"
    fi
}

# Function to get skill hash (for comparison)
get_skill_hash() {
    local skill_dir="$1"
    if [[ -d "$skill_dir" ]]; then
        find "$skill_dir" -type f -exec md5 -q {} \; 2>/dev/null | sort | md5 | cut -c1-8
    else
        echo "missing"
    fi
}

# Function to compare timestamps
get_mtime() {
    local file="$1"
    if [[ -e "$file" ]]; then
        stat -f "%m" "$file" 2>/dev/null || stat -c "%Y" "$file" 2>/dev/null || echo "0"
    else
        echo "0"
    fi
}

# Function to format timestamp
format_time() {
    local ts="$1"
    if [[ "$ts" == "0" ]]; then
        echo "missing"
    else
        date -r "$ts" "+%Y-%m-%d %H:%M" 2>/dev/null || date -d "@$ts" "+%Y-%m-%d %H:%M" 2>/dev/null || echo "unknown"
    fi
}

# Print header
echo ""
echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║                   SKILL SYNC STATUS OVERVIEW                       ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""

# Show directory status
echo "📁 DIRECTORIES"
echo "   pi (source):        $PI_SKILLS"
echo "                      $(dir_exists "$PI_SKILLS" && echo "${GREEN}✓ exists${NC}" || echo "${RED}✗ missing${NC}")"
echo ""
echo "   claude:             $CLAUDE_SKILLS"
echo "                      $(dir_exists "$CLAUDE_SKILLS" && echo "${GREEN}✓ exists${NC}" || echo "${YELLOW}⚠ not found${NC}")"
echo ""

if dir_exists "$ANTIGRAVITY_SKILLS"; then
    echo "   antigravity:        $ANTIGRAVITY_SKILLS"
    echo "                      ${GREEN}✓ exists${NC}"
else
    echo "   antigravity:        $ANTIGRAVITY_SKILLS"
    echo "                      ${YELLOW}⚠ not set up yet${NC}"
fi
echo ""

if dir_exists "$PUBLIC_SKILLS"; then
    echo "   public repo:        $PUBLIC_SKILLS"
    echo "                      ${GREEN}✓ exists${NC}"
else
    echo "   public repo:        $PUBLIC_SKILLS"
    echo "                      ${YELLOW}⚠ not initialized${NC}"
fi
echo ""

# Get list of skills to check
if [[ -n "$SPECIFIC_SKILL" ]]; then
    SKILLS=("$SPECIFIC_SKILL")
else
    SKILLS=()
    if dir_exists "$PI_SKILLS"; then
        while IFS= read -r -d '' skill_dir; do
            skill_name=$(basename "$skill_dir")
            SKILLS+=("$skill_name")
        done < <(find "$PI_SKILLS" -mindepth 1 -maxdepth 1 -type d -print0 | sort -z)
    fi
fi

# Print skill status table
echo "═══════════════════════════════════════════════════════════════════════"
printf "%-20s %-8s %-12s %-12s %-12s\n" "SKILL" "SYNC" "CLAUDE" "ANTIGRAVITY" "PUBLIC"
echo "═══════════════════════════════════════════════════════════════════════"

for skill in "${SKILLS[@]}"; do
    pi_skill="$PI_SKILLS/$skill"
    claude_skill="$CLAUDE_SKILLS/$skill"
    antigravity_skill="$ANTIGRAVITY_SKILLS/$skill"
    public_skill="$PUBLIC_SKILLS/$skill"
    
    # Get sync tag
    sync_tag=$(get_sync_tag "$pi_skill/SKILL.md")
    [[ -z "$sync_tag" ]] && sync_tag="implicit"
    
    # Check claude status
    if [[ -d "$claude_skill" ]]; then
        pi_hash=$(get_skill_hash "$pi_skill")
        claude_hash=$(get_skill_hash "$claude_skill")
        if [[ "$pi_hash" == "$claude_hash" ]]; then
            claude_status="${GREEN}✓${NC}"
        else
            pi_time=$(get_mtime "$pi_skill/SKILL.md")
            claude_time=$(get_mtime "$claude_skill/SKILL.md")
            if [[ "$pi_time" -gt "$claude_time" ]]; then
                claude_status="${YELLOW}stale${NC}"
            else
                claude_status="${RED}drift${NC}"
            fi
        fi
    else
        if [[ "$sync_tag" == "personal" || "$sync_tag" == "private" ]]; then
            claude_status="${BLUE}skip${NC}"
        else
            claude_status="${RED}✗${NC}"
        fi
    fi
    
    # Check antigravity status
    if [[ -d "$antigravity_skill" ]]; then
        antigravity_status="${GREEN}✓${NC}"
    else
        if [[ "$sync_tag" == "personal" || "$sync_tag" == "private" ]]; then
            antigravity_status="${BLUE}skip${NC}"
        else
            antigravity_status="${YELLOW}setup${NC}"
        fi
    fi
    
    # Check public status
    if [[ -d "$public_skill" ]]; then
        public_status="${GREEN}✓${NC}"
    else
        if [[ "$sync_tag" == "personal" || "$sync_tag" == "private" ]]; then
            public_status="${BLUE}skip${NC}"
        else
            public_status="${YELLOW}pending${NC}"
        fi
    fi
    
    # Print row
    printf "%-20s %-8s %-12s %-12s %-12s\n" \
        "$skill" \
        "$sync_tag" \
        "$claude_status" \
        "$antigravity_status" \
        "$public_status"
done

echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "LEGEND:"
echo "  ${GREEN}✓${NC}        = in sync"
echo "  ${YELLOW}stale${NC}    = pi is newer, needs sync"
echo "  ${YELLOW}pending${NC}  = not yet synced"
echo "  ${YELLOW}setup${NC}    = target not ready"
echo "  ${RED}drift${NC}    = target is newer (should not happen)"
echo "  ${RED}✗${NC}        = missing"
echo "  ${BLUE}skip${NC}     = personal/private skill"
echo ""

# Show counts
echo "═══════════════════════════════════════════════════════════════════════"
echo "SUMMARY"
echo "═══════════════════════════════════════════════════════════════════════"
total=${#SKILLS[@]}
echo "  Total skills in pi:     $total"

if [[ -d "$CLAUDE_SKILLS" ]]; then
    claude_count=$(find "$CLAUDE_SKILLS" -mindepth 1 -maxdepth 1 -type d | wc -l)
    echo "  Skills in claude:       $claude_count"
fi

if [[ -d "$ANTIGRAVITY_SKILLS" ]]; then
    ag_count=$(find "$ANTIGRAVITY_SKILLS" -mindepth 1 -maxdepth 1 -type d | wc -l)
    echo "  Skills in antigravity:  $ag_count"
fi

if [[ -d "$PUBLIC_SKILLS" ]]; then
    public_count=$(find "$PUBLIC_SKILLS" -mindepth 1 -maxdepth 1 -type d | wc -l)
    echo "  Skills in public repo:  $public_count"
fi

echo ""
echo "To sync a skill: ./sync-to-claude.sh <skill> --confirm"
echo "To see diffs:    ./diff-skill.sh <skill> --target claude"
echo ""
