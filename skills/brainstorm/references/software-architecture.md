# Software Architecture & Engineering

Use this reference when brainstorming technical systems, designing software, or evaluating codebases. Prioritize **Clean Architecture** and **Future-Proofing** through rigorous application of **SOLID** and **Domain-Driven Design (DDD)** principles.

## The Engineering Loop
1.  **Clarify Goals:** What is the underlying problem? Is the proposed solution actually solving it?
2.  **Explore Options:** Generate at least 2-3 distinct approaches (e.g., Monolith vs. Microservices, SQL vs. NoSQL).
3.  **Evaluate Trade-offs:** Compare options using explicit dimensions (Complexity, Cost, Maintenance, Scalability, Latency).
4.  **Identify Failure Modes:** Conduct a "Pre-Mortem". What are the edge cases? How does it fail under load?
5.  **Recommend & Plan:** Propose a concrete path forward that balances immediate needs with long-term maintainability.

## Core Design Principles

### 1. SOLID (Object-Oriented Design)
- **S - Single Responsibility Principle (SRP):** A class/module should have one, and only one, reason to change.
- **O - Open/Closed Principle (OCP):** Software entities should be open for extension, but closed for modification.
- **L - Liskov Substitution Principle (LSP):** Subtypes must be substitutable for their base types.
- **I - Interface Segregation Principle (ISP):** Many client-specific interfaces are better than one general-purpose interface.
- **D - Dependency Inversion Principle (DIP):** Depend on abstractions, not concretions.

### 2. Domain-Driven Design (DDD)
- **Ubiquitous Language:** Use the same terminology in code as the business experts use.
- **Bounded Contexts:** Explicitly define the boundaries within which a particular model applies.
- **Entities vs. Value Objects:** Distinguish between objects defined by identity (User) and those defined by attributes (Address).
- **Aggregates:** Cluster domain objects that can be treated as a single unit.
- **Repositories:** Abstract the storage mechanism (DB) from the domain logic.

### 3. Clean Architecture
- **Dependency Rule:** Source code dependencies can only point inwards. Nothing in an inner circle can know anything at all about something in an outer circle.
- **Separation of Concerns:** Keep UI, Database, and Frameworks decoupled from Business Logic.

## Other Key Heuristics
- **YAGNI (You Aren't Gonna Need It):** Challenge complexity. Start simple, but design for extension.
- **Gall's Law:** Complex systems that work evolved from simple systems that worked.
- **Chesterton's Fence:** Understand why something exists before removing/changing it.
- **Explicit Constraints:** Define what we *won't* do.
- **CAP Theorem:** Consistency, Availability, Partition Tolerance (Pick 2).

## Common Trade-offs
- **Buy vs. Build:** Speed to market vs. Customizability/Control.
- **Monolith vs. Microservices:** Simplicity/Consistency vs. Scalability/Decoupling.
- **SQL vs. NoSQL:** Structured/ACID vs. Flexible/Scale-out.
- **Sync vs. Async:** Simple logic vs. Decoupled performance.
