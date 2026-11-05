# Issue #62: Atomic parent-repository gitlink content

## Goal and source
Complete https://github.com/castbox/Trellis/issues/62 against main@17015f987166f4106034f115d23212446f16d536. Delivery must identify submodule pointers without depending on a submodule checkout.

## Requirements
- Gitlink candidate identity uses the selected parent index stage-0 path/mode/OID; commit verification and historical reads use the corresponding parent tree entry. Missing and present pointers differ.
- Do not inspect submodule HEAD, cleanliness, initialization, internal files, or target object availability; do not initialize, fetch or update submodules.
- Support explicit staged add/update/delete and regular-file/gitlink transitions. Staged deletion remains deletion with a residual directory. Selected unmerged entries fail through the existing invalid-candidate path. Captured pointer changes fail existing candidate validation.
- Keep ordinary-file workspace bytes/executable bits, deletions, git_free, explicit git mode outside repositories, supported Git formats/path encoding, operation-local immutable blob reuse and independent validation.
- Keep Python, SDK, CLI, canonical templates, applicable dogfood and contracts consistent. Explain candidate compatibility and preserve original-owner historical recovery without replaying completed operations.

## Acceptance criteria
1. A real Git fixture captures a gitlink through public candidate/CLI APIs and passes the Delivery commit gate for the exact tree OID; wrong pointers fail.
2. Representative regressions cover directory presence and one internal change, staged add/update/delete/type changes, post-capture changes and unmerged selected paths.
3. GitCandidateContent matches current identity with missing child commit objects. Python/SDK agree on the same representative fixture.
4. Directly affected runtime/SDK/CLI tests and required lint/type checks pass; ordinary content/recovery regressions remain green.

## Out of scope
Downstream Guru adoption/business recovery, release/tag/package publication, full platform upgrade matrices, submodule internal repair, new authorities/ledgers/approval pipelines and unrelated cleanup.
