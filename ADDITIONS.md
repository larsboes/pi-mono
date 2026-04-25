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

### 4. `packages/ai/scripts/generate-models.ts` — Skip external model catalog fetch

**What:** Removed/stubbed the external API calls to `models.dev` and OpenRouter during build.

**Why:** External catalog fetches fail behind corporate proxies. Upstream catalog in git is sufficient — models are registered via extensions, not the generated catalog.

**Conflict risk on upstream merge:** High — upstream actively maintains model catalog generation. Re-apply after every upstream merge.

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

## Extensions

Public extensions live in `extensions/` — tracked in this repo, symlinked from `~/.pi/agent/extensions/`.
Private extensions live in a separate private repo, symlinked into `~/.pi/agent/extensions/` alongside the public ones.
