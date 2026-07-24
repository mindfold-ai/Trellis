# Audit and harden Trellis runtime scripts

## Goal

Make Trellis' copied Python runtime scripts fail safely and visibly across task lifecycle, configuration, and hook paths. These scripts are installed into user projects and run inside AI/tooling hooks, so small silent failures can propagate into many downstream repos.

## Background

Recent parallel-session review work repeatedly identified a deferred Trellis-core bucket: task overwrite handling, path traversal, config parser robustness, and silent-error behavior in `.trellis/scripts/common/*` plus related hooks. The related review-preflight and Copilot guidance fixes were handled in Trellis or `sd-ai-command-pack`; this broader runtime audit still needs a first-class Trellis task.

Confirmed surfaces in this repo:

- `.trellis/scripts/common/task_utils.py:27` contains the current task path safety helper.
- `.trellis/scripts/common/task_utils.py:218` runs lifecycle hooks and warns on non-zero hook results.
- `.trellis/scripts/common/config.py:62` and `.trellis/scripts/common/trellis_config.py:111` implement separate simple YAML parsers.
- `.trellis/scripts/common/io.py:14` returns `None` for missing, invalid, and unreadable JSON, while `write_json` returns `False` on write errors.
- Packaged copies live under `packages/cli/src/templates/trellis/scripts/common/` and must stay behaviorally aligned with the dogfood `.trellis/scripts/common/` copy.

## Requirements

- Audit task lifecycle entry points that accept task paths or operate on task directories, including create, start, archive, subtask linking, and context curation.
- Ensure task path handling rejects traversal, absolute paths where inappropriate, repo-root resolution, symlink escape, and archive/create collisions before filesystem writes or moves occur.
- Ensure task operations do not silently overwrite task directories, task metadata, JSONL context, or archive destinations without an explicit force-style path.
- Review common JSON I/O helpers and callers so missing files, invalid JSON, unreadable files, and write failures are distinguishable where the caller needs to make a safety decision.
- Review both config parsers for malformed YAML, unsupported YAML shapes, inline comments, quoting, lists, nested mappings, and invalid hook declarations; either consolidate the parser or document and test any deliberate differences.
- Preserve intended fail-open behavior for AI hooks where appropriate, but make unexpected errors observable enough for users and future agents to diagnose.
- Keep `.trellis/scripts/common/*` and `packages/cli/src/templates/trellis/scripts/common/*` synchronized for any runtime fixes.
- Add regression coverage for the audit outcomes, with tests covering both dogfood scripts and packaged templates where drift is possible.

## Acceptance Criteria

- [ ] The audit produces a tracked matrix of entry point, input source, trust boundary, current behavior, desired behavior, and test coverage for the affected runtime paths.
- [ ] Path traversal and symlink escape cases are covered by regression tests for task resolution or task lifecycle commands.
- [ ] Task archive/create/link/context operations fail safely on destination collisions or ambiguous task identifiers instead of overwriting or selecting the wrong target silently.
- [ ] Config parser behavior is covered by tests for malformed files, comments, quoting, lists, nested mappings, and unsupported values; any fail-open behavior is documented in code or spec.
- [ ] JSON read/write helpers and their callers have explicit handling for safety-sensitive failure modes.
- [ ] Lifecycle hook failures keep the intended non-blocking behavior but report event, command, exit status, and useful stderr/stdout context.
- [ ] Dogfood and packaged template script copies are updated together, with a template drift check or equivalent test proving they remain aligned.
- [ ] Relevant focused verification passes, including targeted Vitest coverage and any Python script validation added by the implementation.

## Out Of Scope

- Replacing the simple config parser with a new runtime dependency unless the audit shows the current subset cannot be made safe enough.
- Changing platform-specific prompt/agent templates except where needed to keep hook error reporting coherent.
- Implementing `sd-ai-command-pack` review-preflight or installer policy changes; those remain pack-owned unless a Trellis CLI boundary is found.

## Planning Notes

- This is a complex task. Keep it in `planning` until `design.md`, `implement.md`, and JSONL context are reviewed for the intended implementation strategy.
- Before editing runtime functions, run GitNexus impact analysis for each touched symbol and use `detect_changes({scope: "compare", base_ref: "main"})` before committing.
