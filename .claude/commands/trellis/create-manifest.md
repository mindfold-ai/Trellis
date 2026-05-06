# Create Migration Manifest

Create a migration manifest for a new patch/minor release based on commits since the last release.

## Arguments

- `$ARGUMENTS` — Target version (e.g., `0.3.1`). If omitted, ask the user.

## Steps

### Step 1: Identify Last Release

```bash
# Find the last release tag and its commit
git tag --sort=-v:refname | head -5
```

Pick the most recent release tag (e.g., `v0.3.0`).

### Step 2: Gather Changes

```bash
# Show all commits since last release
git log <last-release-tag>..HEAD --oneline

# Show src/ changes only (skip .trellis/, docs, chore)
git log <last-release-tag>..HEAD --oneline -- src/
```

### Step 3: Analyze Each Commit

For each commit that touches `src/`:
1. Read the diff: `git diff <parent>...<commit> -- src/ --stat`
2. Classify: `feat` / `fix` / `refactor` / `chore`
3. Write a one-line changelog entry in conventional commit style

### Step 4: Draft Changelog

**Voice**: technical reference doc. Short, clear, plain. Not a story, not a sales pitch. Style guide: `.trellis/spec/docs-site/docs/style-guide.md` → "Changelog / Release Notes Voice".

**DO**

- Lead each `###` section with **one** sentence stating what changed. Then table / code / bullets. Done.
- Use feature names as headings (`### Joiner onboarding task`), not outcomes (`### New devs no longer stuck`).
- Include grep-able identifiers: file paths, function names, flag names, migration entries.
- Mirror English and Chinese 1:1 — same sections, same tables, same code blocks; only prose translated.

**DON'T**

- **No "Why X" / "Background" / "Rationale" paragraphs.** If the change isn't self-explanatory from the diff + one-sentence opener, the entry is too vague — split it or trim it. Multi-sentence justification belongs in the task PRD or commit body.
- **No Tests section, no test counts.** "847/847 pass" / "5 new regression tests" is commit-message material, not user-facing changelog.
- **No "Internal" section bloat.** Only include internal entries if they materially change behavior the user can observe (e.g. byte-identity affecting multi-platform setups). Function-rename refactors, internal flag flips, spec-file edits → drop unless directly relevant.
- No rhetorical questions ("然后呢？然后就没然后了" / "but then what?").
- No emotional framing ("一脸懵", "吐槽", "devs were stuck").
- No filler adverbs ("simply", "easily", "just").
- No outcome-phrased headings that age badly or aren't greppable.
- No marketing voice. Don't sell the change. State it.

**Length cap**: each `###` section ≤ ~120 words. Going over means you're explaining instead of describing — trim.

**Allowed top-level sections** (ordered): `Enhancements` (feat), `Bug Fixes` (fix), `Internal` (only if user-observable), `Upgrade`. Skip any section with no entries — don't ship an empty heading.

**Manifest `changelog` field** (terminal display during `trellis update`): same rules, single string with `\n` separators, group with `**Enhancements:**` / `**Bug Fixes:**` / `**Internal:**` bold prefixes.

### Step 5: Determine Manifest Fields

| Field | How to decide |
|-------|---------------|
| `breaking` | Any breaking API/behavior change? Default `false` for patch |
| `recommendMigrate` | Any file rename/delete migrations? Default `false` for patch. **When `breaking=true` + `recommendMigrate=true`, `trellis update` exits 1 without `--migrate` — this is the safety gate, set deliberately.** |
| `migrations` | List of `rename`/`rename-dir`/`delete`/`safe-file-delete` actions. Usually `[]` for patch |
| `migrationGuide` | **MANDATORY when `breaking=true` + `recommendMigrate=true`.** Narrative doc explaining to the user what changed and how to migrate. Gets templated into the generated `04-MM-DD-migrate-to-<version>` task PRD when user runs `trellis update --migrate`. Without this field, `getMigrationMetadata` has no 0.5-specific content to include — the user's migration task PRD silently falls back to older manifests' guides (or no task at all). **`create-manifest.js` enforces this via `--stdin` validation.** |
| `aiInstructions` | Strongly recommended alongside `migrationGuide` on breaking releases. Tells AI how to help the user migrate: what to grep for, what to check, common pitfalls. Separate field so prose-for-humans and instructions-for-AI don't tangle. |
| `notes` | Brief guidance for users (e.g., "run `trellis update --migrate` to sync"). Shown inline in terminal during update. |

**Why `migrationGuide` is mandatory on breaking**: a breaking release without a guide ships a broken upgrade experience. Users who stayed on an older version (≤ N-2 releases old) get a migration task PRD filled with unrelated guides from intermediate hop versions, with nothing describing the actual current breaking change. They migrate blind. The validation in `packages/cli/scripts/create-manifest.js` fails fast rather than let this ship.

