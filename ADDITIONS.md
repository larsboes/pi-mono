# Fork Additions — Lars Boes

Changes from upstream [`badlogic/pi-mono`](https://github.com/badlogic/pi-mono).
Keep this file updated when adding patches or merging upstream.

---

## Active Patches

### 1. `packages/coding-agent/src/core/skills.ts` — TitleCase skill name normalization

**What:** Added `toKebabCase()` function. Skill names from frontmatter or directory names are normalized to kebab-case before validation.

**Why:** PAI skills use TitleCase names (`RedTeam`, `USMetrics`, `OSINT`). Without normalization, pi rejects them with "name contains invalid characters" validation errors.

**Conflict risk on upstream merge:** Medium — upstream may also modify skill validation logic.

---

### 2. `packages/ai/src/providers/amazon-bedrock.ts` — Adaptive thinking maxTokens fix

**What:** When using adaptive thinking, pass `model.maxTokens` instead of the 32k buildBaseOptions default.

**Why:** Adaptive thinking on Opus/Sonnet 4.6 needs room for both thinking tokens AND output. The 32k default cap was truncating responses on 128k-output models (EU Bedrock endpoint).

**Conflict risk on upstream merge:** Low — touches a narrow code path.

---

### 3. `packages/ai/src/providers/anthropic.ts` — Same maxTokens fix for Anthropic provider

**What:** Same as above for the direct Anthropic provider path.

**Why:** Same reason — adaptive thinking maxTokens fix for Opus/Sonnet 4.6.

**Conflict risk on upstream merge:** Low.

---

### 4. `packages/ai/scripts/generate-models.ts` — `PI_SKIP_MODEL_FETCH` escape hatch

**What:** At the top of `generateModels()`, if `PI_SKIP_MODEL_FETCH=1` is set, the
function returns immediately without fetching from models.dev / OpenRouter /
Vercel AI Gateway and without touching `models.generated.ts`.

**Why:** Behind corporate proxies these fetches time out, and the default behavior
is to write a **truncated** catalog (we saw 703 lines vs. 15,660), which then
breaks the type system in `models.ts` via `TProvider` indexing. The escape hatch
preserves the committed catalog on failing networks.

**How to use:** `export PI_SKIP_MODEL_FETCH=1` in your shell (or prefix a single
build: `PI_SKIP_MODEL_FETCH=1 bun run build`). On a network that can reach the
catalogs, leave it unset to refresh the file.

**Conflict risk on upstream merge:** Low — the guard is prepended inside
`generateModels()`; the rest of the function is untouched.

---

### 5. Bun runtime for the agent binary

**What:** `pi` alias uses `bun` instead of `node` to run `dist/cli.js`.

**Why:** Bun runs Node.js output natively with faster startup. Zero code changes — the built output is identical. Build toolchain stays npm (upstream compatible).

**Conflict risk on upstream merge:** None — this is only in dotfiles, not in pi-mono source.

---

## Branch Strategy

```
main    = upstream + our patches (default branch, always deployable)
dev     = integration branch for new work, merges into main when stable
```

**Upgrade flow (when upstream releases):**
```bash
git fetch upstream
git checkout main
git merge upstream/main
# resolve conflicts (generate-models.ts most likely)
bun run build    # verify
git push origin main
```

---

## Additive Directories (no upstream conflict risk)

These are entirely new — upstream has nothing in these paths, so they never conflict on merge.

| Directory | Purpose |
|-----------|---------|
| `extensions/` | 9 public pi extensions (swarm, stats, cortex, mitsupi, pai, buddy, mcp-adapter, web-access, markdown-preview) |
| `add-docs/` | Fork-specific documentation (architecture.md, extensions.md) |
| `scripts/link-extensions.sh` | Setup script — symlinks extensions + unified memory to `~/.pi/` and `~/.pai/` |
| `ADDITIONS.md` | This file |
| `PLAN.md` | Planned work (pi_agent_rust conformance, omp mining, unified stats, swarm testing) |

See `extensions/README.md` for attribution and `add-docs/` for architecture details.

Private DT extensions live in a separate repo (`dt-extensions`), symlinked alongside public ones.
