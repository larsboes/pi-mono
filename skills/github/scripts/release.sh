#!/bin/bash
# Create a GitHub release with changelog
# Usage: release.sh <version> [options]
# Options:
#   --name "Release Name"    Release title (default: version)
#   --notes "Notes"          Release notes
#   --generate-notes         Auto-generate notes from commits
#   --draft                  Create as draft
#   --prerelease             Mark as prerelease
#   --target <commit-ish>    Target commit/branch (default: current)
#   --attach <file>          Attach file (repeatable)

set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Usage: $0 <version> [options]"
    echo ""
    echo "Options:"
    echo "  --name 'Title'           Release title (default: version)"
    echo "  --notes 'Notes'          Release notes"
    echo "  --generate-notes         Auto-generate notes from commits"
    echo "  --draft                  Create as draft release"
    echo "  --prerelease             Mark as prerelease"
    echo "  --target <commit>        Target commit/branch"
    echo "  --attach <file>          Attach file (repeatable)"
    echo ""
    echo "Examples:"
    echo "  $0 v1.0.0 --generate-notes"
    echo "  $0 v2.0.0-rc1 --prerelease --draft"
    echo "  $0 v1.0.0 --notes 'Major release' --attach ./dist/app.zip"
    exit 1
fi

VERSION="$1"
shift

# Defaults
NAME="$VERSION"
NOTES=""
GENERATE_NOTES=false
DRAFT=""
PRERELEASE=""
TARGET=""
ATTACH=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --name)
            NAME="$2"
            shift 2
            ;;
        --notes)
            NOTES="$2"
            shift 2
            ;;
        --generate-notes)
            GENERATE_NOTES=true
            shift
            ;;
        --draft)
            DRAFT="--draft"
            shift
            ;;
        --prerelease)
            PRERELEASE="--prerelease"
            shift
            ;;
        --target)
            TARGET="--target $2"
            shift 2
            ;;
        --attach)
            ATTACH="$ATTACH $1 $2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Build command
CMD="gh release create \"$VERSION\" $DRAFT $PRERELEASE $TARGET $ATTACH"

if [ -n "$NAME" ]; then
    CMD="$CMD --title \"$NAME\""
fi

if [ -n "$NOTES" ]; then
    CMD="$CMD --notes \"$NOTES\""
elif [ "$GENERATE_NOTES" = true ]; then
    CMD="$CMD --generate-notes"
else
    CMD="$CMD --notes \"\""
fi

echo "Creating release $VERSION..."
echo "  Title: $NAME"
[ "$GENERATE_NOTES" = true ] && echo "  Notes: auto-generated"
[ -n "$NOTES" ] && echo "  Notes: custom"
[ -n "$DRAFT" ] && echo "  Draft: yes"
[ -n "$PRERELEASE" ] && echo "  Prerelease: yes"
[ -n "$TARGET" ] && echo "  Target: ${TARGET#--target }"
[ -n "$ATTACH" ] && echo "  Attachments: $ATTACH"
echo ""

# Execute
eval $CMD

echo ""
echo "✓ Release $VERSION created"
