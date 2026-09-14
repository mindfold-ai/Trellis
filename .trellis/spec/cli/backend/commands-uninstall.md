# `trellis uninstall` Command

Source: `packages/cli/src/commands/uninstall.ts`

How the uninstall command removes every Trellis-written file from a project, scrubs structured config files in place, and prunes empty managed directories — without ever touching user-authored neighbors.

---

## Overview

`trellis uninstall` is the inverse of `trellis init` / `trellis update`: it removes everything Trellis wrote and leaves everything Trellis did not.

- **Manifest is authoritative.** The single source of truth for "what trellis wrote" is `.trellis/.template-hashes.json`. Files outside that manifest are never touched, regardless of where they live (e.g. user-added scripts under `.claude/hooks/`, custom commands under `.cursor/commands/`).
- **No user-modification gate.** Whether the user has edited a manifest-listed file or not, it is removed. `update` semantics (warn / preserve modified files) do not apply here — the user's intent is to remove Trellis entirely.
- **Two file classes.** Manifest entries fall into:
  1. *Opaque content files* (most `.py`, `.md`, `.toml`, `.json` agents, etc.) — unlinked outright.
  2. *Structured config files* (`settings.json`, `hooks.json`, `package.json`, `config.toml`, and mixed-ownership markdown like `AGENTS.md`) — passed through a scrubber that removes only the trellis-owned fields/block and writes the trimmed result back. If nothing meaningful remains, the scrubber returns `fullyEmpty: true` and the file is deleted instead of rewritten.
- **Only active `.trellis/` data is removed.** Retired identity/workspace/history stays in place without traversal. Active tasks/specs remain subject to the dirty-data guard. See [Identity-Free Task Lifecycle](./identity-free-task-lifecycle.md) for the current retirement contract.
- **Idempotent.** Re-running with no `.trellis/`, an empty directory, or only retained historical entries is a friendly no-op. No historical descendants are inspected. Remaining active files without an ownership manifest still require explicit reconciliation.
- **Best-effort cleanup.** Permission errors on individual `unlink`/`rmdir` calls are swallowed; the command never aborts halfway. The summary at the end reports counts but does not enumerate per-file failures.

For the *content* of each scrubber (which fields are stripped from `.claude/settings.json`, what counts as a trellis comment in `.codex/config.toml`, etc.), see `uninstall-scrubbers.md` for per-file scrubbing rules.

---

## Command Entry

Wired in `cli/index.ts` near other top-level subcommands:

```
trellis uninstall [-y|--yes] [--dry-run]
```

| Flag | Type | Effect |
|------|------|--------|
| `-y, --yes` | boolean | Skip the `Continue?` confirmation prompt. |
| `--dry-run` | boolean | Print the plan and exit without modifying anything. |

There are no `--platform <name>` or `--keep-config` flags. The design is intentionally all-or-nothing: partial uninstall (e.g. "remove Trellis from Cursor only, leave Claude Code") is **out of scope** because the manifest does not partition by platform — see *Common Pitfalls* below.

The command surface lives in `commands/uninstall.ts:uninstall` and is the only export consumed by `cli/index.ts`. The `UninstallOptions` interface in the same file mirrors the two CLI flags 1:1.

---

## Plan Composition

The command builds a plan first, prints it, optionally prompts, then executes. Plan composition is a pure function of `cwd` + manifest contents.

### Pre-checks (before any planning)

`commands/uninstall.ts:uninstall` performs two pre-checks at the top:

1. **`.trellis/` must exist.** If missing, print a gray "not installed" message and return cleanly (exit 0). This is the idempotent re-run path.
2. **Classify missing ownership without consuming history.** `loadHashes(cwd)` returns `{}` when `.trellis/.template-hashes.json` is missing or unreadable. Read only the `.trellis/` parent's child names via `activeTrellisChildren`. If there are no active entries, return successfully without removing anything or claiming ownership of remaining platform files. If active entries remain, refuse with `process.exit(1)` and request manifest reconciliation. Never recommend deleting the historical directory. A corrupt manifest itself counts as an active entry and is not silently ignored.

