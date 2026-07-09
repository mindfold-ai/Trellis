# Script Conventions

> Standards for Python scripts in the `.trellis/scripts/` directory.

---

## Overview

All workflow scripts target **Python 3.9+** for cross-platform compatibility (matches macOS system `python3`; covers Ubuntu 22.04 LTS and newer). Scripts use only the standard library (no external dependencies). PEP 604 union annotations (`str | None`) are allowed only when the file declares `from __future__ import annotations` — see the Cross-Platform Compatibility section below.

---

## Directory Structure

```
.trellis/scripts/
├── __init__.py           # Package init
├── common/               # Shared modules
│   ├── __init__.py       # Windows encoding fix (centralized)
│   ├── paths.py          # Path constants and functions
│   ├── developer.py      # Developer identity management
│   ├── io.py             # read_json / write_json
│   ├── log.py            # Colors class + log_info/log_error/log_warn/log_success
│   ├── git.py            # run_git() — git command wrapper
│   ├── types.py          # TaskData (TypedDict), TaskInfo (dataclass), AgentRecord
│   ├── tasks.py          # load_task(), iter_active_tasks() — typed task access
│   ├── active_task.py    # Session-scoped active task resolver
│   ├── task_utils.py     # resolve_task_dir(), run_task_hooks()
│   ├── task_store.py     # Task CRUD (create, archive, set-branch, etc.)
│   ├── task_context.py   # JSONL context management (add-context, validate, list-context)
│   ├── task_queue.py     # Task queue CRUD
│   ├── config.py         # Config reader (config.yaml, hooks)
│   ├── trellis_config.py # Standalone .trellis/config.yaml reader (no task/repo deps)
│   ├── workflow_phase.py # Extract Phase Index / step sections from .trellis/workflow.md (with platform filter)
│   ├── cli_adapter.py    # Multi-platform CLI abstraction
│   ├── git_context.py    # Entry shim → session_context + packages_context
│   ├── session_context.py    # Session context generation (text/json/record)
│   └── packages_context.py  # Package discovery and context
├── hooks/                # Lifecycle hook scripts (project-specific)
│   └── linear_sync.py    # Example: sync tasks to Linear
├── task.py               # Entry shim → task_store + task_context
├── get_context.py        # Session context retrieval
├── init_developer.py     # Developer initialization
├── get_developer.py      # Get current developer
└── add_session.py        # Session recording
```

---

## Script Types

### Library Modules (`common/*.py`)

Shared utilities imported by other scripts. **Never run directly.**

Three tiers:

| Tier | Modules | Role |
|------|---------|------|
| **Foundation** | `io.py`, `log.py`, `git.py`, `paths.py` | Zero internal deps, used by everything |
| **Domain** | `types.py`, `tasks.py`, `task_store.py`, `task_context.py`, `task_utils.py` | Task data model and operations |
| **Infra** | `config.py`, `cli_adapter.py` | Platform abstraction and config |
| **Context** | `session_context.py`, `packages_context.py`, `git_context.py` (shim) | Output generation |

### Entry Scripts (`*.py`)

CLI tools that users run directly. Include docstring with usage.

```python
#!/usr/bin/env python3
"""Short description.

Usage:
    python3 script.py <command> [options]
"""

from __future__ import annotations

import argparse
import sys

from common.paths import get_repo_root

def main() -> int:
    parser = argparse.ArgumentParser(...)
    args = parser.parse_args()
    # ... dispatch
    return 0

if __name__ == "__main__":
    sys.exit(main())
```

---

## Coding Standards

### Type Hints

Use modern type hints (Python 3.10+ syntax):

```python
# Good
def get_tasks(status: str | None = None) -> list[dict]:
    ...

def read_json(path: Path) -> dict | None:
    ...

# Bad - old style
from typing import Optional, List, Dict
def get_tasks(status: Optional[str] = None) -> List[Dict]:
    ...
```

### Path Handling

Always use `pathlib.Path`:

```python
# Good
from pathlib import Path

def read_file(path: Path) -> str:
    return path.read_text(encoding="utf-8")

config_path = repo_root / DIR_WORKFLOW / "config.json"

# Bad - string concatenation
config_path = repo_root + "/" + DIR_WORKFLOW + "/config.json"
```

### JSON Operations

Use helper functions for consistent error handling:

```python
import json
from pathlib import Path


def read_json(path: Path) -> dict | None:
    """Read JSON file, return None on error."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def write_json(path: Path, data: dict) -> bool:
    """Write JSON file, return success status."""
    try:
        path.write_text(
            json.dumps(data, indent=2, ensure_ascii=False),
            encoding="utf-8"
        )
        return True
    except Exception:
        return False
```

### Subprocess Execution

```python
import subprocess
from pathlib import Path


def run_command(
    cmd: list[str],
    cwd: Path | None = None
) -> tuple[int, str, str]:
    """Run command and return (returncode, stdout, stderr)."""
    result = subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True
    )
    return result.returncode, result.stdout, result.stderr
```

### Optional Advisory Checks in Session Scripts

#### 1. Scope / Trigger

Use this contract when a generated `.trellis/scripts/` module performs an
advisory check during hook/session context generation, such as checking whether
a Trellis update is available. These checks must never block context output.

#### 2. Signatures

```python
def _fetch_tool_output() -> str | None: ...
def _extract_advisory_value(output: str) -> str | None: ...
def _resolve_advisory_value() -> str | None: ...
def _marker_path(repo_root: Path) -> Path: ...
def _mark_attempted(repo_root: Path) -> bool: ...
```

#### 3. Contracts

- Prefer reusing existing local CLI behavior over duplicating registry/API logic.
- Local advisory commands use `subprocess.run(..., capture_output=True,
  text=True, encoding="utf-8", errors="replace",
  timeout=<short timeout>)`.
- Marker files live under `.trellis/.runtime/` and are keyed by the current
  Trellis session identity when available.
- Marker writes are best-effort: failure to write must not fail context output.

#### 4. Validation & Error Matrix

| Condition | Behavior |
|-----------|----------|
| Local command returns valid value | Compare/use value and write marker |
| Local command fails | Print nothing and do not write marker |
| Value parses as invalid | Print nothing; marker may be written to avoid repeat noisy work |
| Marker already exists | Skip all probes and print nothing |

#### 5. Good / Base / Bad Cases

- Good: `trellis --version` prints an existing CLI update hint or final version,
  project `.version` is `0.5.0`, so context prints the update hint once.
- Base: `trellis --version` returns `0.5.9`; no registry parsing is needed.
- Bad: a failed local command writes the marker before any usable value is
  resolved, hiding a later successful check in the same session.

#### 6. Tests Required

- Newer value prints the hint and includes the generated context body.
- Equal/newer current project version prints no hint.
- Failed lookup prints no hint and does not burn the once-per-session marker.
- Existing `trellis --version` update output is parsed and normalized.
- Non-default modes (`--json`, record, packages, phase) do not call the
  advisory check.

#### 7. Wrong vs Correct

```python
# Wrong: burns the marker before knowing whether the check produced a value.
if not _mark_attempted(repo_root):
    return None
latest = _fetch_primary_value()
if not latest:
    return None
```

```python
# Correct: skip only if a previous successful/decisive attempt wrote a marker.
if _marker_path(repo_root).exists():
    return None
latest = _resolve_advisory_value()
if not latest:
    return None
_mark_attempted(repo_root)
```

---

## Shared Module API Reference

### `common/io.py` — JSON File I/O

The single source of truth for all JSON file operations. Replaces 8 duplicated `_read_json_file` and 5 duplicated `_write_json_file` functions.

| Function | Signature | Returns | Error Behavior |
|----------|-----------|---------|----------------|
| `read_json` | `(path: Path) -> dict \| None` | Parsed dict, or `None` | Returns `None` on `FileNotFoundError`, `JSONDecodeError`, `OSError` |
| `write_json` | `(path: Path, data: dict) -> bool` | `True` on success | Returns `False` on `OSError`, `IOError` |

**Contracts**:
- Always uses `encoding="utf-8"` and `ensure_ascii=False`
- `write_json` outputs with `indent=2` (pretty-printed)
- Callers must check return value — no exceptions are raised

### `common/log.py` — Terminal Output

