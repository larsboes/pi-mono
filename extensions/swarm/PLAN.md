# Swarm Extension — Improvement Plan

*Created: 2026-05-06*
*Status: Planning*

---

## Vision

Transform the swarm from a fixed 5-member board into a **composable deliberation system** where:
- Core board is always present (strategic backbone)
- Specialists are summoned dynamically based on the decision domain
- Agents accumulate expertise across sessions (learn from past deliberations)
- Model diversity matches persona temperament to model strengths

---

## Phase 1: Specialist Pool & Dynamic Composition

### 1.1 Directory Structure

```
.pi/swarm/
├── agents/                  ← Core board (always loaded)
│   ├── ceo.md
│   ├── contrarian.md
│   ├── tech-architect.md
│   ├── revenue.md
│   ├── product-strategist.md
│   └── moonshot.md
├── specialists/             ← NEW: On-demand pool
│   ├── ciso.md
│   ├── operations.md
│   ├── legal.md
│   ├── growth.md
│   ├── data-scientist.md
│   ├── career-strategist.md
│   ├── academic.md
│   └── devrel.md
├── expertise/               ← Accumulated knowledge per agent
├── skills/                  ← Shared reasoning frameworks
└── briefs/
```

### 1.2 Specialist Personas to Create

| File | Name | Color | Temperament | Key Question |
|------|------|-------|-------------|--------------|
| `ciso.md` | CISO | `#e06c75` | Paranoid-pragmatic, risk-quantifying | "What's the blast radius? What's our exposure window?" |
| `operations.md` | Operations | `#98c379` | On-call-aware, reliability-obsessed | "Who gets paged at 3am? What's the MTTR?" |
| `legal.md` | Legal | `#d19a66` | Liability-conscious, precedent-aware | "What liability does this create? What's the precedent?" |
| `growth.md` | Growth | `#c678dd` | Distribution-obsessed, metric-driven | "How does this spread? What's the CAC?" |
| `data-scientist.md` | Data Scientist | `#56b6c2` | Evidence-demanding, measurement-first | "How will we know this worked? What's the signal vs noise?" |
| `career-strategist.md` | Career Strategist | `#e5c07b` | Long-arc thinking, optionality-focused | "What does this optimize for in 5 years?" |
| `academic.md` | Academic | `#abb2bf` | Rigor-demanding, methodology-conscious | "Is this defensible? What's the intellectual contribution?" |
| `devrel.md` | DevRel | `#61afef` | Developer-empathy, friction-hunting | "Would I enjoy using this? What's the 5-minute experience?" |

### 1.3 Command Changes

```bash
# Current (unchanged)
/swarm begin                    # Opens brief editor, loads core board

# New: manual specialist injection
/swarm begin --with ciso,legal  # Core board + CISO + Legal
/swarm begin --with academic    # Core board + Academic (for thesis decisions)

# New: list available specialists
/swarm roster                   # Shows core board + available specialists

# New: quick with specialists
/swarm quick "deploy to prod?" --with ciso,operations
```

### 1.4 Code Changes Required

**`index.ts` — `handleBegin()`:**
- Parse `--with <specialists>` from args
- Load from `specialists/` directory in addition to `agents/`
- Pass combined agent list to deliberation

**`index.ts` — new `handleRoster()`:**
- List core board members + available specialists
- Show name, description, color for each
- Mark which are "core" vs "specialist"

**`config.yaml` changes:**
```yaml
paths:
  specialists: .pi/swarm/specialists/   # NEW

composition:
  core_always: true                      # Core board always present
  max_specialists: 3                     # Don't overload the room
  auto_detect: false                     # Phase 2 feature
```

---

## Phase 2: Expertise Persistence (Cross-Session Learning)

### 2.1 Problem

The mental model update mechanism exists — agents emit `<mental_model_update>` blocks — but nothing saves them back. The expertise files are all empty placeholder text.

### 2.2 Solution

After `end_deliberation()` is called:

1. Parse all `<mental_model_update>` blocks from the transcript
2. Append to each agent's expertise file with metadata:

