# mitsupi

Personal Pi extensions adapted from [mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff).

## Origin

This package started as a fork/adaptation of Armin Ronacher's ([mitsuhiko](https://github.com/mitsuhiko)) `agent-stuff` repository — a collection of skills and extensions for the [Pi Coding Agent](https://buildwithpi.ai/).

The original `agent-stuff` is available at:  
**https://github.com/mitsuhiko/agent-stuff**

## Changes from Original

This version has been slightly adapted for personal use:
- Local development setup with symlink-based loading
- Package renamed to `@larsboes/pi-mitsupi`
- Modified peer dependencies for local pi-mono development
- Personal configuration and customizations

## Extensions Included

All original extensions from `agent-stuff` are preserved:

| Extension | Description |
|-----------|-------------|
| `answer.ts` | Interactive TUI for answering questions one by one |
| `context.ts` | Quick context breakdown with token usage |
| `control.ts` | Session control helpers |
| `prompt-editor.ts` | In-editor prompt mode selector with shortcuts |
| `files.ts` | Unified file browser with git status |
| `go-to-bed.ts` | Late-night safety guard (00:00-06:00) |
| `loop.ts` | Prompt loop for rapid iterative coding |
| `notify.ts` | Desktop notifications on completion |
| `review.ts` | Code review command (Codex-inspired) |
| `session-breakdown.ts` | Session usage analysis with usage graph |
| `todos.ts` | Todo manager with file-backed storage |
| `uv.ts` | Helpers for uv Python packaging |
| `whimsical.ts` | Whimsical "Thinking..." messages |

## License

Original work by Armin Ronacher. Used and adapted with appreciation for the open-source Pi ecosystem.
