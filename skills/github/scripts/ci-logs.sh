#!/bin/bash
# View CI logs for failed or specific workflow runs
# Usage: ci-logs.sh [options]
# Options:
#   --failed          Show only failed logs
#   --run <id>        Show specific run ID
#   --latest          Show latest run
#   --branch <name>   Filter by branch

set -euo pipefail

# Defaults
FAILED=""
RUN_ID=""
LATEST=false
BRANCH=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --failed)
            FAILED="--log-failed"
            shift
            ;;
        --run)
            RUN_ID="$2"
            shift 2
            ;;
        --latest)
            LATEST=true
            shift
            ;;
        --branch)
            BRANCH="--branch $2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --failed          Show only failed step logs"
            echo "  --run <id>        Show specific run ID"
            echo "  --latest          Show latest run"
            echo "  --branch <name>   Filter by branch"
            echo ""
            echo "Examples:"
            echo "  $0 --failed"
            echo "  $0 --run 1234567890"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Get run ID if not specified
if [ -z "$RUN_ID" ]; then
    if [ "$LATEST" = true ]; then
        RUN_ID=$(gh run list $BRANCH -L 1 --json databaseId -q '.[0].databaseId')
    else
        echo "Recent workflow runs:"
        gh run list $BRANCH -L 10
        echo ""
        read -p "Enter run ID: " RUN_ID
    fi
fi

echo "Viewing logs for run: $RUN_ID"

if [ -n "$FAILED" ]; then
    gh run view "$RUN_ID" --log-failed
else
    gh run view "$RUN_ID" --log
fi
