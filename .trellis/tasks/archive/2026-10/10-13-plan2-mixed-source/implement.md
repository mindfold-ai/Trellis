# Execution plan: Plan2 mixed-source

## State and approval

Created/bound and implementation approved on 2026-10-13; Task activated as
in_progress. Four-file implementation, regressions and ordinary quality build/tests
are authorized. Offline candidate pack/install/rehearsal is still pending its
separate exact-target approval. PRD/design own requirements/contracts; provenance freezes the
four-file preimages. Reviewed artifacts and activation approval are recorded
in research/provenance.json. Synthetic candidate work must identify its fresh temporary root
and owned output set; existing/real samples remain read-only. Branch/worktree
and publication actions are separately scoped.

## Ordered work after approval

1. Re-read exact task/continuation/specs and verify base/four preimages. Refresh
   plan/review if changed. Read full quality-guidelines.md from disk if injected
   context is truncated. Activate only after review and approval; follow workflow
   implementation/check owners.
2. Extend existing migrate2 integration helpers with regressions (AC1–AC3):
   explicit mixed inventory, conversion in both directions, archive/current/
   history and homogeneous compatibility. Show baseline rejection using only
   synthetic shapes, never copied business raw.
3. Add closed schema enum/row field/cross-field refinement (AC2, AC3); implement
   shared convert/defer declared-validator dispatch on original snapshots (AC1,
   AC4). Keep Core projection and all other guards intact.
4. Add preservation/recovery assertions (AC4–AC6), reusing tracked Git siblings,
   unique binding authority and existing identity/provenance negatives. Full
   snapshots and writer spies prove zero-write/preserve/no-op behavior.
5. Update commands-migrate.md (AC7): selector/compatibility/error matrix, full
   inventory, frozen-original resume, candidate identity and public evidence.
   Other product/spec paths are outside the default write set.
6. Run targeted/root checks below and record failures/skips/warnings. Fix
   findings and rerun affected checks, without global timeout relaxation.
7. With candidate/rehearsal authorization, allocate and record a fresh
   `/tmp/plan2-mixed-source-candidate-<random>` root before writes. Owned outputs:
   provenance, new tarballs/install, synthetic Git primary/siblings/common dir,
   complete plans/backups and evidence. Build/pack/install offline CLI/Core pair,
   verify pins and installed bytes/modes and record source/tar/template/plan SHA.
   Do not publish npm or invoke release/prepublishOnly as publication workflow.
8. Exercise actual packed bin preview/execution/preservation, actual atomic
   failure, same-plan recovery, completed replay, third-state rejection and exact
   rollback. Run installed Python 3.9 readers in both roots. Keep old artifacts
   unchanged; tie output evidence to AC1–AC7.
9. Independent complete-candidate review against every R/AC and required checks/
   installed evidence. Resolve findings before readiness. Commit/push/PR/merge/
   closure are later boundaries, not implementation approval.

## Behavior matrix

| AC | Cases/observations |
| --- | --- |
| AC1 | Complete synthetic 28 schema1 + 3 legacy, one schema1 convert and 30 defer. Reverse legacy convert/schema1 defer; mixed archive convert. Full preview equality and exact peers. Generate records in a loop, not duplicate tests. |
| AC2 | Missing/bad selectors on all three requiring dispositions, forbidden selectors; source mismatch for convert and defer in both directions; unknown/malformed records; homogeneous override; current/history selectors. Otherwise-valid plans reach intended error and retain entire tree. |
| AC3 | Legacy/schema1 homogeneous regressions; mixed only one predecessor kind or only current/history-only rows; valid schema2 current/history/missing-record roots. Current target record, active nonempty history_only and wrong location still reject. |
| AC4 | UTF-8, whitespace, 0600/0644, all planning/descendants; exact original backup and projection identity/tree/business facts. No peer defaults/artifacts. Preserve paths have zero writer calls. |
| AC5 | Tracked registered siblings, bound authority and common sessions with distinct-format distinct identities and plan-order permutations. Same-ID cross-category collision or different source/generation/case, two/all-defer authorities, malformed/wrong/missing bindings, aliases, markers, omitted inventories/peer additions reject. Retain old safety/final drift coverage; add mixed-specific paths rather than duplicate all tests. |
| AC6 | Actual Nth atomic failure after at least one selected Task has reached schema2; same-plan preview/resume from original selectors with live partial targets. Source/binding/target byte/mode third states reject without extra writes. Completed replay zero writer. Rollback complete primary/sibling/common set, remove only added paths/empty dirs. |
| AC7 | New CLI/matching Core package pins and installed bytes/modes verified. Real bin, Python3.9 Task/runtime/continuation/Delivery selection in both roots; deferred direct selection rejects. Exact source/tar/template/plan hashes and raw outputs. |

Assert intended guards using otherwise valid plans. Full file/hash/mode snapshots
and installed directory/symlink inventory are required. No concurrency hardening.

## Commands planned, not executed

Build before binary integration tests. Current CI uses Node20 and Python3.9;
verify local interpreter version. Missing environment is skip/block, never pass.

