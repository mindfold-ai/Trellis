# fix(init): --yes non-interactive + bootstrap task fallback (issue #204)

GitHub issue: https://github.com/mindfold-ai/Trellis/issues/204

## Goal

`trellis init --yes` should be fully non-interactive (the contract `-y` implies on every CLI), and a first-time init should always end with `.trellis/tasks/00-bootstrap-guidelines/` created — even if a previous run was aborted partway and re-run with different flags.

This task fixes Bug 1 + Bug 2 from issue #204. Bug 3 (`Maximum call stack size exceeded`) is **out of scope** here — not reproducible locally yet, awaiting stack trace from the reporter via the issue comment.

## What I already know

- Root causes verified by code reading + local repro:
  - **Bug 1**: `packages/cli/src/commands/init.ts:893-901` — `setWriteMode` only inspects `--force` / `--skip-existing`, not `--yes`. With `--yes` alone, `globalWriteMode` stays `"ask"` and `writeFile()` (`packages/cli/src/utils/file-writer.ts:111`) hits `inquirer.prompt`. In piped/CI stdin this surfaces as `ERR_USE_AFTER_CLOSE: readline was closed` (also reproduced).
  - **Bug 2**: `packages/cli/src/commands/init.ts:1650-1672` — three-branch dispatch keys off `isFirstInit` captured at function entry (`!fs.existsSync(.trellis/)`). When the first run aborts after writing `.trellis/` skeleton but before reaching this dispatch, the second run sees `isFirstInit=false` and falls into the joiner branch instead of bootstrap. Result: `00-join-<dev>/` exists, `00-bootstrap-guidelines/` does not.
- Repro fixture confirmed both at commit `859a151` (0.5.0-beta.19): `/tmp/trellis-repro-204` (pnpm monorepo `apps/api` + `apps/web`, pre-existing `.codex/config.toml`).
- `writeTaskSkeleton` (`init.ts:148`) is already idempotent (`if (fs.existsSync(taskDir)) return true`), so retriggering bootstrap creation is safe.

## Requirements

### Bug 1 fix
- When `--yes` is passed without `--force` or `--skip-existing`, write mode defaults to `"skip"` (preserve existing files; safest non-interactive default).
- Explicit `--force` and `--skip-existing` continue to take precedence over `--yes`.
- The "Mode: ..." log line still prints so the user knows which mode is active.

### Bug 1.5 fix (defense-in-depth)
- `writeFile()` in `utils/file-writer.ts` should never call `inquirer.prompt` when `process.stdin.isTTY` is false. In non-TTY contexts (CI, pipes, scripted invocations), a missing `setWriteMode` call should fall back to `"skip"` instead of crashing with `ERR_USE_AFTER_CLOSE`.
- This is layer-level safety so future CLI flags can't silently regress this scenario by forgetting to update `setWriteMode`.

### Bug 2 fix
- If `.trellis/tasks/` is empty (or missing) at the dispatch point, treat it as "first init that didn't finish" and create the bootstrap task — regardless of `isFirstInit`.
- The joiner branch (`!hadDeveloperFileAtStart`) only fires when tasks dir is non-empty (i.e., a real existing Trellis project the joiner is onboarding into).
- Same-developer re-init with completed bootstrap (tasks dir non-empty, `.developer` exists) still creates nothing — current behavior preserved.

## Acceptance Criteria

- [ ] `trellis init -u <name> --codex --yes` in a dir with pre-existing `.codex/config.toml` finishes without prompting and without `ERR_USE_AFTER_CLOSE`.
- [ ] After the above, `.trellis/tasks/00-bootstrap-guidelines/{task.json,prd.md}` exists.
- [ ] Re-running `trellis init -u <name> --codex --yes` on the same project does NOT recreate or duplicate the bootstrap task (idempotency).
- [ ] `trellis init -u <name> --codex --force` still overwrites existing files (regression check).
- [ ] `trellis init -u <name> --codex --skip-existing` (no `--yes`) still skips existing files (regression check).
- [ ] Joiner scenario still works: project with full `.trellis/tasks/` (e.g., archived bootstrap) + missing `.developer` → creates `00-join-<dev>/`, NOT a duplicate bootstrap.
- [ ] In non-TTY mode (`echo "" | trellis init ...`), conflict on existing file falls back to "skip" instead of throwing `ERR_USE_AFTER_CLOSE`.
- [ ] Unit tests in `test/commands/init.integration.test.ts` cover the new branches: `--yes` alone, empty-tasks-dir bootstrap fallback, joiner non-empty-tasks branch, same-dev re-init no-op.
- [ ] Unit test in `test/utils/file-writer.test.ts` covers the non-TTY fallback path.
- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck` all pass.

## Definition of Done

- [x] Tests added covering the new write-mode branch and the empty-tasks-dir fallback.
- [x] Lint / typecheck / vitest all green (775 tests).
- [x] Manual repro of all 5 scenarios passes (--yes alone, idempotent re-run, --skip-existing --yes, --force --yes, joiner with archived bootstrap).
- [ ] Changelog entry — deferred to next `/trellis:create-manifest` run for beta.20. Pure behavioral fix on flag/dispatch logic; no data migration or template diff, so no manifest entry needed.
- [ ] Issue #204 update comment after release ships.

## Technical Approach

### Bug 1 (one-line fix)

`packages/cli/src/commands/init.ts:893-901`:

```diff
   let writeMode: WriteMode = "ask";
   if (options.force) {
     writeMode = "force";
     console.log(chalk.gray("Mode: Force overwrite existing files\n"));
   } else if (options.skipExisting) {
     writeMode = "skip";
     console.log(chalk.gray("Mode: Skip existing files\n"));
+  } else if (options.yes) {
+    writeMode = "skip";
+    console.log(chalk.gray("Mode: Non-interactive (skip existing files)\n"));
   }
   setWriteMode(writeMode);
