#!/usr/bin/env python3
# /// script
# dependencies = []
# ///
"""
Extract code examples from Context7 JSON output.

Usage:
    python extract_code.py <context7-output.json>
    c7 pandas groupby -t json | python extract_code.py

Output formats:
    --format list      # List of code blocks (default)
    --format merged    # Single merged code block
    --format json      # JSON array of blocks with metadata
"""

import json
import re
import sys
import argparse
from pathlib import Path


def extract_code_blocks(text: str) -> list[dict]:
    """Extract fenced code blocks and inline code from text."""
    blocks = []
    
    # Fenced code blocks: ```lang\ncode\n```
    fenced_pattern = r'```(\w*)\n(.*?)```'
    for match in re.finditer(fenced_pattern, text, re.DOTALL):
        lang = match.group(1).strip() or "text"
        code = match.group(2).strip()
        blocks.append({
            "type": "fenced",
            "language": lang,
            "code": code,
            "length": len(code)
        })
    
    # Inline code: `code` (but not ``` which we already captured)
    # Skip backtick sequences that are part of fenced blocks
    inline_pattern = r'(?<!`)`([^`]+)`(?!`)'
    for match in re.finditer(inline_pattern, text):
        code = match.group(1).strip()
        if len(code) > 3:  # Skip very short inline (like `x`, `i`)
            blocks.append({
                "type": "inline",
                "language": "text",
                "code": code,
                "length": len(code)
            })
    
    return blocks


def parse_context7_json(data: dict) -> list[dict]:
    """Parse Context7 JSON structure and extract all code blocks."""
    all_blocks = []
    
    # Context7 returns results in various structures
    # Try common patterns
    texts = []
    
    if isinstance(data, dict):
        # Direct content field
        if "content" in data:
            texts.append(data["content"])
        # Results array
        if "results" in data:
            for result in data["results"]:
                if isinstance(result, dict):
                    text = result.get("content") or result.get("text") or result.get("snippet")
                    if text:
                        texts.append(text)
        # Single text field
        if "text" in data:
            texts.append(data["text"])
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                text = item.get("content") or item.get("text") or item.get("snippet")
                if text:
                    texts.append(text)
            elif isinstance(item, str):
                texts.append(item)
    elif isinstance(data, str):
        texts.append(data)
    
    # Extract code from all collected texts
    for i, text in enumerate(texts):
        blocks = extract_code_blocks(text)
        for block in blocks:
            block["source_index"] = i
        all_blocks.extend(blocks)
    
    return all_blocks


def format_list(blocks: list[dict]) -> str:
    """Format blocks as numbered list."""
    if not blocks:
        return "No code blocks found."
    
    output = []
    for i, block in enumerate(blocks, 1):
        lang = block["language"]
        code = block["code"][:500]  # Truncate long blocks
        if len(block["code"]) > 500:
            code += "\n... [truncated]"
        
        output.append(f"\n--- Example {i} ({block['type']}, {lang}) ---")
        output.append(f"```{lang}")
        output.append(code)
        output.append("```")
    
    return "\n".join(output)


def format_merged(blocks: list[dict]) -> str:
    """Format all blocks as single merged code."""
    if not blocks:
        return "# No code blocks found."
    
    output = ["# Extracted Code Examples\n"]
    for block in blocks:
        lang = block["language"]
        output.append(f"\n# {block['type']} ({lang})")
        output.append(f"```{lang}")
        output.append(block["code"])
        output.append("```")
    
    return "\n".join(output)


def format_json(blocks: list[dict]) -> str:
    """Format as JSON array."""
    return json.dumps(blocks, indent=2)


def main():
    parser = argparse.ArgumentParser(
        description="Extract code examples from Context7 JSON output"
    )
    parser.add_argument(
        "file",
        nargs="?",
        help="JSON file from Context7 (or stdin if not provided)"
    )
    parser.add_argument(
        "-f", "--format",
        choices=["list", "merged", "json"],
        default="list",
        help="Output format (default: list)"
    )
    parser.add_argument(
        "-l", "--language",
        help="Filter by language (e.g., python, javascript)"
    )
    parser.add_argument(
        "-n", "--limit",
        type=int,
        default=50,
        help="Max number of blocks (default: 50)"
    )
    
    args = parser.parse_args()
    
    # Read input
    try:
        if args.file:
            text = Path(args.file).read_text()
        else:
            text = sys.stdin.read()
        
        data = json.loads(text)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON - {e}", file=sys.stderr)
        sys.exit(1)
    except FileNotFoundError:
        print(f"Error: File not found - {args.file}", file=sys.stderr)
        sys.exit(1)
    
    # Extract blocks
    blocks = parse_context7_json(data)
    
    # Filter by language if specified
    if args.language:
        blocks = [b for b in blocks if args.language.lower() in b["language"].lower()]
    
    # Sort: fenced blocks first, then by length (descending)
    blocks.sort(key=lambda b: (b["type"] != "fenced", -b["length"]))
    
    # Limit
    blocks = blocks[:args.limit]
    
    # Output
    if args.format == "list":
        print(format_list(blocks))
    elif args.format == "merged":
        print(format_merged(blocks))
    elif args.format == "json":
        print(format_json(blocks))
    
    # Summary to stderr
    print(f"\n[Extracted {len(blocks)} code blocks]", file=sys.stderr)


if __name__ == "__main__":
    main()
