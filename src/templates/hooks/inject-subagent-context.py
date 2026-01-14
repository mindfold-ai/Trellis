#!/usr/bin/env python3
"""
Multi-Agent Pipeline Context Injection Hook

Core Design Philosophy:
- Router becomes a pure dispatcher, only responsible for "calling subagents"
- Hook is responsible for injecting all context, subagent works autonomously with complete info
- Each agent has a dedicated jsonl file defining its context
- No resume needed, no segmentation, behavior controlled by code not prompt

Trigger: PreToolUse (before Task tool call)

Context Source: workflow/.current-feature points to feature directory
- coder.jsonl   - Coder agent dedicated context
- checker.jsonl - Checker agent dedicated context
- fixer.jsonl   - Fixer agent dedicated context
- searcher.jsonl - Searcher agent dedicated context (optional, usually not needed)
- cr.jsonl      - Code review dedicated context
- prd.md        - Requirements document
- info.md       - Technical design
- codex-review-output.txt - Code Review results
"""

import json
import os
import sys
from pathlib import Path

# =============================================================================
# Path Constants (change here to rename directories)
# =============================================================================

DIR_WORKFLOW = "workflow"
DIR_PROGRESS = "agent-traces"
DIR_FEATURES = "features"
DIR_STRUCTURE = "structure"
FILE_CURRENT_FEATURE = ".current-feature"

# =============================================================================
# Subagent Constants (change here to rename subagent types)
# =============================================================================

AGENT_CODER = "coder"
AGENT_CHECKER = "checker"
AGENT_FIXER = "fixer"
AGENT_SEARCHER = "searcher"

# Agents that require a feature directory
AGENTS_REQUIRE_FEATURE = (AGENT_CODER, AGENT_CHECKER, AGENT_FIXER)
# All supported agents
AGENTS_ALL = (AGENT_CODER, AGENT_CHECKER, AGENT_FIXER, AGENT_SEARCHER)


def find_repo_root(start_path: str) -> str | None:
    """
    Find git repo root from start_path upwards

    Returns:
        Repo root path, or None if not found
    """
    current = Path(start_path).resolve()
    while current != current.parent:
        if (current / ".git").exists():
            return str(current)
        current = current.parent
    return None


def get_current_feature(repo_root: str) -> str | None:
    """
    Read current feature directory path from workflow/.current-feature

    Returns:
        Feature directory relative path (relative to repo_root)
        None if not set
    """
    current_feature_file = os.path.join(repo_root, DIR_WORKFLOW, FILE_CURRENT_FEATURE)
    if not os.path.exists(current_feature_file):
        return None

    try:
        with open(current_feature_file, "r", encoding="utf-8") as f:
            content = f.read().strip()
            return content if content else None
    except Exception:
        return None


