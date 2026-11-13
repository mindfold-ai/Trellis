# Design: stop retained unsupported Delivery profiles

## Cause and ownership

`packages/core/src/task/v2/operations.ts:89` and
`packages/cli/src/templates/trellis/scripts/common/delivery_operations.py:141`
reject every existing unsupported-profile operation except explicit historical
publication/delivery recovery. The rejection precedes both original-result
recovery and the current-stage stop branch. Thus a lawful withdrawal cannot
reach the already implemented transition or store release.

The correction belongs to the public operation implementations. Guru already
projects Planning withdrawal to `operation=stop`, `owner_role=planning`,
`expected_phase=planning` through the installed public store. It supplies the
semantic decision; Trellis validates and records the deterministic transition.

## Minimal mechanism

Exempt only `operation == stop` from the existing retained-profile guard in
both runtimes. Preserve the guard's explicit historical-success exception.
Do not move or bypass any other validation or change the stop payload.

The same public operation then follows its existing path:

1. Parse Task, operation and declaration; validate owner and key identity.
2. Apply the profile restriction to operations that still require an enabled
   execution profile.
3. Recover only an identical original result, or validate the current generation,
   expected phase and nonterminal state before applying a new result.
4. Check that the invoking role belongs to the current stage and record stop.
5. Preserve the existing stop payload/evidence validation and let the store
   persist the result. Stop evidence requires nonempty, structurally valid refs;
   the store does not add evidence-file byte verification for this operation.
   The Python store's existing release path releases the affected selection,
   including retry.

The original workflow and current-stage owner remain authoritative. A stopped
slice is not delivered; all Task Completion obligations remain independent.

## Expected implementation surfaces

| Surface | Planned change |
| --- | --- |
| `packages/core/src/task/v2/operations.ts` | Narrow guard exception. |
| `packages/cli/src/templates/trellis/scripts/common/delivery_operations.py` | Matching exception in the shipped runtime. |
| `.trellis/scripts/common/delivery_operations.py` | Byte-identical dogfood twin. |
| `packages/core/test/fixtures/task-v2/unsupported-profile-stop.json` | Shared transition regression, automatically discovered by existing TS/Python runners. Split only if the existing fixture format makes that necessary. |
| `packages/core/test/task/v2.test.ts` | Behavior and aggregate-preservation assertions where shared observations are insufficient. |
| `packages/cli/test/scripts/delivery-v2.integration.test.ts` | Installed public apply/store, release and retry coverage. |
| `packages/cli/src/templates/trellis/delivery-contract.md` and `.trellis/delivery-contract.md` | One matching clarification of stop's retained-profile behavior. |
| `.trellis/spec/cli/backend/delivery-lifecycle.md` | Capture the compatibility rule without duplicating the public transition definition. |

CI compatibility follow-up: the existing Git-preflight assertion in
`packages/cli/test/commands/migrate2.integration.test.ts` must recognize both
supported invalid-repository diagnostics. The Git 2.56 runner rejects the
same retained corrupt gitfile with a different message from Git 2.55. Preserve
the specific rejection and complete before/after snapshot assertion. This
changes only test portability; migration and profile behavior remain unchanged.

Reuse existing fixture runners, store helpers and release machinery. No new
executor, schema, ledger, compatibility adapter or public input field is needed.

## Regression design

Build legal phase samples through existing operations under a declaration that
enables the profile. Apply the restricted declaration to the retained object;
do not fabricate gate success or edit business Task records to obtain phases.

Cover `manual` and `local_commit` at planning, implementing, checking, reviewing
and publishing, using the roles already permitted by stageOwners/STAGE_OWNERS.
Keep tests focused on withdrawal and existing correctness boundaries; add no
hostile-input, concurrency, crash or operating-system stress expansion.

Use exact-result retry and ordinary caller mistakes to ensure the exception
does not skip generation, phase, ownership or result validation. Preserve the
existing unsupported forward-operation and historical-recovery tests. Verify
whole-record preservation rather than asserting only the final phase.

At the installed boundary, copy shipped scripts into a throwaway workspace,
create/select a legal slice, retain it under the restricted declaration and
call the actual public apply path. This is a supported retained-data setup,
not a proposal to weaken workflow-switch preflight. Read back Task and selection
and repeat the original request. Do not claim that this installs a released fix
into the colleague's checkout.

## Compatibility and limits

This is a narrow behavior correction within Task schema 2.0 / Delivery API 1.0.
All existing profiles, payloads, owner roles and historical facts retain their
meaning. Existing workflow-replacement preflight remains unchanged. No
release/version bump or original business Task mutation belongs to this plan.

After source validation, adoption requires matched Core/CLI artifacts and
separate verification in the target installation. The colleague's reported
42-test/120-step candidate result is background evidence, not a pass for this
candidate. Real AWS, target media builds and capacity remain Backend obligations.

Rollback of an unpublished candidate is the inverse scoped source change.
Once an installation has legitimately stored a stop result, preserve that fact;
do not roll it back by editing the Task or invent a completion result.
