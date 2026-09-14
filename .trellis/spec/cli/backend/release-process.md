# Release Process

> Release, versioning, docs, and npm publishing rules for the Trellis monorepo.

---

## Overview

The authorized upstream npm route publishes two packages from one git tag.
The castbox fork uses the attachment-only route below, not these npm commands:

| Package | Role | Published by |
|---|---|---|
| `@mindfoldhq/trellis` | User-facing CLI | GitHub Actions only |
| `@mindfoldhq/trellis-core` | Programmatic core APIs used by the CLI and external integrations | GitHub Actions only |

The package pair is version-locked. Every published version must exist for both packages with the exact same version and npm dist-tag.

---

## CI-only publishing

Official npm publishing must happen through `.github/workflows/publish.yml`.

Do not run `npm publish` or `pnpm publish` locally for official Trellis packages. Local machines may run pack, tests, lint, typecheck, and generic
`check-versions` / `verify-packed-cli` checks. `npm-tag`, `publish-plan` and
`verify-npm` require the exact approved repository context; do not spoof it.

If a CI publish looks partial or inconsistent:

1. Inspect the GitHub Actions publish run.
2. Verify public npm visibility:
   ```bash
   npm view @mindfoldhq/trellis@<version> version dist-tags --json --registry=https://registry.npmjs.org/
   npm view @mindfoldhq/trellis-core@<version> version dist-tags --json --registry=https://registry.npmjs.org/
   ```
3. Fix the workflow or release scripts.
4. Re-run the CI path or move the tag after the fix when the same version is still the intended release artifact.

Do not compensate by publishing one missing package locally. That creates a release artifact without CI provenance and hides the workflow failure from the next release.

The publish workflow must verify both packages after publish with:

```bash
node packages/cli/scripts/release-preflight.js verify-npm --package all
```

---

## Version invariants

| Invariant | Rule |
|---|---|
| Shared version | `packages/cli/package.json` and `packages/core/package.json` must have the same `version`. |
| Shared tag | Git tag `v<version>` must match both package versions. |
| Shared npm dist-tag | `beta` for `-beta.N`, `rc` for `-rc.N`, `alpha` for `-alpha.N`, `latest` for GA. |
| Source dependency | CLI source depends on core with `workspace:*`. |
| Packed dependency | Published CLI package must depend on `@mindfoldhq/trellis-core` with the exact release version. |

`packages/cli/scripts/release-preflight.js` is the source of truth for these checks.

Required upstream npm gates (fork local validation omits `publish-plan`):

```bash
node packages/cli/scripts/release-preflight.js check-versions
node packages/cli/scripts/release-preflight.js verify-packed-cli
node packages/cli/scripts/release-preflight.js publish-plan
```

---

## Branch and release tracks

| Track | Branch pattern | Version pattern | npm tag | Notes |
|---|---|---|---|---|
| Stable | `main` | `X.Y.Z` | `latest` | Patch/minor/major GA releases. |
| Beta | `feat/vX.Y.Z-beta` or equivalent long-lived beta branch | `X.Y.Z-beta.N` | `beta` | Feature incubation. CLI and core both publish beta versions. |
| RC | release candidate branch or the stabilized beta branch | `X.Y.Z-rc.N` | `rc` | Pre-GA validation. CLI and core both publish rc versions. |
| GA promotion | stable release branch / `main` | `X.Y.Z` | `latest` | Promote the release candidate into the stable docs and latest npm tag. |

A new beta cycle starts from the current stable/release baseline and uses the next minor or major version, for example `0.6.0-beta.0` after `0.5.x`. It does not continue an older beta line after that line has moved to RC or GA.

Stable fixes normally flow from `main` to beta/rc by cherry-pick. Beta-only features do not flow back to `main` by cherry-pick; rewrite them as stable-ready commits when needed.

---

## Docs-site lifecycle

The docs-site root path holds the current stable docs. Beta and RC content live under `beta/` and `rc/`.

