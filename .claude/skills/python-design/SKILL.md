---
name: python-design
description: "Python design patterns for CLI scripts and utilities — type-first development, deep modules, complexity management, and red flags. Use when reading, writing, reviewing, or refactoring Python files, especially in .trellis/scripts/ or any CLI/scripting context. Also activate when planning module structure, deciding where to put new code, or doing code review."
---

# Python Design for CLI Scripts

Design patterns and principles for writing maintainable Python CLI tools and utilities.
Based on *A Philosophy of Software Design* (Ousterhout), adapted for scripting contexts.

## When to Activate

- Writing or modifying Python files
- Planning module decomposition
- Code review of Python changes
- Refactoring scripts that feel "messy"
- Adding a new subcommand or utility function

## Core Thesis

**The central challenge is managing complexity, not adding features.**

Complexity is anything that makes code hard to understand or modify. It has three symptoms:

1. **Change Amplification** — A small change requires edits in many places
2. **Cognitive Load** — You must hold too much context to make a safe change
3. **Unknown Unknowns** — You don't know what you don't know (the most dangerous)

Complexity is incremental. It accumulates through hundreds of small decisions, not one catastrophic mistake. Therefore: **sweat the small stuff**.

---

## Principle 1: Deep Modules

A module's value is the ratio of functionality hidden vs. interface exposed.

```
Deep module (good):          Shallow module (bad):
┌──────────┐                 ┌──────────────────────────┐
│ simple   │                 │ complex interface        │
│ interface│                 │ many params, many methods │
├──────────┤                 ├──────────────────────────┤
│          │                 │                          │
│  rich    │                 │  thin implementation     │
│  impl    │                 │                          │
│          │                 └──────────────────────────┘
│          │
└──────────┘
```

**Practical test**: If a caller must understand how the module works internally to use it correctly, the module is too shallow.

### Example: Task Data Access

```python
# Shallow — caller must know JSON structure, file paths, error handling
def _read_json_file(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)

# Every caller does this independently:
task_path = tasks_dir / name / "task.json"
data = _read_json_file(task_path)
title = data.get("title") or data.get("name", "")
status = data.get("status", "planning")
assignee = data.get("assignee", "")
```

```python
# Deep — caller gets what they need, module hides JSON/path/parsing
@dataclass(frozen=True)
class TaskInfo:
    name: str
    title: str
    status: str
    assignee: str
    priority: str
    directory: Path

def load_task(tasks_dir: Path, name: str) -> TaskInfo | None:
    """Load task by directory name. Returns None if not found."""
    ...

def list_active_tasks(tasks_dir: Path) -> list[TaskInfo]:
    """List all non-archived tasks, sorted by priority."""
    ...
```

The deep version absorbs complexity: JSON parsing, field defaults, directory scanning, archive filtering. Callers just work with typed data.

---

## Principle 2: Type-First Development

Types define contracts before implementation. This workflow catches design problems early:

1. **Define data shapes** — dataclass or TypedDict first
2. **Define function signatures** — parameter and return types
3. **Implement to satisfy types** — let the type checker guide completeness
4. **Validate at boundaries** — runtime checks only where data enters the system

### Frozen Dataclasses for Internal Data

```python
from dataclasses import dataclass
from typing import Literal

@dataclass(frozen=True)
class AgentRecord:
    agent_id: str
    task_name: str
    worktree_path: Path
    platform: Literal["claude", "codex", "cursor"]
    status: Literal["running", "done", "failed"]
    branch: str
```

Frozen dataclasses are immutable — no accidental mutation, safe to pass around.

### TypedDict for External JSON Shapes

When the data comes from a file (task.json, config.yaml, registry.json), use TypedDict to document the expected shape:

```python
from typing import TypedDict, Required, NotRequired

class TaskData(TypedDict):
    title: Required[str]
    status: Required[str]
    assignee: NotRequired[str]
    priority: NotRequired[str]
    parent: NotRequired[str]
    children: NotRequired[list[str]]
```

This eliminates scattered `.get("field", default)` calls — the shape is documented once.

### NewType for Domain Primitives

When two strings mean different things, make the type system enforce it:

```python
from typing import NewType

TaskName = NewType("TaskName", str)    # directory name like "03-10-v040"
BranchName = NewType("BranchName", str)  # git branch like "feat/v0.4.0"

def create_branch(task: TaskName) -> BranchName:
    return BranchName(f"task/{task}")
```

### Discriminated Unions for State

When an entity can be in distinct states with different data:

