# pai

PAI (Personal AI) integration for pi — skill discovery from `~/.pai/sources.conf` and HUD statusline widget.

## Features

- **Skill discovery** — Scans PAI packs for SKILL.md files and registers them with pi's skill system
- **HUD statusline** — Shows PAI version, skill count, extension count, hooks, and memory stats
- **Context density** — Tracks session activity density (actions/minute)

## How It Works

1. On load, reads `~/.pai/sources.conf` to find PAI pack directories
2. Discovers all `SKILL.md` files recursively
3. Registers skills with pi so they appear in the `<available_skills>` section of prompts
4. Renders a statusline widget showing system state

## Configuration

Skills are discovered from paths listed in `~/.pai/sources.conf`:

```
/home/user/Developer/PAI/Packs/Thinking/src
/home/user/Developer/PAI/Packs/Utilities/src
/home/user/Developer/PAI/Packs/Security/src
...
```
