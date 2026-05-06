# buddy

Virtual companion that lives in your pi sessions. Each user gets a unique companion rolled from a random seed (species, rarity, stats, hat, eyes).

## Features

- **18 species** — Axolotl, Cat, Fox, Owl, Dragon, and more
- **Rarity system** — Common → Legendary with star ratings
- **Animation** — Buddy animates during AI turns
- **Persistent** — Survives across sessions (stored in `~/.pi/buddy.json`)
- **Widget** — Displays above the editor input

## Commands

| Command | Description |
|---------|-------------|
| `/buddy` | Show full companion card |
| `/buddy rename <name>` | Rename your companion |
| `/buddy reroll` | Get a new random companion |
| `/buddy gallery` | Browse all 18 species |
| `/buddy show` | Show widget above editor |
| `/buddy hide` | Hide widget |
| `/buddy toggle` | Toggle widget visibility |

## Storage

- `~/.pi/buddy.json` — Seed, name, visibility, hatch date