```

Decision: `--yes` implies `skip` (safest non-destructive default), not `force`. Documented in feedback memory after this lands so future maintainers don't flip it.

### Bug 1.5 (defense-in-depth, file-writer.ts)

`packages/cli/src/utils/file-writer.ts:88`:

```diff
-  // File exists with different content, handle based on mode
-  const mode = globalWriteMode;
+  // File exists with different content, handle based on mode.
+  // Non-TTY (CI/pipes): never prompt — fall back to skip rather than crash
+  // with ERR_USE_AFTER_CLOSE if a CLI flag forgot to set globalWriteMode.
+  const mode =
+    globalWriteMode === "ask" && !process.stdin.isTTY
+      ? "skip"
+      : globalWriteMode;
```

### Bug 2 (small dispatch tweak)

`packages/cli/src/commands/init.ts:1650`:

```diff
+    const tasksDir = path.join(cwd, PATHS.TASKS);
+    const tasksEmpty = !fs.existsSync(tasksDir) ||
+      fs.readdirSync(tasksDir).length === 0;
+
-    if (isFirstInit) {
+    if (isFirstInit || tasksEmpty) {
       createBootstrapTask(
         cwd, developerName, pythonCmd, projectType, monorepoPackages,
       );
     } else if (!hadDeveloperFileAtStart) {
       // joiner branch unchanged
     }
```

Same idempotency relies on `writeTaskSkeleton`'s existing `if (fs.existsSync(taskDir)) return true` short-circuit.

### Files touched

- `packages/cli/src/commands/init.ts` — Bug 1 + Bug 2
- `packages/cli/src/utils/file-writer.ts` — Bug 1.5
- `test/commands/init.integration.test.ts` — new init test cases
- `test/utils/file-writer.test.ts` — non-TTY fallback test
- `docs-site/...` — changelog entry (separate commit)

## Decision (ADR-lite)

**Context**: `--yes` semantics in `trellis init`. Two reasonable defaults: implicit `skip` (preserve user files) vs implicit `force` (overwrite to match templates). npm/yarn-style CLIs usually pick `skip` for safety; git-style tooling sometimes picks `force`.

**Decision**: `--yes` defaults to `skip`. Users who want overwrite must opt in explicitly with `--force` (already supported).

**Consequences**:
- Pro: never destroys user's existing config files silently — matches "least surprise" for first-time users running an automated setup.
- Pro: makes `--yes` safe in CI / scripted environments.
- Con: users who hand-edited templates and want a clean re-sync need `--force`. Acceptable; the `--force` flag is documented and present.

## Out of Scope

- Bug 3 (`Maximum call stack size exceeded`) — separate investigation, awaiting stack trace from reporter.
- Refactoring the three-branch dispatch into a state-machine — too speculative for a bug fix.
- Adding a fourth flag like `--non-interactive` synonym for `--yes` — current `--yes` is fine once it works correctly.
- Changing `writeFile` mode semantics globally — scope is just the CLI flag mapping.

## Technical Notes

- Repro fixture (kept around for the duration of this task): `/tmp/trellis-repro-204/`
- `WriteMode` type and `setWriteMode` live in `packages/cli/src/utils/file-writer.ts:6-25`.
- `writeTaskSkeleton` idempotency contract: `init.ts:148-169`.
- Existing integration tests structure: `test/commands/init.integration.test.ts` (16 tests covering full init flow including force/skip-existing).
- Issue link: https://github.com/mindfold-ai/Trellis/issues/204
