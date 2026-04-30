# Swarm Interactive Testing Checklist

Manual test script for the `/swarm` extension. Static + non-interactive
subcommands have been smoke-tested separately (extension loads, registers
commands, lists briefs, handles unknown IDs). This doc covers paths that
require a live pi session with real `modelRegistry` + API keys.

**When to run:** before shipping anything that touches `src/dialogue.ts`,
`src/pipeline.ts`, `index.ts` handlers, or after an upstream pi-coding-agent
merge that changed the `ExtensionAPI` surface.

---

## Preconditions

- Working pi install (`which pi` resolves; test with `pi --version`)
- `~/.pi/agent/extensions/swarm` symlinked to this extension
- At least one provider with funded API key (Bedrock / Anthropic direct / etc.)
- Agent personas present in `extensions/swarm/.pi/swarm/agents/`
  (should contain `ceo.md` + ≥1 board member file)
- `~/.pi/agent/extensions/swarm/config.yaml` present with
  `max_time_minutes` and `max_budget` set

Run once at start: `ls ~/Developer/pi-mono/extensions/swarm/.pi/swarm/agents/`
should list `ceo.md`, `contrarian.md`, `moonshot.md`,
`product-strategist.md`, `revenue.md`, `tech-architect.md`.

---

## Test A — `/swarm quick <topic>` (one-round parallel debate)

Lightest path. Each board agent answers in parallel, no dialogue state
between rounds.

1. Start pi in an empty scratch dir (e.g. `cd /tmp/swarm-test && pi`)
2. Run: `/swarm quick Should I use Rust or Go for a CLI tool?`
3. **Expect:**
   - Status line shows `⏳ Board perspectives...`
   - 3–5 responses stream in from different named agents
   - Each response has a distinct voice (contrarian disagrees, revenue
     focuses on cost, etc.)
   - Final summary shows total cost and elapsed time
4. **Pass criteria:**
   - ≥3 responses received (fewer = some parallel calls failed silently)
   - No exception thrown, no "undefined" in output
   - Cost > 0 and < $0.50 for a one-liner topic
5. **Common failures:**
   - "No agents in ..." → personas dir missing, re-run link-extensions.sh
   - "auth failed" → API key for default provider not set in `~/.pi/auth.json`
   - Empty responses → model not resolving, check `pi list`

---

## Test B — `/swarm begin` (interactive CEO deliberation)

The core untested path. Session takeover + converse() + end_deliberation()
+ auto-revert.

### B.1 Brief selection

1. `cd /tmp/swarm-test && pi`
2. Run: `/swarm begin`
3. **Expect** (on first run): editor opens with the brief template
4. Fill in all four sections (Situation / Stakes / Constraints / Key Question)
   with a concrete micro-question, e.g.:
   ```
   # Should I split our monolith now?

   ## Situation
   8-person team, 300k LOC monolith, deploy takes 20 min.

   ## Stakes
   Upside: faster team velocity. Downside: 3-month split, ops complexity.

   ## Constraints
   Q2 feature roadmap is fixed. One senior eng available for split work.

   ## Key Question
   Split now or defer 6 months?
   ```
5. Save + exit editor
6. **Pass criteria:**
   - No "Brief missing: situation, stakes…" error (all sections detected)
   - Status line shows `⏳ <title> — Session <id>`
   - Widget appears below editor showing board member names + time/budget

### B.2 CEO deliberation

1. Observe the CEO (the current pi agent, now running with CEO system prompt)
   reads the brief and frames the decision
2. **Expect:** CEO makes one or more `converse()` tool calls
3. **Pass criteria:**
   - `converse()` tool appears in the transcript (label "Converse")
   - Each call returns named responses from board members
   - Widget updates to show per-member turn count + cost
   - Cost stays under `$max_budget` from config (abort if it doesn't)

### B.3 End deliberation

1. After a few rounds, CEO should call `end_deliberation()`
2. **Expect:**
   - Tool returns path to memo.md and transcript.md
   - CEO then uses `write` to create the memo file
3. **Pass criteria:**
   - Files exist at `extensions/swarm/.pi/swarm/<output>/<session-id>/`:
     - `memo.md` (final decision, written by CEO)
     - `transcript.md` (raw dialogue log)
   - Auto-revert fires within ~500ms of the write — message
     "Deliberation complete. Memo written. Session restored." appears
   - Status line clears; widget removed
   - `pi.getActiveTools()` returns the original tool set (converse +
     end_deliberation no longer listed)

### B.4 Post-deliberation

1. Run `/swarm list`
2. **Pass criteria:** the session just ended appears in the list
3. Run `/swarm view <session-id>`
4. **Pass criteria:** memo renders correctly

---

## Test C — `/swarm stop` (abort mid-deliberation)

1. Run `/swarm begin` → accept a brief
2. While CEO is mid-converse, run `/swarm stop`
3. **Pass criteria:**
   - "Deliberation aborted. Session restored." notification
   - Widget/status cleared
   - `pi.getActiveTools()` restored
   - No orphan widget after next `/swarm begin`

---

## Test D — `/swarm run <yaml>` (unattended pipeline)

Requires a swarm YAML. Example at `extensions/swarm/examples/` if present,
otherwise write a minimal one:

```yaml
name: test-pipeline
workspace: ./workspace
targetCount: 1
mode: sequential
agents:
  - name: summarizer
    role: Summarizer
    task: Summarize the README.md in 3 bullet points.
    dialogue: false
    maxRounds: 1
```

1. `pi` in a dir with a README.md
2. `/swarm run test.yaml`
3. **Pass criteria:**
   - Widget shows progress bar for each wave
   - Completion message: `'test-pipeline' completed | 1/1 iterations | elapsed: …`
   - No cycle-detection error
   - `workspace/` contains agent outputs

---

## Sign-off

| Test | Date | Result | Notes |
|------|------|--------|-------|
| A — quick | | | |
| B.1 — brief | | | |
| B.2 — CEO deliberation | | | |
| B.3 — end + auto-revert | | | |
| B.4 — list + view | | | |
| C — stop | | | |
| D — run yaml | | | |

When all tests pass with at least one model provider, PLAN.md item 4
("Swarm — Interactive Dialogue Testing") is complete.
