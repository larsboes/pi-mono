# Learning Path Template

Use this to structure a learning path for any skill.

## Template

```markdown
# Learning Path: [Skill Name]

## Goal
[Specific, measurable outcome — not "learn X" but "understand X well enough to build Y"]

## Prerequisites
- [What you need to know first]
- [Current gaps to address]

## Estimated Timeline
[e.g., "8 weeks, 5-8 hours/week" or "ongoing, 2 hours/week"]

## Phase 1: Foundations (Week 1-2)
**Objective:** [What you'll understand after this phase]

**Resources:**
- [ ] [Official docs / Course] - [time estimate]
- [ ] [Official docs / Course] - [time estimate]

**Practice:**
- [ ] [Hands-on exercise 1]
- [ ] [Hands-on exercise 2]

**Milestone:** [How to know you're ready for Phase 2]
[e.g., "Build a simple [project] that compiles without errors"]

## Phase 2: Core Skills (Week 3-4)
**Objective:** [Build on foundations, add depth]

**Resources:**
- [ ] [Resource] - [time estimate]

**Practice:**
- [ ] [Exercise]

**Milestone:** [Proof you've internalized this]

## Phase 3: Applied Practice (Week 5-6)
**Objective:** [Combine skills in realistic scenario]

**Project:**
Build [concrete project] that demonstrates:
- [ ] Feature A
- [ ] Feature B
- [ ] Feature C

**Milestone:** [Project complete and working]

## Phase 4: Advanced/Specialization (Week 7+)
**Objective:** [Go deeper or wider]

**Options:**
- [ ] Deep dive into [specific area]
- [ ] Apply to [larger project]
- [ ] Contribute to [open source]

## Portfolio Projects

Suggested projects to solidify learning:

1. **Beginner:** [Simple project, 1-2 hours]
   - Demonstrates: [Core concept]
   - Materials needed: [Tools, libraries]

2. **Intermediate:** [Medium project, 4-6 hours]
   - Demonstrates: [Multiple concepts integrated]
   - Portfolio-worthy? Maybe

3. **Portfolio-Worthy:** [Substantial project, 20+ hours]
   - Demonstrates: [Deep expertise]
   - Shows employers/community: [Value]
   - Shareable? (GitHub, blog, talk)

## Success Criteria

You'll know you've succeeded when you can:
- [ ] Explain [concept] to a colleague without notes
- [ ] Build [project] without looking up basics
- [ ] Troubleshoot [common problem] on your own
- [ ] Evaluate [competing tools/approaches] objectively

## Next Steps

After completing this path:
1. [Build larger project / apply to job / speak about it]
2. [Teach someone else / write about it]
3. [Go deeper in [specific area]]
```

## Examples

### Example 1: Learning Kubernetes (2 weeks)

**Phase 1: Concepts (Days 1-3)**
- Resources: Official Kubernetes docs (Pods, Services, Deployments)
- Practice: Read, take notes, diagram relationships
- Milestone: Can explain pods, services, deployments in 5 minutes

**Phase 2: Local Cluster (Days 4-7)**
- Resources: kind/minikube setup, official tutorials
- Practice: Deploy sample apps locally
- Milestone: Can start cluster, deploy app, see it running

**Phase 3: Real Application (Days 8-12)**
- Project: Deploy a small web app you've built
- Demonstrates: Dockerfile → image → deployment → service
- Milestone: App runs on your cluster, accessible from browser

**Phase 4: Production Thinking (Days 13+)**
- Explore: Networking, storage, monitoring, scaling
- Read: Advanced Kubernetes books or courses
- Option: Contribute to open source Kubernetes projects

### Example 2: Learning RAG (4 weeks)

**Phase 1: Concepts (Week 1)**
- Resources: Ray, LlamaIndex docs; papers on retrieval
- Practice: Understand the pipeline (embed → retrieve → generate)
- Milestone: Can diagram a RAG system

**Phase 2: Build Simple System (Week 2)**
- Project: RAG over a single PDF, get answers via LLM
- Demonstrates: Embedding, chunking, retrieval, generation
- Milestone: Working system with reasonable answers

**Phase 3: Production Concerns (Week 3)**
- Explore: Chunking strategies, embedding quality, prompt engineering
- Project: Improve answer quality (try different embedders, chunk sizes)
- Milestone: System has <30s latency, accurate answers

**Phase 4: Deep Dive (Week 4+)**
- Options:
  - Graph-based RAG (knowledge graphs + retrieval)
  - Multi-hop reasoning (agent that queries multiple sources)
  - Evaluation frameworks (measure RAG quality)