| Transition | Script | When |
|---|---|---|
| Start a new beta | `docs-site/scripts/docs-beta-start.sh` | Before the first `pnpm release:beta` for a new minor/major, for example `0.6.0-beta.0`. |
| Beta to RC | `docs-site/scripts/docs-beta-to-rc.sh` | Before the first `pnpm release:rc`, for example `0.6.0-rc.0`. |
| RC to GA | `docs-site/scripts/docs-promote.sh` | Before `pnpm release:promote`. |

Per-patch beta, RC, or GA releases do not run these lifecycle scripts. They add changelog MDX files, update `docs-site/docs.json`, commit the docs-site submodule first, then bump the submodule pointer in the main repo.

Full docs details live in `.trellis/spec/docs-site/docs/release-lifecycle.md`.

---

## Submodule commit ordering

When a release touches `docs-site` or `marketplace`, commit and push the submodule first, then commit the submodule pointer in the main repo.

Correct order:

```bash
cd docs-site
git add . && git commit -m "docs: changelog v<version>" && git push origin main

cd ..
git add docs-site
git commit -m "chore: bump docs-site for v<version>"
git push origin <branch>
```

`packages/cli/scripts/release.js` excludes `docs-site` and `marketplace` from its automatic pre-release staging so submodule pointer changes cannot be hidden inside a generic release commit.

### Contract: every modified submodule must be pushed before the version tag

The tag-triggered `publish.yml` CI runs `git submodule update --init --recursive` against the tagged commit. If **any** submodule pointer references a SHA that doesn't exist on the submodule's remote, CI fails at checkout with:

```
fatal: remote error: upload-pack: not our ref <SHA>
fatal: Fetched in submodule path '<name>', but it did not contain <SHA>. Direct fetching of that commit failed.
```

This is per-submodule. Pushing `docs-site` but forgetting `marketplace` (or vice versa) still fails. Verify all submodules before `pnpm release`:

```bash
git submodule foreach 'git fetch origin -q; sha=$(git rev-parse HEAD); \
  git merge-base --is-ancestor $sha origin/main \
    && echo "ok $name" || echo "FAIL $name $sha not on remote"'
```

### Don't: test submodule reachability with `ls-remote`

**Problem**:

```bash
git submodule foreach 'sha=$(git rev-parse HEAD); git ls-remote origin $sha | grep -q $sha && ...'
```

**Why it's bad**: `ls-remote` matches **ref names**, not commits. It finds a SHA
only when that SHA is itself a branch or tag tip. A submodule pointer at any
earlier commit on `main` — which is the normal case, since pointers are bumped
after the submodule moves on — reports `FAIL` while CI fetches it without
trouble. Observed 2026-08-06 while preparing v0.6.13: both submodules reported
`FAIL`, both were reachable.

A check that fails on healthy input is worse than no check. It trains you to
ignore it, which is how the v0.6.4 incident below happens a second time.

**Instead**: fetch, then ask whether the SHA is an ancestor of the remote branch
— that is the same question CI answers when it materialises the pointer.

Any `FAIL` line means: `cd <submodule> && git checkout -B main && git push origin main` before tagging. If the tag was already pushed when you discover the miss, recover by pushing the submodule then re-running the failed CI jobs (`gh run rerun <id> --failed`) — no new tag is needed.

> **Incident note (2026-06, v0.6.4).** `marketplace/workflows/native/workflow.md` was touched as a parity mirror for a bundled template edit, committed in-submodule, and pointer-bumped in the main repo — but the submodule itself was never pushed to its `origin/main`. `pnpm release` happily tagged `v0.6.4`; CI fetched the new tag, tried to materialise the marketplace pointer `680bcbb`, and died at checkout. Fix took two commands (`git -C marketplace push origin main` + `gh run rerun --failed`) but the failure mode is invisible from main-repo `git status` (the submodule is "clean" locally), which is exactly why the verify step above is mandatory and not advisory.

### Contract: the pre-release sweep MUST exclude `.trellis/`

The pre-release `git add` in `release.js` (the `chore: pre-release updates`
commit) **must** exclude `.trellis/` from its pathspec, alongside `docs-site`
and `marketplace`:

