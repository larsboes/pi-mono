# ceo-board — PLAN.md

CEO & Board multi-agent deliberation extension for pi. The CEO IS the agent —
the extension transforms the pi session so the LLM becomes a strategic CEO
who uses a `converse()` tool to orchestrate a board of specialist advisors.

**Uncertainty in → Decision out.**

Modeled after IndiDevDan's CEO & Board pattern (video transcripts archived in
`~/.pi/agent/extensions/`). Adapted for Lars's use cases: technical architecture
decisions, career strategy, hackathon planning, bachelor thesis decisions.

Supersedes the earlier `pai-council` prototype which used a rigid code-driven
pipeline. This version gives the CEO genuine agency.

---

## The Core Architectural Insight

### What pai-council got wrong

pai-council treated the deliberation as a **code-driven pipeline**:

```
code calls complete(chair, "frame this")
code calls complete(member1, "round 1")
code calls complete(member2, "round 1")
code calls complete(member1, "round 2")
...
code calls complete(chair, "write memo")
```

The "CEO" was just another `complete()` call. No agency, no judgment, no tools.
A puppet on a script.

### What CEO & Board does instead

**The CEO IS the session agent.** The extension overrides the system prompt so
the LLM running in pi becomes the CEO. The CEO decides what to do — it reads
the brief, updates its scratchpad, uses `converse()` to engage the board,
evaluates their arguments, pushes back, and writes the final memo.

```
pi session agent = CEO (system prompt overridden)
  CEO reads brief                    (read tool)
  CEO updates scratchpad             (write tool)
  CEO uses converse("Board, we need to discuss X")
    → board members respond via complete()
    → responses returned to CEO
  CEO thinks, decides next move
  CEO uses converse() again — pushes on weak arguments
  CEO calls end_deliberation()       (custom tool)
  CEO writes memo                    (write tool)
  extension enforces budget/time constraints
```

The CEO has **agency**. It decides when enough is enough, which points to push
on, when to call for final statements. The extension provides tools and
guardrails, not a hardcoded flow.

---

## Visual Reference — Dan's Original System

### Startup Screen

```
CEO & Board — Strategic Decision-Making Agent Team

Time    2-5 min
Budget  $1-$5
Editor  code

Board
  ◆ CEO                [anthropic/claude-opus-4-6   1M]
  ◆ Revenue            [anthropic/claude-sonnet-4-6 1M]
  ◆ Product Strategist [anthropic/claude-sonnet-4-6 1M]
  ◆ Technical Architect[anthropic/claude-sonnet-4-6 1M]
  ◆ Contrarian         [anthropic/claude-sonnet-4-6 1M]
  ◆ Compounder         [anthropic/claude-sonnet-4-6 1M]
  ◆ Moonshot           [anthropic/claude-sonnet-4-6 1M]

Run /ceo-begin to start a deliberation.
```

Each board member dot is colored with the `color` from YAML. CEO gets Opus,
board members get Sonnet. The session accepts ONLY `/ceo-begin` — this is
not a conversation, it's a one-shot multi-agent system.

### Deliberation Flow

```
  [1]            [2]           [3]            [4]           [5]          [6]
  Brief    →  CEO Frames  →  Board     →  Constraint  →  Final      →  Memo
                             Debates      Check          Statements
Strategic    Reads brief,  converse()   Time/budget    end_deliber-  Structured
question     frames the    rounds w/    monitoring     ation()       output w/
from user    decision      board                       contrarian    recommenda-
                                                       last          tions

BRIEF → FRAME → DEBATE → CHECK → CLOSE → DELIVER
```

Key: CEO controls the flow through tool calls. Extension monitors constraints
and signals when limits approach ("80% budget reached").

### Status Widget During Deliberation

```
[ CEO [deliberating]           💰 $0.09  🧠 989k ]
[ ✅ Revenue      🔄 0  $0.00  🧠 1.0M ] [ ✅ Product Strategist  🔄 0  $0.00  🧠 1.0M ]
[ ✅ Tech Architect 🔄 0 $0.00 🧠 1.0M ] [ ✅ Contrarian          🔄 0  $0.00  🧠 1.0M ]
[ ✅ Compounder   🔄 0  $0.00  🧠 1.0M ] [ ✅ Moonshot            🔄 0  $0.00  🧠 1.0M ]
```

🔄 = turn count, 💰 = cost, 🧠 = context tokens. Board members show ✅ when
ready, ⏳ when called.

