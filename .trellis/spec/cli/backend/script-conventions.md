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
│   ├── task_utils.py     # resolve_task_dir(), is_within_tasks_dir(), run_task_hooks()
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

## Two script trees, one content

### 1. Scope / Trigger

Every file above exists **twice**: `.trellis/scripts/**` is Trellis's own
dogfood copy, `packages/cli/src/templates/trellis/scripts/**` is what ships to
users. Two physical copies of one thing drift, and this pair did: PR #390
changed the `trellis upgrade` → `update` hint in the template copy only, and
the dogfood copy sat on the old wording for a month.

That is now a build failure. It is written here because until 2026-08-06 three
specs described this pair with three different rules and none named a test.

### 2. Signatures

No API — the contract is a test, `regression.test.ts` → `describe("regression:
.trellis/scripts stays byte-identical to templates/trellis/scripts")`.

```ts
function listPyFiles(root: string): string[]   // recursive, skips __pycache__, sorted
```

### 3. Contracts

- **Identical path sets.** `listPyFiles()` over both roots must produce the same array. A script added to or deleted from one tree must be mirrored in the other.
- **Byte-identical content.** One test case per `.py` file, `Buffer.equals`. Not a text diff — line endings and trailing whitespace count.
- The file list is derived from the filesystem at describe-time, so a new script is covered the moment it is added. Never hard-code it.
- Scope is **`.py` files only**, by construction: `listPyFiles` filters on the extension. *Open question, deliberately unresolved:* whether non-`.py` files under the two trees should also be required to match. Today there are none — both trees are pure Python — so nothing is being ignored. If a non-`.py` file is ever added to either tree, decide the rule then rather than assuming this test covers it.
- Direction is irrelevant to the test. `guides/code-reuse-thinking-guide.md` documents a one-way `rsync` (`.trellis/scripts/` → template) as the convenient way to restore parity; the test only cares that they end up equal.

### 4. Validation & Error Matrix

| Condition | Failure |
| --- | --- |
| A `.py` file exists in one tree only | "both trees hold the same set of .py files" — the array compare shows exactly which |
| Contents differ by any byte | "`<path>` has drifted … Edit both copies, never one." |
| `__pycache__` present in either tree | Skipped — not a failure |
| Someone edits `packages/cli/dist/**` instead | Not covered; `dist/` is generated. Never hand-edit it |

### 5. Good / Base / Bad Cases

- **Good** — a fix to `common/active_task.py` is applied to both paths in one commit; the suite stays green.
- **Base** — a new script `common/foo.py` is added to both trees. No test edit is needed; the derived list picks it up.
- **Bad** — "the dogfood copy has local drift, so I'll apply the edit surgically and keep the drift." There is no such thing as acceptable drift here any more; that instruction now breaks CI.

### 6. Tests Required

Already present and self-extending. When you touch either tree, the assertion
point is the whole-tree comparison — do not add per-file tests of your own.
Confirm locally with:

```bash
diff -rq .trellis/scripts packages/cli/src/templates/trellis/scripts -x __pycache__
```

Silent output means parity.

### 7. Wrong vs Correct

#### Wrong

```bash
# edit only the copy you happened to open
$EDITOR packages/cli/src/templates/trellis/scripts/common/session_context.py
```

#### Correct

```bash
$EDITOR .trellis/scripts/common/session_context.py
rsync -av --delete --exclude='__pycache__' \
  .trellis/scripts/ packages/cli/src/templates/trellis/scripts/
diff -rq .trellis/scripts packages/cli/src/templates/trellis/scripts -x __pycache__
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
    except (FileNotFoundError, json.JSONDecodeError, OSError, UnicodeDecodeError):
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

The names below are placeholders for the pattern. The one live instance is
`session_context.py:get_update_hint` — **public**, with two callers in
different layers (`get_context.py` text mode and `shared-hooks/session-start.py`),
and it takes an optional `context_key`. Its full contract, including how the
result reaches the user, is in `platform-integration.md` → "SessionStart update
reminder".

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
  Trellis session identity when available. A caller that has already resolved
  session identity (a hook reading it from stdin) **passes it in** rather than
  letting the module re-resolve: the module's own fallback chain ends at
  `TERM_SESSION_ID`, which identifies a terminal *window*, so a
  once-per-session marker keyed on it would mute the check for every later
  session opened in that window.
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
- Non-default modes of the *text-mode CLI caller* (`--json`, record, packages,
  phase) do not call the advisory check. This is a property of that caller, not
  of the check — a second caller (the SessionStart hook) legitimately invokes it
  outside `get_context.py` entirely.

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

### `common/io.py` — File I/O

The single source of truth for all JSON file operations. Replaces 8 duplicated `_read_json_file` and 5 duplicated `_write_json_file` functions. It also owns `write_text_atomic`, the same never-truncate-in-place guarantee for the Markdown state files (`journal-*.md`, `index.md`) that hold durable session state.

| Function | Signature | Returns | Error Behavior |
|----------|-----------|---------|----------------|
| `read_json` | `(path: Path) -> dict \| None` | Parsed dict, or `None` | Returns `None` on `FileNotFoundError`, `JSONDecodeError`, `OSError`, `UnicodeDecodeError` |
| `read_json_checked` | `(path: Path) -> tuple[dict \| None, str \| None]` | `(data, None)`, or `(None, reason)` | `reason` is one of the `JSON_READ_*` constants; compare against the constant, never the literal (see the value table below) |
| `describe_json_read_failure` | `(path: Path, reason: str \| None) -> tuple[str, str]` | `(what happened, what to do)` | Never raises; unknown reasons get a generic pair |
| `write_json` | `(path: Path, data: dict) -> bool` | `True` on success | Returns `False` on `OSError`, `IOError` |
| `write_text_atomic` | `(path: Path, text: str) -> bool` | `True` on success | Returns `False` on `OSError`; unlinks the temp file and re-raises on `BaseException` (Ctrl-C) |

`read_json_checked` reason constants and the values they carry:

| Constant | Value | Raised by |
|----------|-------|-----------|
| `JSON_READ_MISSING` | `"missing"` | `FileNotFoundError` |
| `JSON_READ_UNDECODABLE` | `"undecodable"` | `UnicodeDecodeError` — the bytes are not UTF-8 |
| `JSON_READ_UNREADABLE` | `"unreadable"` | any other `OSError` (permissions, I/O) |
| `JSON_READ_INVALID` | `"invalid"` | `json.JSONDecodeError` |
| `JSON_READ_NOT_OBJECT` | `"not-object"` | parsed, but the top level is not a dict |
| `JSON_READ_EMPTY` | `"empty"` | parsed to `{}` — carries none of the fields callers read |

**Contracts**:
- Always uses `encoding="utf-8"` and `ensure_ascii=False`
- `write_json` outputs with `indent=2` (pretty-printed)
- Callers must check return value — no exceptions are raised
- **Tolerant vs safety-sensitive reads.** `read_json` is for *optional* reads
  only: it collapses missing, invalid and unreadable into one `None`, so a
  caller cannot report which happened. Any caller that is about to overwrite
  the file it just read, or whose failure the user must act on, uses
  `read_json_checked` + `describe_json_read_failure` and prints both the file
  and the failure class. Exiting non-zero with empty output — the pre-0.6.14
  behavior of `task.py set-branch` / `set-base-branch` / `set-scope` /
  `set-meta` on a corrupt `task.json` — is not an acceptable failure mode.
- **Every `write_json` return is checked.** A success message printed after an
  unchecked write is a false report: writes are atomic, so a failed write left
  the old content in place and the user believes the new value landed.
  Safety-sensitive writes fail the command (non-zero exit, naming the file and
  which side of a two-file change did land); genuinely optional writes warn on
  stderr. `task.py list` staying silent about a task it skipped counts as a
  safety failure too — the task disappears from every listing with no
  diagnostic, so `tasks.py:load_task` warns on stderr for a `task.json` that
  exists but cannot be loaded (a directory with no `task.json` stays silent).
- Session runtime files go through `write_json` as well: `active_task.py`'s
  private `_write_json` only adds the `mkdir(parents=True)` the runtime
  directory needs and then delegates, so session pointers get the same
  never-truncate-in-place guarantee as `task.json`.
- `write_json` is atomic: it writes to a temp file in `path.parent`
  (`tempfile.mkstemp`) then `os.replace(tmp, path)`. It never
  `path.write_text()`s over the target in place. A crash or Ctrl-C mid-write
  leaves the existing file intact instead of truncated. On failure the tmp
  file is unlinked; a `BaseException` (e.g. `KeyboardInterrupt`) is re-raised,
  while `OSError`/`IOError` from the write itself are caught and return
  `False` as before. This matters for `task.json`: a truncated file reads
  back as `None` from `read_json`, which makes the task silently vanish from
  `task.py list`. See [Filesystem Safety](./filesystem-safety.md#1-atomic-writes--never-truncate-a-state-file-in-place).

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

```python
def resolve_default_branch(repo_root: Path) -> str | None
def branch_exists_locally(branch: str, repo_root: Path) -> bool
def current_branch_name(repo_root: Path) -> str | None
def has_git_remote(repo_root: Path) -> bool
```

- `resolve_default_branch()` tries the local `refs/remotes/origin/HEAD`
  symbolic ref first (no network access), then falls back to
  `git remote show origin` (`HEAD branch: <name>`, which may hit the network
  but also repairs a missing/stale symbolic-ref). Returns `None` when neither
  resolves — callers fall back to their own pre-existing behavior.
- `task_store.py:cmd_create` stamps `task.json.base_branch` from
  `resolve_default_branch()`, falling back to the checked-out branch
  (`git branch --show-current`, or `"main"`) only when the default can't be
  resolved. This fixes creating a task from a feature branch mis-recording
  that feature branch as the PR target (#399).
- `branch_exists_locally()` checks `git rev-parse --verify --quiet
  refs/heads/<branch>`. `task_context.py:cmd_validate` and
  `task_store.py:cmd_archive` call it against `task.json.branch` and print a
  yellow warning (not a failure/block) when the recorded branch no longer
  exists locally — the common case is the branch was already merged and
  deleted upstream.
- `current_branch_name()` returns `git branch --show-current` or `None`;
  detached HEAD and "not a git repository" both come back as `None`, and
  callers must treat them the same — there is no branch worth recording.
- `has_git_remote()` (`git remote`, non-empty) is only used as half of the
  PR-backed predicate below.

```python
def main_worktree_root(repo_root: Path) -> Path | None
```

- Returns the main working tree's root when `repo_root` is a **linked** git
  worktree, and `None` in the main working tree itself, outside a git
  repository, and for a linked worktree of a bare repo.
- The main root comes from the **first record of
  `git worktree list --porcelain`**, compared against `rev-parse
  --show-toplevel` (equal means this *is* the main working tree). A `bare`
  attribute on that first record is the bare case.
- Do **not** re-derive this from the `.git` layout by taking the parent of
  `--git-common-dir`. For a bare repo nested in an unrelated checkout
  (`~/repos/project.git` under a `~/repos` that is itself a repo) that parent
  is a real checkout with a real `.developer`, so the wrong answer is
  indistinguishable from the right one and identity leaks between
  repositories. Covered by `[worktree-identity] a bare repo nested inside an
  unrelated checkout does not leak that checkout's identity`.
