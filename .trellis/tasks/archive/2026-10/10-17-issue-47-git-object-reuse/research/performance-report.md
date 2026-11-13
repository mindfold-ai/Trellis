# Issue 47 performance and resource evidence

All **44 pre-implementation numeric acceptance gates passed** on the final implementation, including primary improvements, independent regression ceilings, bounded object/process counts, and individual RSS ceilings. The baseline/planning checkpoint is commit `3f48ebd`; baseline source is `b0d87f952043058e21001a002b661bf2db56b1fa`. `after-source-manifest.json` pins every measured canonical Python file SHA256, and `after-source-stability.json` confirms unchanged source throughout all final measurements.

The original frozen harness runs original public CLI entry points in fresh Python processes. Each scenario has one warmup plus two timed repetitions. Main before/after reports contain 132 raw samples each, including warmups; 44 operation rows contain two timed samples each. The three 10,001-path scenarios run concurrently in the same fixed cohort for both passes; smaller scenarios run sequentially. Local GitHub/network wait is **0 seconds**.

## Complete primary public operation time

Wall time includes the Python interpreter/wrapper, original writer, objective verification, output collection and completion. Ranges are the two timed observations.

| Scenario | Operation | Before median s | After median s (range) | Speedup | Frozen ceiling s |
|---|---|---:|---:|---:|---:|
| delivery-larger-p10001 | record_delivery | 230.011156 | 4.569776 (4.516469–4.623084) | 50.33x | 46.002231 |
| delivery-larger-p128 | record_delivery | 2.658554 | 0.222916 (0.216395–0.229438) | 11.93x | 1.329277 |
| delivery-repeated-p10001 | record_delivery | 229.561776 | 3.536460 (3.532696–3.540224) | 64.91x | 45.912355 |
| delivery-repeated-p128 | record_delivery | 2.936213 | 0.207327 (0.206693–0.207961) | 14.16x | 1.468106 |
| delivery-unique-p10001 | record_delivery | 229.865829 | 4.543302 (4.466275–4.620330) | 50.59x | 45.973166 |
| delivery-unique-p128 | record_delivery | 2.643609 | 0.212478 (0.210847–0.214108) | 12.44x | 1.321804 |
| task-h2-p24 | task_create | 0.706035 | 0.211807 (0.199648–0.223965) | 3.33x | 0.353017 |
| task-h6-p96 | task_create | 6.145891 | 0.291145 (0.282839–0.299451) | 21.11x | 3.072945 |

The frozen minimum gains were 2x for Task and 128-path delivery, and 5x for 10,001-path delivery. The separate candidate/begin-check/check/full-review/readiness/retry ceilings are all preserved in `frozen-numeric-limits.json`; no limit was relaxed after observing after results.

## Seven measured Delivery operations

These subtotals sum candidate generation, begin-check, check gate, full-review gate, readiness gate, successful record-delivery and exact retry. Scope acceptance, Delivery creation and planning preparation are excluded; this is **not** claimed as a complete Task lifecycle. Each CLI invocation has its own cache lifetime.

| Scenario | Before median s (range) | After median s (range) | Speedup |
|---|---:|---:|---:|
| delivery-larger-p10001 | 244.574051 (243.929090–245.219013) | 18.326560 (18.162076–18.491044) | 13.35x |
| delivery-larger-p128 | 3.392875 (3.344515–3.441236) | 0.898802 (0.886880–0.910723) | 3.77x |
| delivery-repeated-p10001 | 244.043416 (243.407336–244.679495) | 17.237217 (17.138325–17.336109) | 14.16x |
| delivery-repeated-p128 | 3.706572 (3.599575–3.813568) | 0.876587 (0.875909–0.877265) | 4.23x |
| delivery-unique-p10001 | 244.459390 (243.804901–245.113879) | 18.203465 (18.040685–18.366246) | 13.43x |
| delivery-unique-p128 | 3.366432 (3.308958–3.423906) | 0.882322 (0.876180–0.888465) | 3.82x |