### Planner — `utils/managed-removal.ts:buildManagedRemovalPlan`

Inputs: `cwd`, `hashes` (manifest record).

For every POSIX path in `hashes`:

1. Resolve the absolute path via `path.join(cwd, ...posixPath.split("/"))`.
2. Look up the path in the structured-files dispatch table (see below).
3. **No structured spec match** → record as a plain `PlannedDeletion`. If the file is missing on disk, the entry is still recorded with `missing: true` (so the summary can report it as "skipped" without confusing it with a successful deletion).
4. **Spec match, file missing on disk** → record as `PlannedDeletion { missing: true }`. The scrubber is not invoked.
5. **Spec match, file present** → read the file, run the scrubber:
   - If the scrubber returns `fullyEmpty: true`, record as `PlannedDeletion { missing: false }`. The file will be unlinked just like any other manifest entry.
   - Otherwise, record as `PlannedModification` carrying the pre-computed `ScrubResult` (the post-scrub content) plus the `reason` string for the human-readable plan output.

`removeTrellisDir` is set to `true` unconditionally — by the time
`buildManagedRemovalPlan` runs, we have already verified `.trellis/` exists.

The shared planner also supports `strictPaths: true` for reversible ablation.
`uninstall` deliberately uses the default compatibility mode so this extraction
does not change its established best-effort behavior; strict containment,
leaf-symlink, and malformed-mixed-file refusal belong to `trellis ablate`.

### Structured-file dispatch table — `utils/managed-removal.ts:buildStructuredFileSpecs`

A `Map<posixPath, StructuredFileSpec>` built once per command invocation. Each entry pairs a manifest-listed config file with the scrubber that knows how to surgically edit it. Current entries:

| Manifest path | Scrubber | Hooks-JSON mode |
|---|---|---|
| `.claude/settings.json` | `scrubHooksJson` | `nested` |
| `.gemini/settings.json` | `scrubHooksJson` | `nested` |
| `.factory/settings.json` | `scrubHooksJson` | `nested` |
| `.codebuddy/settings.json` | `scrubHooksJson` | `nested` |
| `.qoder/settings.json` | `scrubHooksJson` | `nested` |
| `.codex/hooks.json` | `scrubHooksJson` | `nested` |
| `.cursor/hooks.json` | `scrubHooksJson` | `flat` |
| `.github/copilot/hooks.json` | `scrubHooksJson` | `flat` |
| `.opencode/package.json` | `scrubOpencodePackageJson` | n/a |
| `.pi/settings.json` | `scrubPiSettings` | n/a |
| `.codex/config.toml` | `scrubCodexConfigToml` | n/a |
| `AGENTS.md` | `scrubManagedMarkdownBlock` | n/a |

`AGENTS.md` is not a hooks-JSON file — it's a mixed-ownership markdown file. Trellis owns only the `<!-- TRELLIS:START/END -->` block (markers exported from `update.ts`); the user owns everything outside it. It shares `scrubManagedMarkdownBlock` with the Copilot-instructions scrubber: strip the block, keep the rest, and only fall through to deletion (`fullyEmpty`) when nothing user-authored remains. Before this spec was added, `AGENTS.md` had no dispatch-table row and was `unlinkSync`'d whole by the plain-deletion path, destroying any pre-existing user content outside the block.

Adding a new platform that ships a structured config file means adding one row to this table — the planner picks it up automatically. **Per-file scrub semantics live in `uninstall-scrubbers.md`; do not duplicate them here.**

The `StructuredFileSpec.scrub` callback receives `(content, deletedPaths)`. `deletedPaths` is the full set of manifest-listed POSIX paths for *this uninstall*, used by hooks-JSON scrubbers to identify trellis-managed `command` strings without false-matching on user-added hooks that merely mention the path in an `echo` or comment.

### Plan rendering — `commands/uninstall.ts:renderPlan`

Two-column output:

