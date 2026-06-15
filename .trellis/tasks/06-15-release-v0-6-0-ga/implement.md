# Implementation — v0.6.0 GA promote

## Order

Each phase has a review gate. Do NOT proceed to the next phase before the gate explicitly passes (and, for high-impact steps, the user explicitly confirms).

### Phase 0 — Branch alignment (PRE-requisite, mirrors v0.5.0's PR #233 pattern)

0.1 Verify branch state matches what design.md describes
- `git log --oneline main..HEAD` should be 5 commits
- `git log --oneline HEAD..main` should be 1 commit (WeChat QR refresh)
- If state has drifted, re-survey before proceeding

0.2 Open PR `feat/v0.6.0-rc → main`
- Title: `Release v0.6.0 (RC stabilization → GA)`
- Body: link to this task, brief recap of the v0.6 cycle deliverables, note the duplicate WeChat QR commit will resolve as no-op
- Merge strategy: `Create a merge commit` (NOT rebase — would rewrite SHAs and confuse docs-site pointer chain)
- **Gate**: PR review approval (or owner self-merge if SOLE maintainer)

0.3 Merge PR via GitHub UI
- After merge, `git fetch origin && git checkout main && git pull --ff-only`
- All subsequent Phase A-E steps run **on `main`**, not on `feat/v0.6.0-rc`
- **Gate**: `git log --oneline -3 main` shows the merge commit at HEAD

### Phase A0 — Bundled skill updates (PRE-GA, blocking)

Rationale: v0.6 ships major new capabilities (channel runtime, mem) without corresponding AI capability skills. trellis-meta itself is stale (last edited at v0.5.0 GA, no mention of v0.6 features). Shipping GA without these skill updates means v0.6.0 first-batch users get the CLI but no AI guidance on the new flagship features.

A0.1 Write new `trellis-channel` bundled skill
- Source: `packages/cli/src/templates/common/bundled-skills/trellis-channel/`
- Model: `/Users/taosu/.claude/skills/trellis-channel/` (the global capability skill — 86-line SKILL.md + 6 references/ files). Port the structure (route-by-intent table, Core Rules section, Reference Files index) but rewrite content for the bundled / generic-user audience.
- Drop user-specific sections: NO `local-forum.md` (machine-specific durable boards), NO references to private channel names. Replace with a generic "discoverable via `trellis channel list`" pattern.
- Frontmatter form per `trellis-session-insight` (capability skill, no fixed write-back file): `name: trellis-channel`, description listing the intent triggers ("multi-agent collaboration", "spawn workers", "channel forum", etc.).
- references/ inclusions (parallel to global): `workflows.md` (collaboration patterns A-F), `forum.md` (forums + threads + context), `workers.md` (spawn + agent cards + interrupts), `progress-debugging.md`, `command-reference.md`. Skip `local-forum.md` (user-specific).
- **Validate**: file structure mirrors `trellis-session-insight/` layout; AI dispatch test by reading SKILL.md and asking "when should I use channel" — answer should route to the right references file
- **Gate**: user reviews SKILL.md draft before references/ expansion

A0.2 Rewrite `packages/cli/src/templates/common/bundled-skills/trellis-meta/SKILL.md`
- Target length: ~110 lines (was 73). Add v0.6 architecture coverage:
  - **Multi-agent runtime** (channel) — references new `trellis-channel` bundled skill
  - **Cross-session memory** (mem CLI + `trellis-session-insight`)
  - **Dual-package architecture** (`@mindfoldhq/trellis-core` SDK + CLI), where to find what
  - **Parent / child task trees** (added in beta.16)
  - **Workflow templates** (added in beta.17)
  - **Registry-backed `.trellis/spec`** (added in beta.23)
  - **Configurable hooks via `.trellis/config.yaml`** (added in v0.6)
  - **Platform list update**: add Reasonix (beta.20-ish) + Pi (beta.19) — current list has 8 platforms, v0.6 ships ~10
  - **Bundled-skill auto-dispatch flow**: `trellis init` + `update` auto-deploy `bundled-skills/*` to every supported platform's skill root; this is new in v0.6
