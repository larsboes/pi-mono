# cortex

Self-extending agent extension for pi — active memory, pattern detection, and skill crystallization.

## Features

### Memory System (Phase 8 — Retrieval Quality Pipeline)

8-stage search pipeline:

```
Query → Retrieval → Intent → Granularity → Weights → Graph → Context → Personal → Rerank
```

- **Local embeddings** — Xenova/all-MiniLM-L6-v2 (no external API calls)
- **Intent classification** — 6 intent types (recall, how-to, debug, general, creative, meta) with confidence scoring
- **Entity graph** — Co-occurrence tracking, recency-weighted, auto-pruning
- **Hierarchical index** — Document/section/chunk granularity with intent-driven routing
- **Session context injection** — Recency-ordered entities, activity density tracking
- **Feedback loop** — Time-decay, sigmoid weights, correction-learning
- **Cross-encoder reranking** — MiniLM-L6-v2 for precision (50ms)

### Self-Extension Loop

- **Pattern detection** — Identifies repeated tool sequences (e.g., `read→edit→bash`)
- **Skill crystallization** — Auto-suggests skills from detected patterns
- **Extension creation** — Generates TypeScript extensions from workflow patterns

### Tools Provided

| Tool | Description |
|------|-------------|
| `memory_search` | Semantic vector search with keyword fallback |
| `memory_store` | Store text with embeddings for future retrieval |
| `scratchpad` | Working memory: add, done, undo, list, clear |
| `capabilities_query` | Query tools, skills, errors, gaps |
| `crystallize_skill` | Create a pi skill from a workflow pattern |
| `create_extension` | Generate TypeScript extension from template |
| `audit_skill` | Validate skill quality (0-100% score) |

### Context Injection

Automatically injects into every prompt:
- Daily log (today + yesterday)
- Self-extension status (crystallization candidates)
- Open scratchpad items

## Architecture

```
src/
├── memory.ts          — Core search pipeline + embedding store
├── intent.ts          — Intent classification (6 types)
├── graph.ts           — Entity co-occurrence graph
├── rerank.ts          — Cross-encoder reranking
├── feedback.ts        — Feedback loop + weight computation
├── session.ts         — Session context tracking
├── context.ts         — Context injection (daily log, etc.)
├── patterns.ts        — Tool sequence pattern detection
├── crystallizer.ts    — Skill crystallization
├── extension-creator.ts — Extension generation
├── scratchpad.ts      — Working memory
├── capabilities.ts    — Capabilities query tool
├── skill-tracker.ts   — Skill inventory
├── rules.ts           — Session rules
├── correction.ts      — Correction learning
└── self-extension.ts  — Self-extension orchestration
```

## Storage

- `~/.pi/memory/` — Embedding store + entity graph + feedback data
- `~/.pi/memory/daily/` — Daily session logs
- `~/.pi/agent/skills/` — Crystallized skills
