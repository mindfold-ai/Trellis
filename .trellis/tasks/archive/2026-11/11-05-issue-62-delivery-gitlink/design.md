# Design

## Content ownership and representation
Retain existing ordered JSON triples and SHA256 aggregate. Keep regular files as [path, permissions, SHA256(bytes)] and deletion as [path,null,null]. Encode gitlinks as [path,57344,OID] (57344 is octal 160000), with the full parent index/tree OID. The distinct mode makes the new representation unambiguous without changing ordinary fingerprints or introducing a schema version.

Git candidates query the parent index using literal NUL-delimited stage records. Reject selected unresolved stages before falling back to filesystem observation. For stage-0 gitlinks, emit atomic pointer identity before accessing filesystem paths. Use parent HEAD gitlink entries to recognize staged deletion when stage-0 is absent, even with a leftover directory. An ordinary stage-0 replacement continues ordinary workspace semantics. Non-Git explicit git-mode calls still work for regular files; repository detection must distinguish no repository from actual index/tree errors.

Commit and historical content readers accept mode 160000/type commit and emit the same tuple, without opening its OID as a blob or validating child object availability. Preserve #47 caching and exact parent commit checks. Ordinary directories/symlinks stay unsupported. Share helpers inside each existing content owner where useful; do not create a new authority.

## Compatibility
Ordinary and deleted-file hashes stay identical. Old candidates that treated a missing checked-out gitlink as deletion cannot reliably identify that pointer and must be prepared again before execution if current verification differs. Existing actual commit/publication/delivery results stay recoverable through original recovery paths; do not replay operations on upgrade. No release is part of this task.

## Scope and risks
Touch only content owners/helpers, directly relevant tests, canonical/dogfood contracts and specs. Verify selected-path literal encoding, SHA1/SHA256 OIDs, unborn repositories, index conflicts and staged deletion without querying child state. Roll back with a normal revert of the focused change; no persistent schema migration is introduced.
