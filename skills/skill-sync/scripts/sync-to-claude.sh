#!/bin/bash
#
# sync-to-claude.sh - Sync skills from pi to Claude Code
#
# Usage:
#   ./sync-to-claude.sh <skill-name> --dry-run     # Preview changes
#   ./sync-to-claude.sh <skill-name> --confirm     # Apply changes
#   ./sync-to-claude.sh --all --confirm            # Sync all eligible skills
#
# Transforms applied:
#   - Add sync header with metadata
#   - Update tool names (bash -> Bash, etc.)
#   - Update path references ({baseDir}/ -> ./)
#   - Add warnings for unsupported tools

set -e

# Directories
PI_SKILLS="${HOME}/.pi/skills"
CLAUDE_SKILLS="${HOME}/.claude/skills"
ADAPTER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/adapters"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Arguments
SKILL_NAME=""
DRY_RUN=true
SYNC_ALL=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --confirm)
            DRY_RUN=false
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --all)
            SYNC_ALL=true
            shift
            ;;
        --help)
            echo "Usage: $0 [--all | <skill-name>] [--dry-run | --confirm]"
            echo ""
            echo "Examples:"
            echo "  $0 github --dry-run       # Preview github skill sync"
            echo "  $0 github --confirm       # Apply github skill sync"
            echo "  $0 --all --confirm        # Sync all eligible skills"
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

# Validate arguments
if [[ "$SYNC_ALL" == false && -z "$SKILL_NAME" ]]; then
    echo "Error: Specify skill name or use --all"
    exit 1
fi

# Check directories
if [[ ! -d "$PI_SKILLS" ]]; then
    echo "Error: pi skills directory not found: $PI_SKILLS"
    exit 1
fi

# Create claude skills dir if needed
if [[ ! -d "$CLAUDE_SKILLS" ]]; then
    echo "Creating Claude skills directory: $CLAUDE_SKILLS"
    if [[ "$DRY_RUN" == false ]]; then
        mkdir -p "$CLAUDE_SKILLS"
    fi
fi

