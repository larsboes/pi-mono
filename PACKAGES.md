# Installed Packages

Third-party pi packages installed in this fork. All version-pinned — `pi update` skips pinned versions.
Before upgrading, review the changelog and diff on GitHub.

## Packages

| Package | Version | Author | What it does | Audit |
|---------|---------|--------|-------------|-------|
| [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) | 2.2.1 | nicobailon | MCP server proxy — one tool (~200 tokens) instead of all server tools in context. Lazy server lifecycle. | WARN — cli.js downloads from GitHub main without checksums. Runtime code is clean. |
| [pi-web-access](https://github.com/nicobailon/pi-web-access) | 0.10.4 | nicobailon | Web search (Perplexity/Exa), URL fetch, PDF extraction, YouTube, GitHub repo cloning. | PASS |
| [pi-teams](https://github.com/burggraf/pi-teams) | 0.9.13 | burggraf | Multi-agent team coordination via terminal multiplexers. Only passes PI_* env vars to sub-agents. | PASS |
| [pi-markdown-preview](https://github.com/omaclaren/pi-markdown-preview) | 0.9.6 | omaclaren | Rendered markdown + LaTeX preview (terminal, browser, PDF). Uses puppeteer-core (no browser download). | PASS |

## Rejected

| Package | Version | Reason |
|---------|---------|--------|
| [pi-lens](https://github.com/apmantza/pi-lens) | 3.1.2 | FAIL — Command injection in LSP user config (`shell: true` with unsanitized input). Too new (9 stars, published hours ago). Revisit when patched. |

## Upgrade Procedure

1. Check the GitHub release/diff: `gh api repos/<author>/<repo>/compare/v<old>...v<new>`
2. Review changelog for security-relevant changes
3. Update: `pi install npm:<package>@<new-version>`
4. Update this file

## Last Audited

2026-04-01 — Full security audit by 5 parallel agents reviewing source code, dependencies, install scripts, network calls, credential handling, and obfuscation.
