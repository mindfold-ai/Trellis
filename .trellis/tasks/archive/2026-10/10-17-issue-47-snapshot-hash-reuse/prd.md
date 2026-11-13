# Issue 47 continuation: public immutable Git content reuse

## Goal and authority

Complete the remaining public snapshot digest path of castbox/Trellis#47. Preserve Task batching and normal local_commit behavior from PR48. The archived 10-17-issue-47-git-object-reuse Task and castbox-v0.7.0-castbox.3 remain historical evidence. This continuation does not rewrite them.

The user authorizes preferred implementation, checks, repository/Issue changes, merge and matching installable delivery without intermediate questions. Chinese Issue revisions apply STE principles: consistent terms, active sentences, one requirement per sentence, explicit conditions and outcomes.

## Confirmed gap

Pinned Guru f70b64b026725b27d59fed17ed710cc2f831439f calls commit_candidate -> CandidateObjects.snapshot -> public candidate_content_ref. Manual merged recovery and query2 both use this route. Git transfer is blob-deduplicated. The public filesystem owner still reads/hashes each snapshot path. Local_commit's private observation does not serve this pull_request consumer.

## Requirements

1. The original public digest owner provides a minimal immutable Git capability. Consumers do not import private observations, duplicate the algorithm or trust inodes.
2. Reuse content facts only within one operation and actual repository, using exact commit/tree/blob identities. Every input retains independent path/type/mode/availability and expected-result checks.
3. Preserve sorted UTF-8 compact JSON, raw content SHA256, Git 0755/0644 modes and deletion entries. Preserve public filesystem signatures and mutable observations.
4. Bound object batches and body memory. Release resources on success and failure. Preserve no-lazy-fetch policy and isolated history preparation.
5. Measure normal recovery and query2 wrappers before changing production. Retain the original frozen measurements and resource gates. The user-approved performance acceptance revision in research/acceptance-revision.md supersedes estimated absolute time and percentage cutoffs. Use identical deterministic fixtures afterward, including over 10,000 paths, duplicate/unique content and large blobs.
6. Report whole-operation/digest timings, Git commands/requests/bytes, snapshot reads, content/aggregate hashes and separate Python/Git RSS. Distinguish synthetic provider evidence from live provider and downstream adoption.
7. Preserve PR48 contracts. Verify canonical/dogfood parity, original installation projection, reapply, drift, sidecars and executable modes.
8. Merge into upstream main and provide a new exact paired installable source with checksums. Link evidence to downstream #589 without claiming downstream adoption or Completion.

## Acceptance

- Public normal caller inventory and minimal migration contract are recorded.
- Original oracle and new capability produce identical digests for modes, literal paths, deletions, empty and repeated bodies.
- Invalid inputs, incomplete objects and changed mutable/ref/index/worktree facts retain independent behavior. Recovery creates no duplicate facts.
- Digest/work-deduplication/resource checks pass. Evaluate and disclose all retained same-environment timings under research/acceptance-revision.md; estimated absolute time and fixed-percentage cutoffs are historical, not blocking. Old failures remain unchanged.
- Lint, types, minimum-Python compilation, build and tests pass. Independent review has no unresolved findings.
- Canonical, dogfood and packed/installed capability agree. Main merge and immutable release are verified before Issue closure.

## Exclusions

No downstream production edits or fabricated historical success. No cross-call cache, Git service, generic framework, new threat/concurrency/fault model or full-platform release matrix. Downstream owns matching adoption and original Task Completion.


## Authorized acceptance revision

The user's 2026-10-17 instruction explicitly relaxes the initially estimated performance targets. See research/acceptance-revision.md for the quotation, current requirements and unchanged historical evidence. This is a visible requirements change, not a reinterpretation of failed samples. Correctness, independent checks, bounded resources, quality, installation, merge and immutable delivery requirements remain mandatory.
