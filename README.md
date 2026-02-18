<p align="center">
  <a href="https://pi.dev">
    <img src="https://shittycodingagent.ai/logo.svg" alt="pi logo" width="128">
  </a>
</p>
<p align="center">
  <a href="https://discord.com/invite/3cU7Bz4UPx"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="https://github.com/badlogic/pi-mono/actions/workflows/ci.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/badlogic/pi-mono/ci.yml?style=flat-square&branch=main" /></a>
  <img alt="Skills" src="https://img.shields.io/badge/skills-32-blue?style=flat-square" />
  <img alt="Platforms" src="https://img.shields.io/badge/platforms-pi%20%7C%20Claude%20Code-green?style=flat-square" />
</p>
<p align="center">
  <a href="https://pi.dev">pi.dev</a> domain graciously donated by
  <br /><br />
  <a href="https://exe.dev"><img src="packages/coding-agent/docs/images/exy.png" alt="Exy mascot" width="48" /><br />exe.dev</a>
</p>

# Pi Monorepo + Community Skills

> **This fork** adds 32+ community skills while tracking upstream [pi-mono](https://github.com/badlogic/pi-mono) for core tooling.

Ready-to-use skills for [pi](https://pi.dev), Claude Code, and compatible agents. From GitHub automation to PowerPoint generation—install once, use everywhere.

---

## 🚀 Quick Start

```bash
# Clone and install all skills
git clone https://github.com/larsboes/pi-mono.git
cd pi-mono

# Install to your local pi setup
./scripts/install-skills.sh

# Or use Task (https://taskfile.dev)
task install

# Check what you got
task skills:list
```

**One-liner for existing users:**
```bash
cd ~/Developer/pi-mono && task install
```

---

## 📦 How It Works

```
┌─────────────────────────────────────────────────────────┐
│  pi-mono/skills/          ← Source of truth (this repo) │
│  ├── github/              ← GitHub automation skill     │
│  ├── pptx/                ← Markdown → slides           │
│  └── ... 32 skills total                                │
└─────────────────────────────────────────────────────────┘
                           │
                           │ ./scripts/install-skills.sh
                           ▼
┌─────────────────────────────────────────────────────────┐
│  ~/.pi/skills/            ← pi uses these               │
│  ~/.claude/skills/        ← Claude Code uses these      │
└─────────────────────────────────────────────────────────┘
```

**Key features:**
- ✅ Single source of truth—edit here, sync everywhere
- ✅ Works with pi, Claude Code, and Antigravity (WIP)
- ✅ Public skills (generic) + personal skills (your context)
- ✅ Automatic PII scanning before public release

---

## 🎯 Skill Categories

| Category | Skills | Example Use |
|----------|--------|-------------|
| **Development** | `github`, `uv`, `swift`, `dev-workflow`, `architecture` | Create PRs, scaffold Python, Swift patterns, Clean Architecture |
| **Documents** | `pdf`, `xlsx`, `pptx`, `markitdown` | Convert PDFs, build spreadsheets, slides from Markdown |
| **Integrations** | `gccli`, `gdcli`, `gmcli`, `notion`, `obsidian-vault` | Calendar, Drive, Gmail, Notion, Obsidian |
| **AI/Research** | `browser-tools`, `context7`, `jina-content`, `summarize` | Browser automation, doc search, web extraction |
| **Media** | `transcribe`, `youtube-transcript`, `mermaid` | Speech-to-text, transcripts, diagrams |
| **Utilities** | `debug`, `design`, `brainstorm`, `skill-forge` | Debugging, UI design, critical thinking, skill building |

[See full skill list →](skills/README.md)

---

## ⭐ Featured Skills

### browser-tools
Interactive Chrome automation via DevTools Protocol—no Puppeteer complexity.
```bash
# In pi: "Use browser-tools to screenshot https://example.com"
```

### dev-workflow  
Stateful development: PRD → Plan → Execute → Review → Finish.
```bash
# In pi: "/dev-workflow" → automatically detects current phase
```

### pptx
Markdown to beautiful slides with auto-layout and design tokens.
```bash
pi pptx create --from content.md --theme minimal --export pdf
```

### skill-sync
Sync your skills across pi, Claude Code, and public repo—dogfooding at its finest.
```bash
./scripts/sync-to-claude.sh github --confirm
./scripts/sync-to-public.sh github --confirm
```

---

## 🛠️ Task Commands

```bash
task install              # Install all skills to ~/.pi/skills/
task install:skill -- github  # Install specific skill
task skills:list          # Show installed vs available
task skills:diff          # Show differences between repo and local
task validate             # Check skill structure
task validate:pii         # Scan for personal info before public release
task stats                # Show repo statistics
task --list               # See all commands
```

---

## 📁 Repository Structure

```
pi-mono/
├── skills/               # 32 community skills
│   ├── README.md        # Full skill documentation
│   ├── github/          # GitHub CLI skill
│   ├── pptx/            # PowerPoint generation
│   └── ...
├── scripts/
│   └── install-skills.sh    # One-command installer
├── Taskfile.yml         # Task runner commands
└── README.md           # You are here
```

**Skill structure (example):**
```
skills/github/
├── SKILL.md            # Core instructions (~200 lines)
├── references/         # Deep docs (lazy-loaded)
│   └── api.md
└── scripts/            # Executable helpers
    └── pr-create.sh
```

---

## 🤝 Contributing

### Adding a Skill

1. **Design**: Use the [skill-forge](skills/skill-forge/) skill for best practices
2. **Structure**: Keep SKILL.md <300 lines, put deep docs in `references/`
3. **Tag**: Add `# @sync: public` or `# @sync: personal` in frontmatter
4. **Validate**: Run `task validate` and `task validate:pii`
5. **Install**: Run `task install` to test locally

### Skill Tags

```yaml
---
name: my-skill
description: "What it does"
# @sync: public        # Sync everywhere (generic)
# @sync: personal      # Keep in pi only (your context)
# @sync: private       # Never sync (company secrets)
---
```

### ⚠️ Don't Put Personal Work in examples/

The `examples/` directory is synced to public. Don't include:
- Company presentations ("Praxischeck", "Ahrtal-Netz")
- Personal bios ("Lars Boes | Solution Designer")
- Internal project names

See [skill-sync](skills/skill-sync/) for PII scanning and sanitization.

---

## 📚 References & Inspiration

| Repo | Author | What |
|------|--------|------|
| **[anthropics/skills](https://github.com/anthropics/skills)** | Anthropic | 16 reference skills (Office docs, MCP builder, skill-creator, web artifacts) |
| **[anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official)** | Anthropic | Official Claude Code plugins |
| **[anthropics/claude-cookbooks](https://github.com/anthropics/claude-cookbooks)** | Anthropic | Patterns and recipes for Claude Code |
| **[obra/superpowers](https://github.com/obra/superpowers)** | Jesse Vincent | 14 TDD-driven dev workflow skills |
| **[awesome-claude-code-plugins](https://github.com/larsboes/awesome-claude-code-plugins)** | Community | Curated list of 118+ plugins |
| **[everything-claude-code](https://github.com/larsboes/everything-claude-code)** | Affaan Mustafa | Full config: 8 subagents, 8 skills, 9 commands |

---

## 🔬 Development Setup (pi Core)

Want to hack on pi itself or test changes to core packages? Link your local pi-mono:

### 1. Build the Packages

```bash
cd pi-mono
npm install
npm run build
```

### 2. Link pi CLI to Local Build

```bash
# Make pi-test.sh executable and available
chmod +x pi-test.sh

# Option A: Create alias in your shell profile
alias pi-dev="$HOME/Developer/pi-mono/pi-test.sh"

# Option B: Link globally (use with caution)
npm link
# Or use the local binary directly
./packages/coding-agent/dist/cli/index.js
```

### 3. Use npm run dev (Watch Mode)

```bash
# In one terminal: watch for changes and rebuild
npm run dev

# In another terminal: run the dev build
./pi-test.sh

# Or create a convenient alias
alias pi="$HOME/Developer/pi-mono/pi-test.sh"
```

### 4. Verify Local pi is Used

```bash
# Should show your local path, not global
which pi-dev  # → /Users/you/Developer/pi-mono/pi-test.sh

# Check version shows local build
pi-dev --version
```

### 5. Developing with Local Skills

When running local pi, it will use:
- **Core packages** from `pi-mono/packages/`
- **Skills** from `~/.pi/skills/` (install with `task install`)

```bash
# Edit skill in pi-mono/skills/github/
# Install to local
./scripts/install-skills.sh github

# Test with local pi
./pi-test.sh
```

### Troubleshooting

**Changes not reflecting?**
```bash
# Rebuild after code changes
npm run build

# Or use watch mode
npm run dev
```

**Global pi interfering?**
```bash
# Check which pi is being used
which pi
ls -la $(which pi)

# Temporarily use full path to local
$HOME/Developer/pi-mono/pi-test.sh
```

**Skill not found?**
```bash
# Ensure skills are installed to ~/.pi/skills/
ls ~/.pi/skills/

# Reinstall from local repo
./scripts/install-skills.sh
```

### Running Tests

```bash
# Run all tests (skips LLM-dependent tests without API keys)
./test.sh

# Note: Always build before testing
npm run build && ./test.sh
```

> **Note:** `npm run check` (lint/format/type-check) requires `npm run build` first. The web-ui package needs compiled `.d.ts` files from dependencies.

---

## 🔧 Core Packages

This repo tracks upstream [pi-mono](https://github.com/badlogic/pi-mono) for core tooling:

| Package | Description |
|---------|-------------|
| **[@mariozechner/pi-ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| **[@mariozechner/pi-agent-core](packages/agent)** | Agent runtime with tool calling and state management |
| **[@mariozechner/pi-coding-agent](packages/coding-agent)** | Interactive coding agent CLI |
| **[@mariozechner/pi-mom](packages/mom)** | Slack bot that delegates messages to the pi coding agent |
| **[@mariozechner/pi-tui](packages/tui)** | Terminal UI library with differential rendering |
| **[@mariozechner/pi-web-ui](packages/web-ui)** | Web components for AI chat interfaces |
| **[@mariozechner/pi-pods](packages/pods)** | CLI for managing vLLM deployments on GPU pods |

See [packages/](packages/) for core development.

---

## 📝 License

MIT — Skills are community-contributed and free to use.
