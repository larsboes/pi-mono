#!/bin/bash
#
# sync-to-public.sh - Sync skills from pi to public repository
#
# Usage:
#   ./sync-to-public.sh <skill-name> --dry-run     # Preview changes
#   ./sync-to-public.sh <skill-name> --confirm     # Apply changes
#   ./sync-to-public.sh --all --confirm            # Sync all public skills
#
# Transforms applied:
#   - Remove PII (usernames, paths, company names)
#   - Replace secrets with placeholders
#   - Sanitize examples/ and references/ directories
#   - Add MIT license header
#   - Generalize personal examples
#   - Add community skill header

set -e

# Directories
PI_SKILLS="${HOME}/.pi/skills"
PUBLIC_SKILLS="${HOME}/Developer/pi-mono/skills"

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
STRICT_MODE=false

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
        --strict)
            STRICT_MODE=true
            shift
            ;;
        --help)
            echo "Usage: $0 [--all | <skill-name>] [--dry-run | --confirm] [--strict]"
            echo ""
            echo "Options:"
            echo "  --strict    Skip files with any PII instead of trying to sanitize"
            echo ""
            echo "Examples:"
            echo "  $0 github --dry-run       # Preview github skill for public"
            echo "  $0 github --confirm       # Apply to public repo"
            echo "  $0 --all --confirm        # Sync all public skills"
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

# Create public skills dir if needed
if [[ ! -d "$PUBLIC_SKILLS" ]]; then
    echo "Creating public skills directory: $PUBLIC_SKILLS"
    if [[ "$DRY_RUN" == false ]]; then
        mkdir -p "$PUBLIC_SKILLS"
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

# Function to check if skill should sync to public
can_sync_public() {
    local tag="$1"
    [[ "$tag" == "public" || "$tag" == "community" || "$tag" == "implicit" ]]
}

# Function to scan for PII - returns list of issues found
scan_for_pii() {
    local file="$1"
    local issues=""
    
    # Check for absolute paths (excluding github.com/larsboes which is public)
    if grep "~" "$file" 2>/dev/null | grep -v "github.com/larsboes" > /dev/null; then
        issues="${issues}absolute_path;"
    fi
    
    # Check for username references (excluding GitHub URLs)
    local username_count=$(grep -o "{{username}}" "$file" 2>/dev/null | wc -l | tr -d ' ')
    local github_count=$(grep -o "github.com/larsboes" "$file" 2>/dev/null | wc -l | tr -d ' ')
    if [[ $((username_count - github_count)) -gt 0 ]]; then
        issues="${issues}username;"
    fi
    
    # Check for personal name
    if grep -q "{{author}}" "$file" 2>/dev/null; then
        issues="${issues}personal_name;"
    fi
    
    # Check for email addresses
    if grep -qE "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}" "$file" 2>/dev/null; then
        # Exclude common non-personal domains
        if grep -vE "(example\.com|github\.com|npmjs\.com|izs\.me|support\.|help\.)" "$file" 2>/dev/null | grep -qE "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"; then
            issues="${issues}email;"
        fi
    fi
    
    # Check for hardcoded credentials
    if grep -qE "(api_key|apikey|api-key|token|secret|password)\s*[=:]\s*['\"][^'\"]{10,}['\"]" "$file" 2>/dev/null; then
        if ! grep -q "{{YOUR_" "$file" 2>/dev/null; then
            issues="${issues}credential;"
        fi
    fi
    
    # Check for highly personal context
    if grep -qiE "franzi|ahrtal.*netz|bielefeld.*study.*block|valencia.*internship" "$file" 2>/dev/null; then
        issues="${issues}personal_context;"
    fi
    
    # Check for "Lars" as a subject (indicates personalized skill)
    if grep -q "When Lars\|Let Lars\|Lars says\|Lars can\|Lars wants" "$file" 2>/dev/null; then
        issues="${issues}personalized_subject;"
    fi
    
    echo "$issues"
}

