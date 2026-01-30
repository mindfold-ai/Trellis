# Shell Script Conventions

> Standards for shell scripts in `.trellis/scripts/`.

---

## Overview

Most CLI functionality has migrated to TypeScript (`trellis` command), including the multi-agent pipeline. Shell scripts now only serve as:

1. **Legacy utilities** - Some scripts still in use, gradually being migrated
2. **Hook scripts** - Python hooks for agent context injection (not covered here)

For TypeScript CLI patterns, see [Quality Guidelines](./quality-guidelines.md).

---

## Directory Structure

```
.trellis/scripts/
├── _archive/             # Archived scripts (replaced by CLI)
│   ├── multi-agent/      # Pipeline scripts → trellis pipeline
│   ├── common/           # Libraries → src/core/pipeline/
│   └── README.md         # Migration reference
├── common/               # Shared utilities (still in use)
│   ├── paths.sh          # Path constants
│   ├── developer.sh      # Developer identity
│   ├── worktree.sh       # Git worktree config reading
│   └── git-context.sh    # Git context gathering
├── task.sh               # Task management (legacy wrapper)
├── add-session.sh        # Session recording (legacy)
└── *.sh                  # Other utilities
```

---

## Migration Status

### Completed Migrations

| Old Shell Script | New CLI Command |
|------------------|-----------------|
| `multi-agent/plan.sh` | `trellis pipeline plan` |
| `multi-agent/start.sh` | `trellis pipeline start` |
| `multi-agent/status.sh` | `trellis pipeline status` |
| `multi-agent/cleanup.sh` | `trellis pipeline cleanup` |
| `multi-agent/create-pr.sh` | `trellis pipeline create-pr` |
| `common/registry.sh` | `src/core/pipeline/state.ts` |
| `common/phase.sh` | `src/core/pipeline/state.ts` |
| `task.sh create` | `trellis task create` |
| `task.sh list` | `trellis task list` |
| `init-developer.sh` | `trellis developer init` |
| `get-developer.sh` | `trellis developer get` |
| `get-context.sh` | `trellis context` |

### Still In Use

| Script | Purpose | Migration Plan |
|--------|---------|----------------|
| `common/paths.sh` | Path constants | Low priority |
| `common/developer.sh` | Developer identity | Used by task.sh |
| `common/worktree.sh` | Worktree config | Used by hooks |
| `task.sh` | Task operations | Gradually migrate remaining commands |

---

## Output Conventions

| Stream | Usage |
|--------|-------|
| stdout | Data for scripting (paths, JSON) |
| stderr | User messages, errors |

```bash
# Data on stdout
echo "$WORKTREE_PATH"

# Messages on stderr
echo -e "${GREEN}Pipeline started${NC}" >&2
```

---

## Error Handling

```bash
set -e  # Exit on error

# Validate inputs
if [[ -z "$TASK_DIR" ]]; then
  echo -e "${RED}Error: Task directory required${NC}" >&2
  exit 1
fi
```

---

## Best Practice

For new features, **always prefer TypeScript CLI over shell scripts**.

Shell scripts should only be used when:
- Interacting with existing shell-only workflows
- Quick prototyping (then migrate to TypeScript)
- Platform hooks that require shell execution