- **Will be deleted (N entries)** — the un-missing deletions plus a synthetic `WORKFLOW/` line representing the `.trellis/` directory itself (only printed if the directory still exists, which it always should after the pre-check).
- **Will be modified (N files)** — the structured-file modifications, each annotated with the `reason` from its dispatch entry.
- **Skipped** — a gray footer counting manifest entries already missing from disk (still recorded in the plan but not actionable).

This is purely cosmetic; the plan object itself drives execution.

---

## Confirmation & Dry Run

After printing the plan:

1. **`--dry-run`** — print "Dry run — no files were modified." and return. No prompt, no mutation, no `process.exit`.
2. **`--yes`** — skip prompt, go straight to execution.
3. **Otherwise** — prompt `Continue? [Y/n]` (default `Y`) via inquirer.

### Non-TTY guard

If `process.stdin.isTTY` is false **and** neither `--yes` nor `--dry-run` is set, the command refuses to prompt and exits non-zero with a red message instructing the user to pass `--yes` or `--dry-run`. This is a deliberate fail-closed UX choice that mirrors `trellis update` in scripted environments. The brief `readline.createInterface(...).close()` call before exit is a defensive ref-release in case anything else opened stdin (mostly defensive — the process is about to exit anyway).

If the user answers "no" at the prompt, print a yellow "Uninstall cancelled. No files modified." and return. **No partial execution; no rollback needed.**

---

## Plan Execution — `utils/managed-removal.ts:executeManagedRemovalPlan`

Five ordered phases. The order matters for partial-failure recovery (an interrupted uninstall leaves the project in a more-recoverable state):

### Phase 1 — Modifications first

Write each `PlannedModification.result.content` to its `absPath` via `fs.writeFileSync`. Doing this **before** deletions means that if a later step crashes, structured config files have at least had their trellis fragments stripped. User data inside those files (other deps in `package.json`, other hooks in `settings.json`, custom keys) is preserved.

### Phase 2 — File deletions

For each `PlannedDeletion` where `missing` is false, `fs.unlinkSync(absPath)`. Errors are caught and silently skipped — see *Best-Effort Cleanup* in *Boundaries*.

While deleting, the parent directory of each deleted file is added to a `Set<string>` of `deletedDirCandidates` (POSIX dirname of the manifest path). These are the directories that may have just become empty and are eligible for pruning.

### Phase 3 — Remove Active `.trellis/` Children

`removeActiveTrellisData(trellisDir)` excludes retired names before any descent.
It removes only active children and removes the root only when empty. Historical
identity/workspace/agent-traces remain in place, never backed up or deleted.
A linked `.trellis` root is refused before execution; an opaque tasks symlink
remains supported without traversing its target. Installation/manifest checks,
confirmation and the dirty-data guard still precede execution.

### Phase 4 — Prune empty managed sub-directories

For every dir in `deletedDirCandidates`, call `cleanupEmptyDirs(cwd, dirPosix)` (re-exported from `commands/update.ts`). This walks the directory bottom-up and removes any sub-directory that became empty after Phase 2 — but it explicitly **refuses to remove managed root dirs** (`.claude`, `.cursor`, `.codex`, etc.) because the normal `update` flow needs them to persist.

### Phase 5 — Prune empty managed root directories

This is the uninstall-only fixup that `cleanupEmptyDirs` deliberately won't do. After Phase 4, a platform root like `.claude` may be sitting empty (every nested file removed, every nested empty subdir already pruned). During uninstall there is no reason to keep it, so we walk `ALL_MANAGED_DIRS` (excluding `DIR_NAMES.WORKFLOW` because Phase 3 already handled it), sorted **deepest-first** by slash count, and `rmdirSync` each one that is empty.

After removing a deepest dir (e.g. `.agents/skills`), the loop walks **upward** until it hits a non-empty parent or runs out of POSIX path. This handles cases like:
- `.agents/skills` empty → remove → `.agents` may now be empty → remove → done.

The deepest-first sort matters: if we walked `ALL_MANAGED_DIRS` in registry order and tried to remove `.agents` before `.agents/skills`, the rmdir would fail because the dir was non-empty.