# Function to validate no PII (strict check)
validate_no_pii() {
    local file="$1"
    local issues=$(scan_for_pii "$file")
    
    if [[ -n "$issues" ]]; then
        echo "${RED}PII Validation Failed:${NC}"
        IFS=';' read -ra issue_array <<< "$issues"
        for issue in "${issue_array[@]}"; do
            if [[ -n "$issue" ]]; then
                echo "  - Found: $issue"
            fi
        done
        return 1
    fi
    return 0
}

# Function to sanitize a file for public release
sanitize_file() {
    local src_file="$1"
    local dst_file="$2"
    
    local tmp_file=$(mktemp)
    cp "$src_file" "$tmp_file"
    
    # Replace absolute paths
    sed -i '' \
        -e "s|~/|~/|g" \
        -e "s|~|~|g" \
        "$tmp_file" 2>/dev/null || true
    
    # Replace personal name (preserve GitHub URLs)
    sed -i '' \
        -e 's/github\.com\/{{username}}/github.com/larsboes/g' \
        -e 's/{{author}}/{{author}}/g' \
        -e 's/{{username}}/{{username}}/g' \
        -e 's/github.com/larsboes/github.com\/{{username}}/g' \
        "$tmp_file" 2>/dev/null || true
    
    # Replace company-specific references with generic ones
    sed -i '' \
        -e 's/Main Brand Color/Main Brand Color/g' \
        -e 's/{{company}}/{{company}}/g' \
        "$tmp_file" 2>/dev/null || true
    
    # Replace personal context with placeholders
    sed -i '' \
        -e 's/Pilot Region/Pilot Region/g' \
        -e 's/{{friend_name}}/{{friend_name}}/g' \
        "$tmp_file" 2>/dev/null || true
    
    cp "$tmp_file" "$dst_file"
    rm -f "$tmp_file"
}

# Function to transform skill for public
transform_skill_public() {
    local src_file="$1"
    local dst_file="$2"
    local skill_name="$3"
    
    echo "Transforming for public: $skill_name"
    
    local tmp_file=$(mktemp)
    cp "$src_file" "$tmp_file"
    
    # Add community header
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    local header_file=$(mktemp)
    cat > "$header_file" << EOF

<!--
🌐 COMMUNITY SKILL

Part of the pi-mono open skills collection.
- Repository: https://github.com/larsboes/pi-mono
- License: MIT
- Author: {{author}}

Last synced: $timestamp
-->
EOF
    
    # Insert after frontmatter (after second ---)
    local line_num=$(grep -n "^---$" "$tmp_file" | head -2 | tail -1 | cut -d: -f1)
    if [[ -n "$line_num" ]]; then
        head -n "$line_num" "$tmp_file" > "${tmp_file}.new"
        cat "$header_file" >> "${tmp_file}.new"
        tail -n +$((line_num + 1)) "$tmp_file" >> "${tmp_file}.new"
        mv "${tmp_file}.new" "$tmp_file"
    fi
    rm -f "$header_file"
    
    # Apply standard sanitization
    local sanitized_file=$(mktemp)
    sanitize_file "$tmp_file" "$sanitized_file"
    mv "$sanitized_file" "$tmp_file"
    
    # Check for remaining PII
    local remaining_issues=$(scan_for_pii "$tmp_file")
    if [[ -n "$remaining_issues" ]]; then
        echo "  ${YELLOW}⚠️  Remaining PII after sanitization:${NC}"
        IFS=';' read -ra issue_array <<< "$remaining_issues"
        for issue in "${issue_array[@]}"; do
            if [[ -n "$issue" ]]; then
                echo "    - $issue"
            fi
        done
        
        if [[ "$STRICT_MODE" == true ]]; then
            echo "  ${RED}❌ Skipped (strict mode)${NC}"
            rm -f "$tmp_file"
            return 1
        fi
    fi
    
    # Copy to destination
    if [[ "$DRY_RUN" == true ]]; then
        echo "  ${BLUE}[DRY RUN] Would write to:${NC} $dst_file"
        if [[ -n "$remaining_issues" ]]; then
            echo ""
            echo "  ${YELLOW}⚠️  Warning: PII detected after sanitization${NC}"
        fi
    else
        cp "$tmp_file" "$dst_file"
        echo "  ${GREEN}✓ Written to:${NC} $dst_file"
    fi
    
    rm -f "$tmp_file"
    return 0
}