```python
@dataclass(frozen=True)
class Pending:
    status: Literal["pending"] = "pending"

@dataclass(frozen=True)
class Running:
    status: Literal["running"] = "running"
    pid: int
    worktree: Path

@dataclass(frozen=True)
class Completed:
    status: Literal["completed"] = "completed"
    branch: str
    commit: str

AgentState = Pending | Running | Completed

def handle(state: AgentState) -> None:
    match state:
        case Running(pid=pid, worktree=wt):
            check_process(pid)
        case Completed(branch=br):
            create_pr(br)
        case Pending():
            pass
```

The type checker ensures every state is handled. No more `if data.get("status") == "running"` with forgotten branches.

---

## Principle 3: Information Hiding

Each module should encapsulate design decisions. When the same knowledge appears in multiple modules, information has leaked.

### Common Leakage Patterns in Scripts

**JSON schema knowledge scattered everywhere:**
```python
# BAD — 9 files all know how to iterate tasks and parse task.json
for d in sorted(tasks_dir.iterdir()):
    if d.name == "archive" or not d.is_dir():
        continue
    task_json = d / "task.json"
    if task_json.exists():
        data = json.loads(task_json.read_text())
        title = data.get("title") or data.get("name", "")
        ...
```

```python
# GOOD — one module owns task iteration
# common/tasks.py
def iter_active_tasks(tasks_dir: Path) -> Iterator[TaskInfo]:
    """Yield all active (non-archived) tasks."""
    for d in sorted(tasks_dir.iterdir()):
        if d.name == "archive" or not d.is_dir():
            continue
        info = _load_task_json(d)
        if info:
            yield info
```

**File format details leaking through layers:**
```python
# BAD — caller knows it's JSON, knows the path convention
registry_path = trellis_dir / "registry.json"
data = json.loads(registry_path.read_text())
data["agents"][agent_id] = {...}
registry_path.write_text(json.dumps(data, indent=2))

# GOOD — module hides storage format
registry = AgentRegistry(trellis_dir)
registry.add(agent_id, task=task_name, platform="claude")
```

---

## Principle 4: Pull Complexity Downward

When complexity is unavoidable, the module should absorb it internally rather than pushing it to callers. A module has few developers but many users — it's better for the module author to handle complexity once than for every caller to handle it independently.

```python
# BAD — pushes complexity to every caller
def run_git(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(["git"] + args, capture_output=True, text=True)

# Every caller must: check returncode, decode stderr, handle encoding,
# strip whitespace, handle repo not found, etc.

# GOOD — absorbs complexity
def run_git(args: list[str], *, cwd: Path | None = None) -> str:
    """Run git command, return stdout. Raises GitError on failure."""
    result = subprocess.run(
        ["git"] + args,
        capture_output=True, text=True, encoding="utf-8",
        errors="replace", cwd=cwd,
    )
    if result.returncode != 0:
        raise GitError(args[0], result.stderr.strip())
    return result.stdout.strip()
```

### Anti-patterns of Pushing Complexity Up

- Returning raw `subprocess.CompletedProcess` and letting callers check `.returncode`
- Raising generic exceptions that callers must parse
- Using configuration parameters to avoid making decisions
- Returning `dict` when a typed object would let callers skip validation

---

## Principle 5: Define Errors Out of Existence

Exception handling is a major source of complexity. The best strategy is to design semantics so error conditions simply aren't errors.

```python
# BAD — raises if key doesn't exist
def remove_agent(registry: dict, agent_id: str) -> None:
    if agent_id not in registry["agents"]:
        raise KeyError(f"Agent {agent_id} not found")
    del registry["agents"][agent_id]

# GOOD — guarantees postcondition: agent is not in registry
def remove_agent(registry: dict, agent_id: str) -> None:
    """Ensure agent_id is not in the registry after this call."""
    registry["agents"].pop(agent_id, None)
```

```python
# BAD — raises if directory already exists
def init_workspace(path: Path) -> None:
    if path.exists():
        raise FileExistsError(f"{path} already exists")
    path.mkdir()

# GOOD — guarantees postcondition: directory exists
def ensure_workspace(path: Path) -> Path:
    """Ensure workspace directory exists. Returns the path."""
    path.mkdir(parents=True, exist_ok=True)
    return path
```

The key insight: define the operation by its **postcondition** ("after this call, X is true") rather than its precondition ("X must be true before calling").

---

## Principle 6: KISS and Rule of Three

### KISS — Keep It Simple

Choose the simplest solution that works. Complexity must be justified by concrete (not hypothetical) requirements.

```python
# Over-engineered — registry pattern for 3 formatters
class FormatterRegistry:
    _registry: dict[str, type] = {}
    @classmethod
    def register(cls, name: str): ...
    @classmethod
    def create(cls, name: str): ...

# Simple — just a dictionary
FORMATTERS = {"json": format_json, "text": format_text, "table": format_table}

def format_output(fmt: str, data: Any) -> str:
    formatter = FORMATTERS.get(fmt)
    if not formatter:
        raise ValueError(f"Unknown format: {fmt}")
    return formatter(data)
```

