# Issue 64 — Compact legacy formal archive reactivation

## Goal and authority
Complete https://github.com/castbox/Trellis/issues/64 from origin/main at 3c37c75897f530c3ae8c5c4d85f6c1f3455b2e5f. Deliver public formal generation-incrementing recovery for the positively recognized legacy archive family, preserving raw history and existing operation semantics. The user authorizes planning, preferred implementation decisions, repository/Issue operations and uninterrupted completion.

## Requirements
- R1: Exact archive inspection exposes the supported public family, record TaskId and predecessor generation without current-reader normalization. Only positively recognized legacy records receive generation 0. Keep current Task readers strict.
- R2: Formally completed supported legacy archives use the existing formal operation, keep TaskId and increment once to 1. Preserve every original archive byte, scope, mode and resource. Caller supplies a complete source projection consistent with the canonical historical Issue scope; caller retains semantic disposition and qualification authority.
- R3: Keep prepare/preview write-free and pending distinct from applied. Reuse the original operation after partial writes or lost output, returning its real successor without another increment. Public receiptless inspection verifies accessible active and subsequently archived successors.
- R4: TS relocation, shipped/dogfood Python retained-predecessor reads and public successor discovery share family/generation/source interpretation. A retained predecessor must not cause duplicate identity on valid successor relocation/archive. Do not generalize this to all readers.
- R5: Reject source, locator, key and provenance mismatches with concrete diagnostics and no mutation. Preserve schema1 formal recovery, schema2 native reopen, generation-preserving manual archive_resume, pending recovery and existing gate/history boundaries.
- R6: Deliver a reviewable/installable matching fixed CLI/Core source/build/API candidate, capability and contract documentation with targeted real public execution evidence.

## Acceptance criteria
- AC1 (R1/R2): A fixed desensitized ten-field legacy fixture contains id/name/title/status/branch/base_branch/creator/assignee/scope/completedAt, and lacks schema_version/generation/structured source. Exact public inspection identifies generation 0; actual formal execution creates the same ID at generation 1 and caller-approved structured source; original archive remains byte-identical.
- AC2 (R3): Public prepare/preview, pending, applied lost-result recovery and resume retain one operation and one successor. Receiptless inspection verifies its relationship, both active and archived, without private caller state.
- AC3 (R4): Representative valid completion/archive of the successor exercises actual TS/Python identity/relocation consumers and the next original-archive public inspection. A second conversion is unnecessary.
- AC4 (R5): Ordinary source/locator/key/provenance errors preserve archive and unrelated Tasks. Targeted existing schema1/schema2/manual-resume/pending regressions pass, with shipped/dogfood parity.
- AC5 (R6): Public capability agrees with execution/consumer support. Build and pack the matching pair, install in an isolated prefix, exercise built public entrypoints and record exact source/build digests, API and reproducible installation instructions.

## Exclusions
Guru historical Finish/PR qualification, actual business scope or source ownership decisions, Guru reader/binding/continuation routing, target installation and joint acceptance remain in Guru #712. No real business archive mutation, broad conversion, personnel identity restoration, adversarial/concurrency/crash-consistency expansion, npm publication, official version release or unrelated platform matrix.

## Decisions
No unresolved product choices. Use the preferred minimal extension to existing public operations. Historical status is necessary but never proves semantic completion, source closure authority or current gates.
