# Ultra Modes

Keyword-triggered cognitive modes for pi. Type a keyword at the start of your message to activate deep thinking, divergent exploration, surgical precision, or defensive engineering — for that turn only.

## Modes

| Keyword | Mode | Effect |
|---------|------|--------|
| `ULTRATHINK` | 🧠 Deep Analysis | Multi-angle decomposition, challenge assumptions, second-order effects |
| `ULTRAWIDE` | 🌊 Divergent | Cross-discipline brainstorm, wild cards, reframe the problem |
| `ULTRAFOCUS` | 🎯 Precision | Minimal diff, verify everything, narrow scope, trace dependencies |
| `ULTRACARE` | 🛡️ Defensive | Threat model, input validation, error paths, security checklist |

## Usage

### Per-turn (keyword prefix)

Just start your message with the keyword — it's stripped before the prompt reaches the model:

```
ULTRATHINK how should I architect the auth system?
ULTRAWIDE what are creative ways to solve the caching problem?
ULTRAFOCUS fix the off-by-one error in pagination
ULTRACARE implement the file upload endpoint
```

### Sticky (command)

```
/ultra think       # Enable ULTRATHINK for all turns
/ultra wide        # Enable ULTRAWIDE for all turns
/ultra off         # Disable
/ultra             # Open interactive selector
```

### Keyboard shortcut

`Ctrl+Shift+U` — cycles through: off → think → wide → focus → care → off

## What It Does

When activated, the extension:

1. **Boosts thinking level** to `xhigh` (or `high` for ULTRAFOCUS) for that turn
2. **Injects reasoning instructions** into the system prompt — structured frameworks that guide the model's extended thinking
3. **Shows status** in the footer bar while active
4. **Auto-resets** thinking level after the turn (keywords are per-turn; `/ultra` is sticky)

## When to Use What

- **ULTRATHINK** — Architecture decisions, design tradeoffs, "should I X or Y?", anything where you want the model to really think before committing
- **ULTRAWIDE** — Brainstorming, "what are my options?", stuck problems, when you want novel approaches
- **ULTRAFOCUS** — Bug fixes, small precise changes, when you've been burned by scope creep
- **ULTRACARE** — Security-sensitive code, production systems, anything where failure is expensive

## Installation

Already symlinked to `~/.pi/agent/extensions/ultra`. Reload with `/reload` if pi is running.
