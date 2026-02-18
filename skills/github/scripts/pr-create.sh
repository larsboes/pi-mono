#!/bin/bash
# Create a GitHub PR with template
# Usage: pr-create.sh [options]
# Options:
#   --title "Title"        PR title (required if not using --template)
#   --body "Body"          PR body
#   --template             Use PR template from .github/pull_request_template.md
#   --draft                Create as draft PR
#   --base <branch>        Target branch (default: main)
#   --reviewer <user>      Request reviewer
#   --label <label>        Add label (can be used multiple times)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Defaults
TITLE=""
BODY=""
USE_TEMPLATE=false
DRAFT=""
BASE="main"
REVIEWERS=""
LABELS=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --title)
            TITLE="$2"
            shift 2
            ;;
        --body)
            BODY="$2"
            shift 2
            ;;
        --template)
            USE_TEMPLATE=true
            shift
            ;;
        --draft)
            DRAFT="--draft"
            shift
            ;;
        --base)
            BASE="$2"
            shift 2
            ;;
        --reviewer)
            REVIEWERS="$REVIEWERS --reviewer $2"
            shift 2
            ;;
        --label)
            LABELS="$LABELS --label $2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: pr-create.sh [options]"
            echo ""
            echo "Options:"
            echo "  --title 'Title'        PR title (required without --template)"
            echo "  --body 'Body'          PR body"
            echo "  --template             Use PR template from .github/pull_request_template.md"
            echo "  --draft                Create as draft PR"
            echo "  --base <branch>        Target branch (default: main)"
            echo "  --reviewer <user>      Request reviewer (repeatable)"
            echo "  --label <label>        Add label (repeatable)"
            echo ""
            echo "Examples:"
            echo "  pr-create.sh --title 'feat: add auth' --body 'Implements OAuth2'"
            echo "  pr-create.sh --template --draft --reviewer octocat"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check if in git repo
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "Error: Not in a git repository"
    exit 1
fi

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)

if [ "$CURRENT_BRANCH" = "$BASE" ]; then
    echo "Error: Currently on $BASE branch. Create a feature branch first."
    exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "Warning: You have uncommitted changes."
    read -p "Continue anyway? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Use template if requested
if [ "$USE_TEMPLATE" = true ]; then
    TEMPLATE_FILE=".github/pull_request_template.md"
    if [ -f "$TEMPLATE_FILE" ]; then
        BODY=$(cat "$TEMPLATE_FILE")
        echo "Using PR template from $TEMPLATE_FILE"
    else
        echo "Warning: PR template not found at $TEMPLATE_FILE"
    fi
    
    # If no title, use last commit message
    if [ -z "$TITLE" ]; then
        TITLE=$(git log -1 --pretty=%s)
        echo "Using last commit message as title: $TITLE"
    fi
fi

# Validate required fields
if [ -z "$TITLE" ]; then
    echo "Error: --title is required (or use --template with commits)"
    exit 1
fi

# Build gh command
CMD="gh pr create --title \"$TITLE\" --base $BASE $DRAFT $REVIEWERS $LABELS"

if [ -n "$BODY" ]; then
    CMD="$CMD --body \"$BODY\""
else
    CMD="$CMD --fill"
fi

echo "Creating PR..."
echo "  Branch: $CURRENT_BRANCH → $BASE"
echo "  Title: $TITLE"
[ -n "$DRAFT" ] && echo "  Draft: yes"
[ -n "$REVIEWERS" ] && echo "  Reviewers: $REVIEWERS"
[ -n "$LABELS" ] && echo "  Labels: $LABELS"
echo ""

# Execute
eval $CMD
