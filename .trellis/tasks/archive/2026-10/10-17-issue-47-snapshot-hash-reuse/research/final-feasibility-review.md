# Final feasibility review: Issue 47 public owner

This review is read-only except for this report. It makes no production, Guru, protocol, gate or measurement changes. It starts from the actual failed complete CI cohort rather than assuming that another upstream optimization must exist.

## Question and irreducible constraints

The question is whether a necessary, minimally scoped change in the current Trellis public owner can remove real repeated production work while preserving the full consumer contract and satisfying all retained acceptance requirements.

A1. Every returned candidate must retain its original bytes/path/mode/deletion digest and independent commit/object validation. Removing those checks changes the required answer, rather than making the same computation faster.

A2. Acceptance requires all original 188 checks and all 24 paired checks. A failing retained value cannot become passing through rounding, replacement, a different baseline, a selected retry or an unregistered consumer change.

A3. The public Trellis digest operation does not own the Guru wrapper's interpreter launches, provider queries, terminal-fact fetch policy or history traversal. A change outside that owner must identify the new responsibility and adoption boundary explicitly.

A4. Profile cumulative CPU and independent component wall observations do not constitute additive complete-operation wall attribution. A numerical lower bound or promised gain requires stronger evidence than subtracting those observations.

Success means the same normal wrappers, exact frozen inputs and independent facts pass all accepted checks. A technically plausible cleanup or a faster isolated digest is insufficient.

## Current evidence

The retained CI run is `https://github.com/castbox/Trellis/actions/runs/39011401555`, registration checkout `520b8d8c863845b15c7eec488ccfcbacda21253c`. Its artifact contains `trellis-issue47-ci-results/evaluation.json`, `completed.json` and the six before/after case pairs. The local retained download is `/tmp/trellis47-ci-39011401555-1RjyLDs4/artifact/issue47-ci-520b8d8c863845b15c7eec488ccfcbacda21253c-39011401555/trellis-issue47-ci-results`.

Original checks passed **181/188**. Paired checks passed **22/24**. All seven absolute failures are time checks; no failed body/hash/RSS/oracle check is hidden by this review.

| Failed absolute check | Actual seconds | Frozen maximum seconds |
| --- | ---: | ---: |
| 128 repeated manual median | 0.8002187140000103 | 0.6449902493041009 |
| 128 repeated query2 median | 0.7086789385000003 | 0.5813409617723664 |
| 128 repeated first record | 0.8772779980000109 | 0.8252809686586261 |
| 128 mixed manual median | 0.8153372430000019 | 0.6393437262566294 |
| 128 mixed query2 median | 0.7402350960000064 | 0.5728397875354858 |
| 128 mixed first record | 0.8763055350000002 | 0.8168767245893833 |
| 10001 mixed manual median | 2.273483432500001 | 2.168253252195427 |

For the two failed paired checks, 128 mixed manual changed from 0.8450813749999924 to 0.8153372430000019 seconds; query2 changed from 0.7743191039999999 to 0.7402350960000064 seconds. Both improvements are below the required 5%.

The same CI records demonstrate real upstream improvements. The independent 128 mixed candidate probe changed from 0.09024135800001432 to 0.04526726000000281 seconds. The 10001 mixed complete manual median changed from 5.220020354500036 to 2.273483432500001 seconds; query2 changed from 4.9027674945000115 to 1.9767419849999897 seconds. Those results establish benefits and still do not satisfy the failed checks.

For 128 mixed timed manual, Git process count changed from 11 to 10. For timed query2 it changed from 10 to 8. The actual command reads/hashes 127 unique candidate blobs once in both phases; bodies are 13078996 bytes. This mixed case has essentially unique content, so further blob-content deduplication cannot remove those required raw-content SHA256 computations.

## Assumptions challenged