- Memoized per `repo_root` for the life of the process: a checkout cannot
  become a worktree mid-run, and the answer costs two subprocesses on a path
  that is consulted several times per command.

#### Developer identity resolution

`.trellis/.developer` is gitignored on purpose — it carries a personal
identity and **no tracked file may carry one**. A fresh `git worktree add`
therefore has no identity file, so `paths.get_developer()` resolves in a fixed
order, first hit wins:

1. `TRELLIS_DEVELOPER` environment variable (non-empty after strip).
2. `.trellis/.developer` in this checkout.
3. `.trellis/.developer` in the main checkout, when this is a linked worktree
   (`main_worktree_root()`).

A CLI `--assignee` overrides all three — it is applied by the command before
`get_developer()` is consulted. Step 3 **reads and never copies**: writing the
inherited name into the worktree would go stale and shadow later changes in
the main checkout. Steps 2 and 3 are skipped entirely when step 1 hits, so no
git subprocess runs on the common path.

Every "no developer set" error appends `paths.DEVELOPER_HINT`, which names the
env var and the worktree-inheritance behavior — the two sources a user cannot
guess from `init_developer.py` alone.

#### `task.json.branch` lifecycle

`branch` names the feature branch the work was done on; `base_branch` names
the branch a PR targets. They must differ for PR-backed work.

- `task.py start` (`task.py:_record_start_state`) records
  `current_branch_name()` into `branch` **only when the field is empty**, in
  the same read/write that flips `planning → in_progress`. An explicit
  `set-branch` therefore survives re-starting a task. On detached HEAD or
  outside git it prints a note and records nothing; the start still succeeds.
  When the recorded branch equals `base_branch` it is written anyway (the
  value is true) and a warning says archive will refuse that shape.
- `task.py archive` (`task_store.py:_validate_branch_metadata`) runs before
  any mutation and refuses, exit 1, when either
  (a) `branch` is empty while `base_branch` is set **and** the repo has a
  remote — the pragmatic definition of "PR-backed": a task created expecting a
  PR whose branch was simply never written down; or
  (b) `branch == base_branch`.
  Both errors name the repair command (`task.py set-branch` /
  `set-base-branch`) — hand-editing `task.json` is never the documented path.
  `--skip-branch-validation` bypasses both for tasks that were never
  PR-backed; it does not suppress the stale-branch warning.
- Local-only repos (no remote) and tasks without a `base_branch` skip the
  missing-branch check entirely.
- Note how wide (a) actually is: `cmd_create` stamps `base_branch` on every
  task, so in a repo with a remote the predicate reduces to "every task must
  have a `branch`". Tasks created before start-time recording landed carry
  `branch: null` and are refused until repaired — repair with `set-branch`,
  or pass `--skip-branch-validation` per archive.
- Repairing an **already-archived** task works the same way, but the bare task
  name no longer resolves; pass the archive path explicitly:
  `task.py set-branch .trellis/tasks/archive/<YYYY-MM>/<task> <branch>`.

### `common/active_task.py` — Active Task Resolver

All current-task consumers must use the active task resolver instead of reading
`.trellis/.current-task` directly. The resolver is the single source of truth
for session/window scoped task state:

1. Derive a context key, in this order (`resolve_context_key`, `:468-509`):
   `TRELLIS_CONTEXT_ID`; then session / conversation / transcript ids from the
   hook payload; then a platform-native session environment variable for the
   detected platform; then a shell ticket for a matching AI-run `task.py`
   command.
2. Read `.trellis/.runtime/sessions/<session-key>.json`.
3. If no context key or no session task is present, return no active task.
4. If a session task exists but the task directory is stale, return stale
   session state.

The env branch is the exception, not a peer alternative. **No researched
platform exports a session id into a shell child** (2026-08-05 audit of all 21;
`inject-shell-session-context.py:3-8`, `active_task.py:59-64`), so for most
platforms the ticket — checked *last* — is the path that actually fires.

| Function | Purpose |
|----------|---------|
| `resolve_context_key(platform_input, platform)` | Accepts `session_id` / `sessionId` / `sessionID`, Cursor `conversation_id`, and transcript path fallbacks |
| `resolve_active_task(repo_root, platform_input, platform)` | Returns an `ActiveTask` with `task_path`, `source_type`, `context_key`, and `stale` |
| `set_active_task(...)` | Writes session runtime state when a context key exists; returns `None` without a context key |
| `clear_active_task(...)` | Deletes the session file that supplied the resolved active task; returns no active task without a context key |

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
already set it, because OpenCode exports no session identity into a
shell child at all. The prefix must match the host shell: use
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
`session-start.py` is not a reliable shell environment bridge on any platform.
The general mechanism is the shell ticket — see "Shell-ticket bridge" below.
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
- `python3 .trellis/scripts/task.py current [--source] [--json]`
- `python3 .trellis/scripts/task.py list [--mine] [--status <status>] [--json]`
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
  repo has a platform configured that consumes those files. For `.codex/`,
  this is gated by `get_codex_dispatch_mode()`: the default is
  `codex.dispatch_mode: auto` (native `SubagentStart` context injection with
  a child-side pull fallback), which seeds JSONL like every other sub-agent
  platform. `sub-agent` is a backwards-compatible alias for `auto`. Setting
  `codex.dispatch_mode: inline` opts out and loads context through skills
  instead, so JSONL is not seeded.
- `task.py start` writes session-local state only when a context key is
  available. Otherwise it enters degraded mode: no session pointer is persisted,
  `.trellis/.current-task` is not written, and `task.json.status` may still move
  from `planning` to `in_progress`.
