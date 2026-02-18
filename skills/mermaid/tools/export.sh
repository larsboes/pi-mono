#!/bin/bash
# Export Mermaid diagram to image format (PNG, SVG, PDF)
# Usage: export.sh <diagram.mmd> [options]
# Options:
#   --format png|svg|pdf   Output format (default: png)
#   --width <pixels>       Width in pixels (default: 1200)
#   --height <pixels>      Height in pixels (optional)
#   --theme <theme>        Mermaid theme (default: default)
#   --bg <color>           Background color (default: white)
#   -o, --output <file>    Output file (default: auto)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Defaults
FORMAT="png"
WIDTH=1200
HEIGHT=""
THEME="default"
BG="white"
OUTPUT=""

# Parse arguments
INPUT=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --format)
            FORMAT="$2"
            shift 2
            ;;
        --width)
            WIDTH="$2"
            shift 2
            ;;
        --height)
            HEIGHT="$2"
            shift 2
            ;;
        --theme)
            THEME="$2"
            shift 2
            ;;
        --bg)
            BG="$2"
            shift 2
            ;;
        -o|--output)
            OUTPUT="$2"
            shift 2
            ;;
        -*)
            echo "Unknown option: $1"
            exit 1
            ;;
        *)
            if [ -z "$INPUT" ]; then
                INPUT="$1"
            else
                echo "Unexpected argument: $1"
                exit 1
            fi
            shift
            ;;
    esac
done

if [ -z "$INPUT" ]; then
    echo "Usage: export.sh <diagram.mmd> [options]"
    echo ""
    echo "Options:"
    echo "  --format png|svg|pdf   Output format (default: png)"
    echo "  --width <pixels>       Width in pixels (default: 1200)"
    echo "  --height <pixels>      Height in pixels (optional)"
    echo "  --theme <theme>        Mermaid theme (default: default)"
    echo "  --bg <color>           Background color (default: white)"
    echo "  -o, --output <file>    Output file (default: auto)"
    exit 1
fi

if [ ! -f "$INPUT" ]; then
    echo "Error: File not found: $INPUT"
    exit 1
fi

# Auto-generate output filename if not specified
if [ -z "$OUTPUT" ]; then
    OUTPUT="${INPUT%.mmd}.${FORMAT}"
fi

# Validate format
if [[ ! "$FORMAT" =~ ^(png|svg|pdf)$ ]]; then
    echo "Error: Unsupported format '$FORMAT'. Use: png, svg, or pdf"
    exit 1
fi

echo "Exporting: $INPUT"
echo "Format: $FORMAT"
echo "Width: ${WIDTH}px"
[ -n "$HEIGHT" ] && echo "Height: ${HEIGHT}px"
echo "Theme: $THEME"
echo "Background: $BG"
echo "Output: $OUTPUT"
echo ""

# Build mmdc options
MMDC_OPTS="-i \"$INPUT\" -o \"$OUTPUT\" -t \"$THEME\" -b \"$BG\" -w $WIDTH"
[ -n "$HEIGHT" ] && MMDC_OPTS="$MMDC_OPTS -H $HEIGHT"

# Run mmdc
if npx -y @mermaid-js/mermaid-cli $MMDC_OPTS; then
    echo ""
    echo "✓ Exported to: $OUTPUT"
    
    # Get file size
    if [ -f "$OUTPUT" ]; then
        SIZE=$(du -h "$OUTPUT" | cut -f1)
        echo "  Size: $SIZE"
    fi
else
    echo ""
    echo "✗ Export failed"
    exit 1
fi
