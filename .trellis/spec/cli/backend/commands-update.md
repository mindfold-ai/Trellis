# `trellis update` Command

How `trellis update` upgrades a user project's bundled Trellis assets (Python scripts, workflow.md, AGENTS.md, platform configs) from the version recorded in `.trellis/.version` to the version of the installed CLI.

This spec covers the command pipeline, flags, interactive surface, and the subsystems update orchestrates. Manifest mechanics — schema fields, migration types, hash gating semantics — live in `migrations.md`. This document references that one rather than restating it.

---

## Overview

User-facing contract:

- Input: a project directory containing `.trellis/`, the CLI binary on `PATH`.
- Output: bundled templates on disk match the CLI version; `.trellis/.version` advanced; modified files preserved or backed up; renamed/deleted files migrated when `--migrate`; legacy deprecated files cleaned up via hash-verified `safe-file-delete`; a follow-up migration task created when the upgrade crosses a breaking release with a `migrationGuide`.
- Side effects: snapshot backup at `.trellis/.backup-<timestamp>/`, `.trellis/.template-hashes.json` rewritten, optional `.trellis/tasks/<MM-DD>-migrate-to-<version>/` task tree.

Two big invariants:

1. **Idempotent**: re-running `trellis update` immediately after a successful run prints `✓ Already up to date!` and writes nothing. If you ever see auto-update churn on a clean re-run, the cause is almost always a placeholder unresolved in `collectTemplateFiles` (see Common Pitfalls).
2. **User edits are never silently overwritten**. Anything outside Trellis-managed templates is in `PROTECTED_PATHS`; anything inside whose hash differs from the recorded one drops to the conflict prompt or `--force` / `--skip-all` / `--create-new` policy.

---

## Command Entry

Wired in `cli/index.ts` via Commander:

```text
trellis update
  [--dry-run]            preview only
  [-f, --force]          overwrite all changed files; also bypasses final "Proceed?" confirm and forces modified migrations
  [-s, --skip-all]       skip all changed files; also auto-skips modified migrations under --migrate
  [-n, --create-new]     write `.new` copies for changed files
  [--allow-downgrade]    permit CLI < project version
  [--migrate]            apply pending file migrations (renames/deletes)
```

