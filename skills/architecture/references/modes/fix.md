# Mode: fix

Apply common Clean Architecture fixes via guided refactoring patterns.

## Process

1. Identify the violation type from arguments (or scan with `check` mode first)
2. Read the affected file
3. Apply the appropriate fix pattern below
4. Verify fix does not break imports
5. Run `check` mode to verify

## Common Fixes

### Fix 1: Domain Layer Framework Import

**Violation:** Framework dependency in domain layer (e.g., `from pydantic import BaseModel`)

**Fix:** Replace with pure Python constructs

```python
# BEFORE
from pydantic import BaseModel

class Entity(BaseModel):
    id: str
    name: str

# AFTER
from dataclasses import dataclass
from uuid import UUID, uuid4

@dataclass
class Entity:
    id: UUID
    name: str

    @classmethod
    def create(cls, name: str) -> "Entity":
        return cls(id=uuid4(), name=name)
```

### Fix 2: Service Importing ORM Model

**Violation:** Service layer imports concrete ORM model directly

**Fix:** Use domain entity via repository abstraction

```python
# BEFORE
from myapp.models.order import OrderModel

async def get_order(self, order_id):
    model = await self.session.get(OrderModel, order_id)
    return model

# AFTER
from myapp.domain.entities import Order

async def get_order(self, order_id: UUID) -> Optional[Order]:
    async with self.uow:
        return await self.uow.orders.get(order_id)
```

### Fix 3: Repository Using commit()

**Violation:** Repository calls `commit()` directly instead of letting UoW manage transactions

**Fix:** Use `flush()`, let UoW control commit boundary

```python
# BEFORE
async def add(self, entity):
    self.session.add(model)
    await self.session.commit()  # WRONG — repo should not own transaction

# AFTER
async def add(self, entity):
    self.session.add(model)
    await self.session.flush()  # UoW will commit at boundary
```

### Fix 4: Agent / Workflow Hardcoding Adapter

**Violation:** Workflow node directly instantiates a concrete adapter

**Fix:** Inject adapter via parameter using `functools.partial`

```python
# BEFORE
async def research_node(state: dict):
    adapter = ConcreteSearchAdapter()  # Hardcoded — untestable

# AFTER
async def research_node(
    state: dict,
    search_adapter: AbstractSearchSource = None
) -> dict:
    if search_adapter:
        results = await search_adapter.search(...)
    return {"research_notes": results}

# In graph builder — wire via partial:
from functools import partial
research = partial(research_node, search_adapter=container.get_search_adapter())
```

### Fix 5: Prompt Embedded in Node

**Violation:** LLM prompt string hardcoded inside a workflow node

**Fix:** Externalize to domain prompts or a prompt registry

```python
# BEFORE
async def generate_node(state, ai_service):
    prompt = f"""You are an expert assistant.
    INPUT: {state['query']}
    ..."""

# AFTER — externalized prompt
from myapp.domain.prompts import GENERATION_PROMPT

async def generate_node(state, ai_service):
    prompt = GENERATION_PROMPT.format(
        query=state["query"],
        context="\n".join(state["context_notes"]),
    )
    response = await ai_service.generate(prompt)
    return {"output": response}
```
