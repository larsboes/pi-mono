# swarm

Multi-agent YAML DAG orchestration for pi. Ported from can1357/oh-my-pi `packages/swarm-extension`, merged with CEO board functionality.

## Features

- **Interactive deliberation** — `/swarm begin` opens a multi-agent debate with customizable board members
- **Specialist injection** — `/swarm begin --with ciso,legal` adds domain specialists to the core board
- **Quick debates** — `/swarm quick <topic>` for fast parallel multi-perspective analysis
- **YAML pipelines** — `/swarm run <file>` executes DAG-defined agent workflows
- **CEO board** — Structured deliberation with converse → final round → end_deliberation flow
- **Expertise persistence** — Agents accumulate insights across deliberations via mental model updates

## Commands

| Command | Description |
|---------|-------------|
| `/swarm` | Show swarm help |
| `/swarm begin` | Start interactive deliberation (core board) |
| `/swarm begin --with ciso,ops` | Start with core board + specialists |
| `/swarm quick <topic>` | Quick parallel debate (one round) |
| `/swarm quick <topic> --with academic` | Quick debate with specialist added |
| `/swarm roster` | Show core board + available specialists |
| `/swarm run <yaml>` | Execute YAML DAG pipeline |
| `/swarm list` | List past deliberations |
| `/swarm view [id]` | View past memo |
| `/swarm status` | Current swarm state |
| `/swarm stop` | Abort active deliberation |

## Board Composition

### Core Board (always present)
| Agent | Perspective |
|-------|-------------|
| Revenue | Ship, sell, collect money. 90-day monetization focus. |
| Technical Architect | Scale, dependencies, maintenance burden in year 2. |
| Product Strategist | User value, competitive positioning, compounding advantage. |
| Contrarian | Stress-test consensus. The board's immune system. |
| Moonshot | 10x moves, category-defining plays. |

### Specialists (on-demand via `--with`)
| Slug | Agent | Perspective |
|------|-------|-------------|
| `ciso` | CISO | Blast radius, attack surface, exposure windows. |
| `operations` | Operations | On-call reality, MTTR, what breaks at 3am. |
| `legal` | Legal | Licensing, privacy, liability, regulatory landmines. |
| `growth` | Growth | Distribution loops, CAC, virality mechanics. |
| `data-scientist` | Data Scientist | Measurement design, signal vs noise, evidence. |
| `career-strategist` | Career Strategist | Career capital, optionality, what compounds over decades. |
| `academic` | Academic | Methodology, defensibility, intellectual contribution. |
| `devrel` | DevRel | Developer experience, friction hunting, 5-minute test. |

## Tools (during deliberation)

| Tool | Description |
|------|-------------|
| `converse` | Send message to board members |
| `end_deliberation` | Finalize and write transcript |

## Expertise Persistence

After each deliberation, agents' `<mental_model_update>` blocks are extracted and appended to their expertise files in `.pi/swarm/expertise/`. On subsequent deliberations, agents receive their last 5 accumulated insights as additional context — making the board smarter over time.

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
