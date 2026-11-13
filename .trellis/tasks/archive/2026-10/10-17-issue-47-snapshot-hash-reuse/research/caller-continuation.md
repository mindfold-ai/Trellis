# Research: public historical candidate caller and continuation

- Query: Identify supported Guru PR recovery/query2 callers, additive upstream immutable digest API migration, complete-operation fixtures, and native archived Task continuation.
- Scope: internal; current upstream source plus pinned Guru source f70b64b026725b27d59fed17ed710cc2f831439f.
- Date: 2026-10-17

## Findings

### Files found and caller evidence

Guru paths below are relative to `/Users/wumengye/Documents/GoProjects/guru-trellis`, read with `git show f70b64b026725b27d59fed17ed710cc2f831439f:<path>`; current Guru working files are not the adopted authority.

- `trellis/skills/guru-team/packages/guru-merge-task-delivery/runtime/invoke.py`: normal public profile dispatch; `delivery_merged_recovery` calls `manual_recovery.invoke`, with both `--input` and `--review-input`.
- `.../runtime/manual_recovery.py:58`: shared `commit_candidate`; owns temporary snapshot, calls `objects.snapshot(actual_head, paths, snapshot)` then installed public `candidate_content_ref(snapshot, paths, "git")` at lines 67–70. Standalone recovery creates one local `CandidateObjects(source)` context at lines 63–66.
- `.../runtime/history.py:89`: call-local `HistoryContext`. `fetch` (110–138) creates isolated bare Git root, closes existing object context before switching roots; never fetches into caller common-dir. `prepare` (140–150) retries after fetching exact required history into scratch. `candidate` (155–161) creates `CandidateObjects(root, no_lazy_fetch=True)` and verifies preparation. `discover` (448–461) prepares each fact and passes `git_root=context.root, objects=context.objects` into the same `commit_candidate`, then compares full actual candidate to each recorded fact independently.
- `.../runtime/candidate_objects.py:24`: context is one actual resolved root, with optional no-lazy-fetch environment. `read` resolves input ref on every entry (48–52), caches `(commit,path)` only within this object. `snapshot` (101–113) copies body per selected file and writes exact Git executable mode. These newly written files are mutable filesystem paths; their origin in a Git tree does not make ordinary `Path` inputs immutable authority.
- `.../scripts/discover-task-deliveries.sh`: actual public history shell wrapper routes through runtime launch.sh.
- `trellis/skills/guru-team/runtime/delivery_projection/adapter.py:251`: normal mutable candidate API; public digest call at 260 must retain current independent observation semantics. Do not redirect all candidate construction to historical Git hashing.
- Upstream `.trellis/scripts/common/delivery_store.py:106`: existing public path digest API; 111–150 validate paths, sort entries, encode deletions as `[path,null,null]`, and encode Git execute mode as decimal 493/420. Its private `_ContentObservation` is explicitly normal-local-commit scoped and is not the consumer contract.
- Upstream `.trellis/scripts/common/git_objects.py`: reusable bounded Git tree/blob reader; unique blob batching, 128-request batches, 64 KiB reads and temp-file spooling. `verify_blob_objects` preserves object availability checks even for reused hashes.

### Smallest additive public contract and migration

Recommended public owner shape (names are illustrative): context manager `GitCandidateContent(root, *, no_lazy_fetch=False)` with `content_ref(exact_commit, paths) -> str`. An equivalent one-shot public function is sufficient to eliminate path-count hashing; context additionally enables reuse across multiple facts in one query. Root belongs to context and cannot be rebound. Accept full actual commit OID only, reject symbolic refs/abbreviations/tag object OIDs. Keep old `candidate_content_ref(root, paths, kind)` unchanged.

The upstream owner validates each input list independently, resolves every requested path/tree mode/deletion independently, and checks every requested object is available/type-correct even on cached digest hits. Cache only SHA256 by immutable blob OID in this actual repository context. Recompute or independently validate aggregate input every call; never let cached aggregate bypass validation. No injected digest callback, private observation, inode trust, persistent state or caller-supplied blob map.