### Memo Output Structure

```markdown
---
session: abc123
date: 2026-04-11
duration_minutes: 4.2
budget_used: $1.87
board: [Revenue, Tech Architect, Contrarian, Product Strategist, Moonshot]
brief: .pi/ceo-board/briefs/2026-04-11-api-layer/brief.md
transcript: .pi/ceo-board/deliberations/abc123/conversation.jsonl
---

# Board Memo: [Key Question]

**Session:** abc123   **Date:** 2026-04-11   **Decision Status:** DECIDED

## Final Decision
[Bold statement, 2-4 sentences]

## Decision Map
[Visual diagram of options considered — SVG or ASCII]

## 1. [Top Recommendation] — [budget/weight]
[Reasoning + table: Line Item | Timeline | Success Metric]

## 2. [Second Recommendation]
...

## Board Stances
| Member | Position | Key Argument |
|--------|----------|-------------|

## Dissent & Tensions
[Unresolved disagreements]

## Trade-offs & Risks
| Option | You Gain | You Lose |

## Next Actions
- [ ] Action 1
- [ ] Action 2

## Deliberation Summary
[How the conversation unfolded, how positions shifted]
```

---

## Architecture

### Directory Structure

```
~/.pi/agent/extensions/ceo-board/
├── PLAN.md                          ← this file
├── package.json                     ← deps: js-yaml
├── tsconfig.json
├── index.ts                         ← extension entry point
├── src/
│   ├── config.ts                    ← YAML parser + types
│   ├── agents.ts                    ← agent persona loader (frontmatter .md)
│   ├── converse.ts                  ← converse() tool — core of the system
│   ├── constraints.ts               ← budget/time monitoring + signaling
│   ├── memo.ts                      ← memo + transcript writer
│   ├── widget.ts                    ← TUI status grid
│   └── brief.ts                     ← brief validation + parsing
├── config.yaml                      ← board composition + constraints
└── .pi/ceo-board/
    ├── agents/                      ← board member system prompts
    │   ├── ceo.md
    │   ├── revenue.md
    │   ├── tech-architect.md
    │   ├── product-strategist.md
    │   ├── contrarian.md
    │   └── moonshot.md
    ├── expertise/                   ← PERSISTENT mental models (grow over time)
    │   ├── ceo-scratch-pad.md       ← CEO's live notes (updatable)
    │   ├── revenue.md
    │   ├── tech-architect.md
    │   ├── product-strategist.md
    │   ├── contrarian.md
    │   └── moonshot.md
    ├── skills/                      ← injectable per-agent skills
    │   ├── memo-writing.md
    │   ├── adversarial-analysis.md
    │   └── mental-model.md
    ├── briefs/                      ← input questions
    │   └── YYYY-MM-DD-topic/
    │       ├── brief.md
    │       └── context/             ← supporting files (metrics, docs, etc.)
    ├── deliberations/               ← full conversation logs
    │   └── SESSION_ID/
    │       ├── conversation.jsonl
    │       ├── tool-calls.jsonl
    │       └── *.svg                ← agent-generated visuals
    └── memos/                       ← output decisions
        └── SESSION_ID/
            ├── memo.md
            ├── decision-map.svg
            └── summary.mp3          ← optional TTS summary
```

### Config Schema (`config.yaml`)

