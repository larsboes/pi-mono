#!/bin/bash
# Check CI status for current branch or PR
# Usage: ci-status.sh [options]
# Options:
#   --watch              Watch until completion
#   --fail-fast          Exit immediately on failure
#   --pr <number>        Check specific PR instead of current branch
#   --branch <name>      Check specific branch

set -euo pipefail

# Defaults
WATCH=""
FAIL_FAST=""
PR=""
BRANCH=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --watch)
            WATCH="--watch"
            shift
            ;;
        --fail-fast)
            FAIL_FAST="--fail-fast"
            shift
            ;;
        --pr)
            PR="$2"
            shift 2
            ;;
        --branch)
            BRANCH="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --watch          Watch CI until completion"
            echo "  --fail-fast      Exit immediately on failure"
            echo "  --pr <number>    Check specific PR"
            echo "  --branch <name>  Check specific branch"
            echo ""
            echo "Examples:"
            echo "  $0 --watch"
            echo "  $0 --pr 123"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Determine target
if [ -n "$PR" ]; then
    echo "Checking CI status for PR #$PR..."
    gh pr checks "$PR" $WATCH $FAIL_FAST
elif [ -n "$BRANCH" ]; then
    echo "Checking CI status for branch: $BRANCH..."
    gh run list --branch "$BRANCH" -L 5
else
    # Current branch
    CURRENT_BRANCH=$(git branch --show-current)
    echo "Checking CI status for branch: $CURRENT_BRANCH..."
    
    # Check if there's a PR
    PR_LIST=$(gh pr list --head "$CURRENT_BRANCH" --json number -q '.[0].number')
    
    if [ -n "$PR_LIST" ]; then
        gh pr checks "$PR_LIST" $WATCH $FAIL_FAST
    else
        echo "No PR found for branch $CURRENT_BRANCH"
        echo "Recent workflow runs:"
        gh run list --branch "$CURRENT_BRANCH" -L 5
    fi
fi