### Step 5a: Per-Migration Entry Fields

For each entry inside `migrations`:

| Field | Purpose | Required? |
|-------|---------|-----------|
| `type` | `rename` / `rename-dir` / `delete` / `safe-file-delete` | yes |
| `from` | Source path (relative to project root) | yes |
| `to` | Target path (rename / rename-dir only) | yes for renames |
| `description` | **What** this migration does — one sentence, shown in the confirm prompt | recommended |
| `reason` | **Why** the user might see this entry flagged as modified. Version-specific context (e.g. "Trellis 0.4.0 skipped hashing this path — pristine copies show as modified. [r] is safe."). Keeps version-specific hints out of `update.ts`. | optional |
| `allowed_hashes` | **Only for `safe-file-delete`.** SHA256 hashes of known-pristine content — if file hash matches, delete; otherwise skip with a warning (preserves user customizations). | required for `safe-file-delete` |

**How `rename` classification works** (subtle, common gotcha):
- `rename` uses the **project-local** `.trellis/.template-hashes.json` (auto-maintained by Trellis), NOT the manifest's `allowed_hashes` field.
- Classification outcomes: `auto` (pristine hash match → rename silently) / `confirm` (hash mismatch → interactive prompt) / `conflict` (target already exists) / `skip` (source missing).
- So you do **NOT** need to collect historical template hashes for `rename` entries — only `safe-file-delete` needs `allowed_hashes`.

**When to use `rename` vs `safe-file-delete`:**
- File relocated / renamed in new version, old path has a new target → **`rename`** (preserves user edits via mv, confirm prompt lets them pick)
- File fully removed in new version, no replacement → **`safe-file-delete`** (requires `allowed_hashes` for hash-verified deletion)
- File semantically folded into another command (e.g. `record-session` → `finish-work` Step 3) → **`safe-file-delete`** + mention in `notes` for alias migration guidance

### Step 6: Create Manifest

Pipe JSON via heredoc (auto-detected when stdin is not a TTY):

```bash
cat <<'EOF' | node packages/cli/scripts/create-manifest.js
{
  "version": "<version>",
  "description": "<short description>",
  "breaking": false,
  "recommendMigrate": false,
  "changelog": "<changelog text with real newlines>",
  "notes": "<notes>",
  "migrations": [
    {
      "type": "rename",
      "from": ".claude/commands/old-path.md",
      "to": ".claude/skills/trellis-new-path/SKILL.md",
      "description": "v<version>: repurposed as auto-triggered skill",
      "reason": "Why prompted: <version-specific nuance shown to user in confirm prompt>"
    },
    {
      "type": "safe-file-delete",
      "from": ".claude/commands/removed.md",
      "description": "Removed in v<version> — <replacement>",
      "allowed_hashes": ["<sha256 of known-pristine content>"]
    }
  ]
}
EOF
```

**Tip for breaking releases with many rename entries**: write a small Node generator script (see `/tmp/gen-rename-entries.mjs` pattern from 0.5.0-beta.0) that enumerates platform × command combinations, then injects them into the manifest. Easier to review than hand-writing 60+ entries.

### Step 7: Create Docs-Site Changelogs

**IMPORTANT**: This step is mandatory for every release.

Create changelog files for both English and Chinese:

1. `docs-site/changelog/v<version>.mdx` — English changelog
2. `docs-site/zh/changelog/v<version>.mdx` — Chinese changelog

Use the format from previous changelog files (frontmatter with title + description date, then content). Structure and section ordering must match between English and Chinese 1:1.

**Voice**: same rules as Step 4 — apply them. MDX is what users actually read; if the manifest's `changelog` field is sharp but the MDX expands into prose, you've broken the contract. Skim the most recent `docs-site/changelog/v*.mdx` for sectioning and footer style before writing.

3. Update `docs-site/docs.json`:
   - Add `"changelog/v<version>"` to the English changelog pages list (at the top)
   - Add `"zh/changelog/v<version>"` to the Chinese changelog pages list (at the top)
   - Update the navbar changelog link `href` to point to the new version

#### MDX gotcha — `<Note>` / `<Warning>` with markdown lists

When a `<Note>` or `<Warning>` block contains a bullet list, the closing tag MUST be at column 0:

```mdx
<Note>
- bullet
  </Note>   ← BREAKS Mintlify parser: "Expected closing tag </Note> after end of listItem"
</Note>     ← correct
```

prettier in `lint-staged` will auto-indent the closing tag — re-fix manually after each commit attempt and re-run `pnpm dev` (mintlify) before pushing.