```markdown
## 2026-05-06 — "Should we open-source pi?"

- Revenue and I aligned on time-to-market but diverged on pricing strategy
- Contrarian raised valid point about community expectations
- Pattern: open-source decisions always underestimate maintenance burden

---
```

3. On next deliberation, inject last 5 expertise entries into agent's system prompt as "Your accumulated insights from past sessions"

### 2.3 Code Changes Required

**`src/memo.ts` — `writeDeliberationFiles()`:**
- After writing transcript/memo, parse mental model blocks
- Append to corresponding expertise file in `expertise/<agent-name>.md`

**`src/dialogue.ts` — `callAgent()`:**
- Load expertise file for agent
- Inject last N entries as additional context in system prompt

**`src/persona.ts`:**
- Add `loadExpertiseHistory(agentName, maxEntries)` function

### 2.4 Expertise File Format

```markdown
# Technical Architect — Accumulated Expertise

## 2026-05-06 — "Deploy strategy for v2" [session: a3f2c1]

- Microservices vs monolith tradeoff surfaced again
- Revenue pushed for speed, I held on reversibility
- Key heuristic: if you can't rollback in 5 min, it needs more scrutiny

---

## 2026-05-03 — "Pricing model" [session: b7e4d2]

- Learned: pricing architecture IS technical architecture
- Contrarian was right about usage-based billing complexity
- Note: align with Revenue earlier on pricing-infra coupling

---
```

---

## Phase 3: Auto-Composition (Brief-Aware Specialist Detection)

### 3.1 Concept

The CEO reads the brief and automatically determines which specialists to summon. Two approaches:

**Option A: Keyword heuristics (simple, fast, no extra LLM call)**
```typescript
const SPECIALIST_TRIGGERS: Record<string, string[]> = {
  "ciso": ["security", "vulnerability", "auth", "encryption", "breach", "compliance", "pentest"],
  "operations": ["deploy", "infra", "uptime", "SLA", "incident", "monitoring", "scale"],
  "legal": ["license", "GDPR", "privacy", "liability", "terms", "IP", "patent"],
  "growth": ["acquisition", "funnel", "viral", "marketing", "distribution", "SEO"],
  "data-scientist": ["ML", "model", "metrics", "A/B test", "analytics", "prediction"],
  "career-strategist": ["career", "job", "promotion", "skills", "interview", "personal"],
  "academic": ["thesis", "research", "methodology", "paper", "study", "literature"],
  "devrel": ["API", "SDK", "developer experience", "documentation", "onboarding", "DX"],
};
```

**Option B: CEO tool `recruit_specialist` (dynamic, mid-deliberation)**
```typescript
// New tool available to CEO during deliberation
pi.registerTool({
  name: "recruit_specialist",
  description: "Bring a specialist into the deliberation mid-session",
  parameters: { name: Type.String({ description: "Specialist name from roster" }) },
  execute: async (id, params) => {
    // Load specialist persona, add to activeAgents
    // They join from the next converse() call onwards
  }
});
```

### 3.2 Recommendation

Start with **Option A** (keyword detection) at brief-load time, with CEO override capability. Option B is cooler but adds complexity to the flow.

---

## Phase 4: Model Diversity

### 4.1 Rationale

Different models have different strengths:
- **Claude Sonnet** — precise reasoning, adversarial thinking, structured output
- **Gemini 2.5 Pro** — creative/expansive, good at analogies, cheaper
- **GPT-5** — strong at pragmatic/business reasoning (when available)
- **Claude Opus** — deep analytical, for high-stakes deliberations

### 4.2 Proposed Model Mapping

```yaml
board:
  - name: Contrarian
    model: anthropic/claude-sonnet-4-20250514   # Precise adversarial reasoning
  - name: Moonshot
    model: google/gemini-2.5-pro                 # Creative, expansive thinking  
  - name: Technical Architect
    model: anthropic/claude-sonnet-4-20250514   # Methodical, structured
  - name: Revenue
    model: anthropic/claude-sonnet-4-20250514   # Pragmatic, quantitative
  - name: Product Strategist
    model: google/gemini-2.5-pro                 # User-empathy, analogies

# For high-stakes deliberations:
# /swarm begin --tier high
# → All agents use opus-level models
# → Budget increases to $15
# → Rounds increase to 4-5
```

