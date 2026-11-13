# Matching Guru #531 candidate handoff

This reviewed handoff was sent to the existing Guru #531 chat on 2026-10-12
after the human explicitly authorized candidate delivery and controlled-copy
matching validation. Thread: `01a12f44-4042-7780-bfa5-dc0bb53746a7` (local),
title `推进 Issue #531 Delivery 解耦`. This upstream session did not write Guru
source or lifecycle results. Remote/business/publication authorization is not
expanded by the handoff.

The new upstream interface/migration candidate is locally built, packed and
installed. It is HEAD `a85ce75cf6ab52bafce7bcc9c4b6118ce911a0d2` plus the explicitly
fingerprinted uncommitted increment; the HEAD alone does not identify the package.

- Candidate: `/tmp/trellis31-goal-candidate-slmnvfq2/candidate.json`.
- Source fingerprint: `077bb02966156b10f5d7477fedd9d6f8c2953dcd113434cf2ff48393307f2c25`.
- API 1.0 / Task schema 2.0 / package version 0.7.0-castbox.3.
- CLI tar: `/tmp/trellis31-goal-candidate-slmnvfq2/mindfoldhq-trellis-0.7.0-castbox.3.tgz`,
  SHA `d09b905a539a0f695d2d2d603eeb20fdd925e98d81f710f04af754fed013e20d`.
- Core tar: `/tmp/trellis31-goal-candidate-slmnvfq2/mindfoldhq-trellis-core-0.7.0-castbox.3.tgz`,
  SHA `45bbfee507ed4964649610f703a90ba01c5f5cea21fb95d0845f92ed45302967`.
- Actual installed CLI:
  `/tmp/trellis31-goal-candidate-slmnvfq2/installed/node_modules/@mindfoldhq/trellis/bin/trellis.js`.
- Public exports include `/task/v2`, `/task/legacy-migration` and `/task/migration-v2`.
- Plan 2.0 explicitly requires `workflows[].template_id`; custom workflow
  ownership removes the workflow receipt key, and native ownership verifies the
  exact rendered bundled bytes. Custom user content is retained by ordinary and
  forced reapply. Read the candidate's commands-migrate spec before preparing a
  new plan; never re-freeze a plan that failed stale-source validation.

The old pinned B05 extractor failure is repaired in this candidate. Actual
installed continuation runs in native, migrated-native and migrated-custom
controlled projects. These facts do not retroactively make the old package pass.

Actual upstream checks: Core 475 PASS / one optional SQLite SKIP; CLI full 2103
PASS; package lint/typecheck/Python check and template parity pass. Two tarballs
were installed with exact 983-file byte comparison. Controlled actual old
installation samples prove dry-run/stale-source zero writes, same-plan replay,
third-state refusal, caller-owned exact preview rollback, schema/session cutover,
history permissions, business metadata, Codex model/reasoning customization and
ordinary reapply. Installed custom workflow retains its actual declared owner.

Evidence:

- `/tmp/trellis31-packed-migration-evidence-xqtpc9j7/result.json` and its original
  `reviewed-plan.json`/raw source snapshot/invocations.
- `/tmp/trellis31-packed-custom-evidence-u43lcoat/result.json` and its explicit
  custom plan/default-update/forced-update/runtime-contract observations.
- `/tmp/trellis31-packed-platform-result-v2.json`: registry-derived 22-platform
  actual asset installation/reapply and shared query validation, not external
  host AI execution or the full release matrix.
- Native semantic execution and its final whole-range independent review are
  complete; no new native defect was found. Inputs:
  `/tmp/trellis-31-native-owner-HDwXIv/native-final-review-inputs.json`.
  The Git-free Task has two actual manual Deliveries, one wholly withdrawn
  stopped slice, separate generation-0 Completion/Closure, real cleanup failure,
  two relocations and archive/reopen into generation 1, then validation-only
  Completion without a new Delivery or generation-1 Closure. The local-Git Task
  proves clean integrated full-range review and original-producer historical
  commit recovery without new commits or refreshed gates; it has no Task
  Completion. Original stages used source `85c2ec91`; unchanged native
  runtime/templates/Core and actual final `077bb029` reapply/history resolution
  are documented by each sample's `final-package-transition.json`. Do not relabel
  old invocations as new-package runs or the local-Git Task as complete.
- Independent migration/package review:
  `/tmp/trellis31-v5-migration-independent-review.json` (no new findings,
  migration regression 46/46 and independent custom probes 8/8). This is a scoped
  result, not a complete clean round or consumer readiness authorization.

Guru's original owner should freshly inspect its exact current Task/worktree,
accepted plan and current workflow continuation, then consume this package in
controlled installation copies under its own authority. It owns private
cycle/transaction/history migration and the #149/#444/#155 semantic installed
scenarios. Actual remote Publish/Merge success needs its own precise
authorization and observations; upstream local historical recovery and mocked
provider responses cannot prove those remote events.

One observed consumer gap remains for Guru's owner to assess:
`trellis/skills/guru-team/runtime/delivery_projection/adapter.py` candidate(kind)
does not pass the explicit kind into upstream candidate_content_ref. A git_free
candidate inside a Git checkout can therefore use Git modes unexpectedly. This
repository did not alter Guru or record its gate. Reuse the public helper and
test the actual accepted profile under Guru's reviewed scope.

Return actual evidence pinned to this exact upstream source/tar/API/schema plus
a frozen Guru candidate. The sole Guru test authority still binds `ce36314b`;
its current source/installed results are meaningful but not this matching pair.
Default upstream retirement remains pending actual consumer readiness, not the
Issue CLOSED state. Interface delivery, native acceptance, paired acceptance and
software release stay separate.