- Session state is stored at
  `.trellis/.runtime/sessions/<session-key>.json`. The runtime directory is
  created lazily by the JSON write path.
- Context filenames are derived from the resolved context key:
  - `TRELLIS_CONTEXT_ID=session-demo` -> `session-demo.json`
  - `CLAUDE_CODE_SESSION_ID=cc-a` -> `claude_cc-a.json`
  - `CODEX_THREAD_ID=thread-a` -> `codex_thread-a.json`
  - `CURSOR_CONVERSATION_ID=conv-a` -> `cursor_conv-a.json` (`_context_key`
    ignores the session/conversation distinction; only `transcript` changes the
    shape)
  - OpenCode plugin `sessionID=oc-a` -> `opencode_oc-a.json` (via the plugin's
    `TRELLIS_CONTEXT_ID` prefix — OpenCode has no env-table entry)
  - shell ticket -> whatever key the writing hook computed, unchanged
  - transcript fallback -> `<platform>_transcript_<sha256-prefix>.json`

  Only names that appear in `active_task.py`'s env tables, **for the platform
  the resolver detected**, can produce a filename this way. Twelve names were
  removed on 2026-08-05 as names no vendor ever set (`CODEX_SESSION_ID`,
  `CURSOR_SESSION_ID`, `OPENCODE_RUN_ID`, `PI_SESSION_ID` … — the full list is
  `PURGED_ENV_NAMES` in `regression.test.ts`) and resolve nothing for the
  platform they were removed from. Platform scoping matters here:
  `CLAUDE_SESSION_ID` was deleted from the **claude** entry but survives as
  ZCode's second-choice fallback, so it still resolves in a zcode-detected
  session — and yields `claude_<id>`, because `_CONTEXT_KEY_PLATFORM_ALIASES`
  maps `zcode` → `claude` so both paths of a ZCode session land on one runtime
  filename.
- `TRELLIS_CONTEXT_ID` is already a complete context key. Do not prepend a
  platform name to it.
- `task.py finish` deletes only the session file that supplied the resolved
  active task. For an exact match this is the current context key; for a
  single-session fallback it is `ActiveTask.context_key` from that fallback.
  Without a process context key, or when resolution returns no unique active
  task, it deletes nothing. It must never delete `.trellis/.current-task` or
  bulk-clear other sessions.
- `task.py archive <task>` deletes every runtime session file whose
  `current_task` points at the archived task before moving the task directory.
- `resolve_task_dir(target_dir, repo_root)` (`task_utils.py`) is the
  containment chokepoint for every command taking a task-directory argument.
  It resolves the candidate (following symlinks) and returns `None`, after
  printing an error naming the path, unless the result lands strictly under
  `.trellis/tasks/` — archived tasks under `archive/<YYYY-MM>/` included.
  Traversal (`../victim`), an absolute path outside the repo, a task dir
  symlinked elsewhere, an unknown name, and an ambiguous suffix (two tasks
  ending in `-<name>`; every match is printed) all resolve to nothing.
  Callers must handle `None`; they must not add their own containment checks.
