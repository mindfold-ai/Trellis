# Design — v0.6.0 GA promote

## System boundaries

This release touches three independently versioned artifacts in lockstep:

| Artifact | Source of truth | Pushed by |
|---|---|---|
| `@mindfoldhq/trellis@0.6.0` (CLI) | `packages/cli/package.json` | CI on git tag `v0.6.0` |
| `@mindfoldhq/trellis-core@0.6.0` (SDK) | `packages/core/package.json` | CI on git tag `v0.6.0` |
| `docs.trytrellis.app` GA content | `docs-site` submodule | Mintlify auto-deploy on submodule's `main` push |

Lockstep invariant: CLI's `dependencies["@mindfoldhq/trellis-core"]` in the published tarball MUST equal the published core version. Source uses `workspace:*`; `bump-versions.js` is responsible for the rewrite during release.

## Migration contract: 0.5.x → 0.6.0

Migration chain (driven by `trellis update --migrate`):

```
0.5.19 → 0.6.0-beta.0 (existing manifest: rename + delete) → ... → 0.6.0 (new manifest: noop)
```

The `0.6.0-beta.0.json` manifest is the load-bearing one with `breaking: true` and migration entries (rename/delete chain documented in its own `migrationGuide`). All beta.N → beta.N+1 manifests through to rc.0 are incremental.

`0.6.0.json` (new) carries `breaking: false`, `recommendMigrate: false`, `migrations: []` — semantically "GA = same code as rc.0, no migrations required between them" — but the entry MUST exist to keep the manifest continuity check happy (else `release-preflight check-versions` will exit 1).

## docs-site lifecycle

Current state: `rc/` tree under docs-site root (post beta→rc transition done earlier this session). `docs-promote.sh` does:

1. `cp -r rc/start .` → overwrites root `start/`
2. `cp -r rc/advanced .` → overwrites root `advanced/`
3. `cp rc/index.mdx .` → overwrites root index
4. Mirror in `zh/`
5. `git rm -rf rc/ zh/rc/`

Risk: root may contain a `changelog/` directory (it does — historical changelogs live there) which the script does NOT touch (it only mirrors `start`, `advanced`, `index.mdx`). Confirmed safe.

After script, manual docs.json edits:
- Drop `"version": "RC"` block from `versions[]`
- Remove RC banner (`📦 **RC** docs cover the 0.6 track…`)
- Update navbar changelog `href` from `/changelog/v0.6.0-rc.0` → `/changelog/v0.6.0`
- Insert `changelog/v0.6.0` and `zh/changelog/v0.6.0` at top of nav changelog page lists

## GA changelog synthesis approach

Per user decision: re-read all 25 v0.6 prerelease changelogs (beta.0–beta.23 + rc.0) and synthesize fresh, NOT just polish rc.0's recap.

Reference: `docs-site/changelog/v0.5.0.mdx` (192 lines) is the precedent. It opens with a 1-paragraph framing, then `<Tip>` (the most actionable user-facing shift), `<Note>` (platform-specific upgrade caveats — Codex CLI version requirement etc.), `<Warning>` (known upstream issues out of our control), then plain markdown H2 sections for each area.

Sections (informed by aggregating beta-line section headings):

1. **Lead paragraph** — 1-2 sentences framing v0.6 as a minor that shipped multi-agent collaboration + SDK extraction + memory primitives, breaking from 0.5.x via the `0.6.0-beta.0` migration chain.
2. **`<Tip>`** — the single most actionable shift readers should know: probably the channel runtime / multi-agent or the memory CLI (decide during draft).
3. **`<Note>`** — platform-specific upgrade caveats: Codex CLI compat, Reasonix added, Pi Agent native extension, OpenCode reader temporarily unavailable in 0.6.0-beta.4.
4. **`<Warning>`** — known upstream / unresolved issues at GA cut (e.g. OpenCode SQLite reader pending re-enable).
5. **H2 sections**, grouped by area:
   - Multi-agent collaboration (channel runtime, worker coordination, OOM guard, thread/forum boards, agent definitions, parent/child task trees)
   - Memory (`trellis mem`, `trellis-session-insight` skill, core mem API, `--phase brainstorm|implement` slicing)
   - SDK extraction (`@mindfoldhq/trellis-core` package, dual-package release plumbing)
   - Platform additions (Reasonix / DeepSeek-Reasonix, Pi Agent `trellis_subagent`)
   - Workflow + planning (task triage consent, planning artifacts, brainstorm templates, workflow templates, parent/child task trees)
   - Updater (`trellis upgrade`, registry-backed spec refresh, configurable hooks)
   - Bundled skills (`trellis-spec-bootstrap`, `trellis-session-insight`)
