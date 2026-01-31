# worktree.yaml Configuration Reference

Complete guide to `.trellis/worktree.yaml` configuration.

---

## Overview

`worktree.yaml` configures **both** Multi-Session (worktree isolation) **and** some Multi-Agent behaviors (like Ralph Loop).

```yaml
# .trellis/worktree.yaml

# Multi-Session only
worktree_dir: ../worktrees    # Default value
copy:
  - .trellis/.developer
  - .env
post_create:
  - npm install

# Both Multi-Session AND Multi-Agent
verify:
  - pnpm lint
  - pnpm typecheck
```

**Note**: Trellis uses a custom YAML parser (not PyYAML). Supports basic key-value pairs and arrays; complex nested structures may not work.

---

## Configuration Sections

### Which Config Affects What?

| Config | Multi-Agent (current dir) | Multi-Session (worktree) |
|--------|---------------------------|--------------------------|
| `worktree_dir` | ❌ Not used | ✅ Worktree location |
| `copy` | ❌ Not used | ✅ Files copied to worktree |
| `post_create` | ❌ Not used | ✅ Commands after worktree creation |
| `verify` | ✅ Used by Ralph Loop | ✅ Used by Ralph Loop |

**Key point**: `verify` config applies to BOTH modes!

---

## Full Configuration

```yaml
# =============================================================================
# MULTI-SESSION ONLY - Only used in worktree mode
# =============================================================================

# Worktree creation location (relative to project root)
# Default: ../worktrees
worktree_dir: ../worktrees

# Files to copy to each worktree
# These files are not in git, need manual copy
# Default: [] (empty array)
copy:
  - .trellis/.developer      # Developer identity
  - .env                      # Environment variables
  - .env.local                # Local overrides
  # - .npmrc                  # npm config
  # - credentials.json        # Credential files

# Commands to run after worktree creation
# Runs in order, stops on first failure
# Default: [] (empty array)
post_create:
  - npm install               # or pnpm install
  # - pnpm install --frozen-lockfile
  # - cp .env.example .env
  # - npm run db:migrate

# =============================================================================
# BOTH MODES - Used in both Multi-Agent and Multi-Session
# =============================================================================

# Verification commands - Used by Ralph Loop
# Runs when Check Agent stops
# All must pass to allow stop
# Default: [] (empty array)
verify:
  - pnpm lint
  - pnpm typecheck
  # - pnpm test
  # - pnpm build
```

### Default Values

| Config | Default | Notes |
|--------|---------|-------|
| `worktree_dir` | `../worktrees` | Relative to project root |
| `copy` | `[]` | Empty array, no files copied |
| `post_create` | `[]` | Empty array, no commands run |
| `verify` | `[]` | Empty array, Ralph Loop uses completion markers |

---

## Scenario: Multi-Agent in Current Directory

**Requirement**: Run dispatch → implement → check in current directory, no worktree

**worktree.yaml config**:
```yaml
# These can be omitted (not used in current directory mode)
# worktree_dir: ...
# copy: ...
# post_create: ...

# This is needed! Ralph Loop uses it
verify:
  - pnpm lint
  - pnpm typecheck
```

**Workflow**:
1. Set `.trellis/.current-task`
2. Call `Task(subagent_type="implement")`
3. Call `Task(subagent_type="check")`
4. When Check Agent completes, Ralph Loop runs `verify` commands
5. Human commits

---

## Scenario: Custom Workflows

### Add test verification

```yaml
verify:
  - pnpm lint
  - pnpm typecheck
  - pnpm test          # Add tests
```

### Add build verification

```yaml
verify:
  - pnpm lint
  - pnpm typecheck
  - pnpm build         # Add build check
```

### Go projects

```yaml
verify:
  - go fmt ./...
  - go vet ./...
  - go test ./...
```

### Python projects

```yaml
verify:
  - ruff check .
  - mypy .
  - pytest
```

### Rust projects

```yaml
verify:
  - cargo fmt --check
  - cargo clippy
  - cargo test
```

---

## Scenario: Custom Worktree Creation

### Different package managers

```yaml
post_create:
  # npm
  - npm install

  # or pnpm
  # - pnpm install --frozen-lockfile

  # or yarn
  # - yarn install --frozen-lockfile

  # or bun
  # - bun install
```

### Database migrations required

```yaml
post_create:
  - pnpm install
  - pnpm db:migrate
  - pnpm db:seed
```

### Code generation required

```yaml
post_create:
  - pnpm install
  - pnpm codegen
  - pnpm prisma generate
```

### Copy additional files