| Assumption | Evidence/challenge | Constraint | Judgment |
| --- | --- | --- | --- |
| A digest improvement guarantees 5% complete-wrapper improvement. | The complete paired 128 mixed checks failed despite a much faster independent digest observation. | A2, A4 | Reject the guarantee. |
| The upstream owner can absorb all remaining fixed wrapper cost. | Provider and managed-runtime work resides in pinned Guru routines outside `content_ref`. | A3 | Reject that responsibility assumption. |
| A parsed transition kernel fixes the median failures. | Actual profiled idempotent manual and query2 call neither `apply_to_store` nor `apply_operation`. | A2, A4 | Reject as a median/query2 repair. |
| Repeated equal paths allow previous validation conclusions to be reused. | Independent candidates and mutable/fetched availability must still be checked per call. | A1 | Reject cross-input validation reuse. |
| Another larger object batch is automatically a necessary fix. | The 10001 mixed owner currently starts three content batches, but no retained per-batch critical-path attribution proves changing the registered bound closes the time gap. | A2, A4 | A real trade-off exists; necessity/sufficient gain is unproven. |
| The existing blob verifier already supports four terminal commit roles. | It deduplicates OIDs, checks blob type and supports only one optional exact commit with fail-fast errors. | A1, A3 | Reject without an explicit new public contract. |
| Failing these cohorts proves upstream-only success mathematically impossible. | There is no non-overlapping lower bound for all unaffected downstream wall time. | A4 | Reject an impossibility claim; distinguish insufficient evidence from proof. |

## Ground truths and current owner work

GT1. `GitCandidateContent.content_ref` already performs selected literal tree reads, not a whole-tree scan. It validates each path and actual commit before returning a digest.

GT2. The first content batch combines metadata-only exact commit validation with unique blob contents. There is no separate commit-peeling process on a supported modern Git. Cache hits still batch-check requested availability. Closing discards the operation-local facts.

GT3. The 128 first candidate needs one selected tree query and one content batch. There is no remaining per-path Git body read, snapshot reread or per-path duplicate content SHA in that owner.

GT4. A 10001 mixed candidate has 10000 unique blobs. Its owner uses three finite 4096-request body batches and transports each required unique body once. In the retained timed manual record the after wrapper uses 14 Git processes versus before's 13. This is a concrete batching/process trade-off, not a second read of the same blob.

GT5. Actual Mac wrapper profiling found idempotent manual Task parsing 3 times and query2 parsing once. Those calls belong to separate public boundary responsibilities. The write-kernel duplicate-parse path occurs in first recording, not the failing medians. Profile overhead prevents treating its millisecond values as an achievable wall saving.

GT6. Pinned Guru `manual_recovery.terminal_facts` checks `(merge, head, base_head, publication.reviewed_head)` through four sequential `ensure_commit` calls. Each launches `git cat-file -e <sha>^{commit}`; the retained fixture has repeated OIDs across roles. Query2 does not call `terminal_facts`.

These statements are grounded in current `common/delivery_store.py`, `common/git_objects.py`, `research/benchmark/upstream-fixed-cost-diagnostic.{md,json}`, `research/benchmark/128-bottleneck-analysis.{md,json}`, and pinned Guru `f70b64b026725b27d59fed17ed710cc2f831439f`. No Guru working checkout is used as the source authority.

## Minimal alternatives and necessity

GT1–GT3 plus A1 eliminate removing checks, restoring filesystem snapshots, caching validation conclusions or inventing caller-supplied digest facts. They also eliminate repeating previous commit-query/tree-scan corrections: those corrections are already present.

GT4 identifies one genuine remaining cost: additional finite content-batch startups for a large unique candidate. A larger finite count could reduce two starts and temporary-file pairs without rereading or retaining full bodies. However 4096 is the current reviewed explicit design bound; no retained nested timing or resource evidence proves a larger count is necessary or sufficient. It does not affect the failing 128 cases, which already use one batch. Changing that bound merely to obtain a new cohort would not resolve the cross-case feasibility problem. This report does not recommend implementing it as a demonstrated fix.

GT5 excludes a write-kernel refactor as a repair for these medians. Removing the schema's duplicate `nonempty` check and unused session imports remains a small real cleanup opportunity. The existing diagnostic estimates only a small cost and supplies no complete-operation success evidence. Neither justifies a larger lazy-loading framework, public validation-bypass API or another unchanged acceptance attempt.

