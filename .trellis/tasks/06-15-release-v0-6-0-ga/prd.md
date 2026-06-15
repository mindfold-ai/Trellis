# Release v0.6.0 GA

Promote `@mindfoldhq/trellis@0.6.0-rc.0` and `@mindfoldhq/trellis-core@0.6.0-rc.0` to the public stable release `0.6.0` on npm, shipping the v0.6 minor that has been baking through 24 betas + 1 RC since 2026-04-XX.

## Why now

- rc.0 has been on npm 7 days (tagged 2026-06-08, today 2026-06-15)
- Zero source-code changes since rc.0; all post-rc commits are docs-only
- npm `rc` dist-tag stable at `0.6.0-rc.0`, no rc.1 needed
- Aligns with the project's documented promote lifecycle (`docs-promote.sh` + `pnpm release:promote`)

## Scope

In scope:
- Promote both packages (`@mindfoldhq/trellis` + `@mindfoldhq/trellis-core`) to `0.6.0`
- Write the authoritative v0.6.0 GA changelog (en + zh, mirrored 1:1)
- Run `docs-promote.sh` to collapse `rc/` → root in docs-site
- Add `0.6.0.json` migration manifest (no new migrations vs rc.0; users coming from 0.5.x still hit the 0.6.0-beta.0 manifest's existing rename/delete chain)
- Update docs.json: drop RC version block, drop RC banner, point changelog href at `/changelog/v0.6.0`, add v0.6.0 to nav pages
- **Ship new `trellis-channel` bundled capability skill** (parallel to `trellis-session-insight` for `trellis mem`) so AI knows when to use channel runtime
- **Refresh `trellis-meta` bundled skill** to cover v0.6 architecture (channel, mem, dual-package SDK, parent/child tasks, workflow templates, registry-backed spec, configurable hooks, new platforms Reasonix + Pi, bundled-skill auto-dispatch flow)
- End-to-end dogfood: fresh project init@0.5.19 → upgrade through migrations → land on 0.6.0
- Trigger CI-driven publish via `pnpm release:promote`
- Verify npm dist-tags: `latest: 0.6.0` (was `0.5.19`), `rc` may stay or be cleared

Out of scope:
- New code changes (zero diff vs rc.0)
- v0.7 planning
- Docs feature additions beyond what's required for promote

## Success criteria

1. `npm view @mindfoldhq/trellis dist-tags` shows `latest: 0.6.0`
2. `npm view @mindfoldhq/trellis-core dist-tags` shows `latest: 0.6.0`
3. Both packages downloadable: `npm install -g @mindfoldhq/trellis@0.6.0` works
4. `git tag v0.6.0` exists on origin, **anchored on `origin/main`** (not on the `feat/v0.6.0-rc` branch — mirrors v0.5.0 precedent where PR #233 merged the RC branch into main before tagging)
5. `docs.trytrellis.app` no longer shows RC banner or version dropdown; root content is the promoted ex-rc content; `/changelog/v0.6.0` renders the GA changelog
6. Dogfood: `npx @mindfoldhq/trellis@0.5.19 init` → `npx @mindfoldhq/trellis@0.6.0 update --migrate` produces a clean, working project tree with no orphan files or backup bloat
7. `packages/cli/src/migrations/manifests/0.6.0.json` exists and validates
8. `docs-site/changelog/v0.6.0.mdx` + `docs-site/zh/changelog/v0.6.0.mdx` written, mirrored, listed in docs.json
9. After promote, RC artifacts are cleanly removed: no `rc/` directory in docs-site, no RC banner in docs.json, no dangling `@rc` references in promoted content
10. `packages/cli/src/templates/common/bundled-skills/trellis-channel/SKILL.md` exists + references/ subdirectory populated; `trellis init` deploys it to every supported platform's skill root
11. `packages/cli/src/templates/common/bundled-skills/trellis-meta/SKILL.md` covers all v0.6 architecture elements (channel, mem, dual-package SDK, parent/child tasks, workflow templates, registry-backed spec, configurable hooks, Reasonix + Pi platforms, bundled-skill auto-dispatch); new references/ items added per design.md

## Constraints

- npm publish is CI-only (CI is the only writer; never use local `npm publish` to patch a failed/partial release per /trellis:create-manifest doc)
- Both packages MUST ship with identical version strings; CLI's pinned `trellis-core` dep version MUST match the published core version
- Cannot skip dogfood — promote doc requires breaking-release dogfood; v0.6.0 from v0.5.x is breaking per `0.6.0-beta.0.json` manifest
- Cannot `--no-verify` past failing preflight or hooks
- GA changelog written from scratch by re-reading all 25 beta + rc.0 changelogs and synthesizing fresh (per user decision), not just polishing rc.0's recap

## Risks

- **First dual-package GA promote**: v0.6.0 is the first time `pnpm release:promote` will publish both `@mindfoldhq/trellis` and `@mindfoldhq/trellis-core` in lockstep. The `bump-versions.js promote` codepath and the CI publish workflow's `workspace:*` → exact-version rewrite have been unit-tested but never run for a real GA. v0.5.0 was CLI-only; trellis-core was extracted during the v0.6 cycle.
- **First production run of `docs-promote.sh`**: the script was introduced as part of the v0.5.0 GA flip commit (`9cd1d9c`) but v0.5.0 itself was done by hand (historical layout flip from `release/`-as-stable to `root/`-as-stable). v0.6.0 GA will be the first cycle to actually invoke the script in its intended `T2 → T3` role.
- **Branch divergence between `feat/v0.6.0-rc` and `main`**: 5 commits on feat-branch missing from main; 1 commit on main (WeChat QR refresh) duplicated on feat-branch via cherry-pick (different SHAs). Must align via PR merge before tagging to mirror v0.5.0's PR #233 pattern. Tagging on the feat-branch directly would leave main without the GA artifact.
- **CI publish failure mid-flight** (e.g., one package publishes, other doesn't): manual recovery not allowed; must fix CI and re-run
- **`docs-promote.sh` side effects**: script overwrites root `start/`, `advanced/`, `index.mdx` from `rc/` — if root has stable-only content not present in rc/, it gets lost. Mitigation: `git diff docs-site` before commit.
- **Manifest chain gap**: if `0.6.0.json` doesn't exist and a user goes 0.5.19 → 0.6.0 directly, `release-preflight check-versions` will fail manifest continuity. Mitigation: write `0.6.0.json` with empty migrations array but valid metadata.
- **dist-tag chaos**: `rc` dist-tag still pointing at `0.6.0-rc.0` after `latest` becomes `0.6.0` may confuse users running `@rc`. Acceptable: rc tag persists pointing at the rc.0 artifact, becomes irrelevant once latest is the same code.
- **MDX prettier auto-indents `<Note>` closing tag** (per `.trellis/spec/docs-site/docs/release-lifecycle.md` gotcha section): if the GA changelog uses `<Note>` / `<Warning>` blocks containing markdown lists, prettier through `lint-staged` will re-indent the closing tag and break mintlify parser. Mitigation: write closing tag at column 0; re-fix if pre-commit hook rewrites it.

## Acceptance gate

GA can ship only after:
- All 9 success criteria above
- Dogfood passes
- No HIGH/CRITICAL gitnexus_impact warnings on any pre-publish file changes
- All preflight checks green (`check-docs-changelog --type promote`, `release-preflight check-versions`, `release-preflight publish-plan`, `pnpm lint`, `pnpm typecheck`, `pnpm test`)