- Add new references/ entries:
  - `references/local-architecture/multi-agent-channel.md` — channel runtime model, when AI should reach for it
  - `references/local-architecture/bundled-skills.md` — what gets auto-dispatched at init/update, how to add a new one, how to override locally
- Update existing references/ for v0.6 accuracy: `customize-local/change-skills-or-commands.md` should now mention bundled-skill dispatch; `platform-files/platform-map.md` adds Reasonix + Pi rows
- **Gate**: user reviews SKILL.md + new references draft; spot-check existing references for any v0.5-anchored claims

A0.3 Verify bundled-skill auto-dispatch picks up the new `trellis-channel` directory
- Read `packages/cli/src/configurators/` to confirm dispatch logic enumerates `bundled-skills/*` dirs (not a hardcoded list)
- If hardcoded: extend list to include `trellis-channel`
- Run `pnpm test` to verify no regression
- **Validate**: `pnpm trellis init` in `/tmp/trellis-bundle-test/` produces `.claude/skills/trellis-channel/SKILL.md` (and same for all other platform skill roots)
- **Gate**: dispatch verified across at least 2 platforms

### Phase A — Author artifacts (reversible, local-only)

A1. Read all 25 v0.6 prerelease changelogs, draft `docs-site/changelog/v0.6.0.mdx`
- Read each `docs-site/changelog/v0.6.0-beta.{0..23}.mdx` + `v0.6.0-rc.0.mdx`
- Group by area per design.md sections (Highlights, Enhancements grouped, Bug Fixes, Breaking & Upgrade, Install)
- Length target ~300 lines
- **Gate**: user reviews EN draft before zh mirror

A2. Mirror EN → ZH: `docs-site/zh/changelog/v0.6.0.mdx`
- 1:1 structural mirror, prose translated, code blocks identical
- **Gate**: user spot-checks

A3. Write migration manifest `packages/cli/src/migrations/manifests/0.6.0.json` via stdin pipe to `create-manifest.js`
- Fields per design.md (breaking: false, recommendMigrate: false, migrations: [])
- **Validate**: `node packages/cli/scripts/release-preflight.js check-versions` exits 0

A4. Run `docs-site/scripts/docs-promote.sh`
- Verify: `ls docs-site/rc/` returns "No such file", `ls docs-site/start/` has the previously-rc content
- **Gate**: `git diff docs-site` reviewed for unintended overwrites

A5. Update `docs-site/docs.json` manually — precise edits (do NOT blindly follow the v0.5.0 GA precedent; current docs.json layout is the inverse of pre-v0.5.0)

Current state (audited):
- 2-version layout per language. EN `versions[]` has `RC` (lines ~31-247, `default: true`, pages at `rc/*`) + `Release` (lines ~249-468, `default: false`, pages at root). ZH mirrors at lines ~471-687 + ~689-906.
- Banner content: `📦 **RC** docs cover the 0.6 track. ...`
- Navbar changelog href: `/changelog/v0.6.0-beta.22` (stale — never bumped through beta.23 or rc.0; fix incidentally at this flip)
- Both RC and Release blocks already contain v0.6.0-rc.0 + v0.6.0-beta.* + v0.5.x changelog entries in identical chronological order (merged earlier this session)

Required edits:
1. **Drop the entire `RC` version block** in BOTH languages — those `rc/*` paths 404 after the script deletes the `rc/` directory. Keep the EXISTING `Release` block; its root paths are correct because `docs-promote.sh` overwrites root content with ex-rc/ content.
2. **Add `"default": true`** to the Release block in both languages (the flag was on the RC block; transfer it to the sole-remaining block).
3. **Insert `"changelog/v0.6.0"`** at the top of the Release-block-EN's `Changelog` group `pages[]`, above `"changelog/v0.6.0-rc.0"`. Same for ZH: `"zh/changelog/v0.6.0"` at top of the Release-block-ZH's Changelog list.
4. **Drop the top-level `banner` block entirely** (lines 5-12 area). Default per `docs-promote.sh` script comments. No replacement banner — root content is GA, no advisory needed.
5. **Update navbar `links[0].href`** from `/changelog/v0.6.0-beta.22` → `/changelog/v0.6.0`.

