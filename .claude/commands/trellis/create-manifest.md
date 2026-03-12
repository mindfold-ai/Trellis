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

Organize entries into sections:

```
**Enhancements:**
- feat(scope): description

**Bug Fixes:**
- fix(scope): description
```

### Step 5: Determine Manifest Fields

| Field | How to decide |
|-------|---------------|
| `breaking` | Any breaking API/behavior change? Default `false` for patch |
| `recommendMigrate` | Any file rename/delete migrations? Default `false` for patch |
| `migrations` | List of `rename`/`rename-dir`/`delete` actions. Usually `[]` for patch |
| `notes` | Brief guidance for users (e.g., "run `trellis update` to sync") |

### Step 6: Create Manifest

Pipe JSON via heredoc (auto-detected when stdin is not a TTY):

```bash
cat <<'EOF' | node packages/cli/scripts/create-manifest.js
{
  "version": "<version>",
  "description": "<short description>",
  "breaking": false,
  "changelog": "<changelog text with real newlines>",
  "notes": "<notes>"
}
EOF
```

### Step 7: Create Docs-Site Changelogs

**IMPORTANT**: This step is mandatory for every release.

Create changelog files for both English and Chinese:

1. `docs-site/changelog/v<version>.mdx` — English changelog
2. `docs-site/zh/changelog/v<version>.mdx` — Chinese changelog

Use the format from previous changelog files (frontmatter with title + description date, then content).

3. Update `docs-site/docs.json`:
   - Add `"changelog/v<version>"` to the English changelog pages list (at the top)
   - Add `"zh/changelog/v<version>"` to the Chinese changelog pages list (at the top)
   - Update the navbar changelog link `href` to point to the new version

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
