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

**Why:** DT's Zscaler proxy blocks those endpoints. Upstream catalog in git is sufficient — models are registered via extensions (`bedrock-eu`, `dt-llmchat`) not the generated catalog.

**Conflict risk on upstream merge:** High — upstream actively maintains model catalog generation. Re-apply after every upstream merge.

---

## Branch Strategy

```
main    = pure upstream mirror (never commit here)
dev     = upstream + our patches (work here always)
```

**Upgrade flow (when upstream releases):**
```bash
git checkout dev
git fetch upstream
git merge upstream/main
# resolve conflicts (generate-models.ts most likely)
bun run build    # verify
git push origin dev
# optionally sync main:
git checkout main && git merge upstream/main && git push origin main && git checkout dev
```

---

## Not Tracked Here

Extensions in `~/.pi/agent/extensions/` are separate git repos — not part of this fork.
