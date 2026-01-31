# Ralph Loop

Quality enforcement mechanism for Check Agent.

---

## Overview

Ralph Loop prevents Check Agent from stopping until all verification commands pass.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           RALPH LOOP                                     │
│                                                                          │
│  Check Agent completes                                                   │
│         │                                                                │
│         ▼                                                                │
│  SubagentStop hook fires ──► ralph-loop.py runs                         │
│         │                                                                │
│         ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Run verify commands from worktree.yaml:                         │    │
│  │                                                                  │    │
│  │    pnpm lint        → exit 0 ✓                                   │    │
│  │    pnpm typecheck   → exit 0 ✓                                   │    │
│  │    pnpm test        → exit 1 ✗                                   │    │
│  │                                                                  │    │
│  │  Result: FAIL (test failed)                                      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│         │                                                                │
│         ▼                                                                │
│  ┌─────────────────┐              ┌─────────────────┐                   │
│  │   All pass?     │──── YES ────►│  Allow stop     │                   │
│  └────────┬────────┘              └─────────────────┘                   │
│           │ NO                                                           │
│           ▼                                                              │
│  ┌─────────────────┐                                                    │
│  │  Block stop     │ ◄─── Agent continues to fix issues                 │
│  │  Inject errors  │                                                    │
│  └─────────────────┘                                                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Configuration

### `worktree.yaml`

```yaml
verify:
  - pnpm lint
  - pnpm typecheck
  # - pnpm test
  # - pnpm build
```

---

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_ITERATIONS` | 5 | Maximum loop attempts |
| `STATE_TIMEOUT_MINUTES` | 30 | State file timeout |
| `COMMAND_TIMEOUT` | 120s | Per-command timeout |

---

## State File

### `.trellis/.ralph-state.json`

Tracks loop state across iterations.

```json
{
  "task": ".trellis/tasks/01-31-add-login",
  "iteration": 2,
  "started_at": "2026-01-31T10:30:00"
}
```

---

## Flow

### Iteration 1

1. Check Agent completes work
2. SubagentStop hook fires
3. `ralph-loop.py` creates state file (iteration=1)
4. Runs verify commands
5. If fail: block stop, inject error messages
6. Check Agent continues fixing

### Iteration 2-5

1. Check Agent tries to stop again
2. Hook reads state file, increments iteration
3. Runs verify commands again
4. Repeat until pass or max iterations

### Max Iterations Reached

1. Iteration 5 still fails
2. Hook allows stop (prevents infinite loop)
3. Logs warning about unresolved issues

### Timeout

1. State file older than 30 minutes
2. Hook resets state (fresh start)
3. Treats as iteration 1

---

## Verify Commands

### Execution Order

Commands run in config order. First failure stops execution.

```yaml
verify:
  - pnpm lint        # Runs first (fast)
  - pnpm typecheck   # Runs second
  - pnpm test        # Runs third (slow)
```

**Recommendation**: Order fast → slow

### Exit Codes

- Exit 0 = Pass
- Non-zero = Fail

### Timeout

Each command has 120 second timeout. Long-running tests may need:
- Splitting into smaller test suites
- Running only fast tests in Ralph Loop
- Adjusting `COMMAND_TIMEOUT` in script

---

## Fallback: Completion Markers

If `worktree.yaml` has no `verify` config, Ralph Loop uses completion markers.

### How It Works

1. Read `check.jsonl` for reason fields
2. Generate expected markers: `{REASON}_FINISH`
3. Check agent output for all markers
4. Missing marker = block stop

### Example

```jsonl
{"file": "...", "reason": "typecheck"}
{"file": "...", "reason": "lint"}
```

Expected markers:
- `TYPECHECK_FINISH`
- `LINT_FINISH`

---

## Debugging

### Check State

```bash
cat .trellis/.ralph-state.json
```

### Manual Verify

```bash
# Run verify commands manually
pnpm lint && pnpm typecheck && pnpm test
```

### Reset State

```bash
rm .trellis/.ralph-state.json
```

### View Hook Output

Check agent output for Ralph Loop messages:
- "Verification passed" = all commands succeeded
- "Verification failed" = blocking, shows errors
- "Max iterations reached" = giving up

---

## Customizing

### Add Test Verification

```yaml
verify:
  - pnpm lint
  - pnpm typecheck
  - pnpm test
```

### Add Build Verification

```yaml
verify:
  - pnpm lint
  - pnpm typecheck
  - pnpm build
```

### Different Languages

**Go:**
```yaml
verify:
  - go fmt ./...
  - go vet ./...
  - go test ./...
```

**Python:**
```yaml
verify:
  - ruff check .
  - mypy .
  - pytest
```

**Rust:**
```yaml
verify:
  - cargo fmt --check
  - cargo clippy
  - cargo test
```

---

## Disabling Ralph Loop

To disable for a project:

1. Remove `verify` from `worktree.yaml`
2. Or remove SubagentStop hook from settings.json

**Warning**: Without Ralph Loop, code quality isn't automatically enforced.