## Git processes and actual blob-body reads

Counts are stable across the two timed samples in each row. Fixed rev-parse/worktree/branch/type checks remain visible in the raw reports. A normal Delivery now reuses already hashed filesystem content after confirming immutable object availability with batched metadata requests: **zero blob-body rereads is not zero Git requests**.

| Scenario / primary operation | show before→after | ls-tree before→after | cat-file before→after | Body requests before→after | Unique body contents before→after | Body bytes before→after |
|---|---:|---:|---:|---:|---:|---:|
| delivery-larger-p10001 / record_delivery | 10001→0 | 10001→1 | 1→80 | 10001→0 | 10001→0 | 56367104→0 |
| delivery-larger-p128 / record_delivery | 128→0 | 128→1 | 1→2 | 128→0 | 128→0 | 4324352→0 |
| delivery-repeated-p10001 / record_delivery | 10001→0 | 10001→1 | 1→2 | 10001→0 | 1→0 | 10881088→0 |
| delivery-repeated-p128 / record_delivery | 128→0 | 128→1 | 1→2 | 128→0 | 1→0 | 139264→0 |
| delivery-unique-p10001 / record_delivery | 10001→0 | 10001→1 | 1→80 | 10001→0 | 10001→0 | 10241024→0 |
| delivery-unique-p128 / record_delivery | 128→0 | 128→1 | 1→2 | 128→0 | 128→0 | 131072→0 |
| task-h2-p24 / task_create | 48→0 | 2→2 | 0→1 | 48→24 | 24→24 | 24056→12028 |
| task-h6-p96 / task_create | 576→0 | 6→6 | 0→1 | 576→96 | 96→96 | 289032→48172 |

Actual unique body contents are observed from Git output, separately from declared fixture cardinality. Body byte counts exclude metadata/framing. The normal 10,001-path repeated fixture has one unique blob; distinct/larger fixtures have 10,001. Metadata request cardinality is directly observed in the supplemental public normal-delivery probes below.

## SHA256 work during successful record-delivery

Counters include initial bytes and streaming updates in the original operation; observer hashing is excluded. Mutable paths are still read independently on every invocation.

| Scenario | SHA256 constructions before→after | SHA256 input bytes before→after |
|---|---:|---:|
| delivery-larger-p10001 | 20006→10004 | 114654488→57327287 |
| delivery-larger-p128 | 260→131 | 8673368→4336727 |
| delivery-repeated-p10001 | 20006→4 | 23682456→961271 |
| delivery-repeated-p128 | 260→4 | 303192→13463 |
| delivery-unique-p10001 | 20006→10004 | 22402328→11201207 |
| delivery-unique-p128 | 260→131 | 286808→143447 |

## Individual process peak RSS

All values below are **MiB (1,048,576 bytes)** and ranges across the two timed observations. Python is the individual instrumented CLI process. Git is the maximum individual reaped Git child for that invocation, collected with POSIX wait4. Neither is a simultaneous process-group total. Darwin byte / Linux KiB source units are normalized to bytes in JSON. Frozen absolute ceilings are Python 256 MiB and Git 64 MiB.

| Scenario / operation | Python before MiB | Python after MiB | Git before MiB | Git after MiB |
|---|---:|---:|---:|---:|
| delivery-larger-p10001 / record_delivery | 52.312–54.922 | 51.297–52.547 | 9.594–9.609 | 5.359–5.406 |
| delivery-larger-p128 / record_delivery | 39.656–39.688 | 30.328–30.469 | 4.781–4.781 | 4.609–4.688 |
| delivery-repeated-p10001 / record_delivery | 44.625–45.203 | 48.344–51.172 | 5.234–5.266 | 4.984–5.016 |
| delivery-repeated-p128 / record_delivery | 29.750–29.766 | 29.266–29.609 | 4.812–4.828 | 4.625–4.641 |
| delivery-unique-p10001 / record_delivery | 45.531–46.531 | 51.422–53.250 | 5.625–5.641 | 5.328–5.359 |
| delivery-unique-p128 / record_delivery | 29.672–30.062 | 29.359–29.484 | 4.766–4.812 | 4.609–4.609 |
| task-h2-p24 / task_create | 32.703–32.953 | 33.734–33.797 | 4.781–4.812 | 4.594–4.594 |
| task-h6-p96 / task_create | 32.703–32.938 | 33.484–33.938 | 4.828–4.828 | 4.594–4.609 |