```yaml
meeting:
  constraints:
    max_time_minutes: 5
    max_budget: $5           # parsed: strip $ sign
    rounds_hint: 3           # suggestion to CEO, not hard limit
  editor: code               # opens memo on completion
  brief_required_sections:
    - situation
    - stakes
    - constraints
    - key question

paths:
  briefs:        .pi/ceo-board/briefs/
  deliberations: .pi/ceo-board/deliberations/
  memos:         .pi/ceo-board/memos/
  agents:        .pi/ceo-board/agents/
  expertise:     .pi/ceo-board/expertise/
  skills:        .pi/ceo-board/skills/

ceo:
  name: CEO
  path: .pi/ceo-board/agents/ceo.md
  model: anthropic/claude-opus-4-6      # best intelligence for the orchestrator
  color: "#7dcfff"
  expertise: .pi/ceo-board/expertise/ceo-scratch-pad.md
  skills:
    - .pi/ceo-board/skills/memo-writing.md
    - .pi/ceo-board/skills/mental-model.md

board:
  - name: Revenue
    path: .pi/ceo-board/agents/revenue.md
    model: anthropic/claude-sonnet-4-6
    color: "#ff7edb"
    expertise: .pi/ceo-board/expertise/revenue.md
    skills:
      - .pi/ceo-board/skills/mental-model.md
  - name: Technical Architect
    path: .pi/ceo-board/agents/tech-architect.md
    model: anthropic/claude-sonnet-4-6
    color: "#ff6e96"
    expertise: .pi/ceo-board/expertise/tech-architect.md
    skills:
      - .pi/ceo-board/skills/mental-model.md
  - name: Product Strategist
    path: .pi/ceo-board/agents/product-strategist.md
    model: anthropic/claude-sonnet-4-6
    color: "#fede5d"
    expertise: .pi/ceo-board/expertise/product-strategist.md
    skills:
      - .pi/ceo-board/skills/mental-model.md
  - name: Contrarian
    path: .pi/ceo-board/agents/contrarian.md
    model: anthropic/claude-sonnet-4-6
    color: "#ff9e64"
    expertise: .pi/ceo-board/expertise/contrarian.md
    skills:
      - .pi/ceo-board/skills/adversarial-analysis.md
      - .pi/ceo-board/skills/mental-model.md
  - name: Moonshot
    path: .pi/ceo-board/agents/moonshot.md
    model: anthropic/claude-sonnet-4-6
    color: "#72f1b8"
    expertise: .pi/ceo-board/expertise/moonshot.md
    skills:
      - .pi/ceo-board/skills/mental-model.md
```

Board members are toggled by commenting/uncommenting lines. The YAML is the
single source of truth.

---

## Agent Persona Format

Each agent is a `.md` file with frontmatter:

```markdown
---
name: Revenue
description: "Gravitational pull toward shipping, selling, and collecting money"
model: anthropic/claude-sonnet-4-6
color: "#ff7edb"
expertise:
  - path: .pi/ceo-board/expertise/revenue.md
    updatable: true
skills:
  - path: .pi/ceo-board/skills/mental-model.md
---

# Revenue Agent

You are the Revenue agent on the CEO's advisory board. Your gravitational
pull is toward shipping, selling, and collecting money.

## Temperament
Pragmatic, impatient with abstraction. "I want a version customers will pay
for in 90 days."

## How This Role Thinks
- Always quantify: revenue impact, time-to-money, unit economics
- Maximize within the next 90 days
- If it doesn't generate revenue or protect revenue, it's a distraction

## Reasoning Patterns
- Start from customer willingness-to-pay
- Work backwards from revenue target
- Challenge anything that doesn't have a clear monetization path

## Decision-Making Heuristics
- Ship > perfect
- Revenue now > revenue later (with exceptions for compounding plays)
- A paying customer's opinion > anyone's theory
```

The frontmatter `expertise` field points to a file the agent reads before
responding AND can update after responding. This creates the compounding
knowledge effect — the Revenue agent remembers it tends to clash with
Moonshot across sessions.

---

## Tools

### `converse` — The Core Tool

Registered for the CEO. Broadcasts a message to the board (or specific
members), collects their responses via parallel `complete()` calls, and
returns structured results.

```typescript
pi.registerTool({
  name: "converse",
  description: "Send a message to the board. Members respond with their analysis.",
  parameters: Type.Object({
    message: Type.String({ description: "CEO's message to the board" }),
    to: Type.Optional(Type.Array(Type.String(), {
      description: "Specific board members to address. Omit for all."
    })),
    final_round: Type.Optional(Type.Boolean({
      description: "If true, this is the last round. Members give final statements."
    })),
  }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // 1. Build conversation history from session entries
    // 2. For each targeted member:
    //    a. Load member persona (system prompt from .md)
    //    b. Load member expertise file
    //    c. Load member skills
    //    d. Call complete() with: system prompt + expertise + skills + conversation + CEO's message
    //    e. After response: optionally update member's expertise file
    // 3. Track cost/tokens per member
    // 4. Update widget with live stats
    // 5. Return structured responses to CEO
    //
    // All member calls run in PARALLEL (Promise.all)
    // Budget/time checked before and after

    return {
      content: [{ type: "text", text: formattedResponses }],
      details: { memberStats, totalCost, totalTokens },
    };
  },

  renderCall(args, theme, context) {
    // Show: "converse → Revenue, Tech Architect, Contrarian, ..."
  },

  renderResult(result, { expanded }, theme, context) {
    // Collapsed: summary of who said what (first line each)
    // Expanded: full responses with member names + colors
  },
});
```