What NOT to do (anti-patterns discovered):
- DO NOT rename RC → Release (v0.5.0-style). The RC block's pages point at `rc/*` paths which become dead after the script. Renaming without re-pointing paths leaves 404s.
- DO NOT touch the Release block's existing `pages[]` page paths. They already point at root, which is exactly what we want post-script.
- DO NOT delete the Release block. It's the survivor.

Validation:
- `python3 -c "import json; json.load(open('docs-site/docs.json'))"` exits 0
- `grep -c '"version":' docs-site/docs.json` → 2 (one Release per language) — was 4 (RC + Release × 2 langs)
- `grep -c '"default": true' docs-site/docs.json` → 2 — was 2 (still 2, but on the Release blocks now)
- `grep -c '"banner"' docs-site/docs.json` → 0 — was 1
- `! grep -q '"href": "/changelog/v0.6.0-beta\|/changelog/v0.6.0-rc' docs-site/docs.json` — navbar pointing at GA
- **Gate**: `git diff docs-site/docs.json` reviewed before commit

A6. Scrub stray `@rc` / `@beta` references in promoted root content
- `grep -rn '@mindfoldhq/trellis@rc\|@mindfoldhq/trellis@beta' docs-site/start docs-site/advanced docs-site/index.mdx docs-site/zh/start docs-site/zh/advanced docs-site/zh/index.mdx`
- Replace with `@latest` or version-pinned where appropriate
- **Validate**: re-grep returns no hits

### Phase B — Verify (still reversible)

B1. Preflight checks (all must exit 0):
```
node packages/cli/scripts/check-docs-changelog.js --type promote
node packages/cli/scripts/release-preflight.js check-versions
node packages/cli/scripts/release-preflight.js verify-packed-cli
node packages/cli/scripts/release-preflight.js publish-plan
pnpm lint
pnpm typecheck
pnpm test
```
- **Gate**: all green; any red → fix the underlying issue, do NOT bypass

B2. Dogfood end-to-end migration (per design.md "Dogfood plan")
- `/tmp/v060-ga-dogfood` clean throwaway
- init@0.5.19 → update --migrate --dry-run → update --migrate --force → idempotent update
- **Gate**: no orphans, no backup bloat, second update reports no work, all platforms healthy

### Phase C — Push docs (visible to public, semi-reversible)

Mirror v0.5.0 precedent: **one** docs-site commit bundling GA changelog + lifecycle flip + docs.json edits (commit `9cd1d9c docs: v0.5.0 ga changelog + flip to root-as-stable layout`).

C1. Single docs-site commit + push
- All artifacts from Phase A (changelog mdx en+zh, lifecycle flip from `docs-promote.sh`, docs.json edits, @rc/@beta scrub) in ONE commit
- Commit message: `docs: v0.6.0 ga changelog + promote rc.0 to root`
- Push to `origin/main`
- **Gate**: Mintlify auto-deploys, `/changelog/v0.6.0` renders, banner gone, no `/rc/...` 404s

