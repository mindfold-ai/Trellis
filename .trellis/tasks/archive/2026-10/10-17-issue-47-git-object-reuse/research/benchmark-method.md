# Issue 47 benchmark method

The harness runs the original shipped public `task.py` and `delivery.py` entry points, with `runpy.run_path(..., run_name="__main__")` in a fresh Python process per invocation. No production method is substituted. Instrumentation wraps subprocess measurement and SHA256 accounting only. It requires POSIX `wait4`; this is a local performance experiment, not a cross-platform runtime dependency.

## Frozen inputs and scheduling

- Baseline source: `b0d87f952043058e21001a002b661bf2db56b1fa`, extracted with `git archive`.
- After source: a copied snapshot of the working-tree canonical script template directory, taken before the run starts.
- Python executable, version, platform and Git version are captured in each report. Dependencies are the Python standard library and local Git. Repositories have no remotes and no GitHub calls; network wait is zero.
- Deterministic integer-generated paths and bytes; no random seed or external data. All candidate files are mode `0644`.
- Task scales: 2 heads/24 retained historical Task paths; 6 heads/96 paths. Different heads share the metadata blobs. Historical JSON records derive from the Core-owned native schema-2 fixture, with distinct Task identities.
- Delivery scales: 128 and 10,001 paths. Each scale covers repeated bytes, distinct bytes, and a larger-object mix. In the larger mix every thousandth file is exactly 4 MiB; remaining files have distinct small contents. Repeated small files contain 1,088 bytes; distinct small files contain 1,024 bytes.
- One warmup lifecycle and two timed lifecycles per scenario. Raw warmup samples are retained with `warmup: true`, but excluded from summaries and acceptance medians. Each repetition has a fresh CLI process and its own Task; content and Git history remain identical.
- Task and 128-path Delivery scenarios run sequentially. The three 10,001-path scenarios run concurrently as one fixed three-worker cohort for both passes. Each cohort worker runs its warmup and two timed lifecycles in order. No unrelated test/build workloads should run during either cohort. No cache flush is attempted; OS caches remain warm.
- Early interrupted runs during harness development were discarded. The before report contains the completed sequential scenarios followed by the completed fixed large cohort.

`frozen-benchmark-contract.json` pins the harness hash, repetitions, scheduling, ratio policy and resource ceilings before the large baseline cohort completed. Numeric per-scenario ceilings are materialized from the completed baseline before production implementation starts; they cannot be changed using after results.

## Public operations

Task measurement is one complete successful `task.py create --no-start` operation, including uniqueness checks across retained heads and its final write. New untracked Task artifacts are removed between repetitions, without changing Git inputs.

Delivery setup uses the public Task creator and public `accept_scope`, `create_delivery`, and planning operations. Measurements report `candidate`, `begin_check`, `record_gate` for check/full-review/readiness, `record_delivery`, and an exact `record_delivery` retry separately. The candidate points at the real local commit. All gates are genuinely recorded before delivery; the primary record operation successfully verifies the commit and records its fact. The retry asserts `changed == false` and byte-identical `task.json`, modeling recovery when the caller has lost the first successful stdout. The seven-operation subtotal includes those measured operations only; scope/planning preparation is excluded and is not claimed as a complete Task lifecycle.

Each invocation owns its cache lifetime. Summing measurements across invocations does not imply cache reuse between them. The primary optimization acceptance applies to `task_create` and `record_delivery`; other operations have a separately fixed regression ceiling.

## Measurement definitions

- `complete_elapsed_seconds`: wall time from starting the instrumented Python CLI subprocess through collecting its stdout/stderr and exit result. This includes interpreter/wrapper startup and the complete original public operation.
- `elapsed_seconds`: the original entry execution inside that process. Components are inclusive outermost times for filesystem candidate digest, immutable commit read/digest, authority verification and Task owner execution. The residual covers other objective checks, parsing, writes and wrapper work. Git time overlaps owner components and must not be added to them.
- Every Git subprocess launched through `subprocess.run` is counted by actual subcommand, including fixed rev-parse, worktree and cat-file type checks. There are no direct Git `Popen` calls in the measured source or planned implementation; adding one would require updating the measurement contract before comparison.
- `requested_object_reads`: successful blob-body reads (`show`, or framed `cat-file --batch` results). Fixed metadata/type/existence checks are visible separately in Git command counts, and are not represented as blob-body reads.
- `unique_git_blob_contents_read`: distinct contents actually observed in successful Git blob-body outputs; it is not inferred from the fixture. `unique_blobs` is the separately labeled fixture input cardinality.
- `git_blob_read_bytes` and `git_max_object_bytes`: actual blob body bytes and largest observed blob body. Framing/tree metadata output is excluded. `logical_candidate_bytes` records the separate path-weighted input byte count.
- `sha256_calls` and `sha256_input_bytes`: all SHA256 constructions and bytes passed initially or through `update()` during the original operation. Instrumentation's own output-content observations use the saved original hash implementation and do not inflate these counters.
- `observation_seconds`: additional framed-output inspection after `cat-file` completes. Raw elapsed measurements include this observer cost, so acceptance conservatively includes it. The overhead is separately exposed.
- `python_peak_rss_bytes`: peak RSS for the individual instrumented Python CLI process, from `getrusage(RUSAGE_SELF)`.
- `git_peak_rss_bytes`: maximum of the individual Git child peaks collected when reaping each child with `wait4`. This is **not** simultaneous process-group memory, nor a sum. Darwin reports `ru_maxrss` in bytes; Linux reports KiB, converted by 1024. Reports use bytes uniformly.