### 4.3 Config Changes

```yaml
meeting:
  tiers:
    quick:
      budget: $2
      rounds: 1
      model_override: $default
    standard:
      budget: $5
      rounds: 3
      model_override: null          # Use per-agent model from persona
    high:
      budget: $15
      rounds: 5
      model_override: anthropic/claude-opus-4-20250514
```

### 4.4 Code Changes

- `config.yaml`: Add tiers config
- `handleBegin()`: Parse `--tier high|standard|quick`
- `dialogue.ts`: Respect per-agent model from persona frontmatter (already works via `agent.model`)

---

## Phase 5: Quality-of-Life Improvements

### 5.1 Better CEO Instructions

Current CEO prompt is good but could be improved:
- Add "If the board is too aligned, explicitly ask the Contrarian to go harder"
- Add "After Round 1, identify which specialist (if any) would add value and recruit them"
- Add section on reading accumulated expertise before starting

### 5.2 New Shared Skills

| Skill File | Purpose |
|------------|---------|
| `skills/steelman.md` | Before disagreeing, state the strongest version of opponent's position |
| `skills/quantify.md` | When making claims, attach numbers (confidence %, cost, time) |
| `skills/cite-precedent.md` | Reference specific historical examples, not abstractions |
| `skills/decision-criteria.md` | Name the criteria you're optimizing for explicitly |

### 5.3 Brief Templates

Pre-made brief templates for common decision types:

```
.pi/swarm/templates/
├── architecture-decision.md    # "Choosing between X and Y technical approach"
├── build-vs-buy.md             # "Should we build this or use existing solution"
├── career-move.md              # "Should I take this job/project/opportunity"
├── prioritization.md           # "What should we focus on next"
├── risk-assessment.md          # "Is this safe to do / what could go wrong"
└── investment.md               # "Should I invest time/money in X"
```

### 5.4 Deliberation Replay

- `/swarm replay <session-id>` — Replay a past deliberation with updated expertise
- Useful when circumstances change and you want to re-evaluate

---

## Implementation Order

| # | Phase | Effort | Value | Status |
|---|-------|--------|-------|--------|
| 1 | Specialist personas (write .md files) | 30 min | High | ✅ DONE |
| 2 | `--with` flag + roster command | 1 hr | High | ✅ DONE |
| 3 | Expertise persistence | 1 hr | Medium | ✅ DONE |
| 4 | Auto-composition (keyword triggers) | 30 min | Medium | ✅ DONE |
| 5 | Model diversity config | 30 min | Medium | ✅ DONE |
| 6 | Tiers (quick/standard/high) | 30 min | Medium | ✅ DONE |
| 7 | Brief templates | 20 min | Low | ✅ DONE |
| 8 | New shared skills | 20 min | Low | ✅ DONE |
| 9 | CEO prompt improvements | 15 min | Medium | ✅ DONE |
| 10 | Recruit tool (mid-session) | 1 hr | High | ✅ DONE |

**Quick wins first:** Phases 1-2 give you immediate value (new specialists, `--with` flag).
**Then compounding:** Phase 3 makes the system get smarter over time.
**Then polish:** Phases 4-10 are quality and convenience.

---

## Open Questions

- [ ] Should specialists have the mental-model skill too, or is that core-board only?
- [ ] Max specialists per session — 2? 3? Unlimited?
- [ ] Should the Contrarian respond to specialists too, or only core board?
- [ ] Do we want a "personal board" preset (Career Strategist + Moonshot + Contrarian) for life decisions?
- [ ] Should `/swarm quick` also support `--with` or is it always core-only?

---

## Notes

- The existing `converse()` tool already supports `to: ["specific member"]` — specialists work with no tool changes
- Persona loading from `loadPersona()` already handles arbitrary .md files — just need to point at the right directory
- The expertise files exist but are never written to — Phase 3 is literally just adding a write step after deliberation ends
- Model resolution in `dialogue.ts` already supports `provider/model-id` format from frontmatter