Returns `{ deletedFiles, modifiedFiles, deletedDirs }` for the green summary line.

---

## `.trellis/` Handling

Active scripts, specs, tasks, runtime, config and management receipts are removed;
there is no `--keep-tasks` flag. `.trellis/.developer`, `.trellis/workspace/` and
`.trellis/agent-traces/` remain unchanged in place. Removal refuses a linked
`.trellis` root rather than traversing it. A remaining historical-only root is
not an active installation, and output must not claim whole-tree deletion.

See [Identity-Free Task Lifecycle](./identity-free-task-lifecycle.md) for the current retirement contract.

### Dirty-Data Guard — `collectUncommittedTrellisData`

`collectUncommittedTrellisData(cwd)` checks active specs/tasks with scoped Git
status before execution. It never probes retired workspace history. Non-Git
repositories or unavailable Git retain the existing empty-result behavior.

- **Any hits** print a red warning (up to 20 paths, then a "`… and N more`" tail) before the prompt/dry-run message.
- **Interactive runs** (no `--yes`) only see the warning; the existing `Continue? [Y/n]` prompt is the abort point.
- **`--dry-run`** shows the warning too (for visibility) but returns before any fail-closed check, since dry-run never mutates anything.
- **Scripted `--yes` runs fail closed**: if uncommitted data was found and `--dry-run` was not passed, the command prints an error and `process.exit(1)`s *before* `executeManagedRemovalPlan` runs any write/unlink/rm — unless the environment variable `TRELLIS_ALLOW_DIRTY_UNINSTALL=1` is set, which mirrors the existing homedir-guard bypass pattern (`utils/cwd-guard.ts`).

See [Filesystem Safety § Destructive-op ownership / backup gate](./filesystem-safety.md) for the cross-cutting contract this guard implements.

---

## Boundaries

### What `uninstall` will NOT do

- **Touch unowned platform files outside `.template-hashes.json`.** User-added scripts inside `.claude/hooks/`, custom commands inside `.cursor/commands/`, project-local agents the user defined themselves — all preserved. Test `#7` in `test/commands/uninstall.integration.test.ts` covers this.
- **Mutate user-authored sections of structured config.** Scrubbers strip *only* trellis-emitted entries. Other deps in `package.json`, other event hooks in `settings.json`, custom `[features]` table entries in `config.toml` — all preserved. Test `#8` covers this for `.claude/settings.json`.
- **Touch git history.** No `git add`, no `git commit`, no `git rm`. The user is expected to commit the post-uninstall state themselves. (Same convention as `update`.)
- **Touch `~/.codex/config.toml` or any other user-level config.** Codex's hook activation flag (`features.hooks = true`) lives in the user's home config; we never edit that. We do remove the project-local `.codex/config.toml`, which only contains `project_doc_fallback_filenames` + a comment block.
- **Reverse migrations.** If a user originally installed v0.4 and migrated to v0.5, `uninstall` removes the v0.5-shape files (whatever the current manifest contains). It does not reconstruct any v0.4 files.

### Best-effort cleanup

Phases 2, 4, 5 all use try/catch with empty handlers. Permission errors on individual files or directories are swallowed. The summary's "deleted N files" count will under-report if any of these errors fire. We accept this trade-off: aborting halfway through uninstall would leave the user in a worse state than completing best-effort.

If a user reports "uninstall didn't remove file X", the diagnosis path is:

1. Did the file exist in `.trellis/.template-hashes.json` before the uninstall? (If not, it was never trellis-owned.)
2. Did permissions or AV software block the unlink? (`ls -la` the path post-uninstall.)
3. Was the file inside a structured config that scrubbed-but-was-not-fully-empty? (Check the file content.)

### Manifest as scope contract

Every behavior decision flows from "is this path in the manifest?":

- Path in manifest, no structured spec → unlink.
- Path in manifest, structured spec, scrub returns `fullyEmpty` → unlink.
- Path in manifest, structured spec, scrub keeps content → write back trimmed content.
- Path NOT in manifest → invisible to uninstall.

