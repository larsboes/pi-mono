# [Is it safe to do X]

## Situation
We're considering: [the action/change/deployment/decision]
Current state: [what exists, what works, what depends on it]
Motivation: [why we want to do this — benefit, necessity]

## Stakes
**If it goes well:** [expected benefit, time saved, capability gained]
**If it goes wrong:** [blast radius — who's affected, how badly, for how long]
**Worst realistic case:** [not worst imaginable, but worst plausible scenario]
**Recovery path:** [how would we fix it if it breaks]

## Constraints
- Rollback capability: [can we undo this? how fast?]
- Detection time: [how quickly would we know something's wrong]
- Blast radius: [% of users/systems affected if it fails]
- Timing: [is there a safer window to do this]

## Key Question
Is the risk profile acceptable given our recovery capabilities, and what guardrails would make this safe enough to proceed?
