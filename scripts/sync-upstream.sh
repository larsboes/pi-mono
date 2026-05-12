#!/usr/bin/env bash
# Sync fork with upstream/main — show drift, optionally merge.

set -euo pipefail

UPSTREAM_REMOTE="upstream"
UPSTREAM_BRANCH="main"
FORK_BRANCH="dev"

echo "=== Fetching upstream ==="
git fetch "$UPSTREAM_REMOTE"

BEHIND=$(git log --oneline "HEAD..${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}" | wc -l | tr -d ' ')
AHEAD=$(git log --oneline "${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}..HEAD" | wc -l | tr -d ' ')

echo ""
echo "=== Drift summary ==="
echo "  Ahead  of upstream: $AHEAD commits"
echo "  Behind upstream:    $BEHIND commits"
echo ""

if [[ "$BEHIND" -eq 0 ]]; then
  echo "✓ Fork is up to date with upstream."
  exit 0
fi

echo "=== Upstream commits not in fork ==="
git log --oneline "HEAD..${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}"
echo ""

echo "=== Packages/ diff vs upstream (should be minimal) ==="
PACKAGES_DIFF=$(git diff "${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}" --name-only -- packages/ | grep -v node_modules || true)
if [[ -z "$PACKAGES_DIFF" ]]; then
  echo "  (none — clean)"
else
  echo "$PACKAGES_DIFF"
fi
echo ""

read -rp "Merge ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH} into ${FORK_BRANCH}? [y/N] " confirm
if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
  git merge "${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}" --no-edit
  echo ""
  echo "✓ Merged. Run 'bun install && bun run build' to verify."
else
  echo "Skipped merge."
fi