6. **Bug Fixes** — only the GA-cut-window ones (the rc.0 exa MCP fix; older beta bug fixes are listed in their per-beta changelogs).
7. **Breaking changes & upgrade** — migration chain from 0.5.x, point at `0.6.0-beta.0.json` migration guide.
8. **Install / Upgrade** — `npm install -g @mindfoldhq/trellis` (no `@latest` suffix — npm defaults to latest dist-tag) + `trellis update --migrate`.

Length target: ~190 lines (matching v0.5.0 precedent). EN and ZH 1:1 mirrored, prose translated, code blocks and tables identical. Headers must use grep-able identifiers (`trellis mem`, `@mindfoldhq/trellis-core`) not outcome-phrased headings (`Faster Workflows`).

**MDX gotcha (per release-lifecycle.md spec)**: `<Note>` / `<Warning>` blocks containing markdown lists must have their closing tag at column 0, NOT auto-indented by prettier through `lint-staged`. If the pre-commit hook re-indents, manually re-fix and re-commit.

## Manifest field decisions for `0.6.0.json`

```json
{
  "version": "0.6.0",
  "description": "v0.6.0 stable — multi-agent collaboration, memory, trellis-core SDK, broader platform coverage",
  "breaking": false,
  "recommendMigrate": true,
  "changelog": "<multi-section bold-prefixed summary covering the v0.6 cycle headlines>",
  "notes": "**Stable release.** Promoted from rc.0 with no new src/ changes since. Users on 0.5.x: run `trellis update --migrate` (the `--migrate` flag is REQUIRED — the breaking-change gate from `0.6.0-beta.0` fires when traversing the migration chain). Users on any 0.6.0 prerelease (beta.X / rc.0): plain `trellis update` works as a clean version bump. Install: `npm install -g @mindfoldhq/trellis`",
  "migrations": []
}
```

Rationale (per v0.5.0.json precedent + lessons from mem-recall):
- `breaking: false` because rc.0 → GA is zero source change
- `recommendMigrate: true` — **not false**, against my first instinct. Matches v0.5.0.json field exactly. Reason: users coming from 0.5.x will traverse `0.6.0-beta.0.json` during the manifest chain walk, which IS breaking. Setting `recommendMigrate: true` on the GA manifest is the project's way of telling `trellis update` to print the "you should pass --migrate" guidance even though THIS specific manifest entry has no migrations of its own.
- `migrations: []` because there's nothing to do at this exact step; the breaking work happened at `0.6.0-beta.0.json` and was already absorbed by any user who upgraded through the betas.
- `migrationGuide` omitted (only required when `breaking && recommendMigrate`).
- `changelog` field length: model after v0.5.0.json, which is ~3 KB of bold-prefixed sections (`**Cycle headlines since 0.4.0:**` → `**Codex notes**` / `**Architecture**` / `**Platform coverage**` / etc.). Goes to terminal during `trellis update`, must read well in a 100-col fixed-width window.

## Branch state alignment (PRE-promote, mandatory)

Current state — `feat/v0.6.0-rc` and `origin/main` have diverged:
- 5 commits on `feat/v0.6.0-rc` not on `main`: `bfbf3a71` (rc.0 submodule bump), `6869bc6f` (0.6.0-rc.0 bump), `c463533c` (WeChat QR refresh), `7f66b8d0` (this-session: docs-site fda8422 bump), `e1550c45` (this-session: docs-site b3b5aa8 bump)
- 1 commit on `main` not on `feat/v0.6.0-rc`: `d1aa3c00` (WeChat QR refresh — same change as `c463533c` but different SHA due to independent cherry-pick)

