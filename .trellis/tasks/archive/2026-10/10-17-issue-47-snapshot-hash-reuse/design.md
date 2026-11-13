# Design

## Boundary and owner

Add GitCandidateContent(root: Path, *, no_lazy_fetch: bool = False) to common/delivery_store.py, the existing public digest owner. Provide context-manager lifecycle, close(), and content_ref(exact_commit: str, paths: list[str]) -> str. Fix and resolve root for the context. Accept only a full actual commit OID, respecting the repository SHA1/SHA256 width. Reject refs, abbreviations and tag/blob objects.

Keep candidate_content_ref(root, paths, kind) compatible. Ordinary Path values remain mutable. Never infer immutability from their origin or inode.

## Facts and validation

Every input validates nonempty unique relative paths, private/reserved exclusions, exact commit identity, literal tree entries, regular-file mode/type and blob availability. Missing entries use the existing deletion tuple. Caller expected-result comparisons remain independent.

Use existing git_objects bounded helpers. Cache only reduced immutable content facts and optionally identical aggregate serialization within this actual-root operation. Read/hash new blobs once. Check availability/type for cached blobs. Use the original serialization algorithm; prefer a small internal shared routine over a second digest algorithm. Do not broaden unrelated verifier behavior.

Sanitize inherited GIT_* variables. Apply explicit GIT_NO_LAZY_FETCH=1 when requested. Support bare scratch repositories. Closing clears facts and prevents later use. Temporary batch files close on errors. Metadata may scale with path/blob count; whole content batches must not remain resident.

## Consumer migration

The installed Python module exposes the additive class. Existing API 1.0 shapes remain compatible. A capability check may select the class; old fallback is compatible but cannot count as optimized evidence.

An isolated pinned Guru prototype replaces snapshot + filesystem digest in manual_recovery.commit_candidate with the public reader. Standalone recovery owns its context. HistoryContext owns one reader per query, closing/recreating it when prepare switches to scratch. Pass no_lazy_fetch=True and preserve preparation/probe behavior, candidate shape and independent fact comparisons. Do not change production Guru files.

## Files and evidence

- Canonical packages/cli/src/templates/trellis/scripts/common/delivery_store.py and byte-identical dogfood: public capability.
- Canonical/dogfood common/git_objects.py: allow an explicit finite request batch size; retain the original128 default for all existing callers. The new public context uses4096 to avoid process startup dominating unique-content history calls. Body streaming and temporary-file spooling remain unchanged.
- packages/cli/test/scripts/git-objects.integration.test.ts or focused adjacent suite: public semantics and old regressions.
- .trellis/spec/cli/backend/delivery-lifecycle.md: capability/lifecycle contract.
- Task research: pinned sources, isolated adaptation, frozen performance and installation/delivery evidence.
- Paired package version/lock metadata: new unused castbox prerelease; never move .3.

Baseline main is 0e3b23a3045357b76e69ca91e84b97b294dfb147. Hold production edits until before samples and numeric gates are frozen. Fix Git author/committer metadata, source refs, warmup and repetition conditions. Distinguish prototype adoption from downstream integration. Rollback selects previous source/packages; published bytes and archived evidence remain immutable.

## Same-scope measured correction

The first after generation failed6 of188 checks, all timing gates; exact inputs, digests, body/hash counters and RSS passed. The public context made a redundant type query before an exact commit peel/equality check. Its inherited128 request batching also created79 body processes for10000 unique blobs, while the previous pinned consumer used one finite spooled batch. Remove the redundant new-context query and allow a fixed4096 batch for that context. Preserve existing128 defaults, old local_commit checks and frozen performance thresholds. Retain all failed samples. This extends the planned file boundary only to the existing shared object helper and its dogfood twin.

The second generation passed185/188 gates, including all10001-path gates. Three128-path timing gates still failed by3–18 ms. Valid bytecode caches were confirmed outside timing. The third generation combines exact commit validation with the first existing finite cat-file batch instead of running a separate rev-parse process. An optional commit control request must precede blob bodies and verify the exact returned OID and commit type. Stream or skip its body with bounded reads; do not hash it as candidate content. Cached/deletion-only candidates use the metadata batch equivalent. Keep the total request batch bound4096, preserve original helper defaults and all older callers, and report commit control traffic separately from candidate blob traffic. Every input still validates actual commit identity before returning a digest. Frozen standards remain unchanged.

