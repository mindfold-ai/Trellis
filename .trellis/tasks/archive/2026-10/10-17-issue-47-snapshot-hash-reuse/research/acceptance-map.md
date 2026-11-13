# Residual acceptance map

| Requirement | Evidence owner | Required result |
| --- | --- | --- |
| Normal recovery/query2 callers | caller-continuation.md | Pinned public wrapper and immutable candidate route; retain prepare/root-switch/no-lazy-fetch |
| Original digest bytes | Focused public GitCandidateContent tests | Equality with unchanged filesystem oracle across modes, literal UTF-8/control-character paths, empty/repeated bodies and deletion |
| Independent input checks | Focused public tests and pinned complete wrappers | Every path set and immutable object remains checked; invalid/ref/tag/blob inputs fail; cached content is not a pass conclusion |
| Mutable compatibility | Existing Delivery suites | Adjacent mutable file/index/ref observations remain fresh; historical exact outcome and retry behavior remain intact |
| Bounded resources | git_objects tests and benchmark | Bounded batches/chunks and closed temporary files; no whole-batch memory or duplex pipe |
| Actual hotspot improvement | Frozen baseline and identical after | Complete manual recovery/query2 wrappers plus component; repeated/mixed at128/10001 total paths and large objects; Git/FS/hash/RSS data |
| Original PR48 regression | Existing Task/Delivery suites, original benchmark as applicable | Preserve Task batching/local_commit independent checks and exact digest behavior |
| Installed public capability | verify_install.py, package and published reports | Exact paired dependency, installed content parity/public context, reapply/drift/sidecar/mode checks |
| Upstream delivery | PR CI/main SHA/release record/download checksums | New immutable installable source, no npm publication; exact downstream adoption handoff |

The local provider fixture supplies protocol responses. It does not prove live GitHub behavior or AI semantic judgments. The prototype adaptation is isolated from the downstream checkout. Downstream #589 owns its actual adoption and Completion.
