[!] **Prerequisite**: This command should only be used AFTER the human has tested and committed the code.

**AI must NOT execute git commit** - only read history (`git log`, `git status`, `git diff`).

---

## Record Work Progress (Simplified - Only 2 Steps)

### Step 1: Get Context

```bash
./.trellis/scripts/get-context.sh
```

### Step 2: One-Click Add Session

```bash
# Method 1: Simple parameters
./.trellis/scripts/add-session.sh \
  --title "Session Title" \
  --commit "hash1,hash2" \
  --summary "Brief summary of what was done"

# Method 2: Pass detailed content via stdin
cat << 'EOF' | ./.trellis/scripts/add-session.sh --title "Title" --commit "hash"
| Feature | Description |
|---------|-------------|
| New API | Added user authentication endpoint |
| Frontend | Updated login form |

**Updated Files**:
- `packages/api/modules/auth/router.ts`
- `apps/web/modules/auth/components/login-form.tsx`
EOF
```

**Auto-completes**:
- [OK] Appends session to journal-N.md
- [OK] Auto-detects line count, creates new file if >2000 lines
- [OK] Updates index.md (Total Sessions +1, Last Active, line stats, history)

---

## Archive Completed Task (if any)

If a task was completed this session:

```bash
./.trellis/scripts/task.sh archive <task-name>
```

---

## Script Command Reference

| Command | Purpose |
|---------|---------|
| `get-context.sh` | Get all context info |
| `add-session.sh --title "..." --commit "..."` | **One-click add session (recommended)** |
| `task.sh create "<title>" [--slug <name>]` | Create new task directory |
| `task.sh archive <name>` | Archive completed task |
| `task.sh list` | List active tasks |