The corollary: when adding a new platform/template that emits a structured config file, **you MUST** (a) add the path to `.template-hashes.json` (which happens automatically through `collectPlatformTemplates`) and (b) add a `StructuredFileSpec` row to `buildStructuredFileSpecs`. Forgetting (b) means uninstall will outright unlink the config file and take any user-added neighbors with it.

---

## Common Pitfalls

### 1. "Per-platform uninstall" is not supported

There is no `--platform claude-code` flag. Reason: the manifest does not partition by platform — it is a flat `Record<posixPath, sha256>`. Inferring "this entry belongs to Claude Code" would mean prefix-matching `.claude/`, which is fragile (`.agents/skills/` is shared by Codex and Pi; `.github/copilot/` lives outside the platform-name pattern).

If a user wants to remove just one platform's files, the path is `trellis update` after editing `config.yaml`'s platform list — that flow knows how to deconfigure platforms cleanly. `uninstall` is a single-shot full removal.

### 2. Adding a new structured config file without a scrubber

**Symptom**: User runs `uninstall`, finds their custom keys in `.newplatform/settings.json` are gone — the entire file got unlinked because the planner had no `StructuredFileSpec` for it.

**Cause**: Manifest tracks the file (good — the planner sees it), but `buildStructuredFileSpecs` lacks a row for it, so the planner falls into the "plain deletion" branch.

**Fix**: Always add a `StructuredFileSpec` row at the same time you add the new platform's manifest-tracked structured config. The companion scrubber goes in `utils/uninstall-scrubbers.ts` — see `uninstall-scrubbers.md` for the contract.

### 3. Forgetting that `cleanupEmptyDirs` won't touch root dirs

**Symptom**: After uninstall, `.cursor/` is empty but still present.

**Cause**: `cleanupEmptyDirs` (shared with `update.ts`) refuses to remove anything in `ALL_MANAGED_DIRS` because during `update` those dirs must persist. Phase 5 of `executeManagedRemovalPlan` is the uninstall-specific fixup that goes back and prunes them.

**Fix**: This is already handled correctly. If you ever modify Phase 5 (e.g. to add an exception), make sure the deepest-first sort is preserved — otherwise nested managed dirs (`.agents/skills`) will leak.

### 4. Manifest drift after manual edits

**Symptom**: User manually deleted some Trellis files, then runs `uninstall`. Plan shows "skipped N entries" for those files (they were missing on disk), but the unrelated structured-config phase still works correctly.

**Cause**: Working as designed. The planner records `missing: true` for any manifest-listed file that is gone, then skips it during execution.

**Note**: There is no "manifest is stale, please run `update` first" warning — uninstall is the user's exit hatch and should not require any prior intervention.

### 5. Codex `[features] hooks = true` survives uninstall

**Symptom**: User uninstalls Trellis but `~/.codex/config.toml` still has `[features]\nhooks = true`.

**Cause**: That flag is in the **user-level** Codex config, not project-local. Trellis never wrote to it (the README+the project `.codex/config.toml` comment block instruct the user to add it manually). `uninstall` therefore does not remove it.

**Fix**: Document this in the future — add a closing reminder to the green summary if Codex was one of the configured platforms. Currently silent.

### 6. Hooks-JSON command-string matching is structural, not substring

The hooks-JSON scrubber matches on the *trailing whitespace-delimited token* of each `command`, not arbitrary substring. A user-defined hook whose body merely echoes a deleted path (`echo "see .claude/hooks/session-start.py"`) will NOT be removed — its trailing token is `inspiration"`, not the manifest path. This is the correct behavior; see `uninstall-scrubbers.md` for the full matching contract.

If you ever need to extend the scrubber to match different command shapes (e.g. quoted paths, `--script=path` flags), update both `uninstall-scrubbers.ts` and the hooks-JSON tests in `test/utils/uninstall-scrubbers.test.ts` — `uninstall.ts` itself does not need to change.

---

## Test Conventions