# Function to get sync tag
get_sync_tag() {
    local skill_file="$1"
    if [[ -f "$skill_file" ]]; then
        # Look for @sync: tag in YAML frontmatter (first 20 lines only)
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

# Function to check if skill should sync
can_sync() {
    local tag="$1"
    [[ "$tag" != "personal" && "$tag" != "private" ]]
}

# Function to transform skill for Claude
transform_skill() {
    local src_file="$1"
    local dst_file="$2"
    local skill_name="$3"
    
    echo "Transforming: $skill_name"
    
    # Create temp file
    local tmp_file=$(mktemp)
    
    # Read original content
    cat "$src_file" > "$tmp_file"
    
    # Add sync header after frontmatter
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Create header file
    local header_file=$(mktemp)
    cat > "$header_file" << 'EOF'

<!--
SYNCED FROM: ~/.pi/skills/
TARGET: ~/.claude/skills/

This skill was automatically synced from pi. Some features may not be available:
- No memory system (memory_search, memory_store unavailable in Claude Code)
- No session management (send_to_session, list_sessions unavailable)
- No skill crystallization (crystallize_skill unavailable)
- Tool names use PascalCase (Bash, Read, Edit, Write)

Last synced: TIMESTAMP
-->
EOF
    sed -i '' "s/TIMESTAMP/$timestamp/g" "$header_file"
    
    # Insert header after frontmatter (after second ---)
    # Find line number of second ---
    local line_num=$(grep -n "^---$" "$tmp_file" | head -2 | tail -1 | cut -d: -f1)
    if [[ -n "$line_num" ]]; then
        head -n "$line_num" "$tmp_file" > "${tmp_file}.new"
        cat "$header_file" >> "${tmp_file}.new"
        tail -n +$((line_num + 1)) "$tmp_file" >> "${tmp_file}.new"
        mv "${tmp_file}.new" "$tmp_file"
    fi
    rm -f "$header_file"
    
    # Transform tool names (only in code blocks, be careful)
    # bash -> Bash (but not in URLs or paths)
    sed -i '' \
        -e 's/`bash`/`Bash`/g' \
        -e 's/`read`/`Read`/g' \
        -e 's/`edit`/`Edit`/g' \
        -e 's/`write`/`Write`/g' \
        "$tmp_file" 2>/dev/null || true
    
    # Transform path patterns
    sed -i '' \
        -e 's|{baseDir}/|./|g' \
        -e "s|~/.pi/|~/.claude/|g" \
        "$tmp_file" 2>/dev/null || true
    
    # Add unsupported tool warnings
    local unsupported_tools=("memory_search" "memory_store" "send_to_session" "list_sessions" "crystallize_skill" "capabilities_query")
    for tool in "${unsupported_tools[@]}"; do
        if grep -q "$tool" "$tmp_file"; then
            echo "  ⚠️  Warning: Skill uses unsupported tool '$tool'"
            # Add note about unsupported tool
            sed -i '' "/^##.*$/,/^##/ { /$tool/ s/$/ (⚠️ not available in Claude Code)/ }" "$tmp_file" 2>/dev/null || true
        fi
    done
    
    # Copy to destination
    if [[ "$DRY_RUN" == true ]]; then
        echo "  ${BLUE}[DRY RUN] Would write to:${NC} $dst_file"
        echo ""
        echo "  Preview (first 50 lines):"
        echo "  ───────────────────────────────────────────────────────────────"
        head -50 "$tmp_file" | sed 's/^/  /'
        echo "  ───────────────────────────────────────────────────────────────"
    else
        cp "$tmp_file" "$dst_file"
        echo "  ${GREEN}✓ Written to:${NC} $dst_file"
    fi
    
    rm -f "$tmp_file"
}

# Function to sync a single skill
sync_skill() {
    local skill="$1"
    local src_dir="$PI_SKILLS/$skill"
    local dst_dir="$CLAUDE_SKILLS/$skill"
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Skill: $skill"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Check source exists
    if [[ ! -d "$src_dir" ]]; then
        echo "${RED}Error: Skill not found in pi:${NC} $src_dir"
        return 1
    fi
    
    # Check sync tag
    local sync_tag=$(get_sync_tag "$src_dir/SKILL.md")
    echo "Sync tag: $sync_tag"
    
    if ! can_sync "$sync_tag"; then
        echo "${BLUE}⏭ Skipped:${NC} Skill marked as $sync_tag"
        return 0
    fi
    
    # Create destination directory
    if [[ "$DRY_RUN" == false ]]; then
        mkdir -p "$dst_dir"
    fi
    
    # Sync files
    local files_synced=0
    for file in "$src_dir"/*; do
        if [[ -f "$file" ]]; then
            local filename=$(basename "$file")
            local dst_file="$dst_dir/$filename"
            
            if [[ "$filename" == "SKILL.md" ]]; then
                # Transform SKILL.md
                transform_skill "$file" "$dst_file" "$skill"
            else
                # Copy other files as-is
                if [[ "$DRY_RUN" == true ]]; then
                    echo "  ${BLUE}[DRY RUN] Would copy:${NC} $filename"
                else
                    cp "$file" "$dst_file"
                    echo "  ${GREEN}✓ Copied:${NC} $filename"
                fi
            fi
            ((files_synced++)) || true
        fi
    done
    
    # Sync subdirectories (scripts/, references/, etc.)
    for subdir in "$src_dir"/*; do
        if [[ -d "$subdir" ]]; then
            local subname=$(basename "$subdir")
            local dst_subdir="$dst_dir/$subname"
            
            if [[ "$DRY_RUN" == false ]]; then
                mkdir -p "$dst_subdir"
                cp -r "$subdir"/* "$dst_subdir/" 2>/dev/null || true
                echo "  ${GREEN}✓ Copied directory:${NC} $subname/"
            else
                echo "  ${BLUE}[DRY RUN] Would copy directory:${NC} $subname/"
            fi
        fi
    done
    
    echo ""
    if [[ "$DRY_RUN" == true ]]; then
        echo "${YELLOW}DRY RUN - no changes made${NC}"
        echo "Run with --confirm to apply changes"
    else
        echo "${GREEN}✓ Sync complete${NC}"
    fi
}

# Main execution
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║           SYNC PI SKILLS → CLAUDE CODE                         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

if [[ "$DRY_RUN" == true ]]; then
    echo "${YELLOW}Mode: DRY RUN (preview only)${NC}"
else
    echo "${GREEN}Mode: CONFIRM (applying changes)${NC}"
fi
echo ""

if [[ "$SYNC_ALL" == true ]]; then
    echo "Syncing all eligible skills..."
    for skill_dir in "$PI_SKILLS"/*; do
        if [[ -d "$skill_dir" ]]; then
            skill=$(basename "$skill_dir")
            sync_skill "$skill"
        fi
    done
else
    sync_skill "$SKILL_NAME"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "Done!"
echo "═══════════════════════════════════════════════════════════════════"
