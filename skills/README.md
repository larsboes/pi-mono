# pi-mono Community Skills

A collection of reusable skills for the [pi](https://pi.dev) coding agent.

## Installation

### Quick Install

```bash
# Install all skills
cd /path/to/pi-mono
./scripts/install-skills.sh

# Or using Task
task install
```

### Install Specific Skill

```bash
./scripts/install-skills.sh github
```

### Preview Installation

```bash
./scripts/install-skills.sh --dry-run
```

## Available Skills

| Skill | Description |
|-------|-------------|
| **application-writer** | Draft applications: CFPs, fellowships, scholarships |
| **architecture** | Clean Architecture review and design |
| **brainstorm** | Critical thinking and evaluation partner |
| **browser-tools** | Interactive browser automation via Chrome DevTools |
| **context7** | Search documentation using Context7 vector embeddings |
| **debug** | Systematic root-cause debugging |
| **design** | Create high-quality frontend interfaces |
| **dev-workflow** | Stateful development workflow (PRD → Plan → Execute → Review → Finish) |
| **gccli** | Google Calendar CLI |
| **gdcli** | Google Drive CLI |
| **github** | GitHub interaction using `gh` CLI |
| **gmcli** | Gmail CLI |
| **jina-content** | Free web content extraction via Jina AI |
| **learning-planner** | Design structured learning paths |
| **markitdown** | Convert PDFs, docs, HTML to Markdown |
| **memory-manager** | Manage long-term and daily memory |
| **mermaid** | Create, validate, and export Mermaid diagrams |
| **notion** | Notion workspace integration |
| **obsidian-vault** | Obsidian vault integration |
| **pdf** | PDF manipulation (read, extract, merge, etc.) |
| **pi-extender** | Build pi extensions and skills |
| **pptx** | Advanced PowerPoint generation |
| **security-audit** | Evaluate repos/packages for malicious behavior |
| **skill-forge** | Full-lifecycle skill engineering |
| **skill-sync** | Multi-platform skill synchronization |
| **summarize** | Fetch and summarize web content |
| **swift** | Swift code assistance |
| **tmux** | Remote control tmux sessions |
| **transcribe** | Speech-to-text transcription |
| **trip-planning** | Trip planning and research |
| **uv** | Python packaging with uv |
| **vscode** | VS Code integration |
| **xlsx** | Spreadsheet manipulation |
| **youtube-transcript** | Fetch YouTube transcripts |

## Using Skills

Once installed, skills are automatically available in pi. You can:

1. **Use by name**: Mention the skill in your prompt
   ```
   Use the github skill to create a PR
   ```

2. **Let pi discover**: pi will suggest relevant skills based on context

3. **Check available skills**: Look in `~/.pi/skills/` for installed skills

## Inspiration & Attribution

Many skills in this collection were inspired by or adapted from community projects. Credit where credit is due:

### [anthropics/skills](https://github.com/anthropics/skills) — Anthropic

| This repo | Anthropic original | Notes |
|---|---|---|
| `pdf` | `pdf` | Adapted and extended |
| `pptx` | `pptx` | Adapted and extended |
| `xlsx` | `xlsx` | Adapted and extended |
| `skill-forge` | `skill-creator` | Reimagined as full-lifecycle skill engineering |
| `design` | `frontend-design` | Expanded with design token system |

### [obra/superpowers](https://github.com/obra/superpowers) — Jesse Vincent

| This repo | Superpowers original | Notes |
|---|---|---|
| `brainstorm` | `brainstorming` | Adapted critical thinking approach |
| `debug` | `systematic-debugging` | Adapted root-cause methodology |
| `dev-workflow` | `writing-plans` + `executing-plans` + `finishing-a-development-branch` | Combined into single stateful workflow |

### Original skills

The following skills were built from scratch for this collection:

`application-writer`, `architecture`, `browser-tools`, `context7`, `gccli`, `gdcli`, `github`, `gmcli`, `jina-content`, `learning-planner`, `markitdown`, `memory-manager`, `mermaid`, `notion`, `obsidian-vault`, `pi-extender`, `security-audit`, `skill-sync`, `summarize`, `swift`, `tmux`, `transcribe`, `trip-planning`, `uv`, `vscode`, `youtube-transcript`

## Contributing

Want to add a skill? See the [skill-forge](skill-forge/) skill for guidelines on creating high-quality, reusable skills.

## License

All skills are released under the MIT License.
