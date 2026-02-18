# Mode: design-module

Design a new module following Clean Architecture patterns.

## Process

### 1. Discover Existing Structure

Before designing, scan the project to understand conventions:
- Glob for existing domain entities, services, repositories, API endpoints
- Note naming conventions, file organization, base classes used

### 2. Gather Requirements

Ask for (if not provided in arguments):
- Module purpose
- External APIs/services needed
- Domain entities involved
- Operations to support (CRUD, queries, async jobs, etc.)

### 3. Design Domain Layer First

```python
# <root>/domain/entities.py (or dedicated file)
from dataclasses import dataclass
from uuid import UUID, uuid4

@dataclass
class NewEntity:
    """Domain entity — pure Python, no frameworks."""
    id: UUID
    # ... fields

    @classmethod
    def create(cls, ...) -> "NewEntity":
        """Factory method for creation."""
        return cls(id=uuid4(), ...)
```

```python
# <root>/domain/repositories.py (add interface)
from abc import ABC, abstractmethod

class AbstractNewEntityRepository(ABC):
    @abstractmethod
    async def add(self, entity: NewEntity) -> NewEntity: ...
    @abstractmethod
    async def get(self, entity_id: UUID) -> Optional[NewEntity]: ...
```

### 4. Design Adapter Interface (if external API needed)

```python
# <root>/adapters/interfaces.py
class AbstractExternalAdapter(ABC):
    @abstractmethod
    async def fetch_data(self, query: str) -> List[dict]: ...
```

### 5. Design Service Layer

```python
# <root>/services/new_service.py
class NewService:
    def __init__(self, uow: AbstractUnitOfWork, adapter: AbstractExternalAdapter = None):
        self.uow = uow
        self.adapter = adapter

    async def create_entity(self, data: dict) -> NewEntity:
        entity = NewEntity.create(**data)
        async with self.uow:
            await self.uow.new_entities.add(entity)
            await self.uow.commit()
        return entity
```

### 6. Design Infrastructure

```python
# <root>/infrastructure/repositories/new_repository.py
class SqlAlchemyNewEntityRepository(AbstractNewEntityRepository):
    def __init__(self, session: AsyncSession):
        self.session = session

    async def add(self, entity: NewEntity) -> NewEntity:
        model = self._to_model(entity)
        self.session.add(model)
        await self.session.flush()  # NOT commit — UoW owns the transaction
        return self._to_domain(model)

    def _to_model(self, entity: NewEntity) -> NewEntityModel: ...
    def _to_domain(self, model: NewEntityModel) -> NewEntity: ...
```

### 7. Design API Endpoint

```python
# <root>/api/endpoints/new_endpoint.py
router = APIRouter()

@router.post("/new-entities")
async def create_entity(
    request: CreateNewEntityRequest,
    service: NewService = Depends(get_new_service),
):
    entity = await service.create_entity(request.model_dump())
    return NewEntityResponse.model_validate(entity)
```

### 8. Update DI Container

```python
# In your container / dependency wiring
def create_new_service(self, uow: AbstractUnitOfWork) -> NewService:
    return NewService(uow, adapter=self.get_external_adapter())
```

## Output Template

```markdown
## Module Design: [Name]

### Purpose
[Brief description]

### Files to Create
1. `<root>/domain/...` — Domain entities
2. `<root>/adapters/...` — Adapter interface + implementation
3. `<root>/infrastructure/repositories/...` — Repository
4. `<root>/services/...` — Service
5. `<root>/api/endpoints/...` — API endpoint
6. `<root>/schemas/...` — Request/response models

### Domain Model
[Code snippet]

### Service Interface
[Code snippet]

### Implementation Order
1. Domain entities (no dependencies)
2. Repository interface + implementation
3. Adapter interface + implementation (if needed)
4. Service
5. API endpoint
6. Tests

### Integration Checklist
- [ ] Update DI container with factory method
- [ ] Update dependency provider with new service
- [ ] Update Unit of Work with new repository
- [ ] Add to API router
```