## Reproduction

From the repository root:

```sh
python3 .trellis/tasks/10-17-issue-47-git-object-reuse/research/benchmark.py --source b0d87f952043058e21001a002b661bf2db56b1fa --output /tmp/issue47-before.json
python3 .trellis/tasks/10-17-issue-47-git-object-reuse/research/benchmark.py --source working-tree --output /tmp/issue47-after.json
python3 .trellis/tasks/10-17-issue-47-git-object-reuse/research/summarize.py /tmp/issue47-before.json --output /tmp/issue47-before-summary.json
```

`--only large --resume` continues an output containing the completed sequential baseline scenarios with the same fixed three-worker large cohort. It does not include an incomplete earlier large run.

## Additional functional probe

`historical_probe.py` is deliberately separate from the frozen comparative harness. After implementation it exercises `delivery.py record-delivery` with `historical_success: true` on 10,001 paths in two variants: repeated small content plus one 4 MiB blob, and distinct content plus one 4 MiB blob. It moves HEAD and changes index/worktree after capturing the candidate, so the verifier must read the retained immutable commit through its actual batch-object path. It asserts successful historical recording, exact retry without another fact/write, observed unique body reads, bounded process counts and the same individual RSS limits. No before/after speed claim is made for this extra probe.

```sh
python3 .trellis/tasks/10-17-issue-47-git-object-reuse/research/historical_probe.py /tmp/issue47-historical-probes.json
```

Raw samples name all three gate invocations `record_gate`; the summarizer and evaluator distinguish check, full review and readiness by their fixed invocation order within each scenario/repetition. Thus each reported gate row has exactly two timed samples rather than mixing three gate stages into one median.

## Task decomposition companion

`task_components.py` is a separately frozen copy of the comparative harness with instrumentation-only additions. It runs only the two Task fixtures, sequentially, after the main cohort has ended. Its wrapper records wall time by Git subcommand and the time/count of `json.loads` calls whose immediate caller is `task_store.py`. The measured object-read component is the sum of `show`, `ls-tree`, and `cat-file` command time; metadata parsing is the direct owner JSON parse time. The remaining complete CLI wall time is reported separately as other objective work and wrapper/startup. These components are disjoint; main Task performance acceptance still uses the original frozen benchmark's complete total.

```sh
python3 .trellis/tasks/10-17-issue-47-git-object-reuse/research/task_components.py --source b0d87f952043058e21001a002b661bf2db56b1fa --only task --output /tmp/issue47-task-components-before.json
python3 .trellis/tasks/10-17-issue-47-git-object-reuse/research/task_components.py --source working-tree --only task --output /tmp/issue47-task-components-after.json
```

The companion's hash, inputs and schedule are pinned in `frozen-task-component-probe.json`. No source implementation is changed or mocked by either measurement wrapper.

## Fixture equivalence boundary

The before/after fixtures use byte-identical candidate data, Task metadata data, path sets, modes, and history topology/cardinality. Immutable blob OIDs and tree modes therefore match. Repositories are freshly constructed; Git commit author/committer timestamps use construction-time defaults, so the complete commit OIDs differ. This experiment does **not** claim byte-identical complete commit objects across the passes. Commit-body sizes were not recorded separately. Logical candidate byte totals and largest input object sizes are compared explicitly; the unique/blob-body counters observe actual reads rather than inferring them from commit identity. Pinning commit timestamps would improve a future experiment, but the frozen harness and gates were retained for this one.

The revised normal-delivery implementation retains batched `--batch-check` metadata requests for filesystem-seeded immutable object identities, preserving missing promised-object read failures. The frozen main `requested_object_reads` counter measures blob **body** reads only; zero body rereads does not mean zero Git requests. The supplemental functional probe's isolated subprocess observer logs the actual `--batch-check` stdin OIDs and counts, plus fixed `cat-file -t` checks. It separately runs a normal Delivery and a distinct historical Delivery in each 10,001-path fixture. Both include one 4 MiB blob, so the repeated-content fixture has exactly two unique blobs; the distinct-content fixture has 10,001.

Evaluate a reproduced after report against the original frozen numeric gates, without regenerating or loosening those gates:

```sh
python3 .trellis/tasks/10-17-issue-47-git-object-reuse/research/evaluate.py --after /tmp/issue47-after.json --limits .trellis/tasks/10-17-issue-47-git-object-reuse/research/frozen-numeric-limits.json --output /tmp/issue47-acceptance.json
```