```yaml
copy:
  - .trellis/.developer
  - .env
  - .env.local
  - .npmrc                    # npm private registry config
  - firebase-credentials.json # Firebase credentials
  - google-cloud-key.json     # GCP credentials
```

---

## When worktree.yaml is Missing

If `worktree.yaml` doesn't exist:

| Feature | Behavior |
|---------|----------|
| Multi-Session | ❌ Cannot start (start.py requires config) |
| Multi-Agent | ⚠️ Works, but Ralph Loop uses completion markers |

**Ralph Loop fallback behavior**:
- Without `verify` config, uses completion markers
- Generates markers from `check.jsonl` reason field
- Example: `{"reason": "typecheck"}` → expects `TYPECHECK_FINISH`

---

## Minimal Configuration

### Multi-Agent only (current directory)

```yaml
# .trellis/worktree.yaml
verify:
  - pnpm lint
  - pnpm typecheck
```

### Multi-Session only (worktree)

```yaml
# .trellis/worktree.yaml
worktree_dir: ../worktrees
copy:
  - .trellis/.developer
post_create:
  - npm install
verify:
  - pnpm lint
  - pnpm typecheck
```

---

## Complete Examples

### Node.js/TypeScript Project

```yaml
worktree_dir: ../worktrees

copy:
  - .trellis/.developer
  - .env
  - .env.local

post_create:
  - pnpm install --frozen-lockfile

verify:
  - pnpm lint
  - pnpm typecheck
  - pnpm test
```

### Python Project

```yaml
worktree_dir: ../worktrees

copy:
  - .trellis/.developer
  - .env
  - venv/              # or recreate venv

post_create:
  - python -m venv venv
  - ./venv/bin/pip install -r requirements.txt

verify:
  - ./venv/bin/ruff check .
  - ./venv/bin/mypy .
  - ./venv/bin/pytest
```

### Go Project

```yaml
worktree_dir: ../worktrees

copy:
  - .trellis/.developer
  - .env

post_create:
  - go mod download

verify:
  - go fmt ./...
  - go vet ./...
  - golangci-lint run
  - go test ./...
```

### Monorepo Project

```yaml
worktree_dir: ../worktrees

copy:
  - .trellis/.developer
  - .env
  - .npmrc

post_create:
  - pnpm install --frozen-lockfile
  - pnpm -r build  # Build all packages

verify:
  - pnpm -r lint
  - pnpm -r typecheck
  - pnpm -r test
```

---

## Verification Command Notes

### Ralph Loop Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_ITERATIONS` | 5 | Maximum loop iterations |
| `STATE_TIMEOUT_MINUTES` | 30 | State timeout (minutes) |
| Command timeout | 120s | Per verify command timeout |

### Timeout

Each verify command has **120 seconds** (2 minutes) timeout. Long-running tests may need:
- Split tests
- Run only fast tests
- Modify `COMMAND_TIMEOUT` constant in `ralph-loop.py`

### Exit Codes

- Exit code 0 = Pass
- Non-zero = Fail, blocks Check Agent from stopping

### Order

Commands run in config order, stops on first failure.

Recommended order: fast → slow
```yaml
verify:
  - pnpm lint        # Fast (seconds)
  - pnpm typecheck   # Medium (seconds-minutes)
  - pnpm test        # Slow (minutes)
```

---

## YAML Parser Notes

Trellis uses a custom YAML parser (not PyYAML) with these limitations:

### Supported Syntax

```yaml
# Simple key-value
worktree_dir: ../worktrees

# Arrays (2-space indent, starts with -)
copy:
  - .trellis/.developer
  - .env

# Quoted values
worktree_dir: "../worktrees with spaces"
```

### Unsupported Syntax

```yaml
# ❌ Inline arrays
copy: [.env, .npmrc]

# ❌ Complex nesting
nested:
  key:
    subkey: value

# ❌ Multi-line strings
description: |
  Multiple
  lines
```

---

## Debugging Configuration

### View current config

```bash
cat .trellis/worktree.yaml
```

### Test verify commands

```bash
# Manual run
pnpm lint && pnpm typecheck

# Or view Ralph Loop state
cat .trellis/.ralph-state.json
```

### View worktree status

```bash
git worktree list
```

### Ralph Loop debugging

```bash
# View state file
cat .trellis/.ralph-state.json

# Example output
# {
#   "task": ".trellis/tasks/01-31-add-login",
#   "iteration": 2,
#   "started_at": "2026-01-31T10:30:00"
# }

# Ralph Loop auto-stops when exceeding MAX_ITERATIONS (5) or STATE_TIMEOUT_MINUTES (30)
```