### `end_deliberation` — Closing Tool

CEO calls this when ready to conclude. The extension:
1. Writes conversation.jsonl to deliberations dir
2. Signals the CEO to write the memo (via a follow-up message)
3. Records final stats

### Built-in Tools Available to CEO

The CEO also has access to pi's standard tools:
- `read` — read brief files, context files, previous memos
- `write` — write to scratchpad, write final memo
- `bash` — if needed (unlikely but available)

---

## Brief Format

```markdown
---
title: "Should we accept the $12M acquisition offer?"
date: 2026-04-11
---

## Situation
NutraHoldings, a PE roll-up, made a formal offer to acquire BlendStack
for $12M cash. 11x current ARR of $1M. Non-negotiable price. 30-day
expiration.

## Stakes
- Upside: Guaranteed $12M exit, founders keep 100%
- Downside: If we reject and growth stalls, we may never see this offer again
- Hidden: Revenue has decelerated for 5 consecutive quarters

## Constraints
- $180K cash on hand
- Team of 4 (all founders)
- No outside investors to consult
- 30-day decision window

## Key Question
Should we accept, reject, or counter the NutraHoldings acquisition offer?

## Context Files
- business-metrics.md
- product-overview.md
```

Required sections (from config): situation, stakes, constraints, key question.
Brief is validated on `/ceo-begin` — rejected if missing required sections.

Additional context files in the brief directory are loaded and provided to all
board members alongside the brief itself.

---

## Session Experience

```
$ pi
> /ceo-begin

CEO & Board — Strategic Decision-Making Agent Team

Time    5min    Budget  $5

Board
  ◆ CEO                 [opus-4.6    1M]
  ◆ Revenue             [sonnet-4.6  1M]
  ◆ Technical Architect  [sonnet-4.6  1M]
  ◆ Product Strategist   [sonnet-4.6  1M]
  ◆ Contrarian           [sonnet-4.6  1M]
  ◆ Moonshot             [sonnet-4.6  1M]

Select a brief:
  › 2026-04-11-acquisition-offer
    2026-04-08-api-architecture
    [New brief]

# After selection:
# 1. Extension overrides system prompt → CEO persona
# 2. Extension injects brief content + context files as a user message
# 3. CEO takes over: reads brief, frames decision, uses converse()
# 4. Extension monitors budget/time, injects warnings at thresholds
# 5. CEO calls end_deliberation() when ready
# 6. Memo opens in editor
# 7. Session reverts to normal (or stays as CEO for follow-up discussion)
```

**The user is an observer.** During deliberation, you watch the CEO work.
After the memo, the session can revert — letting you discuss the decision
with the LLM ("I disagree with the board on X, what if we...").

---

## Persistent Expertise — The Compounding Advantage

This is the key differentiator. Board members aren't stateless.

### How It Works

1. Before each `converse()` call, the extension reads each member's expertise
   file and injects it into their system prompt
2. After the member responds, if their expertise file is `updatable: true`,
   the member's response includes a `<mental_model_update>` block
3. The extension appends these updates to the expertise file
4. Over time, the Revenue agent accumulates patterns like:
   ```
   ## Patterns Observed
   - Moonshot and I disagree on time horizons in 4/5 deliberations
   - Contrarian's objections about scale have been valid 3/3 times
   - When Tech Architect flags "maintenance burden", Revenue impact follows
   
   ## Key Learnings
   - Acquisition offers: always check 5-quarter revenue trend first
   - Marketing spend: ROI inflects after month 3, not month 1
   ```

### Mental Model Skill

Injected into every board member. Teaches them how to maintain their expertise
file without being overprescriptive:

```markdown
# Mental Model Skill

After each deliberation response, reflect on:
1. What patterns did you notice in other members' arguments?
2. What surprised you?
3. What would you remember for next time?

Write a brief update (3-5 bullet points max) in a <mental_model_update> block.
Focus on high-level patterns, not specific details of this one brief.
```

---

## Constraint Enforcement

The extension monitors budget and time. It does NOT hard-stop the CEO mid-sentence.
Instead, it injects constraint signals as messages:

### At 80% budget/time:

```
[System] Budget advisory: $4.00 of $5.00 used (80%).
Consider wrapping up the deliberation. You can call end_deliberation()
when you've gathered enough perspectives, or converse() one more time
for final statements.
```

### At 100%:

