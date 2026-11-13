# Upstream fixed-cost diagnostic

This is independent diagnostic evidence. Acceptance remains **failed: 183/188 absolute checks and 21/24 paired checks passed**. This diagnostic does not replace a performance sample, alter a gate or justify another unchanged acceptance run.

## Method and source

The diagnostic copied the isolated pinned Guru consumer into a private temporary directory. It used the existing normal 128-path mixed fixture and actual manual recovery / query2 shell wrappers. Original Publication setup completed before current upstream `common` was overlaid through the existing module projection. The first manual invocation recorded a real terminal fact. The next manual invocation exercised idempotent recovery, matching the behavior measured by the acceptance median. Query2 then read that recorded fact through its normal wrapper.

A temporary `sitecustomize.py` enabled `cProfile.Profile(timer=time.process_time)` only in the actual package command Python process. It selected command arguments containing `--root` and `guru-merge-task-delivery`. The profiler did not run in the managed-runtime validation or fixed provider child processes. Its `atexit` handler saved per-function counts and own/cumulative process CPU.

The interpreter was `/opt/homebrew/bin/python3.14`. The provider remained the existing synthetic fixture. This diagnostic made no live GitHub or AI validation claim. It did not invoke an acceptance runner or select a sample by elapsed time.

The original fixture cleanups ran. The existing fixture-source `finally` restored the copied test file. Canonical Guru files, production Trellis files, frozen fixture/protocol files and acceptance results were not changed. Only this Markdown file and its JSON companion are repository outputs of this diagnostic closeout.

## Actual invocation results

All times below are **profile-instrumented cumulative CPU milliseconds**. They include descendant calls and overlap. Do not add columns or interpret them as removable wall time.

| Actual command | Task parser calls / CPU ms | Candidate calls / CPU ms | Relative-path calls / CPU ms | Store/apply calls |
| --- | ---: | ---: | ---: | ---: |
| Idempotent manual recovery | 3 / 37.643 | 18 / 29.321 | 2486 / 24.742 | 0 / 0 |
| Query2 | 1 / 12.316 | 6 / 9.016 | 914 / 8.429 | 0 / 0 |

Manual recovery called `nonempty` 5049 times; query2 called it 1768 times. These counts include ordinary authority and metadata checks as well as candidate paths. They do not authorize sharing successful validation conclusions between inputs.

The three manual Task parses come from two public projection parser calls and one `get_gate_applicability` call. Query2 performs one public projection Task parse. These are distinct public-entry responsibilities. The diagnostic does not show that those entries can safely reuse a previous parse conclusion.

An earlier, separately retained first-record diagnostic called `parse_task_v2` 7 times, `candidate` 38 times and `relative_path` 5119 times. It called `apply_to_store` and `apply_operation` once each and `parse_operation` twice. That is **first-record evidence only**. `manual_recovery.invoke` skips `projection.apply` after a Delivery result exists. Therefore an internal already-parsed transition kernel would not repair the failing idempotent manual median or read-only query2 gates.

## Import graph and bounded opportunities

Both actual command processes initialized `common.active_task`, `common.session_storage`, `common.task_utils` and `common.delivery_session`. Neither process executed their session runtime functions. Profiled `active_task` initialization was 5.361 ms in manual and 5.246 ms in query2. Those cumulative values already include nested `session_storage` initialization of approximately 3 ms; they must not be added.

The source explains the eager dependency: `common.__init__` reexports `active_task`, and `delivery_session` also imports the active-task/session modules at module scope. Changing only one import path would not remove the other. A lazy-import change would need to preserve public reexports such as `resolve_context_key`, function behavior, typing and the existing session lifecycle checks. The observed initialization cost does not establish enough benefit to close the remaining absolute gate gaps.

The schema has a smaller mechanical duplication: `candidate` calls `strings(paths)`, which calls `nonempty` for each path; it then calls `relative_path`, which checks `nonempty` again. A same-module syntax-only helper could remove that second string check after `strings` has already validated the same input. Such a change must retain the original validation/error order and validate every independent candidate. No such change was implemented. Its observed cost is small and does not establish an acceptance improvement.

## Provenance and limits

The JSON companion contains function counts, CPU statistics, parser callers, initialization statistics and source checksums. It includes no `.prof` binary or full environment dump.

Raw temporary evidence remains at:

- `/var/folders/rd/kbzpxp956nb3p_h04vnfg3l80000gn/T/trellis47-schema-owner-diag-y7nz4gj1`: idempotent manual and query2 profiles.
- `/var/folders/rd/kbzpxp956nb3p_h04vnfg3l80000gn/T/trellis47-schema-owner-diag-kravznfv`: first-record and query2 profiles.

Upstream checksums were captured **after** the diagnostic. Every listed current source file matches the retained `after-runtime-source-checksums.json`. This establishes consistency with the frozen source generation. It is not a contemporaneous before-import checksum; the temporary fixture's installed `common` was removed by cleanup. Runner and retained isolated consumer checksums are also recorded.

There was one independent observation per operation. The profiler adds substantial Python callback overhead: its complete command process CPU was approximately 304.871 ms for idempotent manual and 269.446 ms for query2. These values are not comparable to the unprofiled command CPU snapshot or the acceptance wall measurements. `time.process_time` excludes child-process CPU. Cumulative rows overlap. No gain estimate is derived by subtracting these values from wrapper wall time.

The earlier standalone import-time and repeated pure-parser probes motivated this actual-wrapper diagnostic. They do not prove complete-operation performance.

## Decision

Do not implement an already-parsed write kernel as a fix for the failing median/query2 gates. Those paths do not call it. The duplicated string check and unused eager imports are real cleanup opportunities, but this diagnostic does not establish that either would satisfy the remaining frozen gates. Do not use them to obtain a retry of unchanged acceptance samples or expand into a lazy-loading framework.

Keep the current failed acceptance evidence and Task state. No production change, merge, Issue closure or downstream adoption success is established by this diagnostic.
