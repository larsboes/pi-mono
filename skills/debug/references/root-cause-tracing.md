# Root Cause Tracing

Bugs manifest deep in the call stack. Your instinct is to fix where the error appears — that's treating a symptom.

**Trace backward through the call chain until you find the original trigger. Fix at the source.**

## When to Use

- Error happens deep in execution (not at entry point)
- Stack trace shows long call chain
- Unclear where invalid data originated

## The Process

### 1. Observe the Symptom
```
Error: git init failed in /Users/jesse/project/packages/core
```

### 2. Find Immediate Cause
```typescript
await execFileAsync('git', ['init'], { cwd: projectDir });
```

### 3. Ask: What Called This?
```
WorktreeManager.createSessionWorktree(projectDir, sessionId)
  → called by Session.initializeWorkspace()
  → called by Session.create()
  → called by test at Project.create()
```

### 4. Keep Tracing Up
- `projectDir = ''` (empty string!)
- Empty string as `cwd` resolves to `process.cwd()`
- That's the source code directory

### 5. Find Original Trigger
```typescript
const context = setupCoreTest(); // Returns { tempDir: '' }
Project.create('name', context.tempDir); // Accessed before beforeEach!
```

## Adding Stack Traces When Manual Tracing Fails

```typescript
async function gitInit(directory: string) {
  const stack = new Error().stack;
  console.error('DEBUG git init:', { directory, cwd: process.cwd(), stack });
  await execFileAsync('git', ['init'], { cwd: directory });
}
```

- Use `console.error()` in tests (logger may be suppressed)
- Log BEFORE the dangerous operation, not after failure
- Include: directory, cwd, env vars, timestamps, stack

## Key Principle

**NEVER fix just where the error appears.** Trace back to the original trigger. Then add validation at every layer (see `defense-in-depth.md`).
