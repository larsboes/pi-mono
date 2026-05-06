<p align="center">
  <a href="https://pi.dev">
    <img src="https://pi.dev/logo.svg" alt="pi logo" width="128">
  </a>
</p>
<p align="center">
  <a href="https://discord.com/invite/3cU7Bz4UPx"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="https://github.com/badlogic/pi-mono/actions/workflows/ci.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/badlogic/pi-mono/ci.yml?style=flat-square&branch=main" /></a>
</p>
<p align="center">
  <a href="https://pi.dev">pi.dev</a> domain graciously donated by
  <br /><br />
  <a href="https://exe.dev"><img src="packages/coding-agent/docs/images/exy.png" alt="Exy mascot" width="48" /><br />exe.dev</a>
</p>

> New issues and PRs from new contributors are auto-closed by default. Maintainers review auto-closed issues daily. See [CONTRIBUTING.md](CONTRIBUTING.md).

---

# Pi Monorepo

> **Looking for the pi coding agent?** See **[packages/coding-agent](packages/coding-agent)** for installation and usage.

Tools for building AI agents.

## Fork Extensions

This fork adds 11 extensions in [`extensions/`](extensions/):

| Extension | Purpose |
|-----------|--------|
| **[cortex](extensions/cortex)** | Memory system with 10-stage retrieval pipeline, entity graph, pattern mining |
| **[stats](extensions/stats)** | Unified AI usage dashboard (pi + Claude Code) — `/stats`, web UI |
| **[swarm](extensions/swarm)** | Multi-agent deliberation + YAML DAG orchestration |
| **[web-access](extensions/web-access)** | Web search, fetch, YouTube, PDF, GitHub |
| **[mcp-adapter](extensions/mcp-adapter)** | Token-efficient MCP server gateway |
| **[markdown-preview](extensions/markdown-preview)** | Rendered markdown + LaTeX preview |
| **[mitsupi](extensions/mitsupi)** | Personal utilities (loop, todos, review) |
| **[pai](extensions/pai)** | PAI skill discovery + HUD statusline |
| **[buddy](extensions/buddy)** | Virtual companion widget |
| **[ultra](extensions/ultra)** | ULTRA keyword-triggered deep thinking modes |
| **[image-ai](extensions/image-ai)** | Image generation (CF FLUX) + recognition (Gemini Flash) |

See [`extensions/README.md`](extensions/README.md) for full details, setup, and attribution.

Fork-specific docs: [`ADDITIONS.md`](ADDITIONS.md) (patches), [`PLAN.md`](PLAN.md) (roadmap).

## Share your OSS coding agent sessions

If you use pi or other coding agents for open source work, please share your sessions.

Public OSS session data helps improve coding agents with real-world tasks, tool use, failures, and fixes instead of toy benchmarks.

For the full explanation, see [this post on X](https://x.com/badlogicgames/status/2037811643774652911).

To publish sessions, use [`badlogic/pi-share-hf`](https://github.com/badlogic/pi-share-hf). Read its README.md for setup instructions. All you need is a Hugging Face account, the Hugging Face CLI, and `pi-share-hf`.

You can also watch [this video](https://x.com/badlogicgames/status/2041151967695634619), where I show how I publish my `pi-mono` sessions.

I regularly publish my own `pi-mono` work sessions here:

- [badlogicgames/pi-mono on Hugging Face](https://huggingface.co/datasets/badlogicgames/pi-mono)

## Packages

| Package | Description |
|---------|-------------|
| **[@mariozechner/pi-ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| **[@mariozechner/pi-agent-core](packages/agent)** | Agent runtime with tool calling and state management |
| **[@mariozechner/pi-coding-agent](packages/coding-agent)** | Interactive coding agent CLI |
| **[@mariozechner/pi-tui](packages/tui)** | Terminal UI library with differential rendering |
| **[@mariozechner/pi-web-ui](packages/web-ui)** | Web components for AI chat interfaces |

## Chat bot workflows

For Slack/chat automation, see [earendil-works/pi-chat](https://github.com/earendil-works/pi-chat).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [AGENTS.md](AGENTS.md) for project-specific rules (for both humans and agents).

## Development

```bash
npm install          # Install all dependencies
npm run build        # Build all packages
npm run check        # Lint, format, and type check
./test.sh            # Run tests (skips LLM-dependent tests without API keys)
./pi-test.sh         # Run pi from sources (can be run from any directory)
```

> **Note:** `npm run check` requires `npm run build` to be run first. The web-ui package uses `tsc` which needs compiled `.d.ts` files from dependencies.

## License

MIT
