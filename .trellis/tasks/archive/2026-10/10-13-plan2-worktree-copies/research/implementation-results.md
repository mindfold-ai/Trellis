# Implementation results: Plan2 inherited registered copies

Date: 2026-10-13. Implementer scope: CLI executor/schema/tests and temporary synthetic fixture generator. No Core/Python product edits, commits, pushes, branch changes, original business writes or Issue changes.

## Changed product files

- `packages/cli/src/commands/migration2-schema.ts`: optional closed reviewed `branch_bindings` rows with portable identity, safe generation and raw snapshot. Omission normalizes to an empty list in the executor.
- `packages/cli/src/commands/migration2.ts`: group independently validated frozen originals by reserved identity; admit only exact identity/generation/provenance, distinct canonical roots/Task directories, one active projected authority and deferred predecessor peers. Preserve fixed existing bindings; require reviewed bindings for active unique identities when present, and retain public Git extension-marker/Git-free behavior. Recheck repository roots/common-dir/suffix and each sibling identity, branch checkout, marker predicates, binding absence, safe paths and source-or-target preimages before mutation. Preview also detects raw state changes during preparation.
- `packages/cli/test/commands/migrate2.integration.test.ts`: 47 new cases, yielding 103 migration2 tests. Fixtures commit two predecessor Tasks before adding a real sibling, bind opposite execution copies, vary source metadata/planning/modes and preserve full inventories.

Main owns public spec and planning/evidence updates.

## Verification

- Final targeted command: `pnpm --filter @mindfoldhq/trellis test test/commands/migrate2.integration.test.ts test/commands/migrate.integration.test.ts test/scripts/cross-worktree-session.integration.test.ts` — **142 passed in 3 files**, 35.27s. Log: `/tmp/plan2-targeted-final.log`.
- Root `pnpm lint` and `pnpm typecheck` passed; final CLI lint/typecheck after the final test additions also passed. Logs: `/tmp/plan2-lint-results.log`, `/tmp/plan2-typecheck-results.log`, `/tmp/plan2-lint-final.log`, `/tmp/plan2-typecheck-final.log`.
- Real inherited-copy positive cases passed in both plan orders: preview zero writes, opposite bound conversions, raw branch planning and peer modes, no peer migration/Delivery additions, no writer calls on completed replay, and exact preview-owned rollback.
- Ordinary fourth-write failure followed by same-plan preview/execute passed using original grouping; later peer mode drift rejected with zero migration writes.
- Post-migration shipped template Python from both roots resolved each exact common session to its bound authority; continuation was available. Direct deferred peer Delivery selection failed without writes. These are shipped-template integration checks, not yet packed-binary acceptance.
- Current schema2 authority plus matching schema1 deferred peers, recognized legacy default-zero copies, preserve-null artifact absence and unique-ID reviewed-binding/no-binding compatibility passed.
- Negative coverage includes malformed/extra/duplicate/unrelated bindings; case/generation/valid immutable-source mismatch; all-defer/multiple authorities; archived/history occupation; canonical aliases; missing Task/artifact inventories; peer artifact writes; raw binding/mode/deletion/symlink drift; detached/missing/wrong-peer checkout; final topology/foreign-common/marker/binding absence/path/state changes; Git marker boundary and Git-free bypass.

## Installed rehearsal handoff and pre-fix proof

`/tmp/plan2-installed-fixture.mjs` has a successful `node --check` and was actually run with the previously installed candidate. Invocation:

```sh
node /tmp/plan2-installed-fixture.mjs <installed-root> <new-fixture-directory>
```

It imports only installed CLI/Core JavaScript, creates synthetic tracked inherited Tasks and registered worktrees, and produces `fixture.json`, reviewed `plan.json`, `old-executor-plan.json` (without the new field), and exact raw `backups.json`. Its sessions explicitly select planning Deliveries created through public Core operations. No business data or repository TypeScript import is used. Generate a fresh fixture with the final packed candidate so prospective template digests match that candidate.

The old installed public binary was run against the generated fixture with `--dry-run`: exit 1, `Task identity collision synthetic-alpha`, **84 raw paths/modes unchanged**. Proof and stdout/stderr: `/private/tmp/plan2-old-smoke-fixture/old-preview-proof.json`, `old-preview.stdout`, `old-preview.stderr`. This is fresh synthetic pre-fix reproduction, not downstream acceptance.

Main must still complete exact final pack/install binary preview/migrate/replay/rollback/readers proof, full suites and independent review. No full release or business cutover is claimed here.

## Frozen product digests

- `migration2.ts`: `70ae76e4e504a0f60e5753b38a3a7cebb6afcb5b66ef5bfb319378b24165659a`
- `migration2-schema.ts`: `baf5d7f62b4ff6e16a6f32f9e75dc18f41652539ba4da1f0e99244076d1664ee`
- `migrate2.integration.test.ts` before the independent checker's fixture correction: `2084f18e1af9c5805d0d054dc26607f96b3a8a05c69a3d4ff416ed8d2effd97f`. Final reviewed/build candidate: `2ada5d51874741577c14244a2aa08e5c99b5197d42f5dbf5c05b031a086edf94`.
- `/tmp/plan2-installed-fixture.mjs`: `95b0aacdc77b5e0ed6b49067752c6613bfd601279206fc82570e6637c96d429b`

## Limits

Existing ordinary-failure recovery and caller rollback remain; no write-phase transaction or locking guarantee was added. Older closed-schema executors cannot consume `branch_bindings`. Deferred copies remain predecessor records, not additional execution authority. #31 remains independently completed, and no #531 joint acceptance is introduced.

## Subsequent owner evidence

The main owner completed the packed public-binary rehearsal and the independent checker audited it. See `quality-review.md` and `final-verification.md` for final candidate provenance, installed results and whole-suite disposition. Earlier pending statements above describe the implementer's original handoff only.