```
[System] Budget limit reached: $5.00 of $5.00 used.
Please call end_deliberation() now and write the memo.
```

This gives the CEO the chance to cleanly close rather than being cut off.
The extension hard-stops only if the CEO ignores repeated signals (safety net).

---

## Extension API Surface

```typescript
// pi-mono imports
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { complete, type Message, type Model, type Api, type Context } from "@mariozechner/pi-ai";
import { Text, Container, Markdown } from "@mariozechner/pi-tui";

// Node stdlib
import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";  // npm dep
```

Key API calls:
```typescript
// Transform the session — override system prompt
pi.on("before_agent_start", (event, ctx) => {
  if (deliberationActive) {
    return { systemPrompt: ceoSystemPrompt };
  }
});

// Register /ceo-begin command
pi.registerCommand("ceo-begin", { handler: async (args, ctx) => { ... } });

// Register converse tool (only active during deliberation)
pi.registerTool({ name: "converse", ... });

// Register end_deliberation tool
pi.registerTool({ name: "end_deliberation", ... });

// Board member calls via complete()
const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
const response = await complete(model, context, { apiKey: auth.apiKey, signal });

// Inject constraint warnings mid-deliberation
pi.sendMessage({
  customType: "ceo-constraint",
  content: "Budget advisory: 80% used",
  display: true,
}, { deliverAs: "steer" });

// UI
ctx.ui.setWidget("ceo-board", lines, { placement: "belowEditor" });
ctx.ui.setStatus("ceo", "⏳ Board deliberating...");
ctx.ui.notify("Memo complete!", "info");

// Brief selection
const choice = await ctx.ui.select("Select a brief:", briefList);
const edited = await ctx.ui.editor("Edit Brief", template);

// Message renderer for board responses
pi.registerMessageRenderer("ceo-converse", (msg, opts, theme) => { ... });
pi.registerMessageRenderer("ceo-constraint", (msg, opts, theme) => { ... });
```

---

## Implementation Phases

### Phase 0 — Skeleton + Config
- [ ] Rename directory to `ceo-board/` (or create fresh, archive `pai-council/`)
- [ ] `package.json`, `tsconfig.json`, `.gitignore`
- [ ] `config.yaml` with 5 board members
- [ ] `src/config.ts` — YAML parser + types
- [ ] `src/agents.ts` — agent persona loader (frontmatter + body)
- [ ] `src/brief.ts` — brief parser + validation (required sections)
- [ ] `index.ts` — stub that registers `/ceo-begin` (prints "not yet")
- [ ] Verify: loads without errors

### Phase 1 — CEO System Prompt Override
- [ ] Write CEO agent persona (`ceo.md`)
- [ ] On `/ceo-begin`: select brief, validate, override system prompt
- [ ] `before_agent_start` hook: inject CEO system prompt when active
- [ ] Inject brief as first user message after override
- [ ] CEO can read files, write to scratchpad using built-in tools
- [ ] Verify: CEO receives brief and can frame the question

### Phase 2 — `converse()` Tool
- [ ] Write all board member personas (`.md` files)
- [ ] Create initial (empty) expertise files
- [ ] `src/converse.ts` — the core tool:
  - Parse `to` field (all members or specific)
  - Load each member's persona + expertise + skills
  - Build conversation context from session history
  - Call `complete()` in parallel for all targeted members
  - Collect responses, track cost/tokens
  - Return formatted results
- [ ] Custom `renderCall` + `renderResult` for converse
- [ ] Verify: CEO can converse with board, sees responses

### Phase 3 — Constraints + Widget
- [ ] `src/constraints.ts` — budget/time tracker
  - Track cumulative cost from converse results
  - Track wall-clock time from deliberation start
  - Emit warnings at 80% and 100% via `sendMessage`
- [ ] `src/widget.ts` — live status grid
  - Per-member: name, color, turns, cost, tokens, status
  - CEO on top, board in 2-col grid below
- [ ] Update widget after each converse call
- [ ] Verify: constraints fire, widget updates live

### Phase 4 — `end_deliberation()` + Memo
- [ ] Register `end_deliberation` tool
  - Write conversation.jsonl to deliberations dir
  - Write tool-calls.jsonl
  - Signal CEO to write memo (or auto-compose from transcript)
- [ ] `src/memo.ts` — generate memo skeleton from transcript
- [ ] CEO writes final memo (or extension writes and CEO reviews)
- [ ] Open memo in editor on completion
- [ ] Clear widget, clear status, revert system prompt
- [ ] Verify: full deliberation → memo flow works end-to-end

