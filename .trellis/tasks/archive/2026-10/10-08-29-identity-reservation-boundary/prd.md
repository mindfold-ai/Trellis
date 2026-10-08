# Issue #29: Identity reservation boundaries

Source: https://github.com/castbox/Trellis/issues/29
Baseline: `main@cc5f9a30652be29cffee9acc7e14d5dc5daaf04c`.

## Goal and defect

Users can create and resolve a current task beside unrelated historical records
without making historical records executable. Each step validates only the facts
it consumes; historical TaskIds remain reserved.

Creation's `require_unique_task_id -> read_task_inventory_record` validates full
current/known-legacy schema before comparing ids. A real header with a valid id,
retired personnel fields and generation 1 matches neither. Guru #503's formal
source and clean-installed tests fail at this official writer. Session resolution
uses the same reader before identifying matches. Expanding a whitelist retains
this coupling and changes consumers that need different facts.

## Requirements

- R29-01: Reservation reads valid immutable TaskId and safe locator, compares
  exact/casefold identity, and ignores non-identity fields without rewriting them.
- R29-02: Creation retains target-directory, archive-location, registered-worktree
  and Git-ref occupation checks. Its writer produces a complete current task,
  generation 0 and the exact supplied source.
- R29-03: Session lookup identifies matches before strictly validating matching
  current records and generation. Unrelated non-identity errors do not block a
  valid selected task. Direct old/mixed/invalid-current selection still rejects.
- R29-04: Active unreadable/undecodable/bad JSON, non-object, empty, missing or
  illegal id fail closed with a record locator. Unrelated directories without
  task.json remain evidence-only; direct missing-record selection rejects.
  Existing archive/Git-history missing-data and visible-name fallback policies
  remain unchanged; no catch-all skip is introduced.
- R29-05: Reservation is not lifecycle or migration authority. Strict current
  readers/writers and reviewed current/converted/deferred migration contracts
  retain their complete-schema rules.
- R29-06: Canonical, dogfood and clean-installed behavior agree. Scanning preserves
  historical bytes/modes. Rejection creates no partial task/session resources.

## Scope and exclusions

Scope: Python reservation reading, collision/session consumers and direct error
handling, relevant current documentation and tests. Inspect rename/archive's
strict selected-record validation before their shared uniqueness check.

Exclude personnel restoration, legacy execution, historical migration, new
identity index/store, broad script redesign, session ownership algorithm changes,
Core schema relaxation, version/release changes, Guru/Backend installation
patches, deployment, cleanup and Git/GitHub delivery operations.

## Acceptance

| Scenario | Observable outcome | Requirements |
| --- | --- | --- |
| A29-CREATE | Actual create CLI succeeds beside a registered worktree's mixed header; new record is current with the exact source. | R29-01,02,06 |
| A29-INDEPENDENCE | Changes only to historical source/generation/status/unknown non-identity fields do not change reservation or valid current lookup. | R29-01,03,05 |
| A29-OCCUPIED | Exact/casefold ids, occupied target directory and Git-ref ids still reject without partial resources. | R29-01,02,06 |
| A29-SELECTED | Old/mixed/invalid-current targets reject; valid selection, generation mismatch and duplicate resolution preserve existing semantics. | R29-03,05 |
| A29-BAD-ID | Bad active identity rejects with a locator; evidence-only and archive policies retain coverage. | R29-04 |
| A29-MIGRATION | Strict Core/Python record read/write and migration classification regressions pass. | R29-05 |
| A29-INSTALLED | Built CLI clean-project installation exercises actual shipped creation/session behavior; Python tree parity passes. | R29-06 |

## Dependencies and evidence limits

This Fork delivery is a prerequisite of Guru #503, whose separate preflight and
source-lock integration remain Guru-owned. Backend #378 recovery is a later
independent verification. No blocking product question remains. These are
planning criteria; implementation and acceptance tests have not run.