v0.5.0 GA precedent (commit chain reconstructed from mem-recall + git log):
- `c295ab03 Merge PR #233 from mindfold-ai/feat/v0.5.0-rc` (2026-05-06 12:07)
- Subsequent GA prep commits, then `75b3d623 0.5.0` tag, all on main

For v0.6.0: PR `feat/v0.6.0-rc → main` before any GA tag work. The WeChat QR duplicate will resolve as a no-op merge (same content, different SHA). Merge strategy: `Squash and merge` or `Create a merge commit` both fine; `Rebase and merge` would re-fork the SHAs and confuse the docs-site pointer history. Recommend `Create a merge commit` to preserve granular history of the v0.6 RC stabilization.

## Publish path (CI-only)

`pnpm release:promote`:
1. `release-preflight.js check-versions` (both pkg versions equal current, both are valid prereleases, current is `0.6.0-rc.0`)
2. `release-preflight.js verify-packed-cli` (`pnpm pack` produces a tarball whose `dependencies["@mindfoldhq/trellis-core"]` will be rewritten correctly)
3. `release-preflight.js publish-plan` (prints what would be published)
4. `bump-versions.js promote` (rewrites both `package.json` files: `0.6.0-rc.0` → `0.6.0`; rewrites CLI's core dep from `workspace:*` to `0.6.0`)
5. `release.js` commits + tags `v0.6.0` + pushes to origin
6. CI workflow (`.github/workflows/release.yml` or equivalent) triggered by the tag, runs full test matrix, then publishes both packages to npm with `latest` dist-tag

If any of 1-4 fails locally, the release is not pushed and CI never runs. If CI itself fails, fix the workflow and re-run; do NOT publish locally.

## Dogfood plan

```bash
mkdir -p /tmp/v060-ga-dogfood && cd /tmp/v060-ga-dogfood && git init -q .

# 1. Install older stable
npx -y @mindfoldhq/trellis@0.5.19 init -y -u dogfood --claude --cursor --codex

# 2. Use a locally-built 0.6.0 CLI (the about-to-publish tarball)
TRELLIS=/Users/taosu/workspace/.../packages/cli/dist/cli/index.js

# 3. Dry-run migrate first
node $TRELLIS update --migrate --dry-run

# 4. Real migrate
yes | node $TRELLIS update --migrate --force

# 5. Idempotency check
yes | node $TRELLIS update
```

Watch for:
- Orphan files in `.trellis/` after migrate
- Backup directory bloat under `.trellis/.backup/`
- Second `update` should report no work (idempotent)
- All skills + agents + commands present for the configured platforms

## Rollback shape

After `pnpm release:promote` runs locally but before tag is pushed: `git tag -d v0.6.0 && git reset --hard HEAD~1` undoes the bump commit.

After tag is pushed but before CI publishes: `git push --delete origin v0.6.0` deletes the remote tag and aborts CI. Local bump commit can be `git reset --hard HEAD~1` then `git push --force-with-lease`.

After npm publish succeeds: NO rollback possible (npm unpublish is permanent for the version slot). Recovery is `0.6.1` patch.

Mitigation: gate the entire flow behind explicit user "ship it" approval at step 6.

## Out-of-band decisions

- `latest` dist-tag will jump from `0.5.19` → `0.6.0` (no `latest: 0.6.0-rc.0` intermediate; that's intentional — RCs never get `latest`)
- `rc` dist-tag: leave pointing at `0.6.0-rc.0` (no harm; same code as GA)
- `beta` dist-tag: leave pointing at `0.6.0-beta.23` (no harm; useful as "the last public beta on this line")
- `@mindfoldhq/trellis-core@latest` was historically pointing at `0.6.0-beta.13` (anomaly — first core publish was tagged latest); this release promotes it to `0.6.0`, fixing the anomaly
