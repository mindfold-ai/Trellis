# Independent complete-range D1 source review after rework

Review carrier: `/root/committed_review`, `trellis-check delivery_review`, read-only.
Scope: base `5c760463680ffc10a3f26957b330c57a4b0c3ff8` through committed
`1f479eaf65c1ce661d7aa69d1b68affc6eeb2c92`, plus the complete current source
increment. This is not a review bound to a second commit, nor a native formal gate.

## Original findings and closure

| Finding | Severity | Correction / independently checked behavior |
| --- | --- | --- |
| Second publication rejected after same-Delivery rework | P1 | Undelivered current slot refresh retains repo/PR/original producer; normal fresh gates and historical actual-success recovery both work, with verified target changes. |
| No-session schema-3 hook fell back to Task root | P2 | Strict v2 failure stops injection; explicit legacy classification preserves established fallback. |
| Actual Droid carriers lacked selection/read-only guards | P2 | Real droids collector files have exact Delivery and independent read-only Review rules; registry regression inspects actual carrier content. |
| Three specs declared invocation workflow authority | P2 | All now require validated Task workspace workflow; invalid binding fails closed. |

No remaining actionable D1 finding was reported. The reviewer independently
executed Python 3.9 read-only publication fixture probes: publication-rework
30 steps and publication-history-recovery 11 steps passed. New publication
facts cannot mutate delivered history; recovery of an empty terminal slot must
match terminal repo/PR/head/target/candidate. Historical P2 restores actual
facts without creating missing gate passes or repeating remote publication.

The reviewer read final Check evidence: Core 442 PASS / 1 existing SQLite
capability SKIP, CLI 1928 PASS, lint/typecheck/build PASS, Pyright 0 errors /
48 existing warnings, and 70 installed/context targeted tests PASS.

Conclusion: complete D1 source candidate passes independent Review. The carrier
performed no self-fix, result/lifecycle writes or dispatch. This does not prove
Guru installed integration, remote Delivery, release qualification, D2 cutover
or whole-Task Completion. Newly installed controlled samples require their own
actual Review; prior samples are not rebound to this source increment.