### Rule of Three

Wait until you have **three** instances of a pattern before extracting an abstraction. Two is coincidence; three is a pattern. Premature abstraction is worse than duplication because:

- It couples unrelated code through a shared abstraction
- It makes each instance harder to understand independently
- It creates pressure to fit future cases into the abstraction even when they don't fit

**However**: when you do hit three, extract immediately. Don't let it reach nine.

---

## Principle 7: Single Responsibility and Module Boundaries

Each module should have **one reason to change**. When a module grows beyond ~300 lines, check if it has multiple responsibilities.

### Decomposition Signals

Split when:
- A file has multiple "sections" separated by comment headers
- You need to import only one function from a large module
- Tests for different parts of the module have no shared setup
- Changes to one responsibility don't require understanding the other

### How to Split

Split by **information hiding** (what knowledge is encapsulated), not by execution order (what runs when).

```python
# BAD — split by execution order (temporal decomposition)
# step1_parse_args.py, step2_validate.py, step3_execute.py
# All three must know the command structure

# GOOD — split by responsibility
# task_store.py    — owns task.json read/write, schema, iteration
# task_cli.py      — owns argparse, subcommand routing
# task_display.py  — owns formatting, colors, table output
```

---

## Principle 8: Consistent Shared Infrastructure

When multiple scripts need the same capability, provide it once in `common/`.

| Capability | Should Live In | Not In |
|-----------|---------------|--------|
| JSON file read/write | `common/io.py` | Each script's `_read_json_file` |
| Terminal colors + logging | `common/log.py` | Each script's `Colors` class |
| Git command execution | `common/git.py` | `_run_git_command` prefixed private |
| Task data access | `common/tasks.py` | Ad-hoc task.json parsing |
| Path constants | `common/paths.py` (existing) | Hardcoded strings |

**Naming**: If a function is used by other modules, it's public API — don't prefix it with `_`.

---

## Principle 9: Structured CLI Output Parsing

When parsing output from shell commands (git, grep, etc.), respect semantic whitespace:

```python
# BAD — .strip() destroys semantic whitespace
# git submodule status prefix: ' ' = initialized, '-' = uninitialized, '+' = changed
line = output_line.strip()  # Loses the prefix character!

# GOOD — strip only trailing newlines
line = output_line.rstrip("\n\r")
prefix = line[0] if line else " "
```

Always document what each field position means when parsing structured command output.

---

## Red Flags Quick Reference

Use during code review and self-review:

| Signal | What It Means |
|--------|--------------|
| **Shallow Module** | Interface is nearly as complex as implementation |
| **Information Leakage** | Same JSON schema / file format knowledge in multiple modules |
| **Duplicated Utility** | Same helper function copied to multiple files |
| **God Module** | File > 500 lines with multiple unrelated responsibilities |
| **Pass-Through Function** | Function just forwards args to another with similar signature |
| **Magic `.get()` Chains** | `data.get("x") or data.get("y", "")` — missing type definition |
| **sys.path Hacking** | `sys.path.insert(0, ...)` — fix package structure instead |
| **Private-Named Public API** | `_function` imported by 3+ external modules |
| **Raw Dict Threading** | Passing `dict` through 4+ function calls — use a dataclass |
| **Repeated Iteration** | Same directory scan / file parse pattern in 3+ locations |
| **Broad Exception Catch** | `except Exception:` without re-raising — hides bugs |
| **Temporal Decomposition** | Modules split by "what runs when" instead of "what knows what" |

---

## Design Checklist (Before Writing Code)

1. **Types first**: Define the data shape before writing logic
2. **Module depth check**: Will the interface be simpler than the implementation?
3. **Duplication scan**: `grep -r "pattern" .` before creating new utilities
4. **Responsibility check**: Does this belong in an existing module?
5. **Error design**: Can you define the error out of existence?
6. **Naming precision**: Does the name convey meaning without reading the implementation?

## Design Checklist (During Code Review)

1. **Red flags scan**: Check the table above against the diff
2. **Type safety**: Are new data shapes documented with types?
3. **Information hiding**: Does the change leak implementation details?
4. **Consistency**: Does it follow the existing patterns in the module?
5. **Depth**: Is the common path simple for callers?

---

## Strategic Investment

Spend roughly **10-20% of each change** improving surrounding design.

Working code is necessary but not sufficient. The increments of software development should be **abstractions**, not just features. Each change should leave the codebase slightly better than you found it.

This is not perfectionism — it's compound interest. Small design improvements accumulate into a system that's dramatically easier to work with over time.