| Export | Type | Description |
|--------|------|-------------|
| `Colors` | class | ANSI codes: `RED`, `GREEN`, `YELLOW`, `BLUE`, `CYAN`, `DIM`, `NC` |
| `colored(text, color)` | function | Wrap text with color + reset |
| `log_info(msg)` | function | `[INFO]` prefix (blue) |
| `log_success(msg)` | function | `[SUCCESS]` prefix (green) |
| `log_warn(msg)` | function | `[WARN]` prefix (yellow) |
| `log_error(msg)` | function | `[ERROR]` prefix (red) |

All `log_*` functions print to **stdout** (not stderr). Use `print(..., file=sys.stderr)` for stderr output.

### `common/git.py` — Git Command Wrapper

```python
def run_git(args: list[str], cwd: Path | None = None) -> tuple[int, str, str]
```

- Prepends `git -c i18n.logOutputEncoding=UTF-8` to all commands (cross-platform UTF-8)
- Uses `encoding="utf-8", errors="replace"` for subprocess output
- Returns `(1, "", error_message)` on exception (never raises)
- Backward-compatible alias in `git_context.py`: `_run_git_command = run_git`

### `common/active_task.py` — Active Task Resolver

All current-task consumers must use the active task resolver instead of reading
`.trellis/.current-task` directly. The resolver is the single source of truth
for session/window scoped task state:

1. Derive a context key from platform input, `TRELLIS_CONTEXT_ID`, a
   platform-native session environment variable when the host exports one, or
   a Cursor shell ticket for a matching AI-run `task.py` command.
2. Read `.trellis/.runtime/sessions/<session-key>.json`.
3. If no context key or no session task is present, return no active task.
4. If a session task exists but the task directory is stale, return stale
   session state.

| Function | Purpose |
|----------|---------|
| `resolve_context_key(platform_input, platform)` | Accepts `session_id` / `sessionId` / `sessionID`, Cursor `conversation_id`, and transcript path fallbacks |
| `resolve_active_task(repo_root, platform_input, platform)` | Returns an `ActiveTask` with `task_path`, `source_type`, `context_key`, and `stale` |
| `set_active_task(...)` | Writes session runtime state when a context key exists; returns `None` without a context key |
| `clear_active_task(...)` | Deletes the current session file; returns no active task without a context key |

`TRELLIS_CONTEXT_ID` is a context-key override for subprocesses. It is not a
second task pointer and must never store a task path. A plain AI-run shell
command cannot infer the current conversation/window unless the host process
exports session identity in its environment or the command is launched with
`TRELLIS_CONTEXT_ID`; without that identity, `task.py start` fails and explains
how to provide a session runtime. For Claude Code, SessionStart receives
`CLAUDE_ENV_FILE`; Trellis must append `export TRELLIS_CONTEXT_ID=<context-key>`
there so later Bash tools inherit the same session identity. For OpenCode,
`tool.execute.before` must prefix Bash commands with
`TRELLIS_CONTEXT_ID` from plugin session identity when the command does not
already set it, because some TUI sessions do not expose `OPENCODE_RUN_ID` to
Bash. The prefix must match the host shell: use
`export TRELLIS_CONTEXT_ID=<context-key>;` for POSIX shells and
`$env:TRELLIS_CONTEXT_ID = '<context-key>';` for Windows PowerShell. Keep the
assignment before the user's command so compound commands like
`task.py start && task.py current` keep the same context for every command in
the Bash invocation.
Do not choose this prefix from OS alone. On Windows, Git Bash / MSYS2 still
parse POSIX syntax, so OpenCode must treat `MSYSTEM`, `MINGW_PREFIX`,
`OSTYPE=msys|mingw|cygwin`, `SHELL=...bash`, or `OPENCODE_GIT_BASH_PATH` as
POSIX-shell signals and use the PowerShell prefix only when no such signal is
present.
For Cursor, `session-start.py` is not a reliable shell environment bridge.
Instead, `inject-shell-session-context.py` must run on `beforeShellExecution`
and write a short-lived `.trellis/.runtime/cursor-shell/*.json` ticket for
matching `task.py start/current/finish` commands. The active task resolver may
consume the ticket only when no env identity exists, the current `task.py`
subcommand matches the ticket, the ticket is fresh, and exactly one context key
matches. This keeps Cursor task state per conversation without accepting a
global pointer.
For Pi Agent, the generated TypeScript extension must read the real session id
from `ctx.sessionManager.getSessionId()` and mutate Bash tool calls in
`tool_call` by prefixing `export TRELLIS_CONTEXT_ID=<context-key>;`. The Python
resolver then sees the explicit `TRELLIS_CONTEXT_ID` override; Pi does not need
a `.current-task` fallback or a Python hook directory.

#### Scenario: Active Task Runtime Lifecycle

##### 1. Scope / Trigger

- Trigger: any change to `task.py create/start/current/finish`, hook
  current-task injection, statusline current-task display, plugin active-task
  display, or platform session identity handling.
- Reason: current-task state is a cross-platform runtime contract. A direct
  `.current-task` read or an eager `.runtime` write can reintroduce multi-window
  task pollution.

##### 2. Signatures

- `python3 .trellis/scripts/task.py create "<title>" [--slug <slug>] [--description <text>] [--no-start]`
- `python3 .trellis/scripts/task.py start <task-dir>`
- `python3 .trellis/scripts/task.py current [--source]`
- `python3 .trellis/scripts/task.py finish`
- `resolve_active_task(repo_root, platform_input=None, platform=None) -> ActiveTask`
- `set_active_task(task_path, repo_root, platform_input=None, platform=None) -> ActiveTask | None`
- `clear_active_task(repo_root, platform_input=None, platform=None) -> ActiveTask`

##### 3. Contracts

- `task.py create` always creates task-owned files under
  `.trellis/tasks/<date-slug>/`. It must never write `.trellis/.current-task`.
- `task.py create` normalizes `--description` with `.strip()` before writing
  `task.json` and `prd.md`. Missing or whitespace-only descriptions are stored
  as `""` and emit a warning on stderr.
- Unless `--no-start` is passed, `task.py create` best-effort activates the new
  task for the current session when a context key is available. This writes
  `.trellis/.runtime/sessions/<session-key>.json` and prints both the activated
  task and `Source: session:<key>` on stderr.
- `task.py create --no-start` must not change any session pointer, even when a
  context key is available. It prints a skip notice and leaves existing session
  runtime state untouched.
- `task.py create` without a context key creates the task and does not create
  `.trellis/.runtime/`.
- `task.py create` creates `implement.jsonl` / `check.jsonl` only when the
  repo has a platform configured that consumes those files. `.codex/` is not
  enough by itself: Codex defaults to `codex.dispatch_mode: inline`, which
  loads context through skills. Codex seeds JSONL only when
  `codex.dispatch_mode: sub-agent` is explicitly configured.
- `task.py start` writes session-local state only when a context key is
  available. Otherwise it enters degraded mode: no session pointer is persisted,
  `.trellis/.current-task` is not written, and `task.json.status` may still move
  from `planning` to `in_progress`.
- Session state is stored at
  `.trellis/.runtime/sessions/<session-key>.json`. The runtime directory is
  created lazily by the JSON write path.
- Context filenames are derived from the resolved context key:
  - `TRELLIS_CONTEXT_ID=session-demo` -> `session-demo.json`
  - `CODEX_SESSION_ID=native-a` -> `codex_native-a.json`
  - `CODEX_THREAD_ID=thread-a` -> `codex_thread-a.json`
  - `OPENCODE_RUN_ID=run-a` -> `opencode_run-a.json`
  - OpenCode plugin `sessionID=oc-a` -> `opencode_oc-a.json`
  - `CURSOR_SESSION_ID=cursor-a` -> `cursor_cursor-a.json`
  - transcript fallback -> `<platform>_transcript_<sha256-prefix>.json`
- `TRELLIS_CONTEXT_ID` is already a complete context key. Do not prepend a
  platform name to it.
- `task.py finish` deletes only the current session file. Without a
  context key it returns "no current task" and must not delete
  `.trellis/.current-task`.
- `task.py archive <task>` deletes every runtime session file whose
  `current_task` points at the archived task before moving the task directory.

##### 4. Validation & Error Matrix