### Phase 5 — Persistent Expertise
- [ ] Mental model skill (`.md` file)
- [ ] After each converse response, extract `<mental_model_update>` blocks
- [ ] Append updates to each member's expertise file
- [ ] Load expertise into member's context on next converse call
- [ ] CEO scratchpad: CEO can write to it during deliberation, persists
- [ ] Verify: expertise files grow across multiple deliberations

### Phase 6 — Polish
- [ ] Brief template with required sections
- [ ] `/ceo-begin` shows brief selector (existing briefs + new)
- [ ] `/ceo-list` — list past deliberations with metadata
- [ ] `/ceo-view SESSION_ID` — view past memo (with autocomplete)
- [ ] Message renderer for `ceo-converse` (member colors, collapsed/expanded)
- [ ] Message renderer for `ceo-constraint` (warning styling)
- [ ] Session name set to brief title during deliberation
- [ ] Error handling: missing API keys, missing agent files, YAML errors
- [ ] Revert session cleanly if CEO errors out or user presses Esc

### Phase 7 — Advanced (Future)
- [ ] Board members can generate SVGs to argue their point
- [ ] TTS summary via ElevenLabs skill on CEO
- [ ] Backroom conversations: specific members converse privately
- [ ] Model diversity: mix providers (Opus CEO, Sonnet board, maybe GPT for one)
- [ ] `/ceo-config` command to edit board composition live
- [ ] Template briefs for common decision types (hiring, architecture, product)

---

## Board Member Designs

### CEO (`ceo.md`)
- **Model:** `anthropic/claude-opus-4-6` (best intelligence)
- **Role:** Reads brief, frames decision space, orchestrates debate, writes memo
- **Expertise:** Scratch pad for tracking argument evolution across rounds
- **Key behavior:** "You are NOT a participant. You are the facilitator and
  final decision-maker. Frame the question, surface real tensions, push back
  on weak arguments, and synthesize into a decisive memo."

### Revenue (`revenue.md`)
- **Model:** `anthropic/claude-sonnet-4-6`
- **Temperament:** Pragmatic, impatient with abstraction
- **Lens:** Revenue impact, time-to-money, unit economics
- **Key line:** "I want a version customers will pay for in 90 days"

### Technical Architect (`tech-architect.md`)
- **Model:** `anthropic/claude-sonnet-4-6`
- **Temperament:** Methodical, scale-aware, maintenance-conscious
- **Lens:** System design, dependencies, tech debt, second-order failures
- **Key line:** "What breaks at scale? What's the maintenance burden in year 2?"

### Product Strategist (`product-strategist.md`)
- **Model:** `anthropic/claude-sonnet-4-6`
- **Temperament:** User-obsessed, outcome-oriented
- **Lens:** User value, competitive positioning, time-to-value
- **Key line:** "Who benefits and how much? Does this compound?"

### Contrarian (`contrarian.md`)
- **Model:** `anthropic/claude-sonnet-4-6`
- **Temperament:** Sharp, provocative, substantive
- **Lens:** Find the strongest case AGAINST consensus
- **Key line:** "What if we're solving the wrong problem?"
- **Special:** Always speaks last in final round

### Moonshot (`moonshot.md`)
- **Model:** `anthropic/claude-sonnet-4-6`
- **Temperament:** Visionary, long-horizon, risk-tolerant
- **Lens:** 10x moves, category-defining bets, what-if-we-think-bigger
- **Key line:** "What if we're thinking too small?"

---

## Relationship to Other Extensions

### pi-subagents (separate concern)
pi-subagents is for **task delegation**: spawn → execute → return.
CEO & Board is for **strategic deliberation**: question → debate → decide.
They don't overlap. A CEO & Board deliberation might conclude with "delegate
implementation to engineering via subagents" — but the deliberation itself
doesn't use subagents. Board members are `complete()` calls, not processes.

### pi-teams (not needed)
pi-teams is for persistent multi-agent development teams with terminal panes.
CEO & Board is a time-boxed deliberation (2-10 minutes), not a persistent team.
Different paradigm entirely.

### Dan's multi-team system (video 2)
Dan's three-tier orchestrator → leads → workers system is a separate concept
for large-scale engineering work. If we build that, it would be a separate
extension. CEO & Board stays focused: uncertainty in, decision out.

---

