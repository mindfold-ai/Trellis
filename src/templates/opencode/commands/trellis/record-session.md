[!] **Prerequisite**: This command should only be used AFTER the human has tested and committed the code.

**AI must NOT execute git commit** - only read history (`git log`, `git status`, `git diff`).

---

## Record Work Progress (Simplified - Only 2 Steps)

### Step 1: Get Context

```bash
python3 ./.trellis/scripts/get_context.py
```

### Step 2: One-Click Add Session

```bash
# Method 1: Simple parameters
python3 ./.trellis/scripts/add_session.py \
  --title "Session Title" \
  --commit "hash1,hash2" \
  --summary "Brief summary of what was done"

# Method 2: Pass detailed content via stdin
cat << 'EOF' | python3 ./.trellis/scripts/add_session.py --title "Title" --commit "hash"
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
python3 ./.trellis/scripts/task.py archive <task-name>
```

---

## Script Command Reference

| Command | Purpose |
|---------|---------|
| `python3 ./.trellis/scripts/get_context.py` | Get all context info |
| `python3 ./.trellis/scripts/add_session.py --title "..." --commit "..."` | **One-click add session (recommended)** |
| `python3 ./.trellis/scripts/task.py create "<title>" [--slug <name>]` | Create new task directory |
| `python3 ./.trellis/scripts/task.py archive <name>` | Archive completed task |
| `python3 ./.trellis/scripts/task.py list` | List active tasks |
