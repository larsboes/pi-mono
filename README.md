<p align="center">
  <a href="https://pi.dev">
    <img alt="pi logo" src="https://pi.dev/logo-auto.svg" width="128">
  </a>
</p>
<p align="center">
  <a href="https://discord.com/invite/3cU7Bz4UPx"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
</p>
<p align="center">
  <a href="https://pi.dev">pi.dev</a> domain graciously donated by
  <br /><br />
  <a href="https://exe.dev"><img src="packages/coding-agent/docs/images/exy.png" alt="Exy mascot" width="48" /><br />exe.dev</a>
</p>

> New issues and PRs from new contributors are auto-closed by default. Maintainers review auto-closed issues daily. See [CONTRIBUTING.md](CONTRIBUTING.md).

---

# Pi Agent Harness Mono Repo

This is the home of the pi agent harness project including our self extensible coding agent.

* **[@earendil-works/pi-coding-agent](packages/coding-agent)**: Interactive coding agent CLI
* **[@earendil-works/pi-agent-core](packages/agent)**: Agent runtime with tool calling and state management
* **[@earendil-works/pi-ai](packages/ai)**: Unified multi-provider LLM API (OpenAI, Anthropic, Google, …)

To learn more about pi:

* [Visit pi.dev](https://pi.dev), the project website with demos
* [Read the documentation](https://pi.dev/docs/latest), but you can also ask the agent to explain itself

## Fork Extensions

This fork adds 13 extensions in [`extensions/`](extensions/) (48.6k LOC):

| Extension | Purpose |
|-----------|--------|
| **[cortex](extensions/cortex)** | Memory system with 10-stage retrieval pipeline, entity graph, pattern mining |
| **[web-access](extensions/web-access)** | Web search, fetch, YouTube, PDF, GitHub |
| **[mitsupi](extensions/mitsupi)** | Personal utilities (loop, todos, tool profiles, review) |
| **[mcp-adapter](extensions/mcp-adapter)** | Token-efficient MCP server gateway |
| **[stats](extensions/stats)** | Unified AI usage dashboard (pi + Claude Code) — `/stats`, web UI |
| **[swarm](extensions/swarm)** | Multi-agent deliberation + YAML DAG orchestration |
| **[markdown-preview](extensions/markdown-preview)** | Rendered markdown + LaTeX preview |
| **[pai](extensions/pai)** | PAI skill discovery + Algorithm (E1-E5) + HUD |
| **[outline](extensions/outline)** | Tree-sitter code summarization (27 langs, 5-20x compression) |
| **[buddy](extensions/buddy)** | Virtual companion widget |
| **[ultra](extensions/ultra)** | ULTRA keyword-triggered deep thinking modes |
| **[dream](extensions/dream)** | Autonomous self-improvement from memory |
| **[image-ai](extensions/image-ai)** | Image generation (CF FLUX) + recognition (Gemini Flash) |

Tool profiles (`toolProfile: lean|standard|full`) control how many tools the model sees — from 9 (smaller models) to 30+ (frontier).

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

## All Packages

| Package | Description |
|---------|-------------|
| **[@earendil-works/pi-ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| **[@earendil-works/pi-agent-core](packages/agent)** | Agent runtime with tool calling and state management |
| **[@earendil-works/pi-coding-agent](packages/coding-agent)** | Interactive coding agent CLI |
| **[@earendil-works/pi-tui](packages/tui)** | Terminal UI library with differential rendering |
| **[@earendil-works/pi-web-ui](packages/web-ui)** | Web components for AI chat interfaces |

For Slack/chat automation and workflows see [earendil-works/pi-chat](https://github.com/earendil-works/pi-chat).

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