#### Lifecycle scripts (only at version transitions, not per-patch)

The docs-site root path holds the current stable; dev cycles live under `beta/` or `rc/`. Three scripts in `docs-site/scripts/` handle structural transitions:

| Transition         | Script                | When to run                                                                                            |
| ------------------ | --------------------- | ------------------------------------------------------------------------------------------------------ |
| start a new beta   | `docs-beta-start.sh`  | Before `pnpm release:beta` for the **first** beta of a new minor/major (e.g. `0.6.0-beta.0`)           |
| beta → rc          | `docs-beta-to-rc.sh`  | Before `pnpm release:rc` for the **first** rc (e.g. `0.6.0-rc.0`); renames `beta/` → `rc/` and scrubs `@beta` → `@rc` content |
| rc → release (GA)  | `docs-promote.sh`     | Before `pnpm release:promote`; folds `rc/*` content into root, removes `rc/` tree                       |

**Per-patch releases** (`-beta.1` / `-rc.1` / patch GA `0.5.1`): no script run. Just write the changelog mdx, update `docs.json` page list and navbar href, commit, push.

Each script's stdout prints a manual followup checklist (banner edit, version block add/remove, install command scrub) — apply those before committing the docs-site change.

Full reference: `.trellis/spec/docs-site/docs/release-lifecycle.md`.

#### Stash workflow when RC and GA prep overlap

If you're staging GA content (`changelog/v<X.Y.0>.mdx` + scripts run) while still needing to ship one more rc.X:

```bash
cd docs-site
git stash push -u -m "GA promote prep"   # park GA changes
# ... write rc.X changelog mdx + docs.json bump for rc.X ...
git commit && git push
git stash pop                              # restore GA prep
```

The `docs.json` conflict on `pop` is expected: rc.X commit added `v<X.Y.0>-rc.<N>` at the top of pages list, while the stash had `v<X.Y.0>` (GA) at the top. Resolve by keeping BOTH, with the GA entry first (`v<X.Y.0>`), then the new rc (`v<X.Y.0>-rc.<N>`), then older entries.

### Step 8: Review and Confirm

1. Read the generated manifest: `packages/cli/src/migrations/manifests/<version>.json`
2. Verify the JSON is valid and `\n` renders as actual newlines
3. Verify both changelog MDX files exist and look correct
4. Show the final manifest and changelog to the user for confirmation

## Notes

- Patch versions (`X.Y.Z`) typically have `migrations: []` and `breaking: false`
- Only add `migrationGuide` and `aiInstructions` for breaking changes
- Changelog should cover ALL `src/` changes, not just the latest commit
- Do NOT manually bump `package.json` version — `pnpm release` handles that automatically

### Field Quick Reference

Added/clarified during 0.5.0-beta.0:

- **`breaking` + `recommendMigrate`** (manifest-level) — together form the safety gate: `update` exits 1 without `--migrate` when both are true. Set `recommendMigrate: true` whenever there are rename/delete entries whose absence would leave a half-migrated project.
- **`reason`** (per-entry) — shown in the confirm prompt when a file trips the modified-hash check. Put version-specific nuance here (e.g. "0.4.0 skipped hashing this path"), not in code.
- **`description`** (per-entry) — one sentence answering "what is this migration doing", also shown in the prompt.
- **`allowed_hashes`** — required ONLY for `safe-file-delete`. `rename` classification uses project-local `.trellis/.template-hashes.json`; you do NOT need to collect historical hashes for rename entries.

### Dogfooding (mandatory for breaking releases)

Before shipping, run end-to-end migration in a throwaway tmp dir:

```bash
# 1. Init the previous GA version in tmp
mkdir /tmp/migrate-test && cd /tmp/migrate-test && git init -q .
npx -y @mindfoldhq/trellis@<last-ga> init -y -u test --claude --cursor --<all-platforms-you-care-about>

# 2. Dry-run against local build
node <repo>/packages/cli/dist/cli/index.js update --migrate --dry-run

# 3. Real migrate
yes | node <repo>/packages/cli/dist/cli/index.js update --migrate --force

# 4. Verify idempotency — second run must say "Already up to date!"
yes | node <repo>/packages/cli/dist/cli/index.js update
```

Watch for:
- **Orphan files** — stale paths written by the old version that don't match any rename/safe-file-delete. Grep `find . -path "*/skills/*" -not -path "*/trellis-*"` to catch plain-name skill dirs.
- **Idempotency churn** — if second run adds/cleans files, something is either missing from the manifest or `dist/templates/` has stale copies from a broken build.
- **Backup bloat** — confirm `.trellis/.backup-*/` doesn't contain `/worktrees/` or `/workspace/` paths.
