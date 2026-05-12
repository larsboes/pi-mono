#!/usr/bin/env bash
# CI check: fail if packages/ diverges from upstream beyond the allowed list.
# Run via: bash scripts/check-packages-drift.sh
# In CI: git fetch upstream && bash scripts/check-packages-drift.sh

set -euo pipefail

UPSTREAM_REMOTE="upstream"
UPSTREAM_BRANCH="main"
ALLOWED_FILE="scripts/allowed-packages-diff.txt"

if ! git rev-parse "${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}" &>/dev/null; then
  echo "ERROR: ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH} not found. Run: git remote add upstream <url> && git fetch upstream"
  exit 1
fi

ACTUAL=$(git diff "${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}...HEAD" --name-only -- packages/ \
  | grep -v "node_modules" \
  | grep -v "CHANGELOG\|package.json\|package-lock.json\|README.md" \
  | sort)

if [[ ! -f "$ALLOWED_FILE" ]]; then
  echo "ERROR: $ALLOWED_FILE not found."
  exit 1
fi

ALLOWED=$(grep -v "^#" "$ALLOWED_FILE" | grep -v "^$" | sort)

UNEXPECTED=$(comm -23 <(echo "$ACTUAL") <(echo "$ALLOWED"))

if [[ -n "$UNEXPECTED" ]]; then
  echo "ERROR: Unexpected packages/ changes vs upstream:"
  echo "$UNEXPECTED" | sed 's/^/  /'
  echo ""
  echo "Either:"
  echo "  1. Move the feature to extensions/ (preferred)"
  echo "  2. Add to $ALLOWED_FILE with a comment explaining why"
  exit 1
fi

echo "✓ packages/ diff is within allowed bounds."