C2. Bump main repo submodule pointer + commit (do NOT push yet)
- `git add docs-site && git commit -m "chore(release): bump docs-site submodule for v0.6.0 ga changelog"` (commit-msg mirrors v0.5.0's `1c83cc47`)
- **Gate**: user reviews diff before Phase D

Stash workflow note (per `.trellis/spec/docs-site/docs/release-lifecycle.md` gotcha section): if a 0.6.0-rc.1 has to ship in parallel with this GA prep, `git stash push -u -m "GA promote prep"` parks the GA changes, work on rc.1 separately, then `git stash pop` and resolve the expected docs.json conflict at the changelog page list (keep `v0.6.0` first, then `v0.6.0-rc.1`, then older entries).

### Phase D — Ship (irreversible — npm publish)

D1. **EXPLICIT USER APPROVAL REQUIRED**
- Quote back: "Ready to bump CLI + core to 0.6.0, tag v0.6.0, push tag (CI publishes both packages to npm with `latest` dist-tag). Confirm?"
- Do not proceed without literal "ship" / "确认发布" / equivalent

D2. Run `pnpm release:promote`
- **This is the first dual-package GA promote in project history.** v0.5.0 was CLI-only; trellis-core was extracted during v0.6 cycle. The `bump-versions.js promote` codepath + workspace-resolution-in-pack are unit-tested but unexercised end-to-end.
- The script bumps both `packages/cli/package.json` and `packages/core/package.json` (`0.6.0-rc.0` → `0.6.0`), rewrites CLI's `dependencies["@mindfoldhq/trellis-core"]` from `workspace:*` to `0.6.0` in the packed tarball, commits, tags `v0.6.0`, pushes to origin
- The tag commit pattern (per v0.5.0): commit subject is just `0.6.0` (no `chore:` prefix, no body)
- CI takes over on tag push; do NOT run local `npm publish`

D3. Monitor CI workflow run
- `gh run watch` or check the actions tab
- If CI fails: do NOT publish locally; fix the workflow and re-run via `gh workflow run` or by re-pushing the tag

### Phase E — Verify GA (irreversible side; cosmetic only at this point)

E1. Verify npm:
```
npm view @mindfoldhq/trellis@0.6.0 version dist-tags --json --registry=https://registry.npmjs.org/
npm view @mindfoldhq/trellis-core@0.6.0 version dist-tags --json --registry=https://registry.npmjs.org/
```
- Both must report `version: 0.6.0` and `dist-tags.latest: 0.6.0`

E2. Smoke test from a clean machine state:
```
cd /tmp && npm install -g @mindfoldhq/trellis@0.6.0 && trellis --version
```
- Must report `0.6.0`

E3. Push main repo submodule bump (the commit from C2 + the bump-version commits from D2 are now safe to push together if not already pushed by release:promote)

E4. Mark task complete: `python3 .trellis/scripts/task.py finish`

## Validation matrix

| Check | Command | Phase |
|---|---|---|
| Manifest JSON valid | `python3 -c "import json; json.load(open('packages/cli/src/migrations/manifests/0.6.0.json'))"` | A3 |
| docs.json valid | `python3 -c "import json; json.load(open('docs-site/docs.json'))"` | A5 |
| No stray @rc/@beta | `! grep -rn '@mindfoldhq/trellis@rc\|@mindfoldhq/trellis@beta' docs-site/start docs-site/advanced docs-site/index.mdx docs-site/zh/start docs-site/zh/advanced docs-site/zh/index.mdx` | A6 |
| Preflight | `pnpm release:check && pnpm release:plan` | B1 |
| Static checks | `pnpm lint && pnpm typecheck && pnpm test` | B1 |
| Dogfood idempotent | second `update` exits with "no migrations to apply" | B2 |
| npm dist-tag flipped | `npm view @mindfoldhq/trellis dist-tags --registry=https://registry.npmjs.org/` shows `latest: 0.6.0` | E1 |
| Smoke install | `npm install -g @mindfoldhq/trellis@0.6.0` succeeds, `trellis --version` prints `0.6.0` | E2 |

## Rollback points

| After | Rollback |
|---|---|
| Phase 0 (PR merged) | Revert merge commit on main via `gh pr` or `git revert -m 1 <merge-sha>` — preserves history, undoes content |
| Phase A | `git checkout .` in both repos |
| Phase B | Same — no remote state changed |
| Phase C | `git revert` the docs commit + push; submodule pointer commit `git reset --hard HEAD~1` |
| Phase D2 before CI | `git push --delete origin v0.6.0`; `git reset --hard HEAD~N` for the bump commit(s); `git push --force-with-lease origin main` — risky on main, prefer the revert approach if anyone else may have fetched |
| Phase D2 after CI publish succeeds | NO ROLLBACK — must ship `0.6.1` patch (npm `unpublish` is permanent for the version slot) |