Before measuring generation3, the baseline owner identified that transferring a commit control body would exceed the frozen all-body-byte gate. Do not reinterpret or relax that gate. Use metadata-only `info <commit>` and `contents <blob>` requests in cat-file --batch-command for the optional exact-commit assertion. Cached/deletion calls continue using --batch-check. Older Git that explicitly rejects --batch-command falls back to a separate metadata commit assertion followed by the original body protocol; this keeps functional compatibility without a feature-probe process on current Git. Other failures retain their original error. Add protocol accounting to the separate after instrumentation while retaining frozen files and reporting every body byte. No timed generation3 sample may use commit-body transport.

## Selected tree metadata

The preregistered paired replication passed24/24 stronger relative checks and187/188 original absolute checks. Its only failure exceeded the128 mixed manual ceiling by136.232 microseconds; no tolerance or rounding is accepted. A separate source review identified remaining unnecessary work: the new context scans the whole repository tree, while its supported previous consumer queried only selected candidate paths. Correct this actual metadata regression before delivery. Extend the existing read_tree helper with optional literal selected paths and a64KiB argument budget; default calls/scope retain their exact behavior. The new context passes its independently validated ordered paths. Preserve directory entries so selected directories still fail type checks. Test literal magic-looking/UTF-8/control-character paths and bounded broad selection. Keep all numerical gates and the paired protocol, and preregister the changed measured source before the next complete cohort.

Independent review caught a selected-parent correctness defect before measurements: nonrecursive ls-tree without -t can omit a requested directory when a descendant is also selected. The selected branch must use -t without -r and filter returned rows to the exact requested set. This keeps actual requested directory types available for rejection while excluding unrelated ancestors/descendants from retained facts. Mixed parent+descendant tests and an independent actual-public-class reproduction are required before releasing the next cohort. Default and scope calls remain unchanged.

## Controlled Ubuntu replication

The latest Mac cohort remains FAIL (183/188 original and 21/24 paired). Further
actual-wrapper diagnostics found no asymmetric interpreter/cache error and no
evidence supporting a necessary upstream rewrite. Do not make unrelated changes
merely to obtain another timing attempt. The independent contract review in
`research/runner-contract-review.md` confirms that the accepted scope does not
lock performance evidence to the original Mac hardware.

Preregister one complete replication on an isolated standard GitHub-hosted
`ubuntu-24.04` job. Use Python 3.14.8, the declared runner image and Git version,
the original six exact fixtures and unchanged production source. All original
188 numerical checks and 24 same-runner paired checks remain mandatory. The new
control-before may prove paired improvement; it must never redefine absolute
caps. A faster host alone does not prove an implementation gain.

New `research/benchmark/ci_*` tools adapt only environment setup, Linux RSS units,
raw metric completeness and output placement. Recompile all 84 original pyc
inputs from pinned source bytes, original source mtime and original resolved
paths, and reject any mismatching blob or full commit OID. Build Task/Gate/
Publication facts through the original workflow. Overlay the after runtime only
after normal Publication. Set repo-local maintenance controls immediately after
each fixture Git init, before any commit, equally in both phases. This isolates
background maintenance without changing Git trees or lifecycle facts.

The temporary PR-50-only workflow has read-only repository permissions and never
publishes packages. A registration job admits only a manifest changed at the
current commit whose parent matches its preregistered parent. Later evidence
commits skip the benchmark. Reject workflow retries and existing cohort outputs;
retain every technical failure and raw metric artifact. Do not search multiple
runners or keep only fast samples. Review the protocol and tools before commit
and timing. Remove the temporary workflow during final Task closeout.

Report any pass specifically for the declared Ubuntu runner. Preserve all Mac
failures and the live-provider/downstream-adoption boundaries. A valid complete
pass can satisfy the performance gate; merge, immutable paired delivery and
downloaded reinstall verification remain separate required steps.


## User-approved acceptance revision (current)

The 2026-10-17 user instruction replaces the earlier hard timing/percentage acceptance policy with evidence-based performance assessment. research/acceptance-revision.md is the current acceptance explanation. Preserve every original numerical result and failed review. Do not change the production design to chase an estimated threshold or claim the old gates passed. Keep digest compatibility, per-input checks, operation-local fact reuse, bounded requests/body memory, original resource checks, old capability regression and exact installable delivery. Independent review must assess small-case variation and large-case gains from all retained same-environment data. No new benchmark run is needed for this requirements-only revision.
