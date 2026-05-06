# swarm

Multi-agent YAML DAG orchestration for pi. Ported from can1357/oh-my-pi `packages/swarm-extension`, merged with CEO board functionality.

## Features

- **Interactive deliberation** — `/swarm begin` opens a multi-agent debate with customizable board members
- **Quick debates** — `/swarm quick <topic>` for fast parallel multi-perspective analysis
- **YAML pipelines** — `/swarm run <file>` executes DAG-defined agent workflows
- **CEO board** — Structured deliberation with converse → final round → end_deliberation flow

## Commands

| Command | Description |
|---------|-------------|
| `/swarm` | Show swarm status |
| `/swarm begin` | Start interactive deliberation |
| `/swarm quick <topic>` | Quick parallel debate |
| `/swarm run <yaml>` | Execute YAML DAG pipeline |
| `/swarm list` | List available pipelines |
| `/swarm status` | Current swarm state |
| `/swarm stop` | Abort active deliberation |
| `/swarm view` | View last transcript |

## Tools (during deliberation)

| Tool | Description |
|------|-------------|
| `converse` | Send message to board members |
| `end_deliberation` | Finalize and write transcript |

## YAML Pipeline Format

```yaml
name: research-pipeline
agents:
  researcher:
    model: claude-sonnet-4
    prompt: "Research the topic deeply"
  critic:
    model: gpt-5
    prompt: "Find flaws in the research"
    depends_on: [researcher]
```
