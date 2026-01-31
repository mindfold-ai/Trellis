# How To: Change Verify Commands

Add or modify Ralph Loop verification commands.

**Platform**: Claude Code only (Ralph Loop)

---

## Files to Modify

| File | Action | Required |
|------|--------|----------|
| `.trellis/worktree.yaml` | Modify | Yes |

---

## Step 1: Edit worktree.yaml

Open `.trellis/worktree.yaml` and modify the `verify` section:

```yaml
verify:
  - pnpm lint
  - pnpm typecheck
  - pnpm test          # Add this
```

---

## Common Scenarios

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

### Add Specific Test Suite

```yaml
verify:
  - pnpm lint
  - pnpm typecheck
  - pnpm test:unit        # Fast unit tests only
```

### Different Languages

**Go:**
```yaml
verify:
  - go fmt ./...
  - go vet ./...
  - golangci-lint run
  - go test ./...
```

**Python:**
```yaml
verify:
  - ruff check .
  - mypy .
  - pytest -x
```

**Rust:**
```yaml
verify:
  - cargo fmt --check
  - cargo clippy
  - cargo test
```

---

## Execution Details

### Order

Commands run in order. First failure stops execution.

**Recommended order**: fast → slow

```yaml
verify:
  - pnpm lint        # ~2 seconds
  - pnpm typecheck   # ~10 seconds
  - pnpm test:unit   # ~30 seconds
  - pnpm build       # ~60 seconds
```

### Timeout

Each command has 120 second timeout.

For long-running commands:
- Split into smaller chunks
- Use faster subset for Ralph Loop
- Run full suite manually

### Exit Codes

- Exit 0 = Pass
- Non-zero = Fail, agent continues

---

## Testing

### Manual Test

```bash
# Run commands manually
pnpm lint && pnpm typecheck && pnpm test

# Should all pass for Ralph Loop to allow stop
```

### Integration Test

1. Make a change that fails linting
2. Run check agent
3. Verify Ralph Loop blocks and shows error
4. Fix the issue
5. Verify Ralph Loop allows stop

---

## Troubleshooting

### Command Not Found

Ensure command is available:

```bash
which pnpm  # or npm, yarn, etc.
```

### Timeout Issues

Increase timeout in `ralph-loop.py`:

```python
COMMAND_TIMEOUT = 180  # Default is 120
```

### Skip Verify Temporarily

Comment out commands:

```yaml
verify:
  - pnpm lint
  # - pnpm typecheck  # Skip temporarily
```

---

## Checklist

- [ ] Commands added to worktree.yaml
- [ ] Commands tested manually
- [ ] Order is fast → slow
- [ ] No timeout issues
