# Validation: retained unsupported Delivery stop

Original candidate: `6416e11b59181f8ba70236f051a0414bd2b69b64` on
`codex/59-stop-unsupported-profiles`, based on
`7c1d71c96c40e3778b8df0867de239647bc1f2b7`.
Independent quality Check passed with no finding on that complete local candidate.

## Regression demonstrated before the fix

The implementation owner ran the new regressions with the original guard:

| Command | Observed result |
| --- | --- |
| `pnpm --filter @mindfoldhq/trellis-core exec vitest run test/task/v2.test.ts -t 'unsupported\|retained'` | 18 failed, 1 passed, 40 skipped. New stop/store paths hit unsupported_delivery_profile before reaching the expected behavior. |
| `pnpm --filter @mindfoldhq/trellis exec vitest run test/scripts/delivery-v2.integration.test.ts -t unsupported` | 3 failed, 1 passed, 26 skipped. New shared and installed cases hit the profile guard. |

An initial installed-test assertion expected stop to verify evidence-file
bytes. Source inspection showed that the existing stop contract requires
nonempty, structurally valid evidence refs; content verification is not added
by this repair. The test now checks the existing required-evidence boundary.

## After the fix

| Validation | Result |
| --- | --- |
| Core `vitest run test/task/v2.test.ts` | 59 passed. |
| CLI `vitest run test/scripts/delivery-v2.integration.test.ts` | 30 passed with shipped Python and the shared fixture corpus. |
| CLI `vitest run test/regression.test.ts -t 'stays byte-identical'` | 37 passed; 425 unrelated tests skipped by the explicit selector. |
| `pnpm lint` | Passed; independently refreshed on the final candidate. |
| `pnpm typecheck` | Passed, including Core build and CLI declaration resolution; independently refreshed on the final candidate. |
| Script-tree diff and public-contract cmp | Matching copies. |
| `git diff --check` | Passed. |
| Task context validation | Passed, with five entries per manifest. |

Core assertions cover both old profiles across five legal phases and their
seven existing stage/role combinations, complete aggregate preservation with
a separate delivered peer, identical-result retry, ordinary mistakes, terminal
protection and Core store persistence. The 15-step shared fixture also preserves
unsupported forward-operation refusal in both runtimes.

Installed tests copy the distributed scripts into throwaway workspaces and use
the actual public apply/store entry. They verify both profiles, required
evidence, persisted stop, preservation of the other slice and its session
selection, release of the affected selection, and byte-preserving retry.
Completion and Closure remain empty in these cases.

## Independent Check

The independent owner reviewed the complete runtime, tests, untracked fixture,
public contract twins, durable spec and Task artifacts against R1-R6/AC1-AC6.
No actionable finding or self-fix remained. It refreshed final lint/typecheck,
script-tree and contract parity, diff cleanliness and Task manifest validation.
It consumed the final unchanged targeted-suite results above rather than
repeating tests without a remaining concern. Product files did not change
after this review; only Task progress and these results were updated.

## Boundaries

This evidence covers the local source candidate, copied runtime installation,
package lint/type checks and canonical/dogfood script parity. It does not prove
a matched published Core/CLI release, full installer/update/platform matrices,
or adoption in the colleague's original checkout. No original Backend Task was
changed. Real AWS, media-build identity, capacity and whole-Task Completion
remain outside this repair. Guru migration mapping still requires its original
inputs/results; this change does not assert a second migration defect.

## Publication CI and bounded compatibility follow-up

[PR #60](https://github.com/castbox/Trellis/pull/60) is Draft at the original
candidate. [CI Run 40870708254](https://github.com/castbox/Trellis/actions/runs/40870708254)
passed all four Native Python jobs, Python 3.9 syntax, Python/TS type checks,
lint and Core/CLI build. Core was 511 passed / 1 skipped; CLI was 2407 passed /
1 failed. The failed assertion is in the unchanged
`test/commands/migrate2.integration.test.ts` test
`rejects an inventoried prunable sibling with an extant corrupt Git entry`.

It expects `/not a git repository/`, but the runner's Git 2.56 reports
`fatal: gitfile does not point to a valid repository` for the deliberately
unavailable gitdir. The operation still rejects in Git discovery before any
Delivery stop. The before/after snapshot assertion must remain intact.

The same test file is unchanged from the earlier successful main candidate
`79a97ed6` / [Run 39905440951](https://github.com/castbox/Trellis/actions/runs/39905440951),
whose checkout log reports Git 2.55. Local Apple Git 2.54 passes the old
assertion. These observations support a diagnostic compatibility correction;
they do not justify changing migration rejection behavior.

The follow-up accepts only the two observed Git diagnostic forms in that
assertion. The actual-Git target test passed (1 passed, 162 unrelated cases
excluded by the explicit selector), and its complete migration file passed
163/163. Scoped ESLint, Prettier and diff checks passed. The original
independent Check owner reviewed the increment and its complete-candidate
impact, refreshed scoped mechanical checks and Task validation, and found no
actionable issue. Original product validation remains applicable because the
runtime and product regression files are unchanged.

Corrected behavior on the actual Git 2.56 runner still requires the next CI run
after publication. No CI workflow, timeout, skip or runtime change was made.