| Condition | Required behavior |
|-----------|-------------------|
| `create` without description or with whitespace-only description | Warns on stderr; stores `task.json.description == ""`; initial `prd.md` goal falls back to `TBD.` |
| `create` with context key, default mode | Task files exist; session runtime points at the new task; activation and source are printed; no `.current-task` |
| `create --no-start` with context key | Task files exist; existing session runtime is unchanged; skip notice is printed; no `.current-task` |
| `create` without context key | Task files exist; no `.runtime`; no `.current-task` |
| `create` with `.codex/` and no `codex.dispatch_mode` override | Task files exist; no `implement.jsonl`; no `check.jsonl` |
| `create` with `.codex/` and `codex.dispatch_mode: sub-agent` | Task files exist; `implement.jsonl` and `check.jsonl` contain seed `_example` rows |
| `start` without context key | Returns success in degraded mode; no `.runtime`; no `.current-task`; hints IDE/session identity or `TRELLIS_CONTEXT_ID` |
| `start` with `TRELLIS_CONTEXT_ID` | Writes `.runtime/sessions/<key>.json`; does not require `.current-task` |
| `current --source` with same context key | Prints `Source: session:<key>` |
| `current --source` without context | Prints `(none)` and `Source: none` |
| stale session task + stale `.current-task` exists | Returns stale session state; no `.current-task` fallback |
| `finish` with context key and active task | Deletes `.runtime/sessions/<key>.json` |
| `finish` without context key | Returns no current task; does not delete `.current-task` |
| `archive` for a task referenced by runtime sessions | Deletes those session files even when `finish` was skipped |

##### 5. Good/Base/Bad Cases

- Good: Cursor provides `conversation_id`; resolver writes
  `cursor_<conversation-id>.json` and hook/plugin output includes the
  session source (statuslines shorten it to `[session]`).
- Base: A normal shell command has no session env; `task.py create` creates the
  task without `.runtime`, and `task.py start` degrades with a session identity
  hint instead of writing `.current-task`.
- Bad: `task.py create --no-start` changes an existing session pointer, or any
  resolver reads/writes `.trellis/.current-task` as an active-task fallback.

##### 6. Tests Required

- Regression tests for `create` with a context key writing session runtime and
  surfacing the session source.
- Regression tests for `create --no-start` preserving an existing session
  pointer.
- Regression tests for blank and whitespace-only `--description` warning and
  normalized `task.json.description`.
- Regression tests for `create` without a context key producing no runtime or
  current-task state.
- Regression tests for `start` without a context key degrading without creating
  `.current-task`.
- Regression tests for `TRELLIS_CONTEXT_ID` and platform-native env keys.
- Hook/statusline/plugin tests proving the resolver source is surfaced.
- Stale session tests proving no `.current-task` fallback occurs when the session task
  path is stale.

##### 7. Wrong vs Correct

###### Wrong

```python
# Wrong: batch creation silently moves the current session pointer and gives no
# escape hatch.
set_active_task(task_path, repo_root)
print(f"Created task: {dir_name}")
```

###### Correct

```python
if args.no_start:
    print("Skipped session activation (--no-start)", file=sys.stderr)
elif resolve_context_key():
    active = set_active_task(task_path, repo_root)
    if active:
        print(f"Activated task for this session: {active.task_path}", file=sys.stderr)
        print(f"Source: {active.source}", file=sys.stderr)
```

### `common/types.py` — Typed Data Model

#### Design Decision: TypedDict for Reads, Raw Dict for Writes

**Context**: task.json may contain fields not defined in our TypedDict (e.g., user-added custom fields). If we serialize a TypedDict/dataclass back to JSON, unknown fields are silently dropped.

**Decision**: Two-layer type system:

| Type | Kind | Purpose | Includes unknown fields? |
|------|------|---------|--------------------------|
| `TaskData` | `TypedDict(total=False)` | Type hints when reading task.json | N/A (annotation only) |
| `TaskInfo` | `dataclass(frozen=True)` | Immutable view for business logic | Yes, via `.raw` dict |

**Write-back rule**: Always modify `task_info.raw` (the original dict) and pass it to `write_json()`. Never construct a new dict from TaskInfo fields.

```python
# GOOD — modify original dict, preserve unknown fields
data = read_json(task_json)
data["status"] = "completed"
write_json(task_json, data)

# BAD — would lose any fields not in TaskData
write_json(task_json, {"title": info.title, "status": "completed"})
```

#### `TaskInfo` Fields

| Field | Type | Source |
|-------|------|--------|
| `dir_name` | `str` | Directory name (e.g., `"03-12-refactor"`) |
| `directory` | `Path` | Absolute path to task dir |
| `title` | `str` | `data["title"]` or `data["name"]` or `"unknown"` |
| `status` | `str` | `data["status"]` (default `"unknown"`) |
| `assignee` | `str` | `data["assignee"]` (default `""`) |
| `priority` | `str` | `data["priority"]` (default `"P2"`) |
| `children` | `tuple[str, ...]` | Immutable copy of `data["children"]` |
| `parent` | `str \| None` | Parent task dir name |
| `package` | `str \| None` | Associated package |
| `raw` | `dict` | Original dict for writes and uncommon fields |

Properties: `.name`, `.description`, `.branch`, `.meta` — delegate to `raw`.

### `common/tasks.py` — Task Data Access Layer

Replaces 9 scattered task iteration patterns with a single typed API.

| Function | Signature | Description |
|----------|-----------|-------------|
| `load_task` | `(task_dir: Path) -> TaskInfo \| None` | Load one task; `None` if no valid task.json |
| `iter_active_tasks` | `(tasks_dir: Path) -> Iterator[TaskInfo]` | All non-archived tasks, **sorted by dir name** |
| `get_all_statuses` | `(tasks_dir: Path) -> dict[str, str]` | `{dir_name: status}` map for progress display |
| `children_progress` | `(children, all_statuses) -> str` | Format `" [2/3 done]"` or `""` |

**Sorting guarantee**: `iter_active_tasks` uses `sorted(tasks_dir.iterdir())` — same order as the filesystem `ls` output. This is frozen behavior; changing the sort would break display consistency.

#### Parent-child invariant (children list)

`children` on a parent task is the **historical** list of subtask dir names — it must NOT be pruned when a child is archived. The contract:

- `cmd_archive` keeps the archived child's name in the parent's `children`.
- `children_progress` treats any `child` not present in `all_statuses` (i.e. no longer in the active tasks dir) as **completed**, since `cmd_archive` always sets `status=completed` before moving the directory.
- Renderers that walk children (e.g. `task.py:_print_task`) must guard with `if child_name in all_tasks` so archived entries are silently skipped, not shown.

**Why**: pruning on archive caused `[1/6 done]` → `[0/5 done]` regression — both numerator and denominator dropped, hiding completed work. The single field `children` serves two readers (parent-to-child traversal and progress %); both must agree on its meaning. If you ever need an "active children only" view, derive it via `[c for c in t.children if c in all_statuses]`, do not mutate the field.

---

## Cross-Platform Compatibility

### CRITICAL: Windows stdio Encoding (stdout + stdin)

On Windows, Python's stdout AND stdin default to the system code page (e.g., GBK/CP936 in China, CP1252 in Western locales). This causes:
- `UnicodeEncodeError` when **printing** non-ASCII characters (stdout)
- `UnicodeDecodeError` when **reading piped** UTF-8 content (stdin), e.g. Chinese text via `cat << EOF | python3 script.py`

**The Problem Chain (stdout)**:

```
Windows code page = GBK (936)
    ↓
Python stdout defaults to GBK encoding
    ↓
Subprocess output contains special chars → replaced with \ufffd (replacement char)
    ↓
json.dumps(ensure_ascii=False) → print()
    ↓
GBK cannot encode \ufffd → UnicodeEncodeError: 'gbk' codec can't encode character
```

**The Problem Chain (stdin)**:

```
AI agent pipes UTF-8 content via heredoc: cat << 'EOF' | python3 add_session.py ...
    ↓
Python stdin defaults to GBK encoding (PowerShell default code page)
    ↓
sys.stdin.read() decodes bytes as GBK, not UTF-8
    ↓
Chinese text garbled or UnicodeDecodeError
```

**Root Cause**: Even if you set `PYTHONIOENCODING` in subprocess calls, the **parent process's stdio** still uses the system code page.

---

#### GOOD: Centralize encoding fix in `common/__init__.py`

All stdio encoding is handled in one place. Scripts that `from common import ...` automatically get the fix:

