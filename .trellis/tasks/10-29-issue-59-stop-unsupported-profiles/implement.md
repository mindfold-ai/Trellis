# Execution plan

Status: the original repair is committed as `6416e11b` and published as Draft
PR #60. CI exposed one existing Git-diagnostic assertion compatibility issue;
its bounded test-only follow-up passed local validation and independent Check.
The corrected candidate still requires publication and fresh CI. Task remains in_progress.
Actual results and adoption boundaries are in `validation.md`.

## Ordered work

- [x] Read live Issue #59, current operation/store implementations, public
  contract, relevant specs and existing TS/Python fixture runners.
- [x] Confirm exact base, isolated checkout, Task identity and source relation.
- [x] Converge PRD, design, scope boundaries and this execution plan.
- [x] Complete native Phase 1.4 artifact review and Task activation.
- [x] Dispatch `trellis-implement` with the exact active Task and curated
  manifests. Reproduce the regression before applying the narrow fix.
- [x] Apply matching Core/Python changes, synchronize the dogfood twin, add
  meaningful shared and installed-store regression coverage, and clarify the
  public contract/spec within the documented scope.
- [x] Run the targeted validation below and dispatch independent
  `trellis-check` over the full candidate, including tests and documentation.
- [x] Record actual validation results and unverified adoption boundaries.
  Return for separate commit/publication authorization when applicable.

Before editing or reviewing the Python twin, read the relevant sections of
`.trellis/spec/cli/backend/script-conventions.md` directly: Overview, Two script
trees one content, and Cross-Platform Compatibility. This source exceeds the
context-injection file limit, so it is linked here rather than supplied as a
silently truncated manifest entry. Read the source sections; do not replace
them with this pointer.

## Targeted validation

Use the repository's pinned pnpm version and installed dependencies. If they
are unavailable, report the dependency gap; do not turn missing tests into a pass.

```bash
pnpm --filter @mindfoldhq/trellis-core exec vitest run test/task/v2.test.ts
pnpm --filter @mindfoldhq/trellis-core build
pnpm --filter @mindfoldhq/trellis exec vitest run test/scripts/delivery-v2.integration.test.ts
pnpm --filter @mindfoldhq/trellis exec vitest run test/regression.test.ts -t 'stays byte-identical'
pnpm lint
pnpm typecheck
diff -rq .trellis/scripts packages/cli/src/templates/trellis/scripts -x __pycache__
git diff --check
```

The parity describe is defined in `test/regression.part-06.ts` and imported by
`test/regression.test.ts`; the selector above matches that describe. Run any
additional package test required by a concrete changed boundary, rather than a
full installer matrix.
The installed public stop/store and release assertions belong in the existing
Delivery integration test above. A single copied runtime validates that path;
it does not prove release adoption or every platform's installer/update behavior.

## Review and completion boundaries

- Check R1-R6 and AC1-AC6 against the complete diff and actual outputs.
- Reject unrelated workflow, migration, CI/CD, business-code or release changes.
- Report source tests, copied installation tests and real target adoption as
  distinct evidence levels.
- Do not use the colleague's temporary patch, reported test counts, merged
  Backend PRs or manual-disposition intention as validation of this candidate.
- Do not write or retire the original Backend Task. A target adoption request
  must reread its actual state, owner and remaining obligations.

## Current verification

Task manifests validate. Targeted Core, shipped-Python and script-parity suites
passed. Independent Check reviewed the complete final candidate with no finding,
refreshed root lint/typecheck, and verified script/contract parity and diff
cleanliness. No product files changed after that Check.

## Plan change: Git 2.56 diagnostic compatibility

CI Run `40870708254` passed all four Native Python jobs, Core tests, lint,
type checks and build. The CLI suite failed only because an existing migration
test matched `/not a git repository/`, whereas Git 2.56 reports
`gitfile does not point to a valid repository` for the same invalid gitfile.
The baseline test is identical; its earlier successful main run used Git 2.55.

- [x] Adjust only that diagnostic assertion in
  `packages/cli/test/commands/migrate2.integration.test.ts`, preserving the
  rejection, complete no-write snapshot and original timeout.
- [x] Run the affected actual-Git test/file and scoped lint/format checks.
- [x] Have the original independent Check owner review this increment and its
  effect on the complete candidate. Product/runtime tests can retain their
  unchanged existing evidence.
- [x] Prepare the separate follow-up commit/publication with actual results.

No runtime, migration policy, CI workflow, timeout or test-skip change belongs
to this follow-up. The goal remains delivery of R5's validated candidate.