# Function to sync a single skill
sync_skill() {
    local skill="$1"
    local src_dir="$PI_SKILLS/$skill"
    local dst_dir="$PUBLIC_SKILLS/$skill"
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Skill: $skill → PUBLIC"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Check source exists
    if [[ ! -d "$src_dir" ]]; then
        echo "${RED}Error: Skill not found in pi:${NC} $src_dir"
        return 1
    fi
    
    # Check sync tag
    local sync_tag=$(get_sync_tag "$src_dir/SKILL.md")
    echo "Sync tag: $sync_tag"
    
    if ! can_sync_public "$sync_tag"; then
        echo "${BLUE}⏭ Skipped:${NC} Skill marked as $sync_tag (not for public)"
        return 0
    fi
    
    # Create destination directory
    if [[ "$DRY_RUN" == false ]]; then
        mkdir -p "$dst_dir"
    fi
    
    # Sync files
    local success=true
    local pii_warnings=0
    
    for file in "$src_dir"/*; do
        if [[ -f "$file" ]]; then
            local filename=$(basename "$file")
            local dst_file="$dst_dir/$filename"
            
            if [[ "$filename" == "SKILL.md" ]]; then
                if ! transform_skill_public "$file" "$dst_file" "$skill"; then
                    success=false
                fi
            else
                # For other files, try to sanitize
                local issues=$(scan_for_pii "$file")
                if [[ -z "$issues" ]]; then
                    # No PII, copy as-is
                    if [[ "$DRY_RUN" == true ]]; then
                        echo "  ${BLUE}[DRY RUN] Would copy:${NC} $filename"
                    else
                        cp "$file" "$dst_file"
                        echo "  ${GREEN}✓ Copied:${NC} $filename"
                    fi
                else
                    # Try to sanitize
                    local tmp_sanitized=$(mktemp)
                    sanitize_file "$file" "$tmp_sanitized"
                    local remaining=$(scan_for_pii "$tmp_sanitized")
                    
                    if [[ -z "$remaining" ]]; then
                        # Sanitization successful
                        if [[ "$DRY_RUN" == true ]]; then
                            echo "  ${BLUE}[DRY RUN] Would copy (sanitized):${NC} $filename"
                        else
                            cp "$tmp_sanitized" "$dst_file"
                            echo "  ${GREEN}✓ Copied (sanitized):${NC} $filename"
                        fi
                    else
                        # Still has PII after sanitization
                        ((pii_warnings++)) || true
                        if [[ "$STRICT_MODE" == true ]]; then
                            echo "  ${RED}❌ Skipped:${NC} $filename (PII: $remaining)"
                            success=false
                        else
                            echo "  ${YELLOW}⚠️  Copied with PII:${NC} $filename ($remaining)"
                            if [[ "$DRY_RUN" == false ]]; then
                                cp "$tmp_sanitized" "$dst_file"
                            fi
                        fi
                    fi
                    rm -f "$tmp_sanitized"
                fi
            fi
        fi
    done
    
    # Sync subdirectories with sanitization
    for subdir in "$src_dir"/*; do
        if [[ -d "$subdir" ]]; then
            local subname=$(basename "$subdir")
            local dst_subdir="$dst_dir/$subname"
            
            # Warn about examples directories which often contain personal content
            if [[ "$subname" == "examples" ]]; then
                echo "  ${YELLOW}⚠️  Processing examples/ directory - review for personal content${NC}"
            fi
            
            if [[ "$DRY_RUN" == false ]]; then
                mkdir -p "$dst_subdir"
            fi
            
            local subdir_files=0
            local subdir_skipped=0
            
            for subfile in "$subdir"/*; do
                if [[ -f "$subfile" ]]; then
                    ((subdir_files++)) || true
                    local subfilename=$(basename "$subfile")
                    local dst_subfile="$dst_subdir/$subfilename"
                    
                    # Try to sanitize subdirectory files
                    local issues=$(scan_for_pii "$subfile")
                    if [[ -z "$issues" ]]; then
                        if [[ "$DRY_RUN" == false ]]; then
                            cp "$subfile" "$dst_subfile"
                        fi
                    else
                        local tmp_sanitized=$(mktemp)
                        sanitize_file "$subfile" "$tmp_sanitized"
                        local remaining=$(scan_for_pii "$tmp_sanitized")
                        
                        if [[ -z "$remaining" ]]; then
                            if [[ "$DRY_RUN" == false ]]; then
                                cp "$tmp_sanitized" "$dst_subfile"
                            fi
                        else
                            ((subdir_skipped++)) || true
                            if [[ "$STRICT_MODE" == true ]]; then
                                if [[ "$DRY_RUN" == false ]]; then
                                    rm -f "$dst_subfile"
                                fi
                            else
                                if [[ "$DRY_RUN" == false ]]; then
                                    cp "$tmp_sanitized" "$dst_subfile"
                                fi
                            fi
                        fi
                        rm -f "$tmp_sanitized"
                    fi
                fi
            done
            
            if [[ $subdir_files -gt 0 ]]; then
                if [[ $subdir_skipped -eq 0 ]]; then
                    echo "  ${GREEN}✓ Copied directory:${NC} $subname/ ($subdir_files files)"
                elif [[ "$STRICT_MODE" == true ]]; then
                    echo "  ${YELLOW}⚠️  Partial directory:${NC} $subname/ ($((subdir_files - subdir_skipped))/$subdir_files files, $subdir_skipped skipped for PII)"
                else
                    echo "  ${YELLOW}⚠️  Copied with warnings:${NC} $subname/ ($subdir_files files, some with PII)"
                fi
            else
                if [[ "$DRY_RUN" == false ]]; then
                    rmdir "$dst_subdir" 2>/dev/null || true
                fi
            fi
        fi
    done
    
    echo ""
    if [[ "$success" == true ]]; then
        if [[ "$DRY_RUN" == true ]]; then
            echo "${YELLOW}DRY RUN - no changes made${NC}"
            if [[ $pii_warnings -gt 0 ]]; then
                echo "${YELLOW}⚠️  $pii_warnings file(s) have PII warnings - review carefully${NC}"
            fi
        else
            echo "${GREEN}✓ Public sync complete${NC}"
            if [[ $pii_warnings -gt 0 ]]; then
                echo "${YELLOW}⚠️  $pii_warnings file(s) had PII warnings${NC}"
            fi
            echo "Ready for: git add && git commit && git push"
        fi
    else
        echo "${RED}❌ Sync failed - check errors above${NC}"
    fi
}

# Main execution
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║        SYNC PI SKILLS → PUBLIC REPOSITORY                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

if [[ "$DRY_RUN" == true ]]; then
    echo "${YELLOW}Mode: DRY RUN (preview only)${NC}"
else
    echo "${GREEN}Mode: CONFIRM (applying changes)${NC}"
fi

if [[ "$STRICT_MODE" == true ]]; then
    echo "${YELLOW}Strict mode: ON (skip files with unresolved PII)${NC}"
fi

echo "Public dir: $PUBLIC_SKILLS"
echo ""

if [[ "$SYNC_ALL" == true ]]; then
    echo "Syncing all eligible public skills..."
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