```python
# common/__init__.py
import io
import sys

def _configure_stream(stream):
    """Configure a stream for UTF-8 encoding on Windows."""
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")
        return stream
    elif hasattr(stream, "detach"):
        return io.TextIOWrapper(stream.detach(), encoding="utf-8", errors="replace")
    return stream

if sys.platform == "win32":
    sys.stdout = _configure_stream(sys.stdout)
    sys.stderr = _configure_stream(sys.stderr)
    sys.stdin = _configure_stream(sys.stdin)    # Don't forget stdin!
```

---

#### DON'T: Inline encoding code in individual scripts

```python
# BAD - Duplicated in every script, easy to forget stdin
import sys
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    # Forgot stdin! Piped Chinese text will break.
```

**Why this is bad**:
1. **Easy to forget streams**: stdout was fixed but stdin was missed in multiple scripts, causing real user bugs
2. **Duplicated code**: Same logic copy-pasted across `add_session.py`, `git_context.py`, etc.
3. **Inconsistent coverage**: Some scripts fix stdout only, others fix stdout+stderr, none fixed stdin

**Real-world failure**: Users on Windows reported garbled Chinese text when using `cat << EOF | python3 add_session.py`. Root cause: stdin was never reconfigured to UTF-8.

---

#### Summary

| Method | Works? | Reason |
|--------|--------|--------|
| `common/__init__.py` centralized fix | ✅ Yes | All streams, all scripts, one place |
| `sys.stdout.reconfigure(encoding="utf-8")` | ⚠️ Partial | Only stdout; easy to forget stdin/stderr |
| `io.TextIOWrapper(sys.stdout.buffer, ...)` | ❌ No | Creates wrapper, doesn't fix underlying encoding |
| `PYTHONIOENCODING=utf-8` env var | ⚠️ Partial | Only works if set **before** Python starts |

### CRITICAL: PEP 604 Annotations Require `from __future__ import annotations`

Any distributed Python template file (`templates/**/*.py` — both hooks and scripts) that uses PEP 604 union syntax (`str | None`, `dict | None`, etc.) in annotations **must** start with:

```python
from __future__ import annotations
```

immediately after the module docstring.

**Why it matters**: The `{{PYTHON_CMD}}` placeholder resolves to `python` on
Windows and `python3` on macOS/Linux. `trellis init` probes that same
platform-selected command and soft-warns if it resolves to Python < 3.9, while
hooks are invoked by the host AI CLI (Claude Code, Cursor, enterprise-forked CC
distributions, etc.) in a subprocess whose **PATH may differ from the user's
shell PATH**. Concrete failure mode observed in the field:

- User's terminal `python3 --version` → 3.11.12 (homebrew / pyenv)
- The AI CLI's hook subprocess inherits a minimal PATH (no `/opt/homebrew/bin`), so `python3` resolves to `/usr/bin/python3` → macOS system 3.9
- `def f(x: str | None)` evaluates `str | None` at def-time on 3.9 → `TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'`
- Hook crashes silently; user sees `SessionStart hook error` in debug log with no actionable hint

`from __future__ import annotations` makes all annotations lazy strings (PEP 563), so PEP 604 syntax in annotations works on Python 3.7+. Runtime union usage (e.g. `isinstance(x, int | str)`) is **not** rescued by this import — avoid it in distributed templates.

**Real-world incident**: `shared-hooks/session-start.py` and `shared-hooks/inject-subagent-context.py` lacked this import while `statusline.py` and the copilot/codex copies had it. The inconsistency went undetected until a user on an enterprise-forked Claude Code distribution hit the PEP 604 crash on SessionStart. Fix commit: `7e58432` (2026-04).

#### DO

```python
#!/usr/bin/env python3
"""Hook description."""
from __future__ import annotations

import sys
from pathlib import Path

def handler(x: str | None) -> dict | None:  # lazy annotation — safe on 3.9
    ...
```

#### DON'T

```python
# BAD — annotations evaluated eagerly, crashes on Python < 3.10
def handler(x: str | None) -> dict | None:
    ...
```

```python
# BAD — __future__ import does NOT rescue runtime union
def check(x):
    if isinstance(x, int | str):  # still crashes on 3.9
        ...
```

#### Audit Check

Run this before releasing any change that adds a new `.py` file to `templates/`:

```bash
cd packages/cli/src/templates
for f in $(find . -name "*.py"); do
    if grep -qE '^[^#]*: [A-Za-z_].*\|.*(None|[A-Z])|->.*\|' "$f" \
       && ! grep -q "from __future__ import annotations" "$f"; then
        echo "MISSING: $f"
    fi
done
```

Exit with 0 matches means all PEP 604 users have the future import.

---

### CRITICAL: Keep User-Facing Python Commands Platform-Aware

Windows does not support shebang (`#!/usr/bin/env python3`). For any
user-facing invocation string (docstrings, help text, error messages), either:

- describe the rule explicitly: `python` on Windows, `python3` elsewhere
- or render the command via the same placeholder / helper used at init time

Do not hardcode `python3` into docs and then run `python` internally on
Windows; that drift causes misleading bootstrap instructions.

```python
# In docstrings
"""
Usage:
    python task.py create "My Task"      # Windows
    python3 task.py create "My Task"     # macOS/Linux
"""

# In error messages
print("Usage: python on Windows, python3 elsewhere")
print("Run: {{PYTHON_CMD}} ./.trellis/scripts/init_developer.py <name>")

# In help text
print("Next steps:")
print("  {{PYTHON_CMD}} task.py start <dir>")
```

### Path Separators

Use `pathlib.Path` - it handles separators automatically:

```python
# Good - works on all platforms
path = Path(".trellis") / "scripts" / "task.py"

# Bad - Unix-only
path = ".trellis/scripts/task.py"
```

---

## Task Lifecycle Hooks

### Scope / Trigger

Task lifecycle events (`after_create`, `after_start`, `after_finish`, `after_archive`) execute user-defined shell commands configured in `config.yaml`.

### Signatures

```python
# config.py — read hook commands from config
def get_hooks(event: str, repo_root: Path | None = None) -> list[str]

# task.py — execute hooks (never blocks main operation)
def _run_hooks(event: str, task_json_path: Path, repo_root: Path) -> None
```

### Contracts

**Config format** (`config.yaml`):
```yaml
hooks:
  after_create:
    - "python3 .trellis/scripts/hooks/my_hook.py create"
  after_start:
    - "python3 .trellis/scripts/hooks/my_hook.py start"
  after_archive:
    - "python3 .trellis/scripts/hooks/my_hook.py archive"
```

**Environment variables passed to hooks**:

| Key | Type | Description |
|-----|------|-------------|
| `TASK_JSON_PATH` | Absolute path string | Path to the task's `task.json` |

- `cwd` is set to `repo_root`
- Hooks inherit the parent process environment + `TASK_JSON_PATH`

### Subprocess Execution

```python
import os
import subprocess

env = {**os.environ, "TASK_JSON_PATH": str(task_json_path)}

result = subprocess.run(
    cmd,
    shell=True,
    cwd=repo_root,
    env=env,
    capture_output=True,
    text=True,
    encoding="utf-8",    # REQUIRED: cross-platform
    errors="replace",    # REQUIRED: cross-platform
)
```

### Validation & Error Matrix

| Condition | Behavior |
|-----------|----------|
| No `hooks` key in config | No-op (empty list) |
| `hooks` is not a dict | No-op (empty list) |
| Event key missing | No-op (empty list) |
| Hook command exits non-zero | `[WARN]` to stderr, continues to next hook |
| Hook command throws exception | `[WARN]` to stderr, continues to next hook |
| `linearis` not installed | Hook fails with warning, task operation succeeds |

### Wrong vs Correct

#### Wrong — blocking on hook failure
```python
result = subprocess.run(cmd, shell=True, check=True)  # Raises on failure!
```

#### Correct — warn and continue
```python
try:
    result = subprocess.run(cmd, shell=True, ...)
    if result.returncode != 0:
        print(f"[WARN] Hook failed: {cmd}", file=sys.stderr)
except Exception as e:
    print(f"[WARN] Hook error: {cmd} — {e}", file=sys.stderr)
```

### Hook Script Pattern

Hook scripts that need project-specific config (API keys, user IDs) should:
1. Store config in a **gitignored** local file (e.g., `.trellis/hooks.local.json`)
2. Read config at startup, fail with clear message if missing
3. Keep the script itself committable (no hardcoded secrets)

```python
# .trellis/scripts/hooks/my_hook.py — committable, no secrets
CONFIG = _load_config()  # reads from .trellis/hooks.local.json (gitignored)
TEAM = CONFIG.get("linear", {}).get("team", "")
```