def read_file_content(base_path: str, file_path: str) -> str | None:
    """Read file content, return None if file doesn't exist"""
    full_path = os.path.join(base_path, file_path)
    if os.path.exists(full_path) and os.path.isfile(full_path):
        try:
            with open(full_path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception:
            return None
    return None


def read_directory_contents(
    base_path: str, dir_path: str, max_files: int = 20
) -> list[tuple[str, str]]:
    """
    Read all .md files in a directory

    Args:
        base_path: Base path (usually repo_root)
        dir_path: Directory relative path
        max_files: Max files to read (prevent huge directories)

    Returns:
        [(file_path, content), ...]
    """
    full_path = os.path.join(base_path, dir_path)
    if not os.path.exists(full_path) or not os.path.isdir(full_path):
        return []

    results = []
    try:
        # Only read .md files, sorted by filename
        md_files = sorted(
            [
                f
                for f in os.listdir(full_path)
                if f.endswith(".md") and os.path.isfile(os.path.join(full_path, f))
            ]
        )

        for filename in md_files[:max_files]:
            file_full_path = os.path.join(full_path, filename)
            relative_path = os.path.join(dir_path, filename)
            try:
                with open(file_full_path, "r", encoding="utf-8") as f:
                    content = f.read()
                    results.append((relative_path, content))
            except Exception:
                continue
    except Exception:
        pass

    return results


def read_jsonl_entries(base_path: str, jsonl_path: str) -> list[tuple[str, str]]:
    """
    Read all file/directory contents referenced in jsonl file

    Schema:
        {"file": "path/to/file.md", "reason": "..."}
        {"file": "path/to/dir/", "type": "directory", "reason": "..."}

    Returns:
        [(path, content), ...]
    """
    full_path = os.path.join(base_path, jsonl_path)
    if not os.path.exists(full_path):
        return []

    results = []
    try:
        with open(full_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                    file_path = item.get("file") or item.get("path")
                    entry_type = item.get("type", "file")

                    if not file_path:
                        continue

                    if entry_type == "directory":
                        # Read all .md files in directory
                        dir_contents = read_directory_contents(base_path, file_path)
                        results.extend(dir_contents)
                    else:
                        # Read single file
                        content = read_file_content(base_path, file_path)
                        if content:
                            results.append((file_path, content))
                except json.JSONDecodeError:
                    continue
    except Exception:
        pass

    return results


def get_agent_context(repo_root: str, feature_dir: str, agent_type: str) -> str:
    """
    Get complete context for specified agent

    Prioritize agent-specific jsonl, fallback to spec.jsonl if not exists
    """
    context_parts = []

    # 1. Try agent-specific jsonl
    agent_jsonl = f"{feature_dir}/{agent_type}.jsonl"
    agent_entries = read_jsonl_entries(repo_root, agent_jsonl)

    # 2. If agent-specific jsonl doesn't exist or empty, fallback to spec.jsonl
    if not agent_entries:
        agent_entries = read_jsonl_entries(repo_root, f"{feature_dir}/spec.jsonl")

    # 3. Add all files from jsonl
    for file_path, content in agent_entries:
        context_parts.append(f"=== {file_path} ===\n{content}")

    return "\n\n".join(context_parts)


def get_coder_context(repo_root: str, feature_dir: str) -> str:
    """
    Complete context for Coder Agent

    Read order:
    1. All files in coder.jsonl (dev specs)
    2. prd.md (requirements)
    3. info.md (technical design)
    """
    context_parts = []

    # 1. Read coder.jsonl (or fallback to spec.jsonl)
    base_context = get_agent_context(repo_root, feature_dir, "coder")
    if base_context:
        context_parts.append(base_context)

    # 2. Requirements document
    prd_content = read_file_content(repo_root, f"{feature_dir}/prd.md")
    if prd_content:
        context_parts.append(
            f"=== {feature_dir}/prd.md (Requirements) ===\n{prd_content}"
        )

    # 3. Technical design
    info_content = read_file_content(repo_root, f"{feature_dir}/info.md")
    if info_content:
        context_parts.append(
            f"=== {feature_dir}/info.md (Technical Design) ===\n{info_content}"
        )

    return "\n\n".join(context_parts)


def get_checker_context(repo_root: str, feature_dir: str) -> str:
    """
    Complete context for Checker Agent

    Read order:
    1. All files in checker.jsonl (check specs + dev specs)
    2. prd.md (for understanding feature intent)
    """
    context_parts = []

    # 1. Read checker.jsonl (or fallback to spec.jsonl + hardcoded check files)
    checker_entries = read_jsonl_entries(repo_root, f"{feature_dir}/checker.jsonl")

    if checker_entries:
        for file_path, content in checker_entries:
            context_parts.append(f"=== {file_path} ===\n{content}")
    else:
        # Fallback: use hardcoded check files + spec.jsonl
        check_files = [
            (".claude/commands/finish-work.md", "Finish work checklist"),
            (".claude/commands/check-cross-layer.md", "Cross-layer check spec"),
            (".claude/commands/check-backend.md", "Backend check spec"),
            (".claude/commands/check-frontend.md", "Frontend check spec"),
        ]
        for file_path, description in check_files:
            content = read_file_content(repo_root, file_path)
            if content:
                context_parts.append(f"=== {file_path} ({description}) ===\n{content}")

        # Add spec.jsonl
        spec_entries = read_jsonl_entries(repo_root, f"{feature_dir}/spec.jsonl")
        for file_path, content in spec_entries:
            context_parts.append(f"=== {file_path} (Dev spec) ===\n{content}")

    # 2. Requirements document (for understanding feature intent)
    prd_content = read_file_content(repo_root, f"{feature_dir}/prd.md")
    if prd_content:
        context_parts.append(
            f"=== {feature_dir}/prd.md (Requirements - for understanding intent) ===\n{prd_content}"
        )

    return "\n\n".join(context_parts)


def get_fixer_context(repo_root: str, feature_dir: str) -> str:
    """
    Complete context for Fixer Agent

    Read order:
    1. All files in fixer.jsonl (specs needed for fixing)
    2. codex-review-output.txt (Codex Review results)
    """
    context_parts = []

    # 1. Read fixer.jsonl (or fallback to spec.jsonl + hardcoded check files)
    fixer_entries = read_jsonl_entries(repo_root, f"{feature_dir}/fixer.jsonl")

    if fixer_entries:
        for file_path, content in fixer_entries:
            context_parts.append(f"=== {file_path} ===\n{content}")
    else:
        # Fallback: use spec.jsonl + hardcoded check files
        spec_entries = read_jsonl_entries(repo_root, f"{feature_dir}/spec.jsonl")
        for file_path, content in spec_entries:
            context_parts.append(f"=== {file_path} (Dev spec) ===\n{content}")

        check_files = [
            (".claude/commands/check-backend.md", "Backend check spec"),
            (".claude/commands/check-frontend.md", "Frontend check spec"),
            (".claude/commands/check-cross-layer.md", "Cross-layer check spec"),
        ]
        for file_path, description in check_files:
            content = read_file_content(repo_root, file_path)
            if content:
                context_parts.append(f"=== {file_path} ({description}) ===\n{content}")

    # 2. Codex review output (if exists)
    codex_output = read_file_content(
        repo_root, f"{feature_dir}/codex-review-output.txt"
    )
    if codex_output:
        context_parts.append(
            f"=== {feature_dir}/codex-review-output.txt (Codex Review Results) ===\n{codex_output}"
        )

    return "\n\n".join(context_parts)


def build_coder_prompt(original_prompt: str, context: str) -> str:
    """Build complete prompt for Coder"""
    return f"""# Coder Agent Task

You are the Coder Agent in the Multi-Agent Pipeline.

## Your Context

All the information you need has been prepared for you:

{context}

---

## Your Task

{original_prompt}

---

## Workflow

1. **Understand specs** - All dev specs are injected above, understand them
2. **Understand requirements** - Read requirements document and technical design
3. **Implement feature** - Implement following specs and design
4. **Self-check** - Ensure code quality against check specs

## Important Constraints

- Do NOT execute git commit, only code modifications
- Follow all dev specs injected above
- Report list of modified/created files when done"""


def build_checker_prompt(original_prompt: str, context: str) -> str:
    """Build complete prompt for Checker"""
    return f"""# Checker Agent Task

You are the Checker Agent in the Multi-Agent Pipeline (code checker).

## Your Context

All check specs and dev specs you need:

{context}

---

## Your Task

{original_prompt}

---

## Workflow

1. **Get changes** - Run `git diff --name-only` and `git diff` to get code changes
2. **Check against specs** - Check item by item against specs above
3. **Self-fix** - Fix issues directly, don't just report
4. **Run verification** - Reference .husky/pre-commit for typecheck and lint

## Important Constraints

- Fix issues yourself, don't just report
- Must execute complete checklist in finish-work.md
- Pay special attention to impact radius analysis (L1-L5)"""


def build_fixer_prompt(original_prompt: str, context: str) -> str:
    """Build complete prompt for Fixer"""
    return f"""# Fixer Agent Task

You are the Fixer Agent in the Multi-Agent Pipeline (issue fixer).

## Your Context

Dev specs and Codex Review results:

{context}

---

## Your Task

{original_prompt}

---

## Workflow

1. **Understand issues** - Analyze issues pointed out in Codex Review
2. **Locate code** - Find positions that need fixing
3. **Fix against specs** - Fix issues following dev specs
4. **Verify fixes** - Run typecheck to ensure no new issues

## Important Constraints

- Do NOT execute git commit, only code modifications
- Run typecheck after each fix to verify
- Report which issues were fixed and which files were modified"""


def get_searcher_context(repo_root: str, feature_dir: str | None) -> str:
    """
    Context for Searcher Agent

    Searcher doesn't need much preset context, only needs:
    1. Project structure overview (where spec directories are)
    2. Optional searcher.jsonl (if there are specific search needs)
    """
    context_parts = []

    # 1. Project structure overview (uses constants for paths)
    structure_path = f"{DIR_WORKFLOW}/{DIR_STRUCTURE}"
    project_structure = f"""## Project Spec Directory Structure

```
{structure_path}/
├── shared/      # Cross-project common specs (TypeScript, code quality, git)
├── frontend/    # Frontend standards
├── backend/     # Backend standards
└── flows/       # Thinking guides (cross-layer, code reuse, etc.)

{DIR_WORKFLOW}/big-question/  # Known issues and pitfalls
```

## Search Tips

- Spec files: `{structure_path}/**/*.md`
- Known issues: `{DIR_WORKFLOW}/big-question/`
- Code search: Use Glob and Grep tools
- Tech solutions: Use mcp__exa__web_search_exa or mcp__exa__get_code_context_exa"""

    context_parts.append(project_structure)

    # 2. If feature directory exists, try reading searcher.jsonl (optional)
    if feature_dir:
        searcher_entries = read_jsonl_entries(
            repo_root, f"{feature_dir}/searcher.jsonl"
        )
        if searcher_entries:
            context_parts.append(
                "\n## Additional Search Context (from searcher.jsonl)\n"
            )
            for file_path, content in searcher_entries:
                context_parts.append(f"=== {file_path} ===\n{content}")

    return "\n\n".join(context_parts)


def build_searcher_prompt(original_prompt: str, context: str) -> str:
    """Build complete prompt for Searcher"""
    return f"""# Searcher Agent Task

You are the Searcher Agent in the Multi-Agent Pipeline (search researcher).

## Core Principle

**You do one thing: find and explain information.**

You are a documenter, not a reviewer.

## Project Info

{context}

---

## Your Task

{original_prompt}

---

## Workflow

1. **Understand query** - Determine search type (internal/external) and scope
2. **Plan search** - List search steps for complex queries
3. **Execute search** - Execute multiple independent searches in parallel
4. **Organize results** - Output structured report

## Search Tools

| Tool | Purpose |
|------|---------|
| Glob | Search by filename pattern |
| Grep | Search by content |
| Read | Read file content |
| mcp__exa__web_search_exa | External web search |
| mcp__exa__get_code_context_exa | External code/doc search |

## Strict Boundaries

**Only allowed**: Describe what exists, where it is, how it works

**Forbidden** (unless explicitly asked):
- Suggest improvements
- Criticize implementation
- Recommend refactoring
- Modify any files

## Report Format

Provide structured search results including:
- List of files found (with paths)
- Code pattern analysis (if applicable)
- Related spec documents
- External references (if any)"""


def main():
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    tool_name = input_data.get("tool_name", "")

    if tool_name != "Task":
        sys.exit(0)

    tool_input = input_data.get("tool_input", {})
    subagent_type = tool_input.get("subagent_type", "")
    original_prompt = tool_input.get("prompt", "")
    cwd = input_data.get("cwd", os.getcwd())

    # Only handle subagent types we care about
    if subagent_type not in AGENTS_ALL:
        sys.exit(0)

    # Find repo root
    repo_root = find_repo_root(cwd)
    if not repo_root:
        sys.exit(0)

    # Get current feature directory (searcher doesn't require it)
    feature_dir = get_current_feature(repo_root)

    # coder/checker/fixer need feature directory
    if subagent_type in AGENTS_REQUIRE_FEATURE:
        if not feature_dir:
            sys.exit(0)
        # Check if feature directory exists
        feature_dir_full = os.path.join(repo_root, feature_dir)
        if not os.path.exists(feature_dir_full):
            sys.exit(0)

    # Get context and build prompt based on subagent type
    if subagent_type == AGENT_CODER:
        assert feature_dir is not None  # validated above
        context = get_coder_context(repo_root, feature_dir)
        new_prompt = build_coder_prompt(original_prompt, context)
    elif subagent_type == AGENT_CHECKER:
        assert feature_dir is not None  # validated above
        context = get_checker_context(repo_root, feature_dir)
        new_prompt = build_checker_prompt(original_prompt, context)
    elif subagent_type == AGENT_FIXER:
        assert feature_dir is not None  # validated above
        context = get_fixer_context(repo_root, feature_dir)
        new_prompt = build_fixer_prompt(original_prompt, context)
    elif subagent_type == AGENT_SEARCHER:
        # Searcher can work without feature directory
        context = get_searcher_context(repo_root, feature_dir)
        new_prompt = build_searcher_prompt(original_prompt, context)
    else:
        sys.exit(0)

    if not context:
        sys.exit(0)

    # Return updated input
    output = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
            "updatedInput": {**tool_input, "prompt": new_prompt},
        }
    }

    print(json.dumps(output, ensure_ascii=False))
    sys.exit(0)


if __name__ == "__main__":
    main()
