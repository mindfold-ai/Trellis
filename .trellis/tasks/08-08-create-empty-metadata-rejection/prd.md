# Reject empty title and description at task.py create

## Problem

`task.py create` accepts records that downstream pre-archive validation
refuses:

- An empty description is only a stderr warning (`common/task_store.py`,
  ~line 353 at HEAD) and is then written as `"description": ""`.
- A whitespace-only title passes the truthiness guard, and `--slug` bypasses
  the slug-derivation path that would otherwise fail it.

Downstream consumers (sd-ai-command-pack's review preflight) require
non-empty trimmed `title` and `description`; the failure surfaces at PR
finalization — observed blocking sd-ai-command-pack PR #376 hours after the
task was created — instead of at creation, when it costs one retyped command.

The two emptiness predicates additionally diverge between Python
`str.strip()` and JS `String.trim()` on U+FEFF and U+0085, so "agree by
construction" is false unless the predicate is stated explicitly.

## Requirements

1. `task.py create` exits nonzero and creates nothing when title or
   description is absent or whitespace-only (validation precedes
   `ensure_tasks_dir`, so a rejected invocation leaves the filesystem
   untouched).
2. The whitespace predicate is stated explicitly (character list), chosen so
   Python and JS validators classify the divergent characters identically.
3. The failure message names the flag and states the record would be refused
   at archive; `--help` documents description as required.
4. Template docs/skills that invoke `create` without `--description` are
   updated in the same change.

## Acceptance criteria

- [ ] `create "<title>"` with no `--description` exits nonzero, leaves no new
      directory.
- [ ] `--description "   "` and `create "   " --slug x` fail identically.
- [ ] A test covers U+FEFF / U+0085 agreement between creation and any
      shipped validator.
- [ ] Regression suite green.

## Evidence

sd-ai-command-pack cross-repo review 2026-08-08; PR #376 finalization block;
predicate divergence measured in that repo's 08-08-task-create-description-required
(content preserved in its git history).