## Task component companion

The separately frozen Task-only probe provides the required decomposition; its results do not replace primary total-time acceptance. Object-read time is Git show/ls-tree/cat-file wall time, metadata parsing is json.loads directly called by task_store.py, and other time is complete CLI wall minus those two disjoint components. Task has no content-SHA256 stage. These are companion-run medians; do not mix them with primary-run totals.

| Task scenario | Object-read s before→after | Historical JSON parse s before→after | Other objective + complete wrapper s before→after |
|---|---:|---:|---:|
| task-h2-p24 | 0.490671→0.032805 | 0.001095→0.000113 | 0.199242→0.181629 |
| task-h6-p96 | 6.083219→0.086995 | 0.014385→0.000393 | 0.254155→0.212464 |

Delivery filesystem-digest / immutable-commit-read-digest / authority / other-objective component medians are in the two summary JSON files. Git wall time overlaps these owner components and is not added again. Additional framed-output observation cost is exposed separately and conservatively included in acceptance time.

## Functional normal metadata and historical-success probes

These additional 10,001-path public `record-delivery` probes make no comparative performance claim. Each fixture includes one 4 MiB blob. The normal Delivery first passes all actual gates and records successfully; an isolated observer records actual --batch-check stdin OIDs/counts. A second Delivery then records the retained historical commit after real HEAD, index and worktree changes. Exact retry returns changed=false with byte-identical Task bytes.

| Probe | Normal metadata blob requests / unique OIDs | Fixed commit type requests | Normal body requests | Historical body requests / unique contents | Historical cat-file / ls-tree | Historical maximum body | Historical Python / Git peak MiB |
|---|---:|---:|---:|---:|---:|---:|---:|
| repeated | 2 / 2 | 1 | 0 | 2 / 2 | 2 / 1 | 4194304 bytes | 55.750 / 4.984 |
| unique | 10001 / 10001 | 1 | 0 | 10001 / 10001 | 80 / 1 | 4194304 bytes | 58.812 / 9.328 |

All historical reads satisfy 128-object maximum batch size and fixed individual RSS ceilings. The immutable-body path is exercised rather than inferred from normal filesystem reuse. Availability metadata checks preserve normal object-read failures, including the separately tested offline partial-clone case.

## Fixture equivalence and limits

Candidate/Task data bytes, immutable blob identities, tree modes, and history topology/cardinality are fixed by the unchanged deterministic harness. Dependency, path/count, logical byte-total and maximum-input-size equivalence are explicitly checked in `fixture-equivalence.json`. The largest input object is 4,194,304 bytes in the larger-object scenarios. Logical candidate byte totals and largest input sizes differ by **0 bytes** before versus after in every matching fixture.

Fresh fixture construction uses construction-time Git author/committer timestamps. Complete commit OIDs therefore differ between passes; this experiment does **not** claim identical full commit objects. Complete commit-body sizes were not separately measured. Fixed timestamps would improve a future reproduction, but the frozen harness and thresholds were not changed. No cross-process cache, network acceleration or skipped objective checks is credited as a gain.

The main sample size is two timed observations per operation, with a warmup and min/max reported; it supports this local comparison, not a statistical multi-host release claim. These measurements validate the upstream public operation changes; they do not by themselves validate downstream installed integration or a full release matrix.

See `benchmark-method.md` for commands, precise field definitions and scheduling. Raw reports, frozen limits, manifests, component reports and acceptance results are retained beside this document.
