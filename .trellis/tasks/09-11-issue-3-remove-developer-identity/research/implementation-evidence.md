# Local Implementation Evidence

Date: 2026-09-11. This describes the uncommitted working tree on
`codex/issue-3-remove-developer-identity`, based on
`ad332e3fe5a19d7274cb03e7c2f3e2128f8de291`. It is not a release certificate.

## Implemented Contracts

- Explicit creator/assignee at task creation and bootstrap; no identity resolver,
  initialization, inheritance or hidden owner fallback. Existing task metadata
  and session binding remain usable without new identity input.
- Explicit assignee list filtering; retired personal/record modes fail clearly.
  Context exposes Git facts, project inventory and current session task.
- Task-only archive configuration/staging; retirement entry scripts are
  data-free source diagnostics and are excluded from the installed script map
  and packaged templates. Fresh installation uses the same script map as update.
- Workspace/index/journal generation, reads, rotation and recording are removed.
  Historical roots, predecessor traces and old backup boundaries are excluded
  before traversal, context trust, hashing, copying and active-data removal.
- Upgrade preflight, compatible custom workflow preservation, delayed success
  receipts, cumulative target-valid guides, old managed runtime/prompt removal,
  and repeat-update convergence are covered by regression tests.
- Platform hooks, native workflow, current skills, configuration, source
  templates, dogfood twins, documentation and normative specs are updated.
- Fork npm publication is blocked for push and release events; publishing-only
  preflight fails closed, while generic local package checks stay available.

## Final Host Checks

| Command / probe | Result |
| --- | --- |
| `pnpm build` | PASS, both packages and template copy |
| `pnpm lint` | PASS, core and CLI |
| `pnpm typecheck` and final CLI `tsc --noEmit` | PASS |
| `pnpm test` | PASS: core 372 passed / 1 skipped; CLI 1985 passed across 86 files |
| `pnpm --filter @mindfoldhq/trellis exec basedpyright` | 0 errors, 48 warnings (unused re-export imports) |
| Host `ast.parse(..., feature_version=(3, 9))` | PASS: 62 Python source/dogfood files; grammar check only |
| `git diff --check` | PASS |
| Historical tasks/workspace and external submodule diff | No changes |
| Nonhistorical source/built-output removed-tool scan | No matches; historical records intentionally excluded |

The host suite exercises all declared platform template collectors/configurators,
including Windows command rendering. This is not proof that every vendor's live
application has executed its hooks on every OS.

## Independent Review Corrections

Review found and implementation corrected these concrete issues before the final
checks: predecessor traces missing from Python rename/Git probes and platform
hooks; incompatible workflow bypass in the add-platform init path; old backup
deletion during active-data removal; recording slash-command detection and
harmless retirement explanations; orphan Copilot record prompt cleanup using
original ownership receipts. Each received focused regression coverage.

Integration also aligned raw script extraction with the canonical script map,
excluded caches/source diagnostics, and preserved the existing Linear hook.
Mixed-ownership receipt handling and no-op update snapshots pass the final suite.

## Real Packed Installation

No lifecycle publishing scripts or global installation were executed. Packages
were produced with `npm_config_ignore_scripts=true pnpm ... pack` and installed
together with `npm install --prefix <temporary-prefix> --ignore-scripts
--no-audit --no-fund <core.tgz> <cli-final.tgz>`.

Final temporary prefix: `/tmp/trellis-issue3-pack.5RuBmU/consumer-final`.
Final fixture: `/tmp/trellis-issue3-pack.5RuBmU/final-project-dDI9mp`.
Both tarballs retain the current source version **0.6.16**; these are local
unpublished builds, not the planned `0.7.0-castbox.N` downstream release.
The installed CLI's exact core dependency resolves to the supplied 0.6.16 core.

| Artifact | SHA256 |
| --- | --- |
| `/tmp/trellis-issue3-pack.5RuBmU/core.tgz` | `5a62c765e93e6f4fa952e21fc55c5e9c2cac96b50b2bff97c201cf0966f1426b` |
| `/tmp/trellis-issue3-pack.5RuBmU/cli-final.tgz` | `595bf8b74970156b74cbe10f8e775787c018f812450266c680f310c264bf1823` |

The installed CLI passed:

1. Clean init with all 22 platform flags, explicit task ownership and absence
   of new identity/workspace and retired entry scripts.
2. Dry-run update on the fresh generated project.
3. Upgrade from a 0.6.15 stamp with actual old identity-module and Copilot prompt
   contents taken from the base commit and their ownership hashes recorded.
   Both old enabled assets were removed.
4. Reapply without an additional backup or duplicate migration task.
5. Create/start/current/assignee-list/context/finish/archive in the isolated
   non-PR-backed fixture; archive used `--no-commit --skip-branch-validation`,
   as documented for local tasks. Normal branch-validation/commit behavior is
   separately covered by the archive regression suite.
6. Five fixture history files, including an old backup, remained byte-identical.

An earlier smoke harness incorrectly assumed list JSON was an array instead of
the existing `{tasks: [...]}` envelope, then attempted PR-style branch validation
on a no-commit fixture. The harness was corrected; production was not weakened.
The final fresh smoke above completed end to end with the correct contract.

## Remaining Gates

- Actual minimum Python 3.9 interpreter execution (not just grammar parsing).
- Linux/Windows and vendor live-runtime evidence beyond host generation tests.
- OS-level filesystem read observation beyond language-level guards, Git argv
  assertions and fixture byte equality.
- Separately authorized commit/version selection, fork-version manifest and
  immutable release bundle publication; real Actions skipped-job verification.
- Downstream Guru Team fixed-version adoption and its own acceptance.

Task remains in_progress. No commit, push, tag, Issue closure, history cleanup,
global dependency changes or downstream modification was performed.