The action handler in `cli/index.ts` constructs `UpdateOptions` and calls `commands/update.ts:update`. There is no env override surface today — flags are the only knobs. (Note: `setupProxy()` in `commands/update.ts:update` reads `HTTP_PROXY` / `HTTPS_PROXY` for the npm version check, but that's the only env input.)

`UpdateOptions` is the public interface:

```typescript
interface UpdateOptions {
  dryRun?: boolean;
  force?: boolean;
  skipAll?: boolean;
  createNew?: boolean;
  allowDowngrade?: boolean;
  migrate?: boolean;
}
```

Note that `force` / `skipAll` / `createNew` are mutually exclusive in spirit but the code does not assert mutual exclusivity. They are checked in priority order in `commands/update.ts:promptConflictResolution`. `force` also doubles as "non-interactive" — it skips the global `Proceed?` confirm in `commands/update.ts:update`.

---

## Update Plan Composition

### 1. Collect bundled templates

`commands/update.ts:collectTemplateFiles` is the single place that produces the "what should be on disk" snapshot. Sources, in order:

| Source | Where the bytes come from |
|---|---|
| Python scripts under `.trellis/scripts/` | `templates/trellis/index.ts:getAllScripts` |
| `.trellis/config.yaml` | `templates/trellis/index.ts:configYamlTemplate` |
| `.trellis/.gitignore` | `templates/trellis/index.ts:gitignoreTemplate` |
| `.trellis/workflow.md` | `templates/trellis/index.ts:workflowMdTemplate` (whole-file hash-gated, see below) |
| Root `AGENTS.md` | `commands/update.ts:buildAgentsMdTemplate` (managed-block merge) |
| Per-platform files | `configurators/index.ts:collectPlatformTemplates` for each detected platform via `configurators/index.ts:getConfiguredPlatforms` |
| `.claude/settings.json` `statusLine` | preserved through `commands/update.ts:preserveExistingClaudeStatusLine` |

Platforms are auto-discovered by directory existence in `cwd`. There is one exception: if `commands/update.ts:needsCodexUpgrade` returns true (legacy Trellis tracked `.agents/skills/` but no `.codex/` exists yet), `commands/update.ts:update` passes `extraPlatforms: new Set(["codex"])` to force Codex template collection so the upgrade can create `.codex/`.

After collection, `collectTemplateFiles` runs two final passes:

1. `update.skip` filtering via `commands/update.ts:loadUpdateSkipPaths` — drops paths matching the `update.skip` list in `.trellis/config.yaml`. **Bypassed** when the update is a breaking release with `recommendMigrate` (`breakingBypass`); see "Migration Trigger Semantics".
2. `configurators/shared.ts:replacePythonCommandLiterals` is applied to every value so init-time and update-time bytes are byte-identical on the same OS. This is the load-bearing step that keeps idempotency working — see Common Pitfalls.

### 2. Whole-file workflow.md update and AGENTS.md managed-block merge

These two runtime-facing files have different update contracts:

- **`.trellis/workflow.md`** stays on the normal whole-file template path. `collectTemplateFiles` inserts the bundled `workflowMdTemplate`; `analyzeChanges` decides whether to auto-update, prompt, skip, or create `.new` by comparing the current file hash with `.trellis/.template-hashes.json`. Do not partially merge only `[workflow-state:*]` blocks.
- **`AGENTS.md`** (`commands/update.ts:buildAgentsMdTemplate`) merges only the `<!-- TRELLIS:START -->`…`<!-- TRELLIS:END -->` region via `commands/update.ts:replaceTrellisManagedBlock`; if no markers exist, the template managed block is appended. The legacy untracked-hash whitelist `LEGACY_UNTRACKED_AGENTS_MD_BLOCK_HASHES` lets a pristine pre-tracking AGENTS.md auto-update without a "modified by you" false positive (see `commands/update.ts:isKnownUntrackedTemplate`).

Why workflow is whole-file: `.trellis/workflow.md` is parsed by `get_context.py`,
`workflow_phase.py`, SessionStart strippers, and per-turn workflow-state hooks.
Runtime-significant headings and platform markers live outside
`[workflow-state:*]` blocks. Updating only tag blocks can make breadcrumbs
current while leaving stale phase or platform routing sections behind.

Non-native workflow variants selected through `trellis workflow --template` or
`trellis init --workflow` are deliberately removed from
`.trellis/.template-hashes.json`. That makes `trellis update` classify the file
as user-managed instead of auto-updating it back to bundled native workflow.

### 3. Analyze on-disk state

`commands/update.ts:analyzeChanges` walks every entry in the templates map and produces a `ChangeAnalysis`:

| Bucket | Condition |
|---|---|
| `newFiles` | template has it; disk doesn't; no stored hash |
| `userDeletedFiles` | template has it; disk doesn't; **stored hash exists** → respect deletion, do not re-add |
| `unchangedFiles` | disk content === template content |
| `autoUpdateFiles` | disk differs from template; stored hash matches current content (or known-untracked AGENTS.md) → user did not edit; safe to write |
| `changedFiles` | disk differs from template; stored hash absent or stale → user edited; needs decision |

This bucketing is the basis for both the printed plan and the write phase.

---

## Flags Semantics

### `--dry-run`

Runs the full pipeline up to and including the printed plan and breaking-change banner, then returns before the `Proceed?` confirm. No file writes, no backup, no version bump. Combines safely with `--migrate`: `commands/update.ts:update` allows the migration plan to be printed but stops before `executeMigrations` runs. See `update.integration.test.ts > #2 dry run makes no file changes even when changes exist` and `> #23 breaking-change gate allows --dry-run without --migrate`.

### `--force` / `-f`

Three meanings, all in this single flag:

1. **Conflict resolution** (`commands/update.ts:promptConflictResolution`): for every entry in `changedFiles`, choose `overwrite` without asking.
2. **Migration mode** (`commands/update.ts:executeMigrations`): for every `confirm`-bucket migration, treat as `rename`/`delete` (no inline `.backup`). The full snapshot under `.trellis/.backup-<timestamp>/` is the only safety net in this mode — see `update.integration.test.ts > #26 rename-anyway does NOT leave an inline .backup`.
3. **Final confirm** (`commands/update.ts:update`): skip the global `Proceed?` prompt. This is what makes `trellis update --force --migrate` viable for CI / scripted upgrades.

### `--skip-all` / `-s`

Mirror of `--force` for the "leave my edits alone" intent: `changedFiles` are skipped; modified `confirm` migrations are skipped (you'll see them flagged on the next update until cleaned up manually). Also skips the final confirm.

### `--create-new` / `-n`

For changed files only — writes `<path>.new` next to the original. Migrations are not affected. Tip lines at the end of `update()` remind users to merge `.new` files manually.

### `--allow-downgrade`

Permits `cliVersion < projectVersion`. Without it, `update()` exits early with a help message. With it, the warning still prints, then the pipeline runs as if upgrading. Migrations between the two versions are not "applied in reverse" — `getMigrationsForVersion` always walks low→high (see `migrations.md`), so a downgrade with file changes is best-effort and the user has to clean up manually. There is no migration task generation on downgrade.

### `--migrate`

Opt-in to apply file migrations (renames/deletes/dir renames). Without it: migrations are listed in the plan but not executed; a "Tip: Use --migrate" hint prints. With it:

1. `commands/update.ts:executeMigrations` runs on the classified plan.
2. The hardcoded 0.2.0 `traces-*.md → journal-*.md` rename runs via `commands/update.ts:renameTracesToJournal(workspaceDir)` (workspace/<dev>/ pattern walk; cannot live in the manifest because the path includes a variable developer slug). It never overwrites: if the `journal-*.md` target already exists, that file is left as-is and reported back in a `skipped` list instead of being renamed over — `.trellis/workspace/` is outside the backup snapshot, so an overwrite there would be unrecoverable. See [Filesystem Safety § 3](./filesystem-safety.md).

`safe-file-delete` migrations are independent of `--migrate` — they always run when their hash gate passes (see Apply Phase). A historical deletion is ignored when its path is present in the current template snapshot: current template ownership takes precedence if a later release intentionally restores a retired path. Rationale in `migrations.md`.

### Tag flag (`--tag <beta|rc|latest>`)

There is no `--tag` flag on `trellis update` today. Version selection is implicit: `update()` always uses the version of the installed CLI (`constants/version.ts:VERSION`). Users who want a specific CLI channel should run `trellis upgrade --tag beta` (or `latest` / `rc`) first, then run `trellis update`. The npm-version check in `commands/update.ts:getLatestNpmVersion` only looks at the `latest` dist-tag and is purely advisory ("⚠️ Your CLI is behind npm").

---

## Migration Trigger Semantics

### Pending migrations

`commands/update.ts:update` calls `migrations/index.ts:getMigrationsForVersion(projectVersion, cliVersion)` to get the migration set, then merges in **orphaned migrations** — items whose source still exists and target doesn't, regardless of version range. Orphans show up when a previous update bumped `.trellis/.version` but a migration was skipped or interrupted; they get added to `pendingMigrations` so the next `--migrate` cleans them up.

Migration state is then run through `commands/update.ts:classifyMigrations` against current hashes and templates:

| Class | Trigger |
|---|---|
| `auto` | source unmodified, target free or matches template |
| `confirm` | source modified by user (hash mismatch) |
| `conflict` | both source and target exist with user content |
| `skip` | source missing, path is `PROTECTED_PATHS`, or (see below) an unowned `rename-dir` source |

`rename-dir` has an extra ownership gate when the target is absent: `commands/update.ts:dirHasManifestEntries(item.from, hashes)` must find at least one manifest-tracked file under that source directory before it lands in `auto`. If the manifest has no record of the directory — e.g. a user's own `.windsurf/` editor config that merely shares a path with a retired Trellis platform dir — the item goes to `skip` instead, even under `--force` (skip never executes). See [Filesystem Safety § 2–3](./filesystem-safety.md) for the rationale and the other ownership/backup gates it's modeled after.

Sorting before execution is by `commands/update.ts:sortMigrationsForExecution`: deeper `rename-dir` first, then other `rename-dir`, then `rename` / `delete`. Critical for nested directory renames — without depth ordering, a parent move would leave child entries pointing at a dead source.

### The breaking-change gate

This is the safety mechanism that prevents accidental half-migration across a major version. In `commands/update.ts:update`, after `classifyMigrations`:

```text
if (pendingMigrationCount > 0
    && !options.migrate
    && !options.dryRun
    && cliVsProject > 0
    && projectVersion !== "unknown"
    && metadata.breaking
    && metadata.recommendMigrate)
  → process.exit(1)
```

Why hard-fail: the alternative path silently bumps `.trellis/.version` on success, leaving deprecated files orphaned next to the new architecture forever. The user has no signal that something went wrong until much later, when `update` re-flags the same orphan list every release.

Hard-fail conditions, all of which must be true:

- there is real migration work pending (excluding `safe-file-delete`)
- `--migrate` was not passed
- `--dry-run` was not passed (preview is always allowed)
- the upgrade is a real upgrade (not same-version, not downgrade)
- the version range crosses at least one manifest with both `breaking: true` AND `recommendMigrate: true`

Tested in `update.integration.test.ts > #22 breaking-change gate exits 1 when --migrate is missing`, `> #23 ... allows --dry-run`, `> #24 ... allows --migrate to proceed`.

### `breakingBypass` for `update.skip`

When the breaking-change gate fires AND `--migrate` is set, `commands/update.ts:update` computes `breakingBypass = true` and threads it into `collectTemplateFiles` and `collectSafeFileDeletes`. The bypass causes `update.skip` to be ignored for both new template writes AND `safe-file-delete` cleanup.

Rationale: honoring `update.skip` during a breaking upgrade leaves the project permanently half-migrated — old deprecated files persist under skip-protected paths while new commands never land. The hash check in `safe-file-delete.allowed_hashes` is still the safety net (user-customized files still skip with a "skip-modified" reason). User customizations to non-deprecated files are still guarded at write time by the per-file conflict prompt.

---

## Apply Phase

Order of operations in `commands/update.ts:update` (after the `Proceed?` confirm, when not dry-run):

1. **Backup** — `commands/update.ts:createFullBackup` snapshots every `BACKUP_DIRS` (= `configurators/index.ts:ALL_MANAGED_DIRS`) entry plus `BACKUP_FILES` (= `AGENTS.md`) into `.trellis/.backup-<ISO-timestamp>/`. `commands/update.ts:shouldExcludeFromBackup` filters out previous backups, `node_modules/`, user-data dirs (`workspace/`, `tasks/`, `spec/`, `backlog/`, `agent-traces/`), and platform-native worktree dirs (`/worktrees/`, `/worktree/`). Symlinks (and Windows directory junctions) are never followed in `commands/update.ts:collectAllFiles` — a junction to an ancestor would loop forever.

2. **Migrations** (only if `--migrate`) — `commands/update.ts:executeMigrations` runs `auto` items first (sorted by depth), then `confirm` items via `commands/update.ts:promptMigrationAction` (or `--force` / `--skip-all` short-circuits). Default action for prompts is `backup-rename`: leaves `<new-path>.backup` of the user's modified content alongside the rename, so users can diff inline without digging through the snapshot. Hash tracking is updated via `utils/template-hash.ts:renameHash` / `removeHash`. Empty source dirs are pruned by `commands/update.ts:cleanupEmptyDirs` (gated by `configurators/index.ts:isManagedPath` + `isManagedRootDir` — never deletes managed roots themselves, never crosses into unmanaged paths). After regular migrations, the hardcoded `traces-*.md → journal-*.md` workspace walk (`commands/update.ts:renameTracesToJournal`) runs; files whose journal target already exists are skipped (not overwritten) and printed as a yellow "Kept ... its journal target already exists" warning.

3. **`safe-file-delete`** — `commands/update.ts:executeSafeFileDeletes` deletes files in the `delete` action bucket (hash matched, not protected, not in `update.skip` unless bypassed), removes their hash entries, and prunes empty parent directories. `commands/update.ts:collectSafeFileDeletes` first excludes paths owned by the current template snapshot so historical cleanup cannot conflict with a reintroduced template. `migrations.md` covers the full classification matrix.

4. **New file writes** — straight `mkdir -p` + `writeFileSync`. `.sh` and `.py` get `chmod 755`.

5. **Auto-update writes** — same as new files, but the file already exists.

6. **Conflict resolution** — for every `changedFiles` entry, call `commands/update.ts:promptConflictResolution`. The `applyToAll` carrier object captures `[a]` / `[s]` / `[n]` "Apply to all" choices so the user only has to decide once for a batch of similar prompts. Result is `overwrite` (write + chmod), `skip` (no-op), or `create-new` (write `<path>.new`).

7. **`configSectionsAdded`** — only on real upgrades (`cliVsProject > 0`, `projectVersion !== "unknown"`). `commands/update.ts:applyConfigSectionsAdded` walks entries from `migrations/index.ts:getConfigSectionsAddedBetween`, dedupes by `file::sentinel`, skips any whose sentinel is already present in the user's file (idempotent), and appends the named section extracted via `commands/update.ts:extractConfigSection`. This is the only path that can grow `.trellis/config.yaml` without going through the conflict prompt — by design, since users routinely edit other parts of `config.yaml` (`session_commit_message`, `packages`, etc.) and a hash-mismatch overwrite would either lose those edits (`y`) or starve the project of new sections (`n`). See `migrations.md` § `configSectionsAdded` for the schema.

8. **Version stamp** — `commands/update.ts:updateVersionFile` writes `cliVersion` to `.trellis/.version`.

9. **Hash refresh** — every newly-written file (`newFiles`, `autoUpdateFiles`, overwritten `changedFiles`, plus any `missingAgentsMdHash` entry from `collectMissingAgentsMdHash`) gets its hash recomputed and saved via `utils/template-hash.ts:updateHashes`. `.new` copies and skipped files do NOT get their hash updated — the original file's recorded hash continues to drive the next-update conflict decision.

10. **Migration task creation** — only when the upgrade crosses a manifest with `breaking: true` AND a non-empty `migrationGuide` (collected via `migrations/index.ts:getMigrationMetadata`). `update()` writes `.trellis/tasks/<MM-DD>-migrate-to-<cliVersion>/` containing `task.json` (built via `utils/task-json.ts:emptyTaskJson`) and `prd.md` listing every guide and AI-instruction block. Skipped if the directory already exists. Assignee is read from `.trellis/.developer` via the strict `name=<value>` regex — DO NOT change this to a raw `.trim()` (see Common Pitfalls).

11. **End-of-run banners** — breaking-change banner and `--migrate` recommendation are intentionally printed last so they don't scroll off screen on long updates.

---

## Hashing & Idempotency

`.trellis/.template-hashes.json` is the contract that makes `analyzeChanges` work. Schema and helpers live in `utils/template-hash.ts`. Update interacts with it via:

- `loadHashes(cwd)` at the top of `update()`
- `computeHash(content)` for inline checks (`isKnownUntrackedTemplate`, `safe-file-delete` matching)
- `isTemplateModified(cwd, path, hashes)` in `classifyMigrations`
- `renameHash` / `removeHash` during migrations
- `updateHashes(cwd, files)` at the end

`saveHashes` (called by `updateHashes`/`renameHash`/`removeHash`) writes `.trellis/.template-hashes.json` via `writeFileAtomic` (temp file in the same dir + rename), not a direct `writeFileSync`. A crash mid-write can no longer truncate the manifest to `{}`, which would otherwise make every managed file look user-modified on the next run. See [Filesystem Safety § 1](./filesystem-safety.md).

`migrations.md` documents the relationship to `allowed_hashes` in `safe-file-delete` migrations: the hash file tracks "Trellis-installed bytes" (so update can detect user edits); `allowed_hashes` is a bounded set of "known-pristine bytes" the manifest blesses for auto-deletion. They are different sets — a user file might have a recorded hash but not be `allowed_hashes`-eligible.

The idempotency invariant ("re-running update on a clean repo writes nothing") rests on three pieces of hygiene:

1. **`collectTemplateFiles` resolves all placeholders the same way init does.** The most common bug is forgetting to pipe a new placeholder through `configurators/shared.ts:replacePythonCommandLiterals` (or the per-platform `resolvePlaceholders`) inside a configurator's `collectTemplates` lambda. Init writes resolved bytes; update collects unresolved templates; hashes mismatch every run. See `platform-integration.md > Common Mistakes > "Template placeholder not resolved in collectTemplates"`.
2. **Init and update agree on what files exist.** Anything `collectTemplateFiles` lists must also be created by `init`, otherwise update auto-adds it on every run. See `platform-integration.md > Common Mistakes > "Template listed in update but not created by init"`.
3. **The runtime templates are byte-stable.** `workflowMdTemplate` and `buildAgentsMdTemplate` should return the same content when given the same inputs across runs. The CLI tests this via `update.integration.test.ts > #1 same version update is a true no-op` (full snapshot before/after).

---

## Boundaries with `init`

Update and init share the same template producers:

| Helper | Producer |
|---|---|
| Collect platform files | `configurators/index.ts:collectPlatformTemplates` (init does it via `configurePlatform` writing them out; update gathers them via the parallel `collectTemplates` lambda in `PLATFORM_FUNCTIONS`) |
| Detect platforms | `configurators/index.ts:getConfiguredPlatforms` |
| Backup roots | `configurators/index.ts:ALL_MANAGED_DIRS` (also the source of `BACKUP_DIRS` in update) |
| Empty-dir cleanup gate | `configurators/index.ts:isManagedPath` / `isManagedRootDir` |
| Python script bundle | `templates/trellis/index.ts:getAllScripts` |
| Init hash seeding | `utils/template-hash.ts:initializeHashes` (init); update keeps it fresh via `updateHashes` |

What's unique to update:

- Whole-file hash-gated update for bundled native `workflow.md`; non-native workflows are user-managed by removing the workflow hash entry.
- Managed-block merge for `AGENTS.md` (init writes the bundled template directly).
- Snapshot backup at `.trellis/.backup-<timestamp>/`.
- Migration plan + execution.
- `configSectionsAdded` append path.
- npm-version advisory check (init has no remote check today).
- Migration task generation.

Init has no notion of "what was here before" — it always assumes a fresh slate and is gated by `--force` / `--skip-existing`. Update is the only command that reasons about prior state via hashes.

---

## Boundaries with `migrations.md`

`migrations.md` is the canonical reference for: manifest schema (all fields including `breaking` / `recommendMigrate` / `migrationGuide` / `aiInstructions` / `configSectionsAdded`), migration types (`rename` / `rename-dir` / `delete` / `safe-file-delete`), classification rules per type, hash relationships (`allowed_hashes` vs `.template-hashes.json`), `update.skip` config, protected paths, and walk-table helpers (`getMigrationsForVersion` / `getAllMigrations` / `getMigrationMetadata` / `getConfigSectionsAddedBetween`).

This document does NOT restate any of that. When extending update behavior, decide which side of the line your change lives on:

- New manifest field → `migrations.md`, plus the consumer wiring in `update.ts`.
- New CLI flag, new interactive prompt, new write phase, new banner → here.
- New migration *type* → both: define the type and classification in `migrations.md`, define the executor in `update.ts:executeMigrations`.

---

## Common Pitfalls

### Multi-version hop chain (v0.4 → v0.5+)

`getMigrationsForVersion(from, to)` walks every manifest where `manifest.version` falls strictly above `from` and ≤ `to`. A v0.4 → v0.5.6 jump applies migrations from 0.4.x.y, 0.5.0.0, 0.5.1, …, 0.5.6 in version order. If any of those manifests is `breaking` + `recommendMigrate: true`, the breaking gate fires once for the whole hop. Consequence: a user who deferred upgrades for several releases sees a single hard-fail without `--migrate`, but the migration list can be very long. Test with `--dry-run` before running `--migrate` on big hops.

### Breaking + recommendMigrate must ship `migrationGuide`

`migrations.md` documents this: a manifest with `breaking: true` AND `recommendMigrate: true` MUST also define `migrationGuide` (and conventionally `aiInstructions`). The reason update.ts cares is the migration-task generator: `getMigrationMetadata` aggregates `migrationGuides` across every manifest in the hop; if the breaking manifest is missing one, the user gets either (a) a task PRD full of older guides with no mention of the actual breaking release, or (b) no task at all if every guide in the range is missing. Historical incident: 0.5.0-beta.0 shipped without a `migrationGuide` and was hotfixed in 0.5.0-beta.9. The `packages/cli/scripts/create-manifest.js` `--stdin` mode now hard-fails on this combination at manifest authoring time.

### Orphan migrations

If `.trellis/.version` says you're already on the latest CLI but a stale `from` path still exists on disk and the new `to` doesn't, that's an orphan. `update()` always scans `getAllMigrations()` for orphans regardless of version range and adds them to `pendingMigrations`. They show up under "⚠️ Detected incomplete migrations from previous updates" in the printed plan. Causes: a previous run was interrupted between `migrations` execution and `updateVersionFile`; a previous run skipped the migration via `[s]` and the user expected it to apply later; manifest authoring error (a v0.4 entry referencing a path that was already moved before v0.4 ever shipped). All three resolve the same way: `trellis update --migrate`.

### Backup bloat

Every non-trivial run creates `.trellis/.backup-<timestamp>/`. `BACKUP_EXCLUDE_PATTERNS` keeps user-data trees and platform worktrees out, but the snapshot still includes every managed config file in every platform directory. Power users with 8+ platforms configured can accumulate hundreds of MB of backups over a few months. There is no automatic pruning today — Trellis treats backups as user data ("cleanup is your call"). If you add automatic pruning, it must be opt-in and must not delete backups newer than the last successful version transition (otherwise a debug rollback path disappears).

### `node_modules/` under managed dirs

OpenCode's plugin pattern installs npm dependencies under `.opencode/`. Without `/node_modules/` in `BACKUP_EXCLUDE_PATTERNS`, every backup would snapshot the entire dependency tree (`update.integration.test.ts > #27 backup skips managed node_modules dependency trees` regression-tests this). When adding a new platform that ships dependencies, verify the pattern still catches them; if the platform uses a non-standard path, extend `BACKUP_EXCLUDE_PATTERNS`.

### `.developer` raw-trim foot-gun

`init_developer.py` writes `.trellis/.developer` as `key=value` lines:

```text
name=<developer-name>
initialized_at=<iso8601>
```

Reading the file with `fs.readFileSync(...).trim()` and using the result as `assignee` embeds the `name=` prefix and the `initialized_at` line into the task. The migration-task creator at the end of `commands/update.ts:update` uses the strict regex `/^\s*name\s*=\s*(.+?)\s*$/m` for exactly this reason. Don't "simplify" it.

### Idempotency churn after adding a placeholder

Symptom: every `trellis update` shows the same hooks/settings file as auto-updated. Root cause: a configurator's `configure()` resolves a placeholder before writing, but `collectTemplates` returns the unresolved template. Fix: every placeholder must be resolved in BOTH places. The cleanest pattern is to share a `resolvePlaceholders(...)` call in both code paths inside `configurators/<platform>.ts`. See `platform-integration.md > Common Mistakes > "Template placeholder not resolved in collectTemplates"`.

### "Modified by you" on a file the user never touched

Two failure modes here:

1. The file was written before hash tracking existed for that path (legacy install). Solution for AGENTS.md is `LEGACY_UNTRACKED_AGENTS_MD_BLOCK_HASHES`. Adding the same escape hatch for other paths is acceptable but should be a last resort — the proper fix is to backfill hashes.
2. Two writers produced byte-different content for the same path. The classic case: `.agents/skills/<skill>/SKILL.md` written by both Codex and Gemini configurators with platform-specific `{{CMD_REF:name}}` resolution. Fix: use `configurators/shared.ts:resolvePlaceholdersNeutral` for shared destinations. See `platform-integration.md > "Rule: .agents/skills/ writes use resolvePlaceholdersNeutral()"`.

### `--allow-downgrade` is a foot-gun

Migrations are forward-only. A user who downgrades while staying on the same major usually gets away with it (templates revert, user files preserved), but anything that depends on a migration applied since the target version (e.g., a renamed directory, a deleted legacy file restored under its new name) will be broken. `--allow-downgrade` is genuinely an escape hatch, not a supported workflow.

### Codex two-layer upgrade

Old Trellis used `.agents/skills/` as the Codex configDir; current Trellis uses `.codex/` plus a shared `.agents/skills/` layer. `commands/update.ts:needsCodexUpgrade` detects the legacy state by looking for command-as-skill marker entries (`trellis-continue/SKILL.md`, `trellis-finish-work/SKILL.md`) in the hash file, then excludes any configured non-Codex platform whose current template collector declares those same marker paths. Current non-Codex platforms with a private command surface, such as ZCode, must not declare those marker paths under `.agents/skills`; this keeps combined installs from producing hash churn and keeps the Codex legacy detector unambiguous. When legacy Codex is detected, `update()` injects `codex` into `extraPlatforms` so `collectTemplateFiles` produces the missing `.codex/` files. Don't add platform-detection-via-hashes for any other case without a similarly tight marker and non-owner exclusion — false positives here would create bogus directories.

### Things that look like bugs but aren't

- The `Proceed?` prompt asks for confirmation even when the only "change" is a version bump. Some of those cases short-circuit before the prompt (no file changes, no migrations, no safe-deletes — see the early return after `analyzeChanges`); others legitimately have changes worth confirming.
- `getLatestNpmVersion` failure ("unable to fetch") is silent on the npm side and prints a single grayed-out line. The proxy setup happens in `commands/update.ts:update` via `utils/proxy.ts:setupProxy`; users behind a corporate proxy without `HTTP_PROXY` / `HTTPS_PROXY` set will see the gray line forever. This is intentional — the npm check is advisory only.

---

## Test Conventions

Integration tests live in `test/commands/update.integration.test.ts` (numbered cases `#1 .. #27` plus named cases like `workflow-md-r4`). The fixture pattern:

```typescript
beforeEach: mkdtemp + cwd-spy + console-mute + fetch-stub
setupProject(): await init({ yes: true, force: true })
test body:
  1. mutate the temp project to simulate the scenario (delete a file, edit a file, swap hashes, edit config.yaml, ...)
  2. call await update({ ...flags })
  3. assert on filesystem state and (optionally) on inquirer mock state
afterEach: restoreAllMocks + rm -rf tmp
```

External mocks: `figlet` (banner), `inquirer` (prompts; usually default `{ proceed: true }` and per-test overrides for migration-action and conflict-resolution prompts), `node:child_process.execSync` (Python detection), `globalThis.fetch` (npm registry). No filesystem or VERSION mocks — tests rely on the real CLI version and real bundled templates.

Hash file helpers `readHashesV2` / `writeHashesV2` (defined in the test file) bypass `utils/template-hash.ts` to inject precise hash states. Use them when the test's behavior depends on a specific tracked-vs-modified condition that's awkward to construct via `init` + edit.

Internal helpers exported with `@internal Exported for testing only` JSDoc tags:

- `loadUpdateSkipPaths`
- `extractConfigSection`
- `applyConfigSectionsAdded`
- `shouldExcludeFromBackup`
- `cleanupEmptyDirs`
- `sortMigrationsForExecution`

These are unit-tested in `test/commands/update-internals.test.ts`. Don't widen the public surface of `commands/update.ts` for testing — keep additions to those `@internal` exports.

What you should test when extending update:

| Change | Required test |
|---|---|
| New `UpdateOptions` flag | A new `#NN` integration case exercising the flag |
| New write phase | A snapshot-style test (full repo before/after) and a hash-tracking assertion |
| New idempotency-affecting helper | A "re-run produces no changes" test (model: `#1 same version update is a true no-op`) |
| New protected-path or backup-exclude pattern | A `shouldExcludeFromBackup` unit test in `update-internals.test.ts` |
| New migration type | Add classification + execution unit tests, then a multi-step scenario in the integration suite |
| Block-merge change to `workflow.md` / `AGENTS.md` | At least one test asserting both "user prose preserved" and "managed block updated" |

When a test reaches into `getAllMigrations()` or `getMigrationsForVersion`, it's exercising the boundary with `migrations/index.ts` — keep those assertions narrow (e.g., "this manifest's safe-file-delete fires") so they don't break every time the manifest list grows.