```bash
pnpm build
pnpm --filter @mindfoldhq/trellis test test/commands/migrate2.integration.test.ts test/commands/migrate.integration.test.ts test/scripts/cross-worktree-session.integration.test.ts test/scripts/delivery-v2.integration.test.ts
pnpm lint
pnpm typecheck
pnpm --filter @mindfoldhq/trellis lint:py
pnpm test
python3 .trellis/scripts/task.py validate .trellis/tasks/10-13-plan2-mixed-source
```

Run CI's tracked Python syntax inventory with verified Python3.9 and a temporary
PYTHONPYCACHEPREFIX inside the owned output. Exercise installed readers under
actual 3.9 too; host tests selecting newer python3 are insufficient.

Public entry examples use placeholders, not executable full plans or approval.
Replace paths with recorded synthetic targets; complete reviewed plan and exact
preview backup precede execution. Run in each fixture root with an isolated
explicit context key:

```bash
node /tmp/plan2-mixed-source-candidate-<id>/installed/node_modules/@mindfoldhq/trellis/bin/trellis.js migrate --from 0.7.0-castbox.3 --plan /tmp/plan2-mixed-source-candidate-<id>/mixed-plan.json --dry-run
node /tmp/plan2-mixed-source-candidate-<id>/installed/node_modules/@mindfoldhq/trellis/bin/trellis.js migrate --from 0.7.0-castbox.3 --plan /tmp/plan2-mixed-source-candidate-<id>/mixed-plan.json
python3 .trellis/scripts/task.py current --source
python3 .trellis/scripts/get_context.py --mode runtime-contract
python3 .trellis/scripts/get_context.py --mode continuation
```

Installed partial failure uses a recorded test-only atomic-writer harness; retry
uses unmodified public binary. Retain injection provenance; no shipped fault hook.

## Checkpoints

If Core/Python product changes are needed, refresh scope before expansion. New
formal version/release needs its own plan. Real owner inputs remain
evidence_pending, independent of upstream synthetic completion. No implementation
acceptance pass was recorded at planning time. Context warnings remain explicit.

## Source implementation/check outcome

Four-file source implementation and independent quality Check completed on
2026-10-13. See research/implementation-results.md and research/quality-review.md
for actual snapshots, checks and fixed test findings. No unresolved source/spec
defect remains. Final root lint/typecheck pass; final migrate2 has 163 passing
cases under Python3.9.6. Complete Core ran 475 pass plus one inactive no-python
placeholder skip; complete CLI ran 2283 pass before the two reviewer-only test
fixes, followed by a complete final affected-file rerun. This is not a combined
or newly executed full-suite total.

Main Python checks: /usr/bin/python3 3.9.6 compiled all 89 tracked Python files
with temporary external pycache, exit0; Python typecheck log has 0 errors and
48 existing warnings. No Python/runtime product bytes changed. The quality spec
injection-cap warning remains documented, and the checker read the full file.

Steps 1–6 source implementation/verification are complete. Steps 7–9 packed
candidate/public-entry proof and its independent audit remain pending separate
authorization; AC7 is partially verified, not passed. Task remains in_progress.
No product commit/tar candidate, publication, existing/real sample execution,
business cutover or outbound task message is claimed. Exact proposed destination
and next write boundary are in research/candidate-validation-plan.md.

## Subsequent candidate execution

The exact offline proposal was approved on 2026-10-13 with `确认继续`. Steps 7–9
are now authorized under `/tmp/plan2-mixed-source-candidate-9981ff40b934`. Fresh
CLI build/pack/install succeeded; all 713 CLI and 270 Core installed files match
archive bytes/modes and exact Core pin. Product source manifests before build
and after pack are identical. Synthetic proof and independent audit are in
progress. No product source bytes changed after source quality review. Actual
results and remaining boundaries are recorded separately; the original pending
statements above describe the pre-authorization checkpoint. Commit and remote
side effects remain separately gated.

## Final packed proof checkpoint

Step7 and Step8 completed: final attempt5 passed all five synthetic variants,
151 retained subprocess calls and10 actual Python3.9.6 exact routes; complete
source and installed package bytes remain unchanged. Whole-Git read-only proof
uses explicit GIT_OPTIONAL_LOCKS=0 and PYTHONDONTWRITEBYTECODE=1; attempts1–4
remain disclosed as failed whole attempts. See research/candidate-validation-results.md
and candidate-evidence.json for precise AC trace, tar/source/plan/template/harness
identities and limits. Step9 final independent audit is being recorded. No
commit/publication/business/Issue/lifecycle result is claimed.

## Independent complete-candidate outcome

Step9 completed: independent full-candidate quality/evidence review passes, with
no unresolved implementation/spec/test/evidence finding across R1–R7/AC1–AC7.
See research/candidate-quality-review.md. This is one complete packed-candidate
review round, not two new rounds or a formal lifecycle/Completion record.
Source, tar/install identities, every retained artifact, raw reader/command
outputs and current rolled-back full trees were independently checked. Commit
requires its exact one-shot approval; Task remains in_progress and unpublished.