GT6 identifies an actual normal-production reduction outside the current digest migration: four terminal commit metadata process starts could become one ordered batch. That direction merits a separate explicit contract decision rather than a benchmark shortcut.

## Four-role terminal metadata feasibility

The existing public helpers are not sufficient for a correct drop-in implementation:

- `verify_blob_objects` applies `dict.fromkeys`, requires blob headers and returns no per-request availability facts. Its optional `exact_commit` covers a single control request and raises on the first bad response.
- `read_blob_facts` reads blob contents and reduces them through an observer. Using it for four metadata-only commits would violate its body/type contract or require unsupported behavior.
- `read_tree` returns path entries, not an ordered four-role commit availability result.
- The generic `common.git.run_git` has no stdin batch-request argument. It does not supply the required metadata protocol contract by itself.

A minimal new public capability could read an ordered, bounded list of object/commit metadata facts, preserving one response per input role even when OIDs repeat. It would report typed availability/type/exact returned identity. The original consumer would still validate all four roles independently. Only that consumer would decide which exact missing object to fetch and would recheck after fetch using its existing error and recovery ownership. Protocol/subprocess failures must remain distinct from unavailable objects; callers must not parse exception prose as a missing-object API.

That capability can be coherent with the original Issue's broad objective of eliminating repeated Git work. It would be an **additional public capability and normal-consumer adoption change**, not an already-approved detail of `GitCandidateContent`. Before implementation, the Task's accepted migration/design boundary and independent review must explicitly cover it. The isolated prototype would have to modify the real normal `terminal_facts` route and its error behavior, rather than fill in success facts or merely shrink measured work. Guru production files would remain untouched; downstream production adoption would still be a separate owner action.

Required compatibility work is substantive: retain four role responses, validate exact supplied SHA/type per role, preserve invalid GitHub-data failures, distinguish missing from unreadable/wrong-type objects, preserve exact fetch destinations, and revalidate after fetch. The old `ensure_commit` uses `<sha>^{commit}`; it does not by itself establish raw input object type. The old function also checks fetch exit status without an immediate second `cat-file`; later normal operations supply additional objective checks. A new explicit post-fetch batch recheck and stricter raw-commit check must be specified and reviewed rather than silently described as identical behavior. Batch prevalidation also changes the order in which malformed later roles can be discovered relative to earlier fetches; that ordering needs an explicit decision.

This direction is **statically feasible and removes real process startups**. It has no measured gain promise. Because query2 does not call `terminal_facts`, this change alone cannot establish the missing query2 5% gain. Any history-side change would need its own normal-caller contract and evidence; this report does not silently add one.

## Boundary conclusion and validation

There is no demonstrated necessary change remaining inside the current public digest owner that covers the failed 128 and 10001 checks together. The source already eliminates its identified duplicate body/hash work. The complete frozen gates also contain downstream runtime, provider and history work that this owner cannot change under the current boundary.

That boundary prevents claiming that the upstream digest implementation alone guarantees the complete-wrapper limits. It does **not** prove that no possible upstream-only implementation could ever pass them. The current observations are insufficient for that stronger numerical impossibility statement.

The minimal honest next decision is to keep the failed evidence and explicitly decide whether the original Issue should acquire the additional ordered terminal-metadata public capability and real normal-consumer adaptation. If it remains within the current digest-only continuation contract, no further production change is justified by the retained evidence. Neither branch permits marking existing failures as success, merging/closing on partial results, or claiming Guru adoption.

Validation of this reasoning:

- Traceability: every proposed/rejected direction refers to A1–A4 and GT1–GT6.
- Completeness: digest correctness, all acceptance checks, owner boundaries and attribution limits are covered.
- Honesty: all phases distinguish measured facts, static opportunities and unproved benefits; no new measurement was run.
- Inversion stress test: deleting availability/type checks or moving work outside the observer would improve numbers while violating A1/A2. Both are rejected. A metadata-only four-role adaptation remains possible only while preserving the actual facts and recovery owner.

First-principles phases 0–5 are complete within this report. No Task metadata/manifests were changed because this assignment owns only this research file.