---

## Git interaction in scripts

Scripts that auto-stage / auto-commit `.trellis/` paths must go through the
canonical `common/safe_commit.py` helpers. Hand-rolled `git add -A` /
`git add -f` calls have caused real-user data incidents and are forbidden.

### Absolute prohibition: never blanket-stage (`git add -A` / `git add .` / `git add .trellis/`)

> **In this repository, NEVER run `git add -A`, `git add .`, or `git add .trellis/`
> — in any language, any script, any person, any AI. Always stage by precise path.**

Staging `.trellis/` is only ever allowed via one of two precise routes:

1. **`common/safe_commit.py`'s precise allowlist** — for all Python auto-commits
   (`add_session.py`, `task.py archive`).
2. **`release.js`'s precise pathspec** — for release commits. The pre-release
   sweep MUST exclude `.trellis/` (see `release-process.md`).

For a human/AI assembling an ad-hoc commit: `git status` first, then
`git add <path>` per file. Never blanket-stage.

#### Why: "unscoped `.trellis` staging" is a bug CLASS, not one bug (#303)

The same defect — auto-staging more of `.trellis/` than the current scope —
recurs across **three independent triggers**, and a fix to one does not
propagate to the others:

| Trigger | Site | Staging route |
|---|---|---|
| Session auto-commit | `add_session.py:_auto_commit_workspace` | `safe_trellis_paths_to_add` (Python) |
| Release pre-commit | `release.js` "chore: pre-release updates" | `git add -A` pathspec (Node) |
| Ad-hoc human/AI commit | manual `git add -A` / `git add .` | none — pure behavior |