## Key Design Decisions

1. **CEO is the session agent, not a subprocess.** This gives the CEO full
   tool access and agency. The extension modifies the session, it doesn't
   spawn a separate process.

2. **Board members are `complete()` calls, not processes.** They don't need
   tools — they analyze and respond. Keeping them as API calls is faster,
   cheaper, and simpler than spawning pi processes.

3. **Constraints are soft signals, not hard stops.** The CEO gets warnings
   and decides how to close cleanly. Only a safety-net hard stop if ignored.

4. **Expertise persists across sessions.** This is the compounding advantage.
   Board members get smarter about YOUR decisions over time.

5. **YAML is the single source of truth.** Toggle members by commenting lines.
   No code changes needed to reconfigure the board.

6. **Session reverts after deliberation.** You can discuss the memo with the
   LLM afterwards. The extension doesn't lock you in.

7. **Brief validation enforces structure.** Required sections ensure the CEO
   and board get enough context to make a real decision. Don't submit lazy
   two-sentence prompts.

---

## Known Risks & Implementation Gotchas

Critical items to get right during implementation. None are blockers — all
are solvable — but ignoring them will cause subtle bugs or bad UX.

### 1. System prompt override timing

`before_agent_start` fires on **every** user prompt. We need state:
`deliberationActive = true` after `/ceo-begin`, and the hook checks this flag.

**The problem:** What happens if the user types something mid-deliberation?
The CEO is driving — user input would interrupt the agent loop.

