# Mode: design-workflow

Design an agent/LLM workflow with proper dependency injection and externalized prompts.

## Process

### 1. Discover Existing Structure

Scan the project for existing workflows, node patterns, and DI conventions:
- Glob for workflow/graph files, node implementations, prompt templates
- Note how existing workflows inject dependencies

### 2. Gather Requirements

Ask for (if not provided in arguments):
- Workflow purpose
- Input/output requirements
- External data sources needed
- Should it be iterative (critique/refine loops)?

### 3. Design State Schema

```python
# <root>/agents/new_workflow.py
from typing import TypedDict, Annotated, List, Optional
from operator import add

class NewWorkflowState(TypedDict):
    """State passed between nodes."""

    # --- Inputs (set once at start) ---
    input_field: str
    config_field: Optional[dict]

    # --- Working Memory (accumulated via reducer) ---
    research_notes: Annotated[List[str], add]

    # --- Current Output (overwritten each revision) ---
    output: Optional[dict]

    # --- Metadata ---
    revision_count: int
    error: Optional[str]
```

### 4. Design Nodes

Each node should:
- Accept `state: dict` as first parameter
- Accept injected services as optional keyword parameters
- Return a dict with state updates only

```python
# <root>/agents/nodes/new_nodes.py
async def research_node(
    state: dict,
    search_adapters: List[AbstractDataSource] = None
) -> dict:
    """Gather data for the workflow."""
    notes = []
    for adapter in (search_adapters or []):
        results = await adapter.search(state["input_field"])
        notes.extend(results)
    return {"research_notes": notes}

async def generate_node(
    state: dict,
    ai_service: AbstractAIService = None
) -> dict:
    """Generate output using LLM."""
    prompt = prompt_registry.render("new_workflow.generate", **state)
    response = await ai_service.generate(prompt)
    return {"output": parse_response(response)}
```

### 5. Design Graph Structure

```python
from functools import partial
from langgraph.graph import StateGraph, START, END

def build_new_workflow_graph(
    ai_service: AbstractAIService = None,
    search_adapters: List[AbstractDataSource] = None
) -> StateGraph:
    """Build the workflow graph with injected dependencies."""
    workflow = StateGraph(NewWorkflowState)

    # Create nodes with injected services via partial
    research = partial(research_node, search_adapters=search_adapters)
    generate = partial(generate_node, ai_service=ai_service)

    # Add nodes
    workflow.add_node("research", research)
    workflow.add_node("generate", generate)

    # Define flow
    workflow.add_edge(START, "research")
    workflow.add_edge("research", "generate")
    workflow.add_edge("generate", END)

    return workflow.compile(checkpointer=get_checkpointer())
```

### 6. Design Prompts (Externalized)

Store prompts outside code — YAML, Jinja2 templates, or a prompt registry:

```yaml
# prompts/new_workflow/generate.yaml
id: new_workflow.generate.v1
name: New Workflow Generator
version: 1.0.0
variables: [input_field, research_notes]
template: |
  You are an expert...

  INPUT: {{ input_field }}

  RESEARCH:
  {{ research_notes | join('\n') }}

  Generate a response in JSON format.
```

### 7. Service Integration

```python
# <root>/services/workflow_service.py
async def run_new_workflow(self, input_data: dict) -> dict:
    from myapp.agents.new_workflow import build_new_workflow_graph

    graph = build_new_workflow_graph(
        ai_service=container.get_ai_service(),
        search_adapters=container.get_search_adapters()
    )

    result = await graph.ainvoke(
        initial_state,
        config={"configurable": {"thread_id": str(uuid4())}}
    )
    return result
```

## Output Template

```markdown
## Workflow Design: [Name]

### Purpose
[Brief description]

### State Schema
[TypedDict definition]

### Nodes
1. **research_node** — [Purpose], injected: search_adapters
2. **generate_node** — [Purpose], injected: ai_service

### Flow Diagram
```
START -> research -> generate -> END
```

### Files to Create
1. `<root>/agents/new_workflow.py` — Graph definition + state
2. `<root>/agents/nodes/new_nodes.py` — Node implementations
3. `prompts/new_workflow/*.yaml` — Prompt templates
4. `<root>/services/workflow_service.py` — Service integration

### Injection Points
| Node | Service | Purpose |
|------|---------|---------|
| research | search_adapters | Data gathering |
| generate | ai_service | LLM calls |

### API Endpoint
POST /api/v2/workflows/new-workflow/invoke
```