v0.5.14 fixed only the `task.py archive` symptom (`safe_archive_paths_to_add`).
The session helper kept the wide `tasks_dir.iterdir()` scan, and the release
script + ad-hoc human/AI commits never went through the Python layer at all —
so the class re-surfaced (#303 plus 3 live recurrences in one session). Two of
the three triggers (release, ad-hoc) bypass `safe_commit.py` entirely; the
prohibition above is what closes those two escape hatches.

#### Parity invariant (enforced by code + tests)

> **Any staging helper, when given a `task_name`, MUST NOT do a
> `tasks_dir.iterdir()` full scan over all task dirs.** It stages ONLY the
> named task dir (active or archived) plus explicitly-passed children.

This holds for both `safe_trellis_paths_to_add(..., task_name=...)` and
`safe_archive_paths_to_add(..., task_name=...)`. The legacy no-`task_name`
wide branches exist only for backwards-compat and are dormant: every live
caller passes `task_name`. When the current task cannot be resolved (0 or ≥2
parallel sessions), `add_session.py:_auto_commit_workspace` does NOT fall back
to the wide scan — it stages only the developer's journal/index and skips
every task dir, so the parallel-window case can never silently re-open the
wide scope.

### Canonical helpers

| Helper | Source | Purpose |
|---|---|---|
| `safe_trellis_paths_to_add(repo_root, task_name=None)` | `templates/trellis/scripts/common/safe_commit.py:safe_trellis_paths_to_add` | Path whitelist for `add_session.py` — current developer's journal files + index.md, and (when `task_name` is passed) ONLY the current task dir. Callers MUST pass `task_name` so parallel-window dirty task dirs never leak into the session commit (#303). |
| `safe_archive_paths_to_add(repo_root, task_name=None, modified_children=None)` | `templates/trellis/scripts/common/safe_commit.py:safe_archive_paths_to_add` | Path whitelist for `task.py archive` — archive subtree + explicitly-passed `modified_children` task dirs (parent/child relationship updates). Callers MUST pass `task_name`. |
| `safe_git_add(paths, repo_root)` | `templates/trellis/scripts/common/safe_commit.py:safe_git_add` | Plain `git add -- <paths>`; never `-f`. Returns `(success, used_force=False, stderr)` |
| `print_gitignore_warning(paths)` | `templates/trellis/scripts/common/safe_commit.py:print_gitignore_warning` | Single source of truth for the "ignored by .gitignore" warning, including the AI-defense negative example |
| `get_session_auto_commit(repo_root)` | `templates/trellis/scripts/common/config.py:get_session_auto_commit` | Reads `session_auto_commit` from `.trellis/config.yaml` (default `True`) |

Callers using this contract: `add_session.py:_auto_commit_workspace` and
`task_store.py:_auto_commit_archive` (invoked from `task.py archive`).

### Anti-pattern: AI-invented `git add -f .trellis/`

A real user incident (pre-0.5.10): a project's `.gitignore` listed `.trellis/`
as a company-wide template. When the auto-commit hit `ignored by .gitignore`,
the AI agent driving the workflow "fixed" the failure by retrying with
`git add -f .trellis/`. That fan-out included every ignored subtree
(`.trellis/.backup-*/`, `.trellis/worktrees/`, `.trellis/.template-hashes.json`,
`.trellis/.runtime/`), committing 548 files / 83474 lines of caches and
backups before anyone noticed.

The root cause is generic fallback hint text in scripts, e.g. "run
`git add .trellis && git commit`" — AI agents see "ignored by" and reinvent
`-f` to bypass `.gitignore`, even when no human author would do that.

### Anti-pattern: scripts auto-`-f`-ing on narrow paths

0.5.10's first attempt at fixing the AI-invented `-f` was to have scripts
themselves run `git add -f` against a narrow whitelist (journal files, task
dirs). That was reverted in 0.5.11 because it still violates user `.gitignore`
intent — putting `.trellis/` in `.gitignore` is an explicit signal "do not
track this." A script silently bypassing that with `-f`, even on a narrow
path list, is unacceptable.

The wider-grain `git add -f .trellis/` stays forbidden, AND the narrow-grain
auto `-f` is gone. There is no `-f` retry anywhere in the auto-commit path.

### Pattern: path whitelist + plain `git add` + warn-and-skip

```python
# add_session.py / task.py archive
from common.safe_commit import (
    safe_trellis_paths_to_add,
    safe_git_add,
    print_gitignore_warning,
)
from common.config import get_session_auto_commit

def _auto_commit_workspace(repo_root: Path) -> None:
    if not get_session_auto_commit(repo_root):
        print("[OK] session_auto_commit: false — skipping git stage/commit.",
              file=sys.stderr)
        return

    # Scope staging to the CURRENT task only (#303) — never iterdir all tasks.
    current = get_current_task(repo_root)
    if current:
        paths = safe_trellis_paths_to_add(repo_root, task_name=Path(current).name)
    else:
        # Task unknown (0 / >=2 parallel sessions): stage journal/index only,
        # drop every task dir — do NOT re-open the wide scan.
        paths = [
            p for p in safe_trellis_paths_to_add(repo_root, task_name=None)
            if not p.startswith(".trellis/tasks/")
        ]
    if not paths:
        return

    success, _, err = safe_git_add(paths, repo_root)  # plain `git add --`, no -f
    if not success:
        if "ignored by" in err.lower():
            print_gitignore_warning(paths)        # canonical warning text
        else:
            print(f"[WARN] git add failed: {err.strip()}", file=sys.stderr)
        return

    # ... `git diff --cached --quiet` then `git commit -m <message>`
```

Behavior contract:

- Whitelist is built only from paths that exist on disk; never pass
  non-existent arguments to `git`.
- `safe_git_add` runs `git add -- <paths>` exactly once. No retry, no `-f`.
- On `ignored by` failure → call `print_gitignore_warning(paths)`.
  `add_session.py` returns after writing files to disk. `task.py archive`
  returns success only when the archived source was not tracked; if tracked
  task files were moved and the archive commit cannot be created, `archive`
  exits non-zero so callers do not continue to journal over dirty deletes.
- On any other failure → log the stderr and return. Do not re-attempt with
  different flags.
- `task.py archive` is stricter than `add_session.py`: when `session_auto_commit`
  is enabled and the source task had tracked files, the archive move must be
  accompanied by a successful bookkeeping commit. A failed commit leaves the
  move on disk but exits non-zero with a "Resolve `git status` before
  continuing" message.
- `used_force` in `safe_git_add`'s return tuple is kept for signature
  compatibility but is always `False`. Do not introduce a code path that
  sets it to `True`.

### Pattern: `session_auto_commit` config gate (added 0.5.11)

```yaml
# .trellis/config.yaml
# session_auto_commit: true   # default — auto-stage + auto-commit
session_auto_commit: false    # files written, git left untouched
```

- `true` (default) — `add_session.py` and `task.py archive` stage + commit
  via the helpers above.
- `false` — early-return before touching git. Files are still written; the
  user runs `git status` / `git add` / `git commit` themselves.
- Always read via `get_session_auto_commit(repo_root)`. Do not write a custom
  YAML reader (see "Config helpers" below).

`session_auto_commit: false` is the recommended escape hatch for users whose
`.gitignore` intentionally excludes `.trellis/` and who want session data kept
local-only.

### Pattern: warning text as canonical AI-defense surface

`print_gitignore_warning` in `templates/trellis/scripts/common/safe_commit.py`
is the **single source of truth** for the "ignored by .gitignore" warning.
Any script that hits this failure mode must call this helper rather than
inlining a copy.

The warning text MUST contain the literal forbidden command as a negative
example so any AI rereading the log does not reinvent the bug:

```
[WARN] Do NOT use `git add -f .trellis/` — it pulls in backups, worktrees,
[WARN] and runtime caches that should never be committed.
```

This is the AI-defense pattern: when a script prints a warning that an AI
agent might misinterpret as "try the obvious bypass," put the bypass command
in the warning as a labeled negative example. Centralize the text in one
helper so future edits stay consistent.

### Wrong vs Correct

#### Wrong — any blanket stage (`git add -A` / `git add .` / `git add .trellis/`)

```python
# All three blanket the working tree and sweep in untracked files under
# .trellis/ — parallel-window task dirs, .trellis/.backup-*/,
# .trellis/worktrees/, runtime caches. Forbidden everywhere (#303).
subprocess.run(["git", "add", "-A"], cwd=repo_root)
subprocess.run(["git", "add", "."], cwd=repo_root)
subprocess.run(["git", "add", "-A", ".trellis/"], cwd=repo_root)
```

#### Wrong — wide `iterdir()` scope despite knowing the current task

```python
# Stages EVERY active task dir, leaking dirty parallel-window tasks into an
# unrelated commit (the original #303 body in safe_trellis_paths_to_add).
for child in sorted(tasks_dir.iterdir()):
    paths.append(f".trellis/tasks/{child.name}")
```

#### Wrong — `-f` retry on `ignored by`

```python
rc, _, err = run_git(["add", "--", *paths], cwd=repo_root)
if "ignored by" in err.lower():
    run_git(["add", "-f", "--", *paths], cwd=repo_root)  # reverted in 0.5.11
```

#### Correct — current-task-scoped whitelist + plain add + warn-and-skip

```python
current = get_current_task(repo_root)
task_name = Path(current).name if current else None
paths = safe_trellis_paths_to_add(repo_root, task_name=task_name)
success, _, err = safe_git_add(paths, repo_root)
if not success:
    if "ignored by" in err.lower():
        print_gitignore_warning(paths)
    else:
        print(f"[WARN] git add failed: {err.strip()}", file=sys.stderr)
    return
```

### Tests Required

When changing `safe_commit.py`, `add_session.py:_auto_commit_workspace`, or
`task_store.py:_auto_commit_archive`:

- `safe_trellis_paths_to_add` excludes `.trellis/.backup-*`, `.trellis/worktrees/`,
  `.trellis/.template-hashes.json`, `.trellis/.runtime`, `.trellis/.cache/`.
- `safe_git_add` returns `(False, False, stderr)` when paths are gitignored;
  `used_force` is never `True` in any returned tuple.
- `print_gitignore_warning` output contains the literal substring
  `Do NOT use \`git add -f .trellis/\``.
- `_auto_commit_*` early-returns when `session_auto_commit: false`, with no
  `git` subprocess invocations.
- **Scope-creep guard (required for both staging routes):** with two parallel
  task dirs both dirty, running the auto-commit in task-a's context must NOT
  stage or commit any `task-b` path, and `task-b` stays dirty. Mirror
  `task-archive.integration.test.ts` ("does not bundle dirty changes from
  other task dirs") for the session route in
  `add-session.integration.test.ts`.
- **Parity invariant:** `safe_trellis_paths_to_add(repo_root, task_name=...)`
  returns only the named task dir (active or archived), never the whole task
  list.

---

## CLI Mode Extension Pattern

### Design Decision: `--mode` for Context-Dependent Output

When a script needs different output for different use cases, use `--mode` (not separate scripts or additional flags).

**Example**: `get_context.py` serves two modes:
- `--mode default` — full session runtime (DEVELOPER, GIT STATUS, RECENT COMMITS, CURRENT TASK, ACTIVE TASKS, MY TASKS, JOURNAL, PATHS)
- `--mode record` — focused output for record-session (MY ACTIVE TASKS first with emphasis, GIT STATUS, RECENT COMMITS, CURRENT TASK)

```python
parser.add_argument(
    "--mode", "-m",
    choices=["default", "record"],
    default="default",
    help="Output mode: default (full context) or record (for record-session)",
)
```

### Session Context Git Contract

#### 1. Scope / Trigger

`common/session_context.py` must probe the Trellis root with
`git rev-parse --is-inside-work-tree` before rendering root Git status.
This applies to default text, default JSON, record text, and record JSON.

#### 2. Signatures

```python
def _collect_root_git_info(repo_root: Path) -> dict
def _collect_package_git_info(
    repo_root: Path,
    discover_unconfigured: bool = False,
) -> list[dict]
```

#### 3. Contracts

Root Git JSON includes `isRepo`, `branch`, `isClean`, `uncommittedChanges`,
and `recentCommits`.

When the root is a Git worktree, default and record text modes render:

```text
## GIT STATUS
Branch: <branch>
Working directory: <state>

## RECENT COMMITS
...
```

When the root is not a Git worktree, context must not render synthetic root
values such as `Branch: unknown`, `Working directory: Clean`, or `(no commits)`.
It must render:

```text
## GIT STATUS
Root is not a Git repository.
Run Git commands from the package repository paths listed below.

## RECENT COMMITS
Root has no Git commit history because it is not a Git repository.
```

For non-Git roots, JSON must set `isRepo: false`, `branch: ""`, and
`isClean: false` so consumers do not interpret the root as a clean repository.

Package repository sections are appended after root context. Configured
`packages.<name>.git: true` entries are authoritative. If the root is not a Git
repo and no configured package repos are available, runtime may fall back to the
bounded child-repository scan documented in `directory-structure.md`.

#### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Root `rev-parse --is-inside-work-tree` succeeds | Render root branch/status/log |
| Root probe fails | Render explicit non-Git-root note; skip root status/log commands |
| Configured `git: true` package has `.git` | Render package status/log |
| Configured package path lacks `.git` | Skip that package |
| Root is not Git and configured package repos are empty | Run bounded child repo discovery |
| Fewer than two child repos are discovered | Do not infer polyrepo layout |

#### 5. Good/Base/Bad Cases

- Good: root is Git; output is unchanged from the normal root Git status.
- Base: root is not Git but `packages.*.git: true` is configured; output gives
  the root note, then package repo sections.
- Bad: root is not Git and output says `Branch: unknown` or
  `Working directory: Clean`.

#### 6. Tests Required

- Text context: root non-Git with configured `git: true` package.
- Record context: same non-Git-root rendering as default text mode.
- Runtime fallback: root non-Git with multiple unconfigured child repos.
- JSON context: root non-Git has `isRepo: false` and `isClean: false`.

#### 7. Wrong vs Correct

Wrong:

```text
## GIT STATUS
Branch: unknown
Working directory: Clean
```

Correct:

```text
## GIT STATUS
Root is not a Git repository.
Run Git commands from the package repository paths listed below.
```

**When to add a new mode** (not a new script):
- Output is a subset/reordering of the same data
- The underlying data sources are shared
- The difference is in presentation, not in data fetching

---

## Parsing Structured Command Output

### CRITICAL: Preserve Semantic Whitespace

Many CLI tools encode status information in leading/trailing whitespace characters. **Never blindly `.strip()` before parsing.**

**Example — `git submodule status` output format**:

```
 abc1234 path/to/submodule (v1.0)     ← space prefix = initialized
-def5678 path/to/other (v2.0)         ← minus prefix = not initialized
+ghi9012 path/to/modified (v3.0)      ← plus prefix = modified (out of sync)
```

```python
# BAD — .strip() removes the leading space that means "initialized"
status_line = status_out.strip()
prefix = status_line[0]  # Reads commit hash char, not status prefix!

# GOOD — parse the raw line, then strip individual fields
raw_line = status_out.rstrip("\n")  # Only remove trailing newline
if not raw_line:
    continue
prefix = raw_line[0]               # ' ', '-', or '+'
rest = raw_line[1:].strip()        # Now safe to strip the rest
commit_hash = rest.split()[0]
```

**General rule**: When a command's output uses positional formatting (columns, prefixes, fixed-width fields), parse the structure first, then clean up individual values.

**Other commands with semantic whitespace**:
- `git status --porcelain` — two-char status prefix (`XY`)
- `git diff --name-status` — tab-separated with status prefix
- `docker ps --format` — column-aligned output

---

## Config helpers

All keys in `.trellis/config.yaml` MUST be read through `common/config.py`
(or its hook-side mirror `common/trellis_config.py` for hooks that cannot
import the full task helpers). Both modules share the same parser chain:

```
_load_config(repo_root)
  -> parse_simple_yaml(content)
    -> _strip_inline_comment(value)
    -> _unquote(value)
```

This is a load-bearing chain. Any new key added to `.trellis/config.yaml`
must flow through it — do not write a custom reader, even a "small" one.

### Anti-pattern: custom YAML reader that bypasses `_strip_inline_comment`

Symptom: a value like `key: value  # comment` parses as `value  # comment`
or as `value` plus garbage, depending on the reader's `.split("#")` /
`.strip()` strategy. Tests that don't use the inline-comment form pass; live
configs with the `# explanation` annotation in `templates/trellis/config.yaml`
break silently.

Two near-misses worth remembering:

- `codex.dispatch_mode` originally had its own ad-hoc YAML reader. A
  `# default` comment on the user's config silently broke dispatch routing.
- `task.py create` must read `codex.dispatch_mode` through
  `get_codex_dispatch_mode()` before deciding whether `.codex/` should seed
  `implement.jsonl` / `check.jsonl`. Missing or invalid values default to
  `inline`, not `sub-agent`.
- `session_auto_commit` (0.5.11) almost shipped with a one-line
  `config.get(...).strip()` reader before being routed through
  `get_session_auto_commit`.

Both were fixed by deleting the custom reader and routing through
`_load_config` + a typed accessor.

### Pattern: typed accessor on top of `_load_config`

```python
# common/config.py
DEFAULT_SESSION_AUTO_COMMIT = True

def get_session_auto_commit(repo_root: Path | None = None) -> bool:
    config = _load_config(repo_root)
    raw = config.get("session_auto_commit", DEFAULT_SESSION_AUTO_COMMIT)
    if isinstance(raw, bool):
        return raw
    s = str(raw).strip().lower()
    if s in ("true", "yes", "1", "on"):
        return True
    if s in ("false", "no", "0", "off"):
        return False
    print(
        f"[WARN] invalid session_auto_commit value: {raw!r}; using true (default)",
        file=sys.stderr,
    )
    return DEFAULT_SESSION_AUTO_COMMIT
```

Each new key gets its own `get_<key>` accessor. The accessor owns:

1. The default constant (named `DEFAULT_<KEY>`, exported alongside the
   accessor).
2. Type coercion (string → bool / int / list as appropriate).
3. Fallback-with-stderr-warn on invalid values. Config errors must NOT
   raise — a bad config line should not block scripts.

### Pattern: boolean tolerance

Boolean accessors must accept native YAML `true` / `false` plus the
case-insensitive string aliases `true / false / yes / no / 1 / 0 / on / off`.
Anything else falls back to the default with a stderr warning.

This breadth matters because the simple YAML parser does not coerce
`true`/`false` to native bool — values arrive as strings. A reader that only
checks `raw is True` misses every quoted-or-unquoted string variant the user
naturally writes.

### Pattern: document every key in `templates/trellis/config.yaml`

Every accessor in `common/config.py` must have a corresponding commented-out
example in `packages/cli/src/templates/trellis/config.yaml`, with:

- A short prose explanation of effects (default behavior + opt-in/opt-out
  semantics).
- The accepted values, including the boolean alias set when relevant.
- The default value commented out (so the key is discoverable but the file
  doesn't override the in-code default until the user uncuts it).

```yaml
# Auto-commit behavior for session journal + task archive operations.
# - true (default): scripts auto-stage and auto-commit ...
# - false: scripts do not touch git. Files are still written to disk; ...
#
# Accepts: true / false / yes / no / 1 / 0 / on / off (case-insensitive).
#
# session_auto_commit: true
```

If the key is undocumented in `config.yaml`, users discover it only by
reading source — which guarantees they will instead invent a custom
workaround (see "AI-invented `git add -f`" above for what custom
workarounds look like in practice).

### Pattern: fixture tests must include the inline-comment form

Test fixtures for any config accessor MUST include at least one row of the
form `key: value  # comment`. This is the form that breaks custom readers
silently. Without this fixture, regressions in `_strip_inline_comment` go
undetected.

```python
# test fixture
config_yaml = """
session_auto_commit: false  # opt out — gitignored .trellis/
session_commit_message: "chore: record"  # custom message with quotes
"""
# Both must parse to the unquoted, comment-free value.
```

### Wrong vs Correct

#### Wrong — custom reader, no inline-comment handling

```python
def _read_session_auto_commit(repo_root: Path) -> bool:
    text = (repo_root / ".trellis/config.yaml").read_text(encoding="utf-8")
    for line in text.splitlines():
        if line.startswith("session_auto_commit:"):
            return line.split(":", 1)[1].strip() == "true"
    return True
# Fails on `session_auto_commit: false  # opt out` — returns True.
```

#### Correct — typed accessor on `_load_config`

```python
from common.config import get_session_auto_commit

if not get_session_auto_commit(repo_root):
    return  # respects inline comments, quotes, and bool aliases
```

### Tests Required

When adding a new accessor in `common/config.py`:

- Default behavior when the key is absent from `config.yaml`.
- Value with inline comment: `key: value  # comment`.
- Value with surrounding quotes: `key: "value"` and `key: 'value'`.
- For boolean accessors: each of `true / false / yes / no / 1 / 0 / on / off`
  in both upper and lower case.
- Invalid value → returns default, prints stderr warning, does not raise.

---

## Monorepo Config API (`common/config.py`)

### Config Functions

| Function | Return | Purpose |
|----------|--------|---------|
| `is_monorepo(repo_root)` | `bool` | Whether `packages:` exists in config.yaml |
| `get_packages(repo_root)` | `dict[str, dict] \| None` | All packages from config.yaml (`{name: {path, type?}}`) |
| `get_default_package(repo_root)` | `str \| None` | The `default_package` from config.yaml |
| `get_submodule_packages(repo_root)` | `dict[str, str]` | Packages with `type: submodule` (`{name: path}`) |
| `get_spec_base(package, repo_root)` | `str` | `"spec"` (single-repo) or `"spec/<package>"` (monorepo) |
| `validate_package(package, repo_root)` | `bool` | Whether package exists in config (always `True` for single-repo) |
| `resolve_package(task_pkg, repo_root)` | `str \| None` | Resolve package: task → default → None |
| `get_spec_scope(repo_root)` | `str \| list \| None` | The `session.spec_scope` config value |
| `get_hooks(event, repo_root)` | `list[str]` | Hook commands for lifecycle event |

### Config.yaml Schema

```yaml
# Auto-detected monorepo packages (written by trellis init)
packages:
  cli:
    path: packages/cli
  docs-site:
    path: docs-site
    type: submodule       # optional, marks git submodule
default_package: cli      # first non-submodule package

# Session behavior
session:
  spec_scope: active_task  # or ["cli", "docs-site"] or omit for full scan

# Update behavior
update:
  skip:
    - .claude/commands/trellis/my-custom.md

# Lifecycle hooks
hooks:
  after_create:
    - "python3 .trellis/scripts/hooks/my_hook.py create"
```

### Task → Package Binding Contract

**Rule**: The `package` field on a task is **bound at `task create` time and frozen into `task.json.package`**. Downstream scripts read that field; they do **not** re-resolve package from path, cwd, or runtime context.

**Why it matters**: Once a task exists, changing `default_package` in `config.yaml` will not retroactively rebind existing tasks. Path-based inference is not implemented anywhere in the script layer — callers (human or AI) must pass `--package` explicitly if they want non-default binding.

**Resolution order at `task create`** (`common/task_store.py:cmd_create`):

| Priority | Source | Behavior on invalid value |
|---|---|---|
| 1 | CLI `--package <pkg>` (explicit) | **Fail-fast**: print available packages, exit 1 |
| 2 | `default_package` (config.yaml) | Warn to stderr, fall through to `None` |
| 3 | `None` | Task stored with `package: null` (allowed; spec scope falls back to full scan) |

Single-repo mode (`packages:` absent from config): `--package` triggers a stderr warning and is silently ignored; stored `package` is always `None`.

**Resolution order at read-time** (any script reading an existing task):

| Priority | Source |
|---|---|
| 1 | `task.json.package` (the frozen binding) |
| 2 | `resolve_package(task_package=..., repo_root=...)` — falls back to `default_package` if `task.json.package` is missing/invalid |

Do **not** re-infer package from cwd, worktree path, or git remote. If the task is mis-bound, fix the stored field, do not wrap reads in path logic.

**Spec scope is a separate layer** (`common/packages_context.py:_resolve_scope_set`). It consumes `task.package` but also has its own config surface `session.spec_scope`:

| `session.spec_scope` value | Behavior |
|---|---|
| omitted / `null` | Full scan — all packages in `spec_scope` |
| `"active_task"` | Use current task's `package`; fall back to `default_package` if missing |
| `list[str]` | Use the explicit list; invalid entries fall back to task / default |

### Wrong vs Correct

#### Wrong — re-inferring package at read-time

```python
# DON'T: re-derive package from cwd
def get_task_package(task_dir: Path) -> str | None:
    cwd = Path.cwd()
    for name, cfg in get_packages(repo_root).items():
        if cwd.is_relative_to(repo_root / cfg["path"]):
            return name
    return get_default_package(repo_root)
```

Why wrong: silently diverges from `task.json.package`. A task created under `packages/cli` but later read from `docs-site/` would flip package, breaking spec scope, session runtime, and Linear sync idempotency.

#### Correct — read the frozen field, fall back through `resolve_package`

```python
task = load_task(task_dir)
task_package = task.package if task and isinstance(task.package, str) else None
package = resolve_package(task_package=task_package, repo_root=repo_root)
# package is now: task.json binding → default_package → None (in that order)
```

### Tests Required

When changing `cmd_create`, `resolve_package`, or `validate_package`:

- `test/commands/task_store.test.ts` (or equivalent Python test):
  - `--package <valid>` in monorepo → `task.json.package == <valid>`
  - `--package <invalid>` in monorepo → exit 1, stderr lists available packages, no `task.json` written
  - `--package <anything>` in single-repo → warning on stderr, `task.json.package is None`
  - no `--package` in monorepo with `default_package` set → `task.json.package == default_package`
  - no `--package` in monorepo with `default_package` missing from `packages:` → warning, `task.json.package is None`
- Assertion points: `task_json_path.exists()`, `read_json(task_json_path)["package"]`, captured stderr.

---

## Error Handling

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Usage error (wrong arguments) |

### Error Messages

Print errors to stderr with context:

```python
import sys

def error(msg: str) -> None:
    """Print error message to stderr."""
    print(f"Error: {msg}", file=sys.stderr)

# Usage
if not repo_root:
    error("Not in a Trellis project (no .trellis directory found)")
    sys.exit(1)
```

---

## Argument Parsing

Use `argparse` for consistent CLI interface:

```python
import argparse


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Task management",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 task.py create "Add login" --slug add-login
  python3 task.py list --mine --status in_progress
"""
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    # create command
    create_parser = subparsers.add_parser("create", help="Create new task")
    create_parser.add_argument("title", help="Task title")
    create_parser.add_argument("--slug", help="URL-friendly name")

    # list command
    list_parser = subparsers.add_parser("list", help="List tasks")
    list_parser.add_argument("--mine", "-m", action="store_true")
    list_parser.add_argument("--status", "-s", choices=["planning", "in_progress", "review", "completed"])

    args = parser.parse_args()

    if args.command == "create":
        return cmd_create(args)
    elif args.command == "list":
        return cmd_list(args)

    return 0
```

---

## Import Conventions

### Relative Imports Within Package

```python
# In task.py (root level)
from common.paths import get_repo_root, DIR_WORKFLOW
from common.developer import get_developer

# In common/developer.py
from .paths import get_repo_root, DIR_WORKFLOW
```

### Standard Library Imports

Group and order imports:

```python
# 1. Future imports
from __future__ import annotations

# 2. Standard library
import argparse
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# 3. Local imports
from common.paths import get_repo_root
from common.developer import get_developer
```

---

## Module Split Patterns

When a script grows too large (300+ lines of logic), split it into focused modules. These patterns were established during the v0.4.0 refactoring of `task.py` (1375→456 lines), `git_context.py` (724→80 lines), and `status.py` (783→79 lines).

### Pattern: Entry Shim

Keep the original filename as a thin dispatcher that imports from new modules. This preserves all external references (`.md` templates, other scripts doing `from task import cmd_create`).

```python
# task.py — entry shim (argparse + dispatch only)
from __future__ import annotations

import argparse
import sys

from common.task_store import cmd_create, cmd_archive   # CRUD operations
from common.task_context import cmd_init_context         # JSONL management

def main() -> int:
    parser = argparse.ArgumentParser(...)
    args = parser.parse_args()
    if args.command == "create":
        return cmd_create(args)
    # ... dispatch table
    return 0

if __name__ == "__main__":
    sys.exit(main())
```

**Key rules**:
- Original file path stays stable (e.g., `python3 .trellis/scripts/task.py`)
- Imported names become re-exports for backward compatibility
- Display-only commands (like `cmd_list`) can stay in the shim if they don't warrant a new module

### Pattern: Lazy Import for Circular Dependencies

When two split modules need each other (A imports from B, B imports from A), use a lazy import inside the function body:

```python
# status_display.py — imports status_monitor at call time, not module load time
def cmd_summary(repo_root: Path, filter_assignee: str | None = None) -> int:
    # Lazy import: status_monitor imports find_agent from this module
    from .status_monitor import get_last_tool, get_last_message

    # ... use get_last_tool, get_last_message
```

**When to use**: Only when a true circular dependency exists. If you can restructure imports to avoid it, do that first.

### Pattern: Internal Helpers to Avoid Redundant File Reads

When multiple public functions read the same file and call each other, extract private helpers that operate on a pre-loaded `data: dict`:

```python
# BAD — get_phase_info reads task.json 3 times
def get_phase_info(task_json: Path) -> str:
    data = read_json(task_json)              # read 1
    total = get_total_phases(task_json)      # read 2 (inside)
    action = get_phase_action(task_json, p)  # read 3 (inside)

# GOOD — read once, pass data to private helpers
def _total_phases(data: dict) -> int:
    next_action = data.get("next_action", [])
    return len(next_action) if isinstance(next_action, list) else 0

def _phase_action(data: dict, phase: int) -> str:
    # ... operate on data dict directly

def get_phase_info(task_json: Path) -> str:
    data = read_json(task_json)              # read once
    total = _total_phases(data)              # no file I/O
    action = _phase_action(data, phase)      # no file I/O
```

**When to use**: Any module where public functions compose by calling other public functions that each read the same file (e.g., `task_store.py`, `config.py`).

---

## DO / DON'T

### DO

- Use `pathlib.Path` for all path operations
- Use type hints (Python 3.10+ syntax)
- Return exit codes from `main()`
- Print errors to stderr
- Keep user-facing Python commands platform-aware
- Use `encoding="utf-8"` for all file operations

### DON'T

- Don't use string path concatenation
- Don't use `os.path` when `pathlib` works
- Don't rely on shebang for invocation documentation
- Don't use `print()` for errors (use stderr)
- Don't hardcode paths - use constants from `common/paths.py`
- Don't use external dependencies (stdlib only)

---

## Example: Complete Script

See `.trellis/scripts/task.py` for a comprehensive example with:
- Multiple subcommands
- Argument parsing
- JSON file operations
- Error handling
- Cross-platform path handling

---

## Migration Note

> **Historical Context**: Scripts were migrated from Bash to Python in v0.3.0 for cross-platform compatibility. In v0.5.0, the `multi_agent/` pipeline directory (`plan.py`, `start.py`, `status.py`, etc.) was removed along with `phase.py`, `registry.py`, and `worktree.py` from `common/`. The `_bootstrap.py` shim is no longer needed.