Migration in Guru: replace snapshot materialization and public filesystem digest at manual_recovery.py:67–70 with installed public Git digest for actual source + actual_head + paths. Preserve returned candidate shape, actual head, base and path set. For standalone recovery, own/close context in commit_candidate; for query2, own it at HistoryContext scope and close/recreate alongside CandidateObjects whenever fetch switches root. Invoke the new API with `no_lazy_fetch=True` under HistoryContext so upstream environment cleaning does not silently discard preparation policy. Preserve `context.candidate`/`prepare` or an equivalent preparation probe before digest; if digest itself fails because of incomplete history, return through the existing preparation owner and isolated root rather than fetching in upstream owner. Old upstream API can remain the compatibility fallback; fallback cannot count as optimized delivery proof.

### Complete public-operation fixtures

- `.../tests/test_manual_recovery.py:17` `ManualRecoveryTests.setUp`: imports actual `guru-check-task/tests/test_delivery_flow.py::DeliveryFlow`; sets profile `pull_request`, does real readiness/check/review fixtures, records publication, constructs a real Git merge, installs fake gh executable. `invoke` (94–96) runs actual `invoke.sh` wrapper, not merely commit_candidate. Provider and semantic judgments remain fixture evidence, not live GitHub proof.
- `.../tests/test_manual_recovery.py:154` public query2 after recovery; wrapper `discover-task-deliveries.sh`, schema 2/task identity/repo/base/task_ref. Existing Git trace shim at real executable boundary demonstrates how to count the complete subprocess operation without production hooks.
- `.../tests/test_history_public.py:21` `PublicHistoryTests`: composes ManualRecoveryTests, records recovery through wrapper, then calls actual query wrapper at 31–33. Includes restored-session clone with missing merge, scratch preparation, unchanged original Task bytes, and original repo missing-object preservation.
- `.../tests/test_delivery_flow.py:26`: fixture requires `TRELLIS_DELIVERY_API_COMMON` explicitly; absence causes skip, not pass. Optional `GURU_DELIVERY_TEST_INSTALLATION` enables a complete installation and preset application. Lines 53–54 copy selected upstream public common into fixture. Lines 55–104 create valid schema-2 Task, public Delivery, accepted plan and current candidate via actual projection. `wrapper` at 116–122 invokes Bash launch process and checks JSON/exit.

For repeated-path before measurements, extend fixture's input candidate generation before public checks/publication: create N files with one repeated body and set paths during begin_check. Do not replace candidate on already-frozen result facts. Build count variants 3/30, 100/1000/10000 and realistic repeated blob sizes; include executable duplicate content, deletion and empty content. Measure whole public recovery and query2 independently as well as inner digest, under identical fixtures/pinned sources. SHA counters need a child-process instrumentation shim (e.g. temporary sitecustomize) because wrappers spawn Python; test-process patch alone misses work. Do not claim a local_commit benchmark proves these PR paths.

### Related specs and continuation

- `.trellis/spec/cli/backend/delivery-lifecycle.md:304`: existing operation-local immutable content-observation contract; preserves digest format, independent mutable inputs, repository context and cleanup, no cross-invocation cache.
- `.trellis/spec/cli/backend/task-lifecycle.md`: immutable TaskId/generation, archive/session semantics; original archived records remain reserved historical evidence.
- `.trellis/spec/cli/backend/trellis-core-sdk.md`: keep public contracts additive and typed; do not require private imports.
- `.agents/skills/python-design/SKILL.md`: deep module and typed interface boundary support upstream-owned context rather than downstream hash algorithm copies.
- `.trellis/scripts/task.py:739` exposes archive and list-archive but no native unarchive/reopen command; `.trellis/workflow.md` lifecycle command list likewise has no supported native reopen operation. A related continuation Task for the same Issue residual is appropriate; preserve archived original Task unchanged and explicitly retain prior #48 delivered scope. This does not imply Guru's separate schema-2 reactivation API is absent.

## Caveats / Not Found

- Research made no downstream or production changes and did not run benchmarks; numeric budgets must be frozen from the separate fresh before evidence.
- API names above are design guidance, not a claim of already-shipped public capability.
- The original Git no-lazy-fetch boundary is explicit Guru policy. A new upstream function that sanitizes all GIT_* variables without a public no_lazy_fetch option would weaken query2 behavior.
- No relevant memory evidence was used; source facts above were freshly inspected.
