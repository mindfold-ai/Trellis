# Before baseline and frozen acceptance limits

Baseline source: `b0d87f952043058e21001a002b661bf2db56b1fa`. One warmup plus two timed repetitions. Times below are medians of complete public CLI wall time, including wrapper/interpreter startup. All local/network wait = 0. Three large Delivery scenarios run in the same controlled concurrent cohort used for after.

| Scenario | Primary operation | Before median s | Frozen after ceiling s | Git show | Git ls-tree | Blob-body requests / unique content | Actual body bytes | Python peak MiB | Git individual peak MiB |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| delivery-larger-p10001 | record_delivery | 230.011156 | 46.002231 | 10001 | 10001 | 10001 / 10001 | 5.63671e+07 | 54.922 | 9.609 |
| delivery-larger-p128 | record_delivery | 2.658554 | 1.329277 | 128 | 128 | 128 / 128 | 4.32435e+06 | 39.688 | 4.781 |
| delivery-repeated-p10001 | record_delivery | 229.561776 | 45.912355 | 10001 | 10001 | 10001 / 1 | 1.08811e+07 | 45.203 | 5.266 |
| delivery-repeated-p128 | record_delivery | 2.936213 | 1.468106 | 128 | 128 | 128 / 1 | 139264 | 29.766 | 4.828 |
| delivery-unique-p10001 | record_delivery | 229.865829 | 45.973166 | 10001 | 10001 | 10001 / 10001 | 1.0241e+07 | 46.531 | 5.641 |
| delivery-unique-p128 | record_delivery | 2.643609 | 1.321804 | 128 | 128 | 128 / 128 | 131072 | 30.062 | 4.812 |
| task-h2-p24 | task_create | 0.706035 | 0.353017 | 48 | 2 | 48 / 24 | 24056 | 32.953 | 4.812 |
| task-h6-p96 | task_create | 6.145891 | 3.072945 | 576 | 6 | 576 / 96 | 289032 | 32.938 | 4.828 |

Absolute individual-process RSS ceilings were fixed before after: Python 256 MiB (268435456 bytes), Git 64 MiB (67108864 bytes). Neither measurement is a simultaneous process-group total.

All 44 scenario/operation numeric timing ceilings, including the independent regression allowance for candidate, begin-check, gates and retry, are in `frozen-numeric-limits.json`. Limits are fixed before production implementation and must not be relaxed using after results.

Git command counts include the retained fixed checks. Raw command timing and observed object/byte/SHA counters are in `before.json`; per-operation ranges and medians are in `before-summary.json`. The additional Task-only decomposition probe is stored separately and does not replace these primary performance gates.
