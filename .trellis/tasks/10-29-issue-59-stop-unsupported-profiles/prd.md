# Fix stopping retained unsupported Delivery profiles

## Goal

Allow an existing Task v2 Delivery to be withdrawn by its current stage owner
when the active workflow no longer enables its retained profile. This removes
the obsolete-slice blocker without claiming delivery or whole-Task completion.

## Source and confirmed behavior

- Requirement authority: [castbox/Trellis#59](https://github.com/castbox/Trellis/issues/59).
- Reviewed base: `7c1d71c96c40e3778b8df0867de239647bc1f2b7`.
- The reported object is a retained `manual / planning` Delivery in Backend
  #148. The public operation rejects it with `unsupported_delivery_profile`
  before reaching the existing stop transition.
- Independent diagnosis reproduced the rejection for both `manual` and
  `local_commit` using native owners, public creation, and a subsequently
  restricted declaration. The same stop request succeeds when that profile
  remains enabled. This diagnosis exercised Python; it is not patch validation.
- The public contract permits current-stage withdrawal and independently
  rejects Completion while any Delivery remains nonterminal.

## Requirements

| ID | Required behavior |
| --- | --- |
| R1 | An existing, schema-valid Delivery whose profile is no longer enabled can be stopped from a legal nonterminal phase by its current declared stage owner, with the required reason, scope decision and evidence. |
| R2 | Preserve TaskId, generation, DeliveryId, retained profile, existing plans, gates, candidates, publication/delivery history and all other slices. Record only the lawful stop result and phase transition. |
| R3 | Preserve existing identity, current-stage owner, expected-phase, generation, result-conflict, terminal-state and stop payload/evidence checks. An identical original-result retry remains a no-op and can finish the existing selection-release path. |
| R4 | Unsupported profiles remain unavailable for creation, activation, development, gates, rework and ordinary publication/delivery. Existing explicit historical-success recovery retains its current contract. |
| R5 | Core TypeScript and distributed Python implement equivalent behavior. The dogfood Python copy and distributed template remain byte-identical. |
| R6 | Public store execution persists the stop result and the installed Python path releases the exact affected selection. Stop creates no delivery, Completion or Closure success. |

## Acceptance criteria

- [x] AC1 / R1: Reproduce the original rejection, then demonstrate lawful stop
  for retained `manual` and `local_commit` profiles under a PR-only declaration.
  Exercise the supported nonterminal phases and their existing stage owners.
- [x] AC2 / R2, R6: Compare the complete before/after aggregate. Only the
  selected slice's phase and stop_result change; unrelated slices and all
  retained facts remain equal. Completion/Closure collections remain equal.
- [x] AC3 / R3: Verify identical-result retry, ordinary wrong-owner, wrong-phase,
  wrong-generation and conflicting-result mistakes, and terminal-state refusal.
- [x] AC4 / R4: Verify that the stop exception does not admit unsupported-profile
  creation or forward execution and does not alter historical-success recovery.
- [x] AC5 / R5: Run the shared fixture corpus in both runtimes, targeted Core and
  shipped-Python integration coverage, required lint/type checks and script parity.
- [x] AC6 / R6: Exercise copied installed scripts through the public apply/store
  entry using the original declared stage owner. Verify persisted state,
  affected-selection release and no-op retry. Report this separately from
  adopting a release in the colleague's original business checkout.

## Scope boundaries

No schema, public operation, owner, profile, workflow, migration policy, CI/CD
or release-version change is proposed. Do not add a Guru state writer, rename
the old profile, manufacture a delivered result, or relax Completion.

Original Backend task mutation, production access, deployment, real AWS,
capacity validation, Guru migration redesign and colleague-chat changes are
outside this repair. Root-cause evidence about migration is recorded separately
in `research/ownership.md`; absent original migration inputs are not proof of
a second defect. Full installer/platform matrices remain outside this scope.

## Current status

Requirements are converged with no unresolved scope choice. The original repair
and local Check are complete in `6416e11b` / Draft PR #60. Its CI found one
existing Git-diagnostic assertion compatibility issue. Its bounded test-only
follow-up passed local validation and independent Check; fresh CI is pending
publication. See `implement.md` and `validation.md` for actual results and
unverified adoption boundaries.