**Solution:** During active deliberation, intercept the `input` event and
either block user input entirely (Dan's approach — only `/ceo-begin` accepted)
or treat user input as "steering" messages to the CEO (e.g., "push harder
on the revenue angle"). Blocking is simpler and matches the one-shot design.

```typescript
pi.on("input", (event, ctx) => {
  if (deliberationActive && !event.text.startsWith("/ceo")) {
    ctx.ui.notify("Deliberation in progress — observe or /ceo-stop to abort", "warning");
    return { action: "handled" };
  }
});
```

### 2. Conversation history reconstruction for `converse()`

Each `converse()` call needs the full history of what's been said. Board
members don't see pi's session — they get a `complete()` call with a
constructed `messages` array.

The conversation naturally lives in pi session entries (CEO messages +
`converse` tool results). We need to reconstruct "the debate so far" from
`ctx.sessionManager.getEntries()` by extracting:
- CEO's messages to the board (from converse tool call args)
- Board member responses (from converse tool results)
- CEO's framing/analysis (from assistant messages between tool calls)

**Approach:** Maintain an in-memory `conversationLog: TranscriptEntry[]`
inside the extension. Append to it after each `converse()` call. Pass the
full log to each member on subsequent calls. Also write it to the JSONL
file for persistence.

Don't rely on `ctx.sessionManager.getEntries()` for reconstruction — it's
complex to parse and may include compacted entries. Keep our own log.

### 3. Board member expertise updates — extraction reliability

The plan says members include `<mental_model_update>` blocks in their
responses, and the extension extracts and appends them.

**The problem:** LLMs are not deterministic tag emitters. The model might:
- Forget the tag entirely
- Format it slightly differently (`<mental-model-update>`, `## Mental Model`)
- Include it mid-response instead of at the end

**Solution:** Graceful extraction with fallback.
```typescript
function extractMentalModelUpdate(response: string): string | null {
  // Try XML-style tag first
  const xmlMatch = response.match(/<mental_model_update>([\s\S]*?)<\/mental_model_update>/i);
  if (xmlMatch) return xmlMatch[1].trim();
  // Try markdown heading fallback
  const mdMatch = response.match(/## Mental Model Update\n([\s\S]*?)(?=\n## |$)/i);
  if (mdMatch) return mdMatch[1].trim();
  // No update found — that's fine, skip silently
  return null;
}
```
Never crash or lose the response if the tag is missing. The expertise update
is a nice-to-have per round, not a requirement.

### 4. Cost tracking — two streams

`complete()` returns `AssistantMessage` with `.usage.cost.total` per board
member call. The CEO's own cost is tracked by pi's normal session.

**We're tracking two cost streams:**
- CEO cost: automatic via pi session (visible in footer)
- Board member cost: from `converse()` tool results (our tracking)

The constraint system needs the **sum** of both. CEO cost can be approximated
from `ctx.getContextUsage()` but this only shows the last turn, not cumulative.

**Solution:** Track board costs precisely in the converse tool (sum all
`complete()` costs). For CEO cost, use a rough estimate based on turns × average
cost. Inject the combined number into constraint checks. The widget should
show both: CEO cost separate from board cost.

Alternatively, hook into `turn_end` to capture CEO's per-turn cost from
`event.message.usage` and accumulate it.

### 5. Model availability — graceful fallback

The config specifies `anthropic/claude-opus-4-6` for CEO. If Lars is on
Bedrock (different model IDs) or doesn't have Opus, the whole thing fails.

**Solution:** Model resolution chain:
1. Try the exact model from config (`ctx.modelRegistry.find(provider, id)`)
2. Try without provider prefix (search all providers for the model ID)
3. Fall back to the session's current model (`ctx.model`)
4. Surface a clear warning: "Configured model X not found, using Y instead"

For board members, falling back to the session model is fine — Sonnet is
Sonnet whether it's Anthropic direct or Bedrock.

### 6. Session revert after deliberation

The `before_agent_start` hook overrides the system prompt while
`deliberationActive === true`. After `end_deliberation()`, we set it to
`false` and the next `before_agent_start` call returns nothing (normal
system prompt restored).

**Edge cases:**
- User presses Esc during deliberation → catch abort, set `deliberationActive = false`
- CEO errors out mid-deliberation → `try/catch` in the agent loop, revert state
- Session compaction during deliberation → unlikely but register a
  `session_before_compact` handler that blocks compaction while active
- `/new` or `/resume` during deliberation → `session_before_switch` handler
  cleans up state

Also need to re-enable any tools that were disabled. If we used
`pi.setActiveTools()` to restrict to converse/end_deliberation, we need
to restore the full tool set on revert.

### 7. Parallel converse + abort signal

All board members are called in parallel via `Promise.all()`. If the user
presses Esc, `ctx.signal` fires.

**Problem:** `complete()` calls may be mid-flight. Some may have responded,
some may not.

**Solution:** Pass `signal` to every `complete()` call. Use `Promise.allSettled()`
instead of `Promise.all()` so we can collect partial results. On abort:
- Return whatever responses we got ("3 of 5 members responded before abort")
- Don't crash the tool — return a partial result with an abort notice
- Let the CEO decide what to do with partial information

```typescript
const results = await Promise.allSettled(
  members.map(m => callMember(m, conversation, signal))
);
const responses = results
  .filter((r): r is PromiseFulfilledResult => r.status === "fulfilled")
  .map(r => r.value);
const aborted = results.filter(r => r.status === "rejected").length;
```

### 8. The "observer" UX during deliberation

During deliberation, the user watches the CEO work. The CEO's messages
stream normally via pi's TUI. `converse()` tool results show board responses.

**This should work naturally** — it's just the CEO making tool calls. The
user sees assistant messages (CEO thinking) and tool results (board responses)
exactly like watching any agent work.

**Potential confusion:** When the deliberation ends and the session reverts,
the user needs a clear signal that it's "their turn" again.

**Solution:** After revert, inject a visible message:
```
══════════════════════════════════════════════════
  Deliberation complete. Memo written to: [path]
  Session restored — you can now discuss the memo.
══════════════════════════════════════════════════
```
And clear the widget/status to visually signal the transition.

---

## Notes for Future Sessions

- **pi import path:** `@mariozechner/pi-coding-agent`
- **`complete()` from:** `@mariozechner/pi-ai` — `complete(model, context, options)`
- **`Context` type:** `{ systemPrompt?: string; messages: Message[] }`
- **`ResolvedRequestAuth`:** discriminated union — check `result.ok` before accessing `.apiKey`
- **Model resolution:** `ctx.modelRegistry.find(provider, modelId)` — returns `Model<Api> | undefined`
- **System prompt override:** return `{ systemPrompt: ... }` from `before_agent_start` handler
- **Tool activation:** use `pi.setActiveTools()` to enable converse/end_deliberation only during deliberation
- **Session ID:** `Math.random().toString(36).slice(2, 8)` — 6 char alphanumeric
- **Widget placement:** `ctx.ui.setWidget(key, lines[], { placement: "belowEditor" })`
- **Extension base dir:** `path.dirname(new URL(import.meta.url).pathname)`
- **YAML parsing:** `js-yaml` npm dep, `yaml.load(raw)` returns parsed object
- **ThemeColor type:** use `any` for theme.fg binding to avoid ThemeColor union issues