- Before moving anything, `cmd_archive` (`task_store.py`) additionally calls
  `is_within_tasks_dir(task_dir_abs, repo_root)` (`task_utils.py`) and refuses
  with "refusing to archive ..." (exit 1) unless the resolved dir is a direct
  child of `.trellis/tasks/`, so an already-archived task is not archived
  twice. A mistyped `task.py archive src` is stopped one step earlier, by
  `resolve_task_dir`, with the same refusal wording. See
  [Filesystem Safety](./filesystem-safety.md#2-path--name-safety--validate-at-the-chokepoint-before-pathjoin).
- `task.py create --slug` is user input joined into the task directory name:
  a slug containing `/`, `\`, or `..` is rejected (exit 1) rather than
  sanitized. `task.py add-context <dir> <file>` applies the same rule to the
  JSONL filename, which is otherwise joined onto the task dir unvalidated.
- `task.py current --json` prints `{current_task, source, stale}` on one
  line (`ensure_ascii=False`); `current_task` is `null` when there is no
  active task, otherwise `{dir, id, title, status, parent, children, branch,
  base_branch}` read from that task's `task.json`. Exit 0 when a task is
  active, exit 1 when `current_task` is `null`. Human output (no `--json`)
  is unchanged. When that `task.json` cannot be read, the fields are still
  emitted as `null` and a fourth key `error` — `{file, reason, message}`,
  with `reason` from `read_json_checked` — is added so all-null output is
  distinguishable from a task whose fields genuinely are null. The key is
  absent on the healthy path, and the exit code is unchanged.
- `task.py list --json` prints `{tasks: [...]}` on one line, one object per
  task after `--mine`/`--status` filtering: `{dir, id, title, status,
  display_status, priority, assignee, parent, children, package}`. With
  `--mine --json` and no developer configured, prints `{"error": "No
  developer set", "hint": ...}` to stderr and exits 1 (mirrors the human-mode
  error; `hint` carries `paths.DEVELOPER_HINT`).
  `--json` and human `list` share one iteration pass over
  `iter_active_tasks()` — do not add a second pass for either mode.
- `display_status` (`_display_status()` in `task.py`) shows `"active"`
  instead of the stored `"planning"` for a parent task when at least one
  child's status is not `None`/`"planning"`. This is a display-only label —
  it never writes back to `task.json.status` — surfaced in both the human
  `list` line and the JSON `display_status` field (#399 item 3).

##### 4. Validation & Error Matrix

| Condition | Required behavior |
|-----------|-------------------|
| `create` without description or with whitespace-only description | Warns on stderr; stores `task.json.description == ""`; initial `prd.md` goal falls back to `TBD.` |
| `create` with context key, default mode | Task files exist; session runtime points at the new task; activation and source are printed; no `.current-task` |
| `create --no-start` with context key | Task files exist; existing session runtime is unchanged; skip notice is printed; no `.current-task` |
| `create` without context key | Task files exist; no `.runtime`; no `.current-task` |
| `create` with `.codex/` and no `codex.dispatch_mode` override (default `auto`) | Task files exist; `implement.jsonl` and `check.jsonl` exist and are empty |
| `create` with `.codex/` and `codex.dispatch_mode: inline` | Task files exist; no `implement.jsonl`; no `check.jsonl` |
| `start` without context key | Returns success in degraded mode; no `.runtime`; no `.current-task`; hints IDE/session identity or `TRELLIS_CONTEXT_ID` |
| `start` with `TRELLIS_CONTEXT_ID` | Writes `.runtime/sessions/<key>.json`; does not require `.current-task` |
| `current --source` with same context key | Prints `Source: session:<key>` |
| `current --source` without context | Prints `(none)` and `Source: none` |
| `current --json` with active task | `{current_task: {...}, source, stale}`; exit 0 |
| `current --json` with no active task | `{current_task: null, source, stale}`; exit 1 |
| `current --json` with an active task whose `task.json` is corrupt/unreadable | `{current_task: {... nulls}, source, stale, error: {file, reason, message}}`; exit 0 |
| `set-branch` / `set-base-branch` / `set-scope` / `set-meta` on a corrupt or unreadable `task.json` | Names the file and the failure class on stderr; exit 1; file untouched |
| Any of those four when the write fails | Reports the failed write instead of the `✓` line; exit 1 |
| `create` when the `task.json` write fails | No "Created task", nothing on stdout, exit 1; a directory it created is removed |
| `archive` when the status write or a child re-parent write fails | Nothing is moved; the failure and the affected child are named; exit 1 |
| `list` with one corrupt `task.json` | Other tasks still list; the skipped task is named on stderr with the reason; exit 0 |
| `start` on a task whose `task.json` is corrupt, or whose status write fails | Session pointer is still set and `after_start` hooks still run; the skipped status flip is named on stderr; exit 0 |
| `list --json --mine` with no developer configured | `{"error": "No developer set", "hint": ...}` on stderr; exit 1 |
| `list --json` / `list` with a parent whose stored status is `planning` and a child past `planning` | `display_status` (and human list label) shows `"active"`; `task.json.status` on disk stays `planning` |
| `archive` / `validate` when `task.json.branch` no longer exists locally | Prints a yellow warning; does not block archive or fail validation |
| stale session task + stale `.current-task` exists | Returns stale session state; no `.current-task` fallback |
| `finish` with an exact context-key match | Deletes only `.runtime/sessions/<exact-key>.json` |
| `finish` with a missing exact match and one fallback session | Deletes only the fallback file named by the resolved `ActiveTask.context_key` |
| `finish` with a missing exact match and multiple session files | Returns no current task and deletes nothing |
| `finish` without context key | Returns no current task; does not delete `.current-task` |
| `archive` for a task referenced by runtime sessions | Deletes those session files even when `finish` was skipped |
| `archive` on a name that is not a task under `.trellis/tasks/` (e.g. `archive src`) | Refuses with "refusing to archive ..." and exit 1; source directory is left untouched |
| Any task-dir argument that traverses out, is an outside absolute path, or is a symlink to outside the tasks dir | `resolve_task_dir` prints "refusing to use ..." naming the resolved path and returns `None`; the command exits 1 without reading or writing anything |
| A command whose task-dir argument `resolve_task_dir` refused | Exactly one message, on stderr, from `resolve_task_dir`; no second generic "Task not found" line on stdout |
| `task.json` that is not valid UTF-8 | `JSON_READ_UNDECODABLE`; reported as "not valid UTF-8 text" with a re-save remedy, never as a parse error or a traceback |
| A bare task name matching two or more `-<name>` suffixes | Every match is listed, the command exits 1; no task is picked |
| `create --slug` or `add-context <file>` containing `/`, `\`, or `..` | Rejected with exit 1 before any file is created |
| `rename` onto an existing active name, an archived name, or the task's current name | Names the conflicting location and exits 1; nothing under `.trellis/tasks/` is touched |
| `rename` of an archived task (a path under `archive/<YYYY-MM>/`) | Refuses with "is not an active task under ..." and exit 1; archived tasks keep no maintained back-references |
| `rename <new-slug>` carrying a date prefix | The task's own prefix is normalized away with a warning; a *different* prefix is an error (rename keeps the original creation date, never today's) |
| `rename` when any write fails | The task directory is still at its old name and is named on stderr; every completed step is idempotent, so re-running the identical command finishes the rename |

##### 5. Good/Base/Bad Cases

- Good: Cursor provides `conversation_id`; resolver writes
  `cursor_<conversation-id>.json` and hook/plugin output includes the
  session source (statuslines shorten it to `[session]`).
- Good: a Codex shell has a new thread id while exactly one older session file
  supplies the active task; `finish` reports `session-fallback:<old-key>` and
  deletes that old file.
- Good: the exact session file is empty or malformed while another session
  exists; `finish` reports no current task and preserves both files because no
  unique active task was resolved.
- Base: A normal shell command has no session env; `task.py create` creates the
  task without `.runtime`, and `task.py start` degrades with a session identity
  hint instead of writing `.current-task`.
- Bad: `finish` deletes the process-derived key instead of the resolved source
  key, bulk-clears sessions, or any resolver reads/writes
  `.trellis/.current-task` as an active-task fallback.

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
- Finish regression tests for exact-match deletion, sole-fallback deletion,
  ambiguous multi-session no-op behavior, and malformed/empty exact-session
  no-op behavior. Exact-match coverage must prove a sibling session for the
  same task remains untouched.

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

###### Wrong

```python
previous = resolve_active_task(repo_root, platform_input, platform)
context_path = _context_path(repo_root, resolve_context_key(platform_input, platform))
```

This leaves a sole fallback file active when the process key and resolved
source key differ.

###### Correct

```python
previous = resolve_active_task(repo_root, platform_input, platform)
if previous.context_key:
    context_path = _context_path(repo_root, previous.context_key)
```

Deletion ownership follows the resolver result and never guesses another file.

#### Shell-ticket bridge

##### 1. Scope / Trigger

Cross-layer contract: session identity has to cross from a hook process (which
has it) into a shell child (which does not). This is now the primary identity
path for seven platforms, and it was written down nowhere as a general rule —
only as "what Cursor does".

The premise, from a 2026-08-05 audit of all 21 platforms: **no researched
platform exports a session id into its shell tool's child process, but every
hook-capable one puts that id on hook stdin.** So the hook that fires just
before a shell command writes a ticket, and `task.py` reads it back.

##### 2. Signatures

```python
# templates/shared-hooks/inject-shell-session-context.py — the writer
def _pending_shell_command(hook_input: dict) -> tuple[str, dict | None]
def _host_platform_name() -> str | None
def _extract_task_subcommands(command: str) -> list[dict[str, str]]

# common/active_task.py — the reader
def _lookup_shell_ticket_context_key() -> str | None   # :438
```

Ticket path: `.trellis/.runtime/shell-tickets/<epoch-ms>-<sha256-16>.json`.

##### 3. Contracts

**Registration.** `inject-shell-session-context.py` is registered on whichever
pre-shell event the host publishes: Cursor's `beforeShellExecution`,
Claude-shaped `PreToolUse`, Gemini's `BeforeTool`. `_pending_shell_command` is
the only place that knows about payload variation — it reads `command` at the
top level (shell-execution shape) or `tool_input.command` / `toolInput.command`
(tool-call shape). It is an ordered fallback, not a platform switch; a fourth
shape extends the same function.

**Response envelope.** A shell-execution host gets `{"permission": "allow"}` back
so Cursor does not re-prompt for a command Trellis itself asked for. Tool-call
hosts read a different response schema and get no answer at all, rather than a
key they would have to ignore.

**The context key comes from the install directory, not a platform table.**
`_host_platform_name()` returns the deepest dotted path segment of `sys.argv[0]`
(`.cursor/hooks/` → `cursor`, `.factory/hooks/` → `factory`). This matters more
than it looks: the ticket's context key must equal the one that platform's
*other* hooks compute. Get it wrong and `task.py start` writes a session file no
later hook ever reads — which half-works behind the single-session fallback and
breaks silently the moment a second window is open.

**Ticket payload** — `platform`, `context_key`, `conversation_id`, `session_id`,
`generation_id`, `cwd`, `command`, `subcommands`, `created_at_epoch`,
`expires_at_epoch`. The `platform` field is debugging metadata **only**; gating
acceptance on it is exactly what kept this bridge invisible to every platform
but Cursor.

**Four acceptance conditions**, all required (`_matching_ticket_context_key`):

1. Fresh — within `SHELL_TICKET_TTL_SECONDS` (30 s).
2. Written for this repo — the ticket's `cwd` resolves inside `repo_root`.
3. The `task.py` subcommand now running matches one the ticket recorded (only
   `start` / `current` / `finish` are ticketed at all).
4. **Exactly one** matching context key across all ticket dirs. Two concurrent
   windows therefore both degrade rather than one inheriting the other's
   pointer.

**Ordering.** The ticket is checked **last**, after the env tables, and is not
gated on platform name (`active_task.py:505-508`). A platform that genuinely
exports identity into the shell outranks a ticket written on its behalf.

**Two directories are read, one is written.** `shell-tickets/` is current;
`cursor-shell/` is the pre-0.6.13 name from when the bridge was Cursor-only. It
is still read so a command already in flight across an upgrade does not
silently degrade, and it is never written. There is nothing to migrate —
tickets are 30-second ephemera, so the old directory ages out by itself; the
cost is a glob on a directory that is normally absent, and the alternative
(ignore it) would land its one lost command on the platform this already worked
for.

##### 4. Validation & Error Matrix

| Condition | Behavior |
| --- | --- |
| `TRELLIS_HOOKS=0` or `TRELLIS_DISABLE_HOOKS=1` | Hook exits 0, writes nothing |
| stdin is not JSON, or not an object | Treated as `{}`; no command found; no-op |
| Payload has no recognizable command | `("", None)` → `main()` no-ops |
| Command contains no `task.py start/current/finish` | No ticket written |
| `shlex.split` raises on an unbalanced quote | No subcommands → no ticket |
| Hook payload carries no session/conversation/transcript id | No context key → no ticket |
| Ticket older than 30 s | Rejected on read; also unlinked by the next write's sweep |
| Ticket `cwd` outside this repo | Rejected |
| Subcommand mismatch | Rejected |
| Two or more distinct fresh context keys match | **All** rejected — degrade, never guess |

##### 5. Good / Base / Bad Cases

- **Good** — one Cursor window, AI runs `python3 .trellis/scripts/task.py start .trellis/tasks/x`. `beforeShellExecution` writes a ticket keyed `cursor_<conversation-id>`; `task.py` finds exactly one and writes `cursor_<conversation-id>.json`. Every later hook in that conversation reads the same file.
- **Base** — the platform has a real session env var (Codex `CODEX_THREAD_ID`). The env branch wins before the ticket is ever consulted; the ticket, if written, simply expires.
- **Bad** — two windows on the same repo both about to run `task.py current`. Two fresh keys match, the resolver returns `None`, and both degrade. That is the designed outcome: a wrong pointer is worse than no pointer.

##### 6. Tests Required

- Ticket accepted: assert the resolved context key equals the one the hook computed, not merely that *a* key resolved.
- Each rejection condition separately — stale, wrong repo, wrong subcommand, two-candidates. Assertion point is `resolve_context_key() is None`, plus the absence of a session file.
- Payload-shape coverage: top-level `command` and both `tool_input` casings, asserting the response envelope differs (`{"permission": "allow"}` vs nothing).
- `_host_platform_name` against an argv under `.cursor/hooks/` and under `.factory/hooks/` — the value ends up in the runtime filename, so it is user-visible.
- Legacy `cursor-shell/` still read.

##### 7. Wrong vs Correct

###### Wrong

```python
if ticket.get("platform") != platform_name:
    continue          # gate on who wrote it
```

This is what made the bridge Cursor-only. A ticket's provenance says nothing about whether it describes *this* command.

###### Correct

```python
if not _ticket_is_fresh(ticket, ticket_path, now): return None
if not _ticket_cwd_matches_repo(ticket, repo_root): return None
if not _pending_ticket_matches_args(ticket, repo_root): return None
return _string_value(ticket.get("context_key"))
```

Accept a ticket on its merits — fresh, right repo, right subcommand — and let the "exactly one" rule handle ambiguity.

#### Session env var names carry their provenance

##### 1. Scope / Trigger

Env wiring: `active_task.py`'s three env tables are the only place Trellis
claims a vendor sets a particular variable. On 2026-08-05 an audit of all 21
platforms deleted **12 of the 21 declared names** — none had ever existed on any
platform. They had been pattern-guessed from a `<PLATFORM>_SESSION_ID` shape no
vendor agreed to, and the uniformity of the table was their only "evidence".

The rule that came out of it currently lives as a code comment
(`active_task.py:59-64`). It is written here so it survives the next person who
adds a platform from the spec rather than from the code.

##### 2. Signatures

```python
_ENV_SESSION_KEYS:      tuple[tuple[str, tuple[str, ...]], ...]   # :66
_ENV_CONVERSATION_KEYS: tuple[tuple[str, tuple[str, ...]], ...]   # :111
_ENV_TRANSCRIPT_KEYS:   tuple[tuple[str, tuple[str, ...]], ...]   # :120
```

Each entry is `(platform_name, (env_var, ...))`. Lookup is platform-scoped —
`_iter_env_keys` filters by the detected platform, which is why ZCode may list
`CLAUDE_CODE_SESSION_ID` without colliding with the claude entry.

##### 3. Contracts

Every name carries a comment recording **how it was checked**, in one of four
grades:

| Grade | What it means | What must be in the comment |
| --- | --- | --- |
| REAL-verified | Observed set, first-hand | Date, product version, and where it was observed |
| REAL but HOOK-SCOPE ONLY | Set for hook processes, absent from the shell child | The same, plus which surface it is absent from. This decides whether `task.py` can ever see it |
| UNVERIFIED | Plausible, unconfirmed | The exact probe that would settle it, runnable by someone with the product |
| unchecked | Never researched | Say so explicitly |

- **Do not add a name by analogy with a neighbour.** Table uniformity is not evidence.
- **A platform with no verified name belongs in no table.** It resolves through `TRELLIS_CONTEXT_ID` or its hook/plugin bridge, and that is a working configuration — Grok, Kimi, OpenCode and Pi all live there.
- **Do not delete an UNVERIFIED name to tidy up.** Absence of evidence is not evidence of absence, and removing a live name breaks that platform silently. Either run the probe or leave it.
- `_ENV_TRANSCRIPT_KEYS` is the *unchecked* table. The 2026-08-05 audit covered the session table only, so do not infer its entries are real **or** fake from that work.

##### 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| Name is set and platform matches | Context key `{platform}_{sanitized-value}` |
| Name is set but platform does not match | Ignored — `_iter_env_keys` never yields the entry |
| Name is unset or whitespace | Falls through to the next name, then the next table, then the shell ticket |
| Name was never real (the removed twelve) | Resolves nothing; the platform degrades with "Session identity not available" |

`regression.test.ts` `PURGED_ENV_NAMES` locks the twelve deleted pairs: setting
any of them must resolve **no** context key for its platform.

##### 5. Good / Base / Bad Cases

- **Good** — Snow. `sessionIdentityEnv.ts` exports `SNOW_SESSION_ID` into hook, terminal and sub-agent children, and names Trellis in its source header. Verified by reading the vendor's source; the comment says so.
- **Base** — Kiro. `KIRO_SESSION_ID` is absent from the official docs, but three independent third-party tools key agent detection on it. Kept, marked UNVERIFIED, with the settling probe written down (`env | grep KIRO` from a Kiro shell-tool call).
- **Bad** — the removed `PI_SESSION_ID` / `PI_SESSIONID`. Pi builds its bash env as `{...process.env, PATH}` only; no `PI_*` session var exists anywhere. The entry looked like the others and worked never.

##### 6. Tests Required

- One assertion per purged name: it resolves no context key for its platform. Assertion point is the resolver output, not the table contents.
- For each surviving name, a positive case producing the expected runtime filename.
- Platform scoping: the ZCode entry must not fire in a claude-detected session and vice versa.

##### 7. Wrong vs Correct

###### Wrong

```python
("trae", ("TRAE_SESSION_ID",)),   # every other platform has one
```

###### Correct

```python
# UNVERIFIED (2026-08-05): absent from docs.trae.cn's hook reference; hooks get
# TRAE_PROJECT_DIR, CLAUDE_PROJECT_DIR and TRAE_ENV_FILE. To settle: run
# `env | grep TRAE` from a Trae shell-tool call.
```

— or, as actually happened here, no entry at all. Trae resolves through its
shell ticket.

#### `CLAUDE_ENV_FILE` append is deduped on the *last* matching export

##### 1. Scope / Trigger

Infra wiring into a **user-owned** file. Claude Code's SessionStart passes
`CLAUDE_ENV_FILE`; Trellis appends `export TRELLIS_CONTEXT_ID=<context-key>`
there so later Bash tools inherit the session identity. The append rule was
stated with no bound, and unbounded it produced 3 933 lines for 27 distinct
values on one maintainer's machine — in a file the shell sources for every
command.

##### 2. Signatures

```python
# templates/shared-hooks/session-start.py
def _last_context_key_export(env_file: str) -> str | None   # :302
```

##### 3. Contracts

- Append only when `_last_context_key_export(env_file) != export_line`.
- **"Last matching line", not "appears anywhere".** The shell applies later assignments over earlier ones, so an A → B → A switch *must* re-append; a contains-check would leave the shell on B.
- The value is `shlex.quote`d.
- Read with `errors="replace"`. A user env file with non-UTF-8 bytes would otherwise raise `UnicodeDecodeError`, which is a `ValueError` — **not** an `OSError` — and would escape the caller's non-fatal `except OSError` guard.
- A missing file means "no previous export"; the caller creates it.
- The whole bridge is optional: any `OSError` is swallowed and SessionStart continues.

##### 4. Validation & Error Matrix

| Condition | Behavior |
| --- | --- |
| No `CLAUDE_ENV_FILE` in env | No-op |
| File absent | Created with one export line |
| Last export line already equals the new one | No append |
| Last export line differs (including an earlier-but-not-last match) | Append |
| File unreadable or unwritable | Silent no-op |
| File contains non-UTF-8 bytes | Read with replacement; append proceeds |

##### 5. Good / Base / Bad Cases

- **Good** — ten SessionStarts in one session (clear, compact, resume) leave exactly one export line.
- **Base** — the user switches windows: key A, then B, then back to A. Three lines, and the shell ends on A. Correct, and the reason the rule is "last" rather than "anywhere".
- **Bad** — unconditional append. Thousands of lines in a file sourced on every command, all but the last one dead.

##### 6. Tests Required

`regression.test.ts` `[env-file-dedup]`, five cases: repeated same key appends once; a changed key appends again; switching back to an earlier key re-appends (this is the one a contains-check fails); an unwritable or unreadable file is a silent no-op; a non-UTF-8 file does not break SessionStart. Assertion point is the file's line count and its **last** line, not set membership.

##### 7. Wrong vs Correct

###### Wrong

```python
if export_line in Path(env_file).read_text():
    return
```

Two bugs in one line: `in` matches anywhere, so an A → B → A switch never
re-appends and the shell stays on B; and `read_text()` raises
`UnicodeDecodeError` on a non-UTF-8 user file, which the caller's `except
OSError` does not catch.

###### Correct

```python
if _last_context_key_export(env_file) == export_line:
    return
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
    python task.py create "My Task" -d "What it delivers"      # Windows
    python3 task.py create "My Task" -d "What it delivers"     # macOS/Linux
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

# task_utils.py — execute hooks (never blocks main operation)
HOOK_TIMEOUT_SECONDS = 60
HOOK_KILL_GRACE_SECONDS = 5
def run_task_hooks(event: str, task_json_path: Path, repo_root: Path) -> None
def _kill_hook_tree(proc: subprocess.Popen[str]) -> None
```

### Trust boundary

**`.trellis/config.yaml` is a repo-committed file whose `hooks:` entries are
shell commands, executed with `shell=True` from the repo root with the caller's
full environment.** Cloning a repository and running `task.py create` in it runs
whatever that repository's `config.yaml` declares for `after_create` — no
prompt, no allow-list. This is inherent to the feature (a hook is a shell
command by definition), and it is stated here because it was not stated
anywhere before: reviewers of a pull request that touches `config.yaml` are
reviewing executable code, and `config.yaml` deserves the same scrutiny as a
CI workflow file.

Consequences for implementers:

- Never widen the hook surface to a file that is *not* already reviewed like
  code (a fetched template, a cache, a `.local` override sourced from a remote).
- Never add a hook event that fires from a *read-only* command. Today every
  event follows an explicit mutation the user asked for (`create`, `start`,
  `finish`, `archive`); a hook on `list` or `current` would turn inspecting a
  cloned repo into executing it.
- The bounded timeout below is a liveness guarantee, not a security boundary.
  It does not contain what a hook can do. The tree-kill on timeout is part of
  that same liveness guarantee: a hook that calls `setsid` itself leaves the
  process group and survives the kill. That is accepted and out of scope —
  arbitrary code cannot be contained by the code that launches it.

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

# POSIX: a fresh session puts the shell and every descendant in one process
# group, which is what makes the timeout able to kill the whole tree.
popen_kwargs: dict = {}
if os.name == "posix":
    popen_kwargs["start_new_session"] = True

with subprocess.Popen(
    cmd,
    shell=True,
    cwd=repo_root,
    env=env,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    encoding="utf-8",              # REQUIRED: cross-platform
    errors="replace",              # REQUIRED: cross-platform
    **popen_kwargs,
) as proc:
    try:
        stdout, stderr = proc.communicate(  # REQUIRED: output is captured, so
            timeout=HOOK_TIMEOUT_SECONDS,   # an unbounded hook wedges the
        )                                   # lifecycle command silently
    except subprocess.TimeoutExpired:
        _kill_hook_tree(proc)               # whole tree, not just the shell
        ...
```

`capture_output` (here, explicit `PIPE`s) is what makes a missing `timeout=`
unacceptable rather than merely untidy: a hook waiting on stdin, a network call,
or an auth prompt produces *no output at all* while it blocks, so the user sees
`task.py create` hang with an empty terminal and no way to tell what it is
waiting for. The timeout is a module constant, not a config key — a hook slow
enough to need more than a minute belongs in a background job, not on a
lifecycle event.

#### Timeout kills the process tree, not the direct child

`shell=True` means the direct child is the shell; the hook's actual work runs in
its children. `subprocess.run(..., timeout=...)` kills only that shell, which
leaves two defects:

1. Grandchildren survive the timeout and keep running after the lifecycle
   command has returned — they also still hold the inherited stdout/stderr
   pipes.
2. Anything that collects output after the kill blocks until those orphans
   release the pipes. That is the "command that never returns" the timeout
   exists to prevent, reintroduced by the timeout handler itself.

So hooks run through `Popen` + `communicate(timeout=...)`, and the timeout path
kills the tree via `_kill_hook_tree(proc)`:

| Platform | Mechanism | Fallback |
|----------|-----------|----------|
| POSIX | `start_new_session=True` at spawn, then `os.killpg(os.getpgid(proc.pid), SIGKILL)`, guarded against `ProcessLookupError` / `PermissionError` | `proc.kill()` |
| Windows | `taskkill /F /T /PID <pid>` (best effort) | `proc.kill()` |

Output is then collected under a **bounded** grace —
`proc.communicate(timeout=HOOK_KILL_GRACE_SECONDS)`. If that also times out, the
partial output already carried on the `TimeoutExpired` is printed and the pipes
are abandoned. Never collect post-kill output unbounded: an orphan that escaped
the kill would hang the lifecycle command forever.

**Known limitation:** a hook that calls `setsid` itself (or otherwise leaves the
group) escapes the kill and survives. Accepted and out of scope — see the trust
boundary above.

### Diagnostics

A hook whose only symptom is "nothing happened" is undebuggable. Every failure
path names, at minimum, the **event**, the **command**, and **why it failed**:

| Failure | Must report |
|---------|-------------|
| Non-zero exit | event, command, exit status, cwd, captured stdout **and** stderr |
| Timeout | event, command, the timeout value, cwd, whatever was captured before the kill |
| Exception | event, command, exception **type** and message |

Captured streams are truncated (`HOOK_OUTPUT_LIMIT`) so a chatty hook cannot
bury the lifecycle command's own output. Discarding stdout is not acceptable:
a script that reports its errors on stdout is common, and a hook that prints
its diagnosis and exits 1 would otherwise show the exit code with no reason.

### Validation & Error Matrix

| Condition | Behavior |
|-----------|----------|
| No `hooks` key in config | No-op (empty list) |
| `hooks` is present but not a mapping | `[WARN]` naming the value, no-op |
| Event key missing | No-op (empty list) |
| Event value is a scalar, not a list (`after_create: echo hi`) | `[WARN]` naming the event and showing the list form — it parses fine and would otherwise register nothing |
| Hook command exits non-zero | `[WARN]` with exit status + both streams, continues to next hook |
| Hook command exceeds `HOOK_TIMEOUT_SECONDS` | Whole process tree killed; `[WARN]` naming the timeout, continues to next hook |
| Hook spawned a grandchild that outlives the shell | Killed with the group (POSIX) / tree (Windows); a `setsid`-escaping hook survives |
| Post-kill output collection still blocked | Abandoned after `HOOK_KILL_GRACE_SECONDS`; whatever partial output exists is printed |
| Hook command throws exception | `[WARN]` with exception type, continues to next hook |
| `linearis` not installed | Hook fails with warning, task operation succeeds |

### Wrong vs Correct

#### Wrong — blocking on hook failure
```python
result = subprocess.run(cmd, shell=True, check=True)  # Raises on failure!
```

#### Wrong — unbounded, and silent about why it failed
```python
result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
if result.returncode != 0:
    print(f"[WARN] Hook failed: {cmd}", file=sys.stderr)  # which exit code?
    if result.stderr.strip():                             # stdout dropped
        print(f"  {result.stderr.strip()}", file=sys.stderr)
```

#### Wrong — timeout that kills only the shell
```python
# The shell dies; `sleep 300 &` does not. The orphan keeps the captured pipes
# open, so any post-kill collect blocks on it.
result = subprocess.run(cmd, shell=True, capture_output=True,
                        timeout=HOOK_TIMEOUT_SECONDS)
```

#### Correct — warn and continue, bounded, diagnosable
```python
try:
    with subprocess.Popen(cmd, shell=True, ..., **popen_kwargs) as proc:
        try:
            stdout, stderr = proc.communicate(timeout=HOOK_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired as e:
            _kill_hook_tree(proc)                  # process group / tree
            stdout = _decode_hook_output(e.stdout)  # bytes on some paths
            stderr = _decode_hook_output(e.stderr)
            try:
                rest_out, rest_err = proc.communicate(
                    timeout=HOOK_KILL_GRACE_SECONDS  # bounded, never unbounded
                )
                stdout = rest_out or stdout
                stderr = rest_err or stderr
            except (subprocess.TimeoutExpired, OSError, ValueError):
                pass
            print(
                f"[WARN] Hook timed out ({event}) after "
                f"{HOOK_TIMEOUT_SECONDS}s: {cmd}",
                file=sys.stderr,
            )
            ...
            continue
        if proc.returncode != 0:
            print(
                f"[WARN] Hook failed ({event}): exit {proc.returncode}: {cmd}",
                file=sys.stderr,
            )
            print(f"  cwd: {repo_root}", file=sys.stderr)
            _print_hook_stream("stdout", stdout or "")
            _print_hook_stream("stderr", stderr or "")
except Exception as e:
    print(
        f"[WARN] Hook error ({event}): {cmd} — {type(e).__name__}: {e}",
        file=sys.stderr,
    )
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

def _auto_commit_workspace(repo_root: Path) -> str:
    # Returns COMMIT_DONE / COMMIT_SKIPPED / COMMIT_BLOCKED / COMMIT_FAILED.
    # The caller turns COMMIT_FAILED into a non-zero exit + checkpoint; see
    # "Session recording is a resumable state machine" below.
    if not get_session_auto_commit(repo_root):
        print("[OK] session_auto_commit: false — skipping git stage/commit.",
              file=sys.stderr)
        return COMMIT_SKIPPED

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
  `add_session.py` returns `COMMIT_BLOCKED` and still exits 0: a gitignored
  `.trellis/` is the user telling git to stay out of this tree, which is the
  same configured skip as `session_auto_commit: false`, not a failure worth
  retrying. `task.py archive` returns success only when the archived source
  was not tracked; if tracked task files were moved and the archive commit
  cannot be created, `archive` exits non-zero so callers do not continue to
  journal over dirty deletes.
- On any other failure → log the stderr and return `COMMIT_FAILED`. Do not
  re-attempt with different flags. `add_session.py` exits non-zero and prints
  the resume checkpoint.
- `task.py archive` is stricter than `add_session.py`: when `session_auto_commit`
  is enabled and the source task had tracked files, the archive move must be
  accompanied by a successful bookkeeping commit. A failed commit leaves the
  move on disk but exits non-zero with a "Resolve `git status` before
  continuing" message.
- `used_force` in `safe_git_add`'s return tuple is kept for signature
  compatibility but is always `False`. Do not introduce a code path that
  sets it to `True`.

### Scenario: Session recording is a resumable state machine

#### 1. Scope / Trigger

Any change to `add_session.py`'s rendering, journal append, index update,
auto-commit, or session numbering. Recording used to be three unguarded steps
in a row: append, update index, best-effort commit. A crash or a failed commit
between them left a half-recorded session that the next identical run happily
appended a *second* time, and the commit table rendered `(see git log)` for
every hash because no code ever asked git what the commit said.

#### 2. Signatures

```python
# add_session.py
def parse_commit_tokens(commit: str) -> tuple[list[str], str | None]
def parse_subject_overrides(values: list[str] | None) -> tuple[dict[str, str], str | None]
def resolve_commit_subject(repo_root: Path, oid: str) -> str | None
def build_commit_evidence(repo_root, tokens, overrides) -> tuple[list[tuple[str, str]], str | None]
def escape_markdown_cell(text: str) -> str
def compute_record_fingerprint(...) -> str          # 16 hex chars
def render_marker(fingerprint: str) -> str          # HTML comment
def classify_record(repo_root, dev_dir, index_file, marker
    ) -> tuple[str, Path | None, int | None, str | None]
def resolve_next_session(repo_root, dev_dir, index_file) -> int
def _auto_commit_workspace(repo_root: Path) -> str
```

New CLI surface: `--commit-subject OID=SUBJECT` (repeatable) and
`--idempotency-key <key>`.

#### 3. Contracts

**Accurate commit evidence, or no write at all.** Every `--commit` token is a
bounded hex OID (`^[0-9a-fA-F]{7,40}$`); anything else is rejected. Each OID is
resolved to its real subject with `git show -s --format=%s <oid>^{commit} --`
— argv, never shell interpolation, and peeled to `commit` so a hex-looking ref
name cannot resolve to a tree. An OID that does not resolve fails the command
**before the journal or index is touched**. The only escape hatch is an
explicit, one-to-one `--commit-subject <oid>=<subject>` mapping; a mapping for
an OID that is not in `--commit`, a duplicate mapping, or an empty subject is
an error. Generic prose (`(see git log)`, `not recorded`, `(Add details)`) is
never substituted — that is the whole point of the requirement.

**Record identity is a retry key, not a dedupe key.** The fingerprint is a
SHA-256 over the normalized semantic inputs (developer, title, summary,
package, branch, resolved commits *and their subjects*, changes, extra
content, tests, next steps, idempotency key), truncated to 16 hex chars, and
persisted as `<!-- trellis-session: v=2 fp=<hash> -->` on the line directly
under the `## Session N:` heading. An HTML comment renders as nothing, so the
human evidence is unchanged by its presence.

The calendar date is **not** an input. v1 mixed it in and wrote the marker
unversioned as `<!-- trellis-session: fp=<hash> -->`; a retry resumed after a
midnight rollover then recomputed a fingerprint that no longer matched the
marker already sitting in the journal, and appended a second entry for one
session. v1 markers are still read — the entry's own `**Date**:` line supplies
the date to recompute with — but never written.

The marker only matches a record that is **still uncommitted in this
worktree**: once the entry is present in `git show HEAD:<journal>`, an
identical later request is a legitimately new session and gets a new number.
That new session cannot carry the committed marker, or two entries would share
one and every later run would be ambiguous, so the run steps to the next
`generation` of the payload and fingerprints that instead. Generation 0 omits
the field, so a first-time marker is unaffected. `--idempotency-key` is the one
way to say otherwise — with a key, an already-committed match is reported and
exits 0.

**Five states, one direction.** `classify_record` returns `absent`,
`journal-recorded`, `index-recorded`, or `committed`, and the run walks them
in order:

| From | Step | To |
| --- | --- | --- |
| absent | atomically append the complete marked entry | journal-recorded |
| journal-recorded | write the exact index row | index-recorded |
| index-recorded | stage the scoped paths and commit | committed |

A retry re-enters at whichever state it finds. `journal-recorded` repairs
*only* the index row — it never appends a second entry. `index-recorded`
retries *only* the commit.

**Only a unique exact match is ever adopted.** Two entries carrying the same
marker, a marker with no `## Session N:` heading above it, or a missing index
row while `Total Sessions` already counts past this session all return an
error and change nothing. Ambiguous or malformed pending evidence is never
guessed into completion.

**A failed auto-commit is a failure.** `_auto_commit_workspace` returns
`COMMIT_DONE` / `COMMIT_SKIPPED` / `COMMIT_BLOCKED` / `COMMIT_FAILED`. On
`COMMIT_FAILED` the command exits 1 after printing a `[BLOCKED] Checkpoint:`
block naming the session, the journal file, and the fact that re-running the
identical command resumes rather than duplicates. Reporting overall success
because the append worked is what made the producer gap invisible. After a
reported-successful commit the marker is re-read from `HEAD:<journal>`; if it
is not there, the same checkpoint fires.

**Session numbers converge across branches.** The next number is
`max(...) + 1` over the working tree (index `Total Sessions` plus every
`## Session N:` heading in every local `journal-*.md`) **and** every recorded
ref. The refs come from `for-each-ref` — HEAD and the default branch first,
then the other local heads (where a parallel worktree's branch lives, which is
the case that actually collided twice on 2026-08-06), then remote-tracking
refs — capped at `MAX_CONVERGENCE_REFS` and read with a single `git grep` over
all of them, not an `ls-tree` + `show` per ref. Deriving the number from the
working tree alone lets two branches claim the same number; the
`journal-*.md merge=union` driver then merges two *different* sessions that
both call themselves N. The default branch is resolved locally only
(`refs/remotes/origin/HEAD`, then `main`/`master`) — `resolve_default_branch`
falls back to `git remote show origin`, which can block on the network, and
session recording is a hot path.

**Writes are crash-safe.** The journal append and the index rewrite both go
through `io.write_text_atomic` (temp in the same dir, then `os.replace`), so a
crash mid-write leaves the previous content rather than a half-record no retry
could classify. See
[Filesystem Safety](./filesystem-safety.md#1-atomic-writes--never-truncate-a-state-file-in-place).

#### 4. Validation & Error Matrix

| Condition | Behavior |
| --- | --- |
| `--commit` token is not 7-40 hex chars | Exit 1, names the token; nothing written |
| `--commit` OID does not resolve locally | Exit 1, names the OID and the `--commit-subject` remedy; nothing written |
| `--commit-subject` for an OID not in `--commit`, duplicated, or empty | Exit 1; nothing written |
| `--commit-subject` subject contains `\|` or newlines | Accepted; escaped for the Markdown cell |
| `--commit -` (default) | `(No commits - planning session)`; no git resolution at all |
| `--idempotency-key` outside `[A-Za-z0-9._-]{1,64}` | Exit 1; nothing written |
| Retry after a failed index update | Index row repaired, journal entry count unchanged |
| Retry after a failed auto-commit | Only the commit is retried; journal and index unchanged |
| Retry of an already-committed record, no idempotency key | New session, new number, and a next-generation marker so neither entry is ambiguous |
| Retry of an already-committed record, with idempotency key | Exit 0, reports "already recorded"; nothing written |
| Marker found in two entries | Exit 1, names the files; nothing written |
| Marker with no `## Session N:` heading above it | Exit 1, "malformed"; nothing written |
| Auto-commit fails | Exit 1 with the `[BLOCKED] Checkpoint:` block |
| `.trellis/` is gitignored | `print_gitignore_warning`, exit 0 (configured skip) |
| Not a git repository | `COMMIT_BLOCKED`, exit 0 — retry could never succeed, so it is not `COMMIT_FAILED` |
| `session_auto_commit: false` | Stops after verified journal + index, exit 0 |

#### 5. Good / Base / Bad Cases

- **Good** — a session recorded with three real OIDs renders three real
  subjects; a later interrupted run of the same command lands on the same
  fingerprint, sees the entry uncommitted with no index row, writes the row,
  commits, and exits 0 with one journal entry.
- **Base** — a planning session (`--commit -`) with auto-commit disabled.
  No git resolution, no staging, exit 0 once journal and index agree.
- **Bad** — "the append succeeded, so report success and warn about the
  commit." The next identical run then appends a second entry for a session
  the user believes is already recorded.

#### 6. Tests Required

`test/scripts/add-session.integration.test.ts`, real `python3` against real
git repos — not source-string assertions. Subject rendering and escaping,
unresolved-OID fail-before-write (assertion point: the journal file is byte
unchanged), explicit mapping accepted, planning `-`, auto-commit disabled,
rotation, fault injection at each of append / index / commit with a retry that
proves convergence, a repeated committed record producing a *new* session, the
idempotency-key no-op, concurrent-branch numbering, a malformed marker, and
the staging scope staying inside Trellis-owned paths.

#### 7. Wrong vs Correct

##### Wrong

```python
for c in commit.split(","):
    commit_table += f"\n| `{c.strip()}` | (see git log) |"
```

The table has a Message column and this fills it with an instruction to go
look somewhere else. Every consumer of the journal then reads evidence that
says nothing.

##### Correct

```python
evidence, error = build_commit_evidence(repo_root, tokens, overrides)
if error:
    print(f"Error: {error}", file=sys.stderr)
    return 1                      # before any mutation
for oid, subject in evidence:
    commit_table += f"\n| `{oid}` | {escape_markdown_cell(subject)} |"
```

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
(or `common/trellis_config.py` for hooks that cannot import the full task
helpers). Both go through one parser chain:

```
_load_config(repo_root)                      # config.py
read_trellis_config(repo_root)               # trellis_config.py
  -> parse_simple_yaml(content, source)      # trellis_config.py — the only copy
    -> _strip_inline_comment(value)
    -> _unquote(value)
```

This is a load-bearing chain. Any new key added to `.trellis/config.yaml`
must flow through it — do not write a custom reader, even a "small" one.

**`parse_simple_yaml` lives in `trellis_config.py` and nowhere else.**
`config.py` imports it. The direction is forced: `trellis_config.py` imports
nothing from the package, because hooks copy it out as a single standalone
file, while `config.py` depends on `paths.py`. The two modules previously
carried byte-equivalent copies of all five parser functions with only
`config.py`'s under test — a drift hazard with no upside. A second copy is a
regression, and `regression.test.ts` asserts `config.py` has none.

### Supported YAML subset, and what happens outside it

Every parsed value is a **string** — the parser does no type coercion, so
`false` arrives as `"false"` and `2000` as `"2000"`. Accessors coerce (see
below). Supported: `key: value`, nested mappings by indentation, `- ` lists of
scalars, whole-line and inline `#` comments, one layer of matching quotes.

Anything outside that subset is **named on stderr against the file and line,
and skipped** — it is never parsed into a plausible-looking wrong value:

| Construct | Was | Is |
|-----------|-----|-----|
| Mapping inside a list (`- name: cli` / `  path: x`) | `path` hoisted to a **top-level** key — a nested key silently becoming a root key | Warned, skipped; the parent dict is untouched |
| Block scalar (`notes: \|`) | `{"notes": "\|"}` — marker stored as the value, body dropped | Warned, key and body skipped |
| Anchor / alias / merge key / flow collection | stored as the literal string `&b`, `*b`, `[a, b]` … | Warned, skipped |

Only **unquoted** scalars are inspected, so `cmd: "a | b"` is still the string
the user wrote. A well-formed config produces no output at all.

`_load_config` is fail-open in both modules: an unreadable file returns `{}`
silently, and a parse *exception* (e.g. `RecursionError` from a pathologically
nested file) warns once and returns `{}`. A malformed config must never take
down `task.py create` — that asymmetry existed until 0.6.x, where `config.py`
caught only `(OSError, IOError)` around a call that could raise anything.

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
  `implement.jsonl` / `check.jsonl`. A missing key defaults to `auto`;
  an invalid explicit value falls back to `inline` (with a stderr warning),
  not `auto`.
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
    return coerce_config_bool(
        raw, DEFAULT_SESSION_AUTO_COMMIT, "session_auto_commit"
    )
```

Each new key gets its own `get_<key>` accessor. The accessor owns:

1. The default constant (named `DEFAULT_<KEY>`, exported alongside the
   accessor).
2. Type coercion (string → bool / int / list as appropriate).
3. Fallback-with-stderr-warn on invalid values. Config errors must NOT
   raise — a bad config line should not block scripts.

### Pattern: boolean tolerance

**Every boolean config value goes through `coerce_config_bool(value, default,
label)`.** It accepts native YAML `true` / `false` plus the case-insensitive
string aliases `true / false / yes / no / 1 / 0 / on / off`; anything else
falls back to `default` with a stderr warning naming `label`.

This breadth matters because the simple YAML parser does not coerce
`true`/`false` to native bool — values arrive as strings. A reader that only
checks `raw is True` misses every quoted-or-unquoted string variant the user
naturally writes.

One helper, not one per key. The failure mode is not a missing alias, it is
two accessors disagreeing about the same word: `_is_true_config_value`
(reading `packages.*.git`) accepted only the literal `"true"` while
`get_session_auto_commit` accepted the full set, so `git: yes` silently meant
**false** — the opposite branch, no warning, in the accessor that decides
whether a package is its own git repository. An accepted-here/rejected-there
split is worse than a narrow set applied consistently.

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
  python3 task.py create "Add login" --description "Email + password sign-in" --slug add-login
  python3 task.py list --mine --status in_progress
"""
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    # create command
    create_parser = subparsers.add_parser("create", help="Create new task")
    create_parser.add_argument("title", help="Task title")
    create_parser.add_argument("--description", help="One-line summary")
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

## Structured Session & Task Metadata Flags (2026-07-22)

Contracts added by task `07-22-script-qol-batch` (#394, #402, meta access):

- `add_session.py` accepts repeatable `--change` / `--test` / `--next-step`;
  each value renders as one bullet (Testing bullets get the `[OK] ` prefix).
  **Sections with zero values are omitted entirely — never render placeholder
  text** (`(Add details)` / `(Add test results)` are banned strings; a test
  greps for them). `--content-file`/`--stdin` remain an alternate Main Changes
  source when `--change` is absent.
- `task.py list` renders children indented under their parent; a dangling
  `parent` ref falls back to flat display (never crash, never hide the task).
- `task.py create --meta key=value` (repeatable) populates `task.json`'s `meta`
  object; validation runs BEFORE `mkdir` so malformed input leaves no
  half-created directory. `task.py set-meta <dir> <key> <value>` sets/overwrites
  one key on an existing task via the same `resolve_task_dir()` path validation
  as other subcommands. Values are plain strings (no nesting/coercion).