```js
run("git add -A -- ':!docs-site' ':!marketplace' ':!.trellis'");
```

`.trellis/tasks/` is not gitignored, so a blanket `git add -A` sweeps in any
dirty in-progress task dirs, historical data, and runtime artifacts
that happen to be present in the release session. Staging `.trellis/` is only
ever allowed through `common/safe_commit.py`'s precise allowlist (see the
"unscoped `.trellis` staging" bug class in `script-conventions.md`) — never
through a release-time blanket stage.

> **Incident note (2026-06, #303).** A `release.js` pre-release `git add -A`
> that excluded only `docs-site`/`marketplace` swept 6 unrelated in-progress
> community-governance task files into the pre-release commit twice
> (`5ee43ecc`, `ec123deb`). The maintainer had to `git rm --cached` three
> times (`d66405d9`, `81960120`, `3c3219cf`) before finally tracking the
> drafts to stop the bleed (`e83233c9`). The same staging-scope defect also
> historically existed in the now-retired `add_session.py` (the #303 body) and in ad-hoc human/AI
> `git add -A`. This contract exists so the release route can never re-open
> that escape hatch. See `script-conventions.md` → "Absolute prohibition:
> never blanket-stage" for the full bug-class writeup.

---

## Manifest continuity across branches

Each release branch maintains its own `packages/cli/src/migrations/manifests/<version>.json`. The CLI update logic walks the manifest chain between `fromVersion` and `toVersion`, so every published version that a user can upgrade through must have a local manifest on the release branch.

When a stable patch manifest is missing from a beta branch:

```bash
git show main:packages/cli/src/migrations/manifests/<version>.json \
  > packages/cli/src/migrations/manifests/<version>.json
git add packages/cli/src/migrations/manifests/<version>.json
git commit -m "chore: restore manifest <version> from main"
```

Restore published manifests deliberately. Do not auto-merge whole manifest directories across release branches, because branch-specific manifests can mention files that do not exist on the other branch.

---

## Release command sequence

The root release scripts delegate to the CLI package:

```bash
pnpm release
pnpm release:beta
pnpm release:rc
pnpm release:promote
```

`packages/cli/scripts/release.js` runs:

1. `check-manifest-continuity`
2. `check-docs-changelog --type beta|rc|promote` for prerelease/promotion tracks
3. core tests
4. CLI tests
5. pre-release commit excluding `docs-site`, `marketplace`, and `.trellis`
6. `bump-versions.js <type>` to update both package versions together
7. `release-preflight check-versions`
8. version commit with the version string as the commit message
9. git tag `v<version>`
10. push branch and tags
11. GitHub Actions publish workflow builds, tests, packs, publishes, and verifies both packages

The release script does not publish locally. The pushed tag is what starts official npm publication.

---

## Publish workflow sequence

`.github/workflows/publish.yml` runs on `v*` tag push and GitHub Release publication. It is idempotent for reruns on the same tag.

Before any step, job-level `github.repository == 'mindfold-ai/trellis'`
must hold for both push and release.published. Fork events skip the whole job,
including checkout, lifecycle scripts and credential access.

Required order:

1. install dependencies
2. `release-preflight check-versions --require-tag`
3. `pnpm typecheck`
4. `pnpm test`
5. `pnpm build`
6. `release-preflight verify-packed-cli`
7. `release-preflight publish-plan --github`
8. publish `@mindfoldhq/trellis-core` if missing
9. publish `@mindfoldhq/trellis` if missing
10. `release-preflight verify-npm --package all`

Core publishes first because the CLI package depends on the exact core version in the packed artifact.

---

## Artifact verification for release-claimed assets

Any changelog, docs page, or marketplace entry that says a feature is "bundled",
"installed automatically", or "included with Trellis" must be verified against
the built package artifact, not only against the source tree.

Before tagging a release that adds or changes a bundled template, skill,
workflow, hook, script, or generated platform asset:

1. Run the CLI build.
2. Run `npm pack --dry-run --json` from `packages/cli/` and check the expected
   `dist/templates/**` paths are present.
3. Use the built binary (`node packages/cli/bin/trellis.js`) in a fresh temp
   git repository and run the user-facing command that should install the
   asset.
4. Check both the generated files and `.trellis/.template-hashes.json` for the
   expected paths.
5. Run `trellis update --dry-run` from the temp repository and confirm it
   reports the project is already up to date.

This gate is required when docs are updated before or separately from the code
branch that actually adds the distributable files. A source file existing on
another branch, in `marketplace/`, or in a docs submodule is not evidence that
the npm package contains it.

Example for a built-in multi-file skill:

```bash
pnpm --filter @mindfoldhq/trellis build

cd packages/cli
npm pack --dry-run --json | grep 'dist/templates/common/bundled-skills/<skill>/SKILL.md'
cd ../..

tmpdir=$(mktemp -d /tmp/trellis-release-smoke-XXXXXX)
printf '{"name":"trellis-smoke","version":"0.0.0"}\n' > "$tmpdir/package.json"
git -C "$tmpdir" init -q
(
  cd "$tmpdir"
  node /path/to/Trellis/packages/cli/bin/trellis.js init --creator smoke --assignee smoke --yes --claude --codex
  test -f .claude/skills/<skill>/SKILL.md
  test -f .agents/skills/<skill>/SKILL.md
  grep -q '<skill>' .trellis/.template-hashes.json
  node /path/to/Trellis/packages/cli/bin/trellis.js update --dry-run
)
```

---

## Pre-release checklist

- [ ] Worktree is clean except intentional release changes.
- [ ] Relevant coding specs have been read.
- [ ] Manifest exists for the target version.
- [ ] English and Chinese docs-site changelogs exist and match 1:1.
- [ ] `docs-site/docs.json` points to the new changelog.
- [ ] Submodule commits are pushed before main repo pointer commits.
- [ ] `node packages/cli/scripts/release-preflight.js check-versions` passes.
- [ ] `node packages/cli/scripts/release-preflight.js verify-packed-cli` passes.
- [ ] Release-claimed bundled assets are verified in `npm pack --dry-run --json` and a fresh temp-directory `trellis init` / `trellis update --dry-run` smoke test.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass or the blocker is recorded.
- [ ] Breaking releases include `migrationGuide` and `aiInstructions` in the manifest.
- [ ] Official package publication is left to CI.

---

## Cross-references

- Core/CLI code ownership and package boundaries: `trellis-core-sdk.md`
- Manifest format and migration types: `migrations.md`
- Docs lifecycle: `.trellis/spec/docs-site/docs/release-lifecycle.md`
- Native dependency policy: `quality-guidelines.md`

## Castbox Fixed-Version Delivery

The retirement release uses paired `0.7.0-castbox.N` tarballs attached to a
`castbox/Trellis` release, with `castbox-v<VERSION>` bound to the reviewed full
SHA. Verify the next unused N before assigning it; never replace published bytes.
This route does not invoke `release.js`, `publish-plan`, npm publish or upstream
publish lifecycle hooks. Local validation is not authorization to tag/upload.

Required assets: both package tarballs, SHA256SUMS, migration guide and manifest
(repository, full SHA, tag, version, filenames, checksums, exact CLI/core dependency).
Keep existing package names and exact paired dependency; install both downloaded
local tarballs together in an isolated consumer prefix and verify core resolution.
Record actual filenames and commands, not floating branch instructions. Repeat
checks from the published download only after separate publication authorization.
External docs-site/marketplace and Guru adoption remain separate owner handoffs.

Publication defense is independent of tag naming: npm preflight requires exact
`GITHUB_REPOSITORY=mindfold-ai/trellis`, anchored `v` tags and supported release
tracks. Unknown/castbox prereleases must fail, never map to latest. Generic local
version/pack checks remain usable without npm authority. Side-effect-free tests
cover both event types, upstream/fork/missing repository, normal/fork tags and
unknown tracks, even with simulated credentials. Verify guards on the workflow
revision used by the event and inspect the skipped npm job after authorized release.
