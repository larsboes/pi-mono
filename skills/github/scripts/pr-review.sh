#!/bin/bash
# Review a GitHub PR with options
# Usage: pr-review.sh <pr-number> [options]
# Options:
#   --approve [comment]    Approve PR
#   --request-changes      Request changes
#   --comment              Add comment review
#   --body "text"          Review body
#   --checkout             Checkout PR locally first

set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Usage: $0 <pr-number> [options]"
    echo ""
    echo "Options:"
    echo "  --approve [comment]      Approve PR"
    echo "  --request-changes [msg]  Request changes"
    echo "  --comment [msg]          Add comment review"
    echo "  --body \"text\"           Review body (required for approve/request-changes)"
    echo "  --checkout               Checkout PR locally before reviewing"
    echo ""
    echo "Examples:"
    echo "  $0 123 --approve --body \"LGTM!\""
    echo "  $0 123 --request-changes --body \"Fix the typo\""
    echo "  $0 123 --checkout --comment"
    exit 1
fi

PR_NUMBER="$1"
shift

# Defaults
ACTION=""
BODY=""
CHECKOUT=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --approve)
            ACTION="--approve"
            if [ $# -ge 2 ] && [[ ! "$2" =~ ^-- ]]; then
                BODY="$2"
                shift
            fi
            shift
            ;;
        --request-changes)
            ACTION="--request-changes"
            if [ $# -ge 2 ] && [[ ! "$2" =~ ^-- ]]; then
                BODY="$2"
                shift
            fi
            shift
            ;;
        --comment)
            ACTION="--comment"
            if [ $# -ge 2 ] && [[ ! "$2" =~ ^-- ]]; then
                BODY="$2"
                shift
            fi
            shift
            ;;
        --body)
            BODY="$2"
            shift 2
            ;;
        --checkout)
            CHECKOUT=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Checkout if requested
if [ "$CHECKOUT" = true ]; then
    echo "Checking out PR #$PR_NUMBER..."
    gh pr checkout "$PR_NUMBER"
    echo ""
fi

# Check if action specified
if [ -z "$ACTION" ]; then
    echo "Error: Must specify --approve, --request-changes, or --comment"
    exit 1
fi

# Build command
CMD="gh pr review $PR_NUMBER $ACTION"

if [ -n "$BODY" ]; then
    CMD="$CMD --body \"$BODY\""
fi

echo "Submitting review for PR #$PR_NUMBER..."
echo "  Action: $ACTION"
[ -n "$BODY" ] && echo "  Body: ${BODY:0:50}..."
echo ""

# Execute
eval $CMD
