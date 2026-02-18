# Defense-in-Depth Validation

When you fix a bug, adding validation at one place feels sufficient. But that single check can be bypassed by different code paths, refactoring, or mocks.

**Validate at EVERY layer data passes through. Make the bug structurally impossible.**

## The Four Layers

### Layer 1: Entry Point Validation
Reject obviously invalid input at API boundary.
```typescript
function createProject(name: string, workingDirectory: string) {
  if (!workingDirectory || workingDirectory.trim() === '') {
    throw new Error('workingDirectory cannot be empty');
  }
}
```

### Layer 2: Business Logic Validation
Ensure data makes sense for this specific operation.
```typescript
function initializeWorkspace(projectDir: string, sessionId: string) {
  if (!projectDir) {
    throw new Error('projectDir required for workspace initialization');
  }
}
```

### Layer 3: Environment Guards
Prevent dangerous operations in specific contexts.
```typescript
async function gitInit(directory: string) {
  if (process.env.NODE_ENV === 'test') {
    const normalized = normalize(resolve(directory));
    if (!normalized.startsWith(normalize(resolve(tmpdir())))) {
      throw new Error(`Refusing git init outside temp dir during tests: ${directory}`);
    }
  }
}
```

### Layer 4: Debug Instrumentation
Capture context for forensics.
```typescript
async function gitInit(directory: string) {
  logger.debug('About to git init', {
    directory, cwd: process.cwd(), stack: new Error().stack,
  });
}
```

## Application Pattern

1. **Trace the data flow** — where does bad value originate? Where is it used?
2. **Map all checkpoints** — list every point data passes through
3. **Add validation at each layer** — entry, business, environment, debug
4. **Test each layer** — try to bypass layer 1, verify layer 2 catches it

All four layers are necessary. During testing, each layer catches bugs the others miss: different code paths bypass entry validation, mocks bypass business logic, edge cases need environment guards.

## Condition-Based Waiting

When fixing flaky tests, replace arbitrary delays with condition polling:

```typescript
// ❌ Guessing at timing
await new Promise(r => setTimeout(r, 50));

// ✅ Waiting for actual condition
async function waitFor<T>(
  condition: () => T | undefined | null | false,
  description: string,
  timeoutMs = 5000
): Promise<T> {
  const startTime = Date.now();
  while (true) {
    const result = condition();
    if (result) return result;
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout waiting for ${description} after ${timeoutMs}ms`);
    }
    await new Promise(r => setTimeout(r, 10));
  }
}
```

| Scenario | Pattern |
|---|---|
| Wait for event | `waitFor(() => events.find(e => e.type === 'DONE'))` |
| Wait for state | `waitFor(() => machine.state === 'ready')` |
| Wait for file | `waitFor(() => fs.existsSync(path))` |

Only use arbitrary timeouts when testing actual timing behavior (debounce, throttle) — and document WHY.