Tests live in `packages/cli/test/commands/uninstall.integration.test.ts`. The file pattern: each test runs `init({ ..., force: true })` in a fresh tmpdir to set up a real Trellis install, then exercises one path through `uninstall()`.

Two behaviors documented above have their own dedicated integration test files rather than living in the main table below: the `AGENTS.md` block-scrub fix is covered by `test/commands/init-uninstall-overdelete.integration.test.ts`, and the *Dirty-Data Guard* is covered by `test/commands/uninstall-dirty-guard.integration.test.ts` (skipped when `git`/`python3` are unavailable, since it shells out to real `git status`).

Reference cases (number = test ID in the file):

| # | Scenario | What it pins down |
|---|---|---|
| 1 | `.trellis/` missing | Friendly no-op exit, no error. |
| 2 | `.trellis/` present, manifest missing | Error exit (manual cleanup hint). |
| 3 | `init claude+cursor → uninstall` | Project is byte-clean afterwards. |
| 4 | `--dry-run` | No filesystem mutation. |
| 5 | Prompt `n` | Aborts with no mutation. |
| 6 | User-modified manifest file is still removed | Manifest membership trumps modification state. |
| 7 | User-added file in managed dir survives | Manifest is the scope boundary. |
| 8 | `.claude/settings.json` with extra user fields | Scrubber preserves user fields, strips trellis hooks. |
| 8a | Empty managed dirs pruned (Kilo case, no structured config) | Phase 4+5 cleanup. |
| 8b | Platform root survives when scrubbing leaves residual content | Phase 5 only prunes empty roots. |

When adding a new structured-config platform:

1. Add a row to the dispatch table.
2. Write a unit test in `test/utils/uninstall-scrubbers.test.ts` for the scrubber itself.
3. Add an integration test in this file mirroring `#8` — init that platform, write some user-owned fields into the structured config, uninstall, assert the user fields survive and the trellis fields are gone.

Do **not** mock `fs` for these tests; they all use real tmpdirs. The pattern is: `beforeEach` makes a tmpdir and `chdir`'s into it, `afterEach` restores `cwd` and `rmSync` the tmpdir. This catches Windows path bugs, permission issues, and unintended side effects that a mocked fs would hide.

---

## Reference Symbols

| Symbol | Location |
|---|---|
| `uninstall` | `commands/uninstall.ts:uninstall` |
| `UninstallOptions` | `commands/uninstall.ts:UninstallOptions` |
| `buildStructuredFileSpecs` | `utils/managed-removal.ts:buildStructuredFileSpecs` |
| `buildManagedRemovalPlan` | `utils/managed-removal.ts:buildManagedRemovalPlan` |
| `renderPlan` | `commands/uninstall.ts:renderPlan` |
| `promptContinue` | `commands/uninstall.ts:promptContinue` |
| `executeManagedRemovalPlan` | `utils/managed-removal.ts:executeManagedRemovalPlan` |
| `StructuredFileSpec` | `utils/managed-removal.ts:StructuredFileSpec` |
| `PlannedDeletion` / `PlannedModification` / `ManagedRemovalPlan` | `utils/managed-removal.ts` |
| `loadHashes` | `utils/template-hash.ts:loadHashes` |
| `cleanupEmptyDirs` | `commands/update.ts:cleanupEmptyDirs` (re-exported) |
| `ALL_MANAGED_DIRS` / `isManagedRootDir` | `configurators/index.ts` |
| `DIR_NAMES.WORKFLOW` | `constants/paths.ts:DIR_NAMES` |
| `collectUncommittedTrellisData` | `commands/uninstall.ts:collectUncommittedTrellisData` (exported) |
| `TRELLIS_ALLOW_DIRTY_UNINSTALL` (env bypass) | checked via `dirtyUninstallBypassEnabled` in `commands/uninstall.ts` |
| Scrubbers (`scrubHooksJson`, `scrubOpencodePackageJson`, `scrubPiSettings`, `scrubCodexConfigToml`, `scrubManagedMarkdownBlock`) | `utils/uninstall-scrubbers.ts` — see `uninstall-scrubbers.md` |
