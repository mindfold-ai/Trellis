# Issue 47: operation-local immutable Git fact reuse

## Source and authorization
https://github.com/castbox/Trellis/issues/47, verified main b0d87f952043058e21001a002b661bf2db56b1fa on 2026-10-17. The user explicitly authorizes all current-repository and Issue actions, accepts preferred recommendations, and requests uninterrupted completion.

## Problem
Original Task creation repeats historical metadata reads across branch heads. Delivery local-commit recording reads each candidate path using separate Git processes and hashes content already observed during that same operation.

## Accepted scope
Optimize canonical Python Task create and Delivery candidate/fact verification through their supported public CLI/store entry points, and ship identical managed scripts through the official CLI template projection. Preserve public input/output, content digest bytes, identity reservation, independent owner/structure/scope/phase/ancestry checks, mutable candidate checks, typed failures and exact-operation recovery. The Core SDK is a separate counterpart, not an installed nested caller; preserve compatibility without expanding into its independent performance work.

## Acceptance criteria
- Inventory actual public entries and direct callers; optimize only supported normal redundancy and retain fixed independent checks.
- Eliminate included per-path Git reads and repeated immutable-blob SHA256 within one operation. Preserve each path/mode/deletion contribution, sorted UTF-8 digest encoding and original expected-digest comparisons.
- Baseline before production edits, then freeze numeric performance/resource gates. Reproduce at two Task head/history scales and two Delivery path scales including 10,001 paths, repeated/unique/larger blobs, same warmup/repetitions/dependencies. Report full operation and lifecycle timings, component/network split, all Git commands/objects/bytes and separately defined Python/Git RSS.
- No persistent caches, background service, universal Git framework or lifecycle bypass. Bounded batches and streaming/spooled bodies, no duplex pipe deadlock, cleanup on success/failure.
- Functional regressions cover historical identities/different heads, supported path/type/mode/deletion/error behavior, mutable subsequent calls and output-loss recovery.
- Canonical/dogfood parity, official template registration, built/packed representative installation and applicable reapply/drift/sidecar/mode tests pass.
- Deliver exact commit and installable source/assets, performance evidence and verification limits; backlink downstream guru-trellis#589 without closing or upgrading it.

## Exclusions
No business repository writes, downstream implementation/adoption, full platform Release matrix, extra threat model, concurrency/fault-injection/crash-hardening work or npm publication.
