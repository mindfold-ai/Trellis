# Research: Baseline candidate/commit path and mode compatibility

- Query: Experimentally preserve public Delivery digest and immutable commit verification behavior before Issue 47 optimization.
- Scope: internal executable baseline, isolated small fixtures
- Date: 2026-10-17

## Findings

### Evidence and method

`compatibility_probe.py` snapshots canonical unchanged Python scripts into `baseline-scripts/` in this research directory. Two small real repositories use Git SHA1 and SHA256 formats. Public `delivery.py candidate` computes each expected digest; public `delivery.py apply` records one historical local_commit success per case, resetting the valid pre-operation Task fixture between cases. Scope/create setup uses the existing pure `apply_operation`; historical recording intentionally exercises the installed public immutable owner without requiring unrelated planning gates. Error cases check original Task bytes remain unchanged. All fixture/script writes stay inside this designated temporary research task's `research/` directory. The full raw observations are `compatibility-results.json` and `mode-results.json`.

This is functional compatibility evidence only; it is not timing/RSS evidence or a substitute for normal forward-operation integration tests.

### Baseline outcomes (identical for SHA1 and SHA256 except full OID length)

| Candidate path / entry | Public candidate | Public historical local_commit apply |
| --- | --- | --- |
| `plain`, UTF-8 `空格文件`, `with space` | exit 0, content_ref | exit 0, changed true |
| literal tab in `with\ttab`, literal newline in `with\nnewline` | exit 0 | exit 0 |
| `with:colon`, `[abc]` (alongside a real `a` file) | exit 0 | exit 0 |
| leading / trailing spaces | exit 0 | exit 0 |
| executable regular file | exit 0 | exit 0 |
| missing path, representing deletion | exit 0, aggregate `[path,null,null]` | exit 0 when absent in commit too |
| directory/tree | exit 1, `invalid_candidate` | exit 1, `invalid_git_fact`; no Task write |
| filesystem symlink / committed mode 120000 | exit 1, `invalid_locator` | exit 1, `invalid_git_fact`; no Task write |
| gitlink mode 160000 without initialized worktree path | exit 0 as missing filesystem path | exit 1, `invalid_git_fact`; no Task write |
| incorrect candidate digest | n/a | exit 1, `candidate_mismatch` |
| 40-character prefix of real SHA256 commit | n/a | exit 1, `invalid_git_fact` |
| full real SHA1 commit (40 characters) / SHA256 commit (64 characters) | n/a | exit 0 |

Git-mode candidates at filesystem 0644, 0600 and 0640 produce the exact same digest. At 0755 they produce a different digest. Concrete `plain` digest for the fixture binary bytes `hello\x00world\n`: `sha256:cf7b2bbbe1ca1d181049abbb875f5bf6c9422fcb181cdf1bbade9ed413b97853`; with owner execute set: `sha256:9eab99211b389f103b6520f2e3d68e5abb80d27b2dedb3f5fee9afc096c23ecc`.

### Required regressions

1. Use **public CLI apply**, not only a private batch-reader unit, for a candidate containing ordinary, UTF-8, spaces, tabs, newlines, colon, bracket, leading/trailing-space names together. Assert original content_ref and successful immutable local_commit outcome in SHA1 and SHA256 repos. NUL-separated tree parsing must not split path lines or decode Git C quoting as literal paths.
2. Preserve deletion entries, including candidates combining missing and existing files. Do not silently omit missing candidates from aggregate JSON.
3. Independently assert public candidate rejects directories as `invalid_candidate` and symlinks as `invalid_locator`; historical commit verification rejects tree/symlink/gitlink entries as `invalid_git_fact`, not `candidate_mismatch` or empty/deleted entries. Assert Task bytes unchanged.
4. Preserve mode normalization and binary byte hashing. Shared blob content at both 100644 and 100755 must yield one content hash but two mode contributions. No tree-OID replacement for the existing aggregate digest.
5. Assert full SHA256 commit works and 40-character prefix remains `invalid_git_fact`; retain existing wrong commit type, mutable/short refs and actual candidate mismatch tests.
6. Re-run the same supported public operation with ref/worktree/mode changes between calls. Second call must observe new mutable facts; historical exact commit may retain prior immutable facts only within the current call.
7. Preserve all existing independent semantic validation and retry recovery. This probe uses historical record_delivery; normal record_delivery, begin_check, candidate-bearing record_gate, record_publication and lost-response retry still need existing/formal integration coverage.

### Files and related contracts

- `packages/cli/src/templates/trellis/scripts/common/delivery_store.py:58`: filesystem digest owner and mode serialization.
- `.../delivery_store.py:108`: immutable tree verification and its typed Git errors.
- `.../delivery_schema.py:81`: accepted UTF-8 relative paths; whitespace/control names used above are legal except NUL/backslash and unsafe components.
- `.../delivery.py:129,147,151`: public candidate/apply outputs and error JSON `{kind:error,code,message}`, process exit 1.
- `.trellis/spec/cli/backend/delivery-lifecycle.md:230-294`: full OID, environment isolation and normalized mode contracts.
- `packages/cli/test/scripts/delivery-v2.integration.test.ts`: existing correct public local_commit / historical recovery test setup.

## Caveats / Not Found

- These are small deterministic baseline checks. No heavy benchmark ran alongside the parent performance baseline.
- Historical input for directory/symlink/gitlink uses a syntactically valid placeholder digest because those filesystem candidates cannot necessarily be authored; the immutable verifier rejects their type before digest comparison. This measures existing typed failure semantics, not a valid deliverable.
- Probe setup was a schema-2 fixture, not a CLI create timing test or representative installation proof.
- Original source remains unchanged; snapshot is retained for direct after/before comparison. Source line numbers may shift after implementation.
