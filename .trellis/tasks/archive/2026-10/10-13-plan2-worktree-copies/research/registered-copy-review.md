# Research: Plan2 registered inherited Task copies

- Query: Can reviewed Plan2 migration safely accept normal inherited active Task copies in registered worktrees by selecting exactly one execution authority through an existing public branch binding?
- Scope: internal source/spec/test review plus supplied controlled-copy evidence; planning only. No source edits, Git operations, original business-tree scan, installation changes, or downstream acceptance.
- Date: 2026-10-13

## Findings

### Confirmed gap and existing behavior

The supplied controlled preview rejects `149-normal-price-promotion-current` before making any writes. `/private/tmp/531-exact149155-7r03xsrr/defer-current-only-preview-result.json` reports exit 1, ten deferred future-artifact decisions removed, and 13,347 tracked snapshot entries unchanged. Its companion stderr identifies `Task identity collision`. The supplied checkout-shape evidence contains exactly one current checkout per Task binding. These observations are bounded supplied evidence, not a fresh execution or business acceptance performed by this researcher.

The rejection is explained by `packages/cli/src/commands/migration2.ts:487`: valid source IDs enter a global lowercased identity map and every second occurrence rejects at lines 496-499, before `defer` is evaluated. Therefore neither identical nor independently reviewed branch variants can use current conversion plus preservation of inherited peers.

The public dispositions do not supply an alternative legal route:

- `defer` requires an active Task root and a valid declared predecessor record (`migration2.ts:460`, `:549`). It is a preserve-only source with no projection.
- `history_only` cannot cover a record-bearing active root (`migration2.ts:465`). It reserves unknown archived/missing-record occupation rather than granting execution.
- Two conversions/current entries also conflict in the projected TaskKey map (`migration2.ts:524`). Retain that independent authority rejection after revising identity occupation.
- Complete workspace and occupied Task inventories remain mandatory (`migration2.ts:381`, `:557`); omission or renaming is not a fix.

### Relevant files found

| File | Purpose |
| --- | --- |
| `packages/cli/src/commands/migration2-schema.ts` | Closed public Plan2 schema and exact raw-snapshot inputs; no branch-binding input today. |
| `packages/cli/src/commands/migration2.ts` | Repository membership, complete inventory, identity reservation, prospective authority, session projection, byte/mode preflight and execution. |
| `packages/cli/src/templates/trellis/scripts/common/session_storage.py` | Existing public binding-aware registered-worktree Task resolution; this reader is the interoperability contract. |
| `.trellis/scripts/common/session_storage.py` | Dogfood twin of the shipped public reader. |
| `packages/cli/src/templates/trellis/scripts/common/task_utils.py` | Strict selected TaskId/generation reading; missing generation is invalid at normal runtime. |
| `packages/core/src/task/schema.ts` | Canonical predecessor Task schema and structured immutable issue-source shape. |
| `packages/core/src/task/migration.ts` | Recognized older legacy shape; only explicit migration can default absent generation to zero. |
| `packages/core/src/task/migration-v2.ts` | Projection must preserve identity, generation, source, metadata, tree and artifact origin. |
| `packages/cli/test/commands/migrate2.integration.test.ts` | Existing migration preservation/replay tests and registered sibling fixture with different TaskIds. |
| `packages/cli/test/scripts/cross-worktree-session.integration.test.ts` | Existing public repository/session runtime regression family; appropriate neighboring verification. |

### Recommended bounded contract

An optional `branch_bindings` array with an empty default is viable. Each entry should identify an exact safe TaskId and nonnegative safe-integer lifecycle generation and contain a reviewed non-null raw snapshot for the existing binding. Derive the sole legal path internally as `<git-common-dir>/trellis/task-branches/<TaskId>/<generation>.json`. Do not accept an arbitrary path, owner, write action, target bytes, or a newly synthesized binding. Git-free plans cannot use this input.

Validate the snapshot JSON against the existing Python closed shape (`session_storage.py:162`): exactly `schema_version`, `task_id`, `lifecycle_generation`, `binding_revision`, and `branch_name`; schema `"1.0"`; exact ID/generation; nonnegative integer revision; a nonempty string branch. Exclude boolean/null/fractional/negative generations and revisions. Use the same public reader semantics for whitespace/branch matching rather than introducing a subtly different private contract. Reject duplicate binding entries for the same TaskKey. Preserve original binding bytes and complete mode in the preview and all retries.

Allow a repeated identity group only when all of the following hold:

1. Every ID is case-exact and every normalized generation is equal.
2. Every member is an occupied active Task root in a distinct canonical registered project workspace at the existing common repository/suffix. Reject duplicate canonical roots, alternate IDs for the same workspace, and aliased Task directories representing the same physical source.
3. Exactly one member is `convert_active` or active `current`; every other member is valid declared-predecessor `defer`. Reject multiple authorities, all-deferred groups, archived/history-only members and mixed-generation/case variants.
4. A reviewed live binding selects exactly one current checkout across the complete eligible registered project-workspace inventory, and that checkout is the projected authority's workspace. A branch name recorded in Task metadata, a remote branch, or existence of the ref alone does not establish the current checkout.
5. Every deferred record and artifact remains preserve-only, independently frozen to its own bytes/mode, with no migration/source or Delivery planning targets added there.
6. Every occupied active/archive leaf and every existing artifact/session still has its complete reviewed disposition. The exception must not bypass unknown historical visible-name occupation (`migration2.ts:563`).

Maintain identity reservation by TaskId independently from execution projection by exact TaskKey. The collision exception must be validated after complete grouping rather than depending on plan ordering. A legitimate case is authority row before or after its deferred peers; neither should alter behavior or diagnostics.

### Copy equality and immutable provenance

Do not require equal raw `task.json` snapshots across peers. Byte equality would unnecessarily reject independently reviewed branch variants; each source already has exact own byte/mode preservation. Branch-local title/status/notes/metadata/planning may legitimately differ. Do not copy the authority's planning into its deferred siblings.

For valid schema-1.0/current sources, compare structured `source` semantically across a repeated identity group as an additional immutable-source consistency check. `TaskSource` is `no_issue` or the closed issue object containing kind/repo/number/disposition (`schema.ts:13`, `:176`). Comparing only repo/number while ignoring disposition weakens the canonical source contract. Identity/generation plus the reviewed existing binding are the authority basis; ordinary metadata equality is not.

For recognized older `legacy` sources, missing generation means zero only after `isKnownLegacyTaskRecord` succeeds. That validator deliberately excludes `source` and `lifecycle_generation` (`migration.ts:12`); do not use a generic `value ?? 0` for malformed current/v1 records. Normal Python selected reads require generation (`task_utils.py:77`), and projection already preserves/defaults it only at migration (`migration-v2.ts:42`). A `current` authority may already be schema2 while peers are valid declared legacy/v1; group against reviewed source identity/generation, not a guessed live shape.

### Replay, topology and preflight safety

Reconstruct all grouping, generation, source consistency and projection from reviewed original snapshots, even when some live Task files already contain their exact targets. `prepare` already accepts only exact source or exact target states with full modes (`migration2.ts:395`), while a preserve target equals its source. Do not change the plan from `convert_active` to `current` during a same-plan retry or read a partially migrated file to determine group membership.

Prepare each binding as an ordinary preserve item so raw SHA/mode changes or disappearance are a third state. Existing common-directory containment refuses nested symlinks (`migration2.ts:157`, `:403`), and raw snapshot canonical base64/SHA validation applies (`:63`). Preserve this path boundary for binding directories/files too.

The existing entire-set byte/mode recheck occurs at `migration2.ts:1119`, immediately before writes, but does not revalidate repository membership or branch checkout. Add a bounded second authority/topology check there: the same eligible registered workspaces, same common directory/suffix, and the same unique current checkout selected by every reviewed binding. A checkout may change while binding bytes remain identical; binding preservation alone cannot catch this. Rechecking before the first write improves the existing preflight boundary but does not provide repository locking or claim concurrency safety against subsequent external changes.

Canonical workspace aliases should reject early (`migration2.ts:350` currently checks unique IDs and later compares a sorted root list, which normally catches repeated roots indirectly). Legal `.trellis`/tasks-root aliases exist at `:171`; distinct lexical paths may alias the same Task directory. Explicit repeated-copy checks must not treat two names for one physical source as two safe peers. Existing no-copy managed-root behavior should retain its current boundary.

Dry-run must include binding preserve actions and report stale raw states without writing. Binding syntax, missing required binding, ambiguous branch or authority mismatch are semantic preflight errors; live byte/mode changes should retain established third-state reporting. For execution, all such failures must occur before installation/template/session/Task writes.

### Artifact preservation constraints

Existing ownership already rejects arbitrary writes to deferred Task descendants: preserve ownership cannot write (`migration2.ts:657`); artifact ownership requires converted/current Tasks and only migration/Delivery subpaths (`:712`); template/workflow owners constrain their own exact targets. Therefore this is not a confirmed existing arbitrary-write vulnerability. Nonetheless the new copy contract should explicitly enforce and test preserve-only decisions beneath deferred roots, including deceptive owner labels, injected future Delivery targets, changed modes, overlapping storage aliases, and null-source preserves.

All existing root/nested artifacts are recursively inventoried (`migration2.ts:276`, `:753`). A preserve decision with `source:null` only freezes absence and adds no file; do not describe it as a write. It must never satisfy the disposition for an existing artifact. The duplicate-copy exception must not permit extra write-capable targets merely because an authority exists in another workspace.

### Session handling

Keep exactly one projected authority entry per TaskKey. Projected schema2-to3 sessions preserve exact TaskId/generation and must select that active authority (`migration2.ts:806`); any selected Delivery must belong to it, share generation and be nonterminal (`:820`). The reviewed binding must select that same workspace, with no invocation-local fallback.

The Python resolver already narrows its search to the unique bound checkout before scanning Task records (`session_storage.py:356`); this supports a converted schema2 authority plus untouched old copies in siblings without a new ledger. Exercise public installed current/continuation from every sibling to prove it, then explicitly selecting a deferred record must still reject the unsupported source schema. A passing Task resolver alone does not imply business Planning/Check/Recovery gates.

Preserve-only sessions retain their raw bytes/mode and are not silently projected or counted as accepted execution. `migration2.ts:803` intentionally avoids manufacturing authority for them. Complete session inventory and no checkout-local projection fallback remain mandatory (`:790`, `:842`).

There is an additional bounded decision for unique projected session identities: the public Python reader consults any existing binding even without duplicate copies. If a converted common session relies on an existing binding, require that binding's reviewed preserve snapshot and agreement with the same projected workspace; otherwise preview can approve a session that runtime redirects via unreviewed binding. Do not scan or disposition all unrelated historical bindings. For identities without any binding, old unique/no-copy behavior can remain; if claiming a stable no-binding selection at first mutation, explicitly recheck absence and topology as well. The design should state this policy rather than imply the optional duplicate-only input proves all session routing.

### Compatibility and verification recommendations

Omitted `branch_bindings` should normalize to `[]`; valid old no-copy/no-binding plans continue to parse and execute. Invalid duplicate groups still fail. The new optional input is additive for the upgraded executor, but old closed-schema executors cannot consume a plan containing the new field. Pin/build/install the candidate when validating the extended plan; do not claim older executors are compatible with it.

Create a real Git fixture with tracked predecessor Task records before `git worktree add`, so the sibling inherits the same Task identity. Existing sibling coverage creates an empty commit then calls `seedWorkspace("sibling", ...)`, whose Task ID becomes `sibling-task` (`migrate2.integration.test.ts:75`, `:1532`). That explains why ordinary registered-worktree coverage did not expose this defect.

Meaningful checks for the bounded change:

- Clean raw-copy and independently changed branch-record/planning variants; authority order permutations; legacy default0 and strict v1/current generation cases.
- One conversion/current authority plus deferred peers; binding bytes/modes preserved; planning bytes/modes differ and remain exact in each sibling.
- Dry-run zero writes; migrate; same-plan no-op replay; injected ordinary partial failure then retry; exact preview-path rollback.
- Missing/stale/malformed/extra-field/case-mismatched binding; wrong authority checkout, detached or missing branch, duplicate checkout ambiguity, missing workspace/Task/artifact/session inventory; zero writes on each rejection.
- Multiple conversions/current authorities, all-defer, archived duplicate, case collision, generation/source mismatch, repeated root or aliased physical Task source.
- Binding mode/bytes and branch/topology change between initial preflight and first mutation; source-vs-target Task states on replay do not alter grouping.
- No new migration/Delivery artifact in a deferred peer; poisoned generic file decisions fail; newly appeared deferred record/artifact produces a third state or missing disposition.
- Public installed Python selected Task/continuation from every registered sibling resolves the bound schema2 authority; deferred direct selection remains blocked. Shared sessions preserve exact identity/generation and only explicit projections gain schema3.
- Existing Plan1/Plan2 regressions and unit/type/lint/build/pack validation appropriate to touched CLI files. Core projection need not change unless implementation reveals a distinct contract defect.

## Related specs

- `.trellis/spec/cli/backend/commands-migrate.md:120`: Plan2 input table, full raw snapshot/replay contract, complete inventories and no private downstream acceptance.
- `.trellis/spec/cli/backend/task-lifecycle.md:35`: strict Task identity/generation, immutable occupation and repository-scoped sessions; `:74` live/prunable registration policy.
- `.trellis/spec/cli/backend/filesystem-safety.md:54`: validate path segments at the chokepoint; atomic mode-aware writes; shipped/dogfood Python twins if modified.
- `.trellis/workflow.md:140`: approved planning is distinct from implementation; this research changes only the assigned research file.

## External references

No external documentation was needed. The contract is the local public Python binding reader and current CLI/Core source. Supplied evidence used Node v26.9.0 with the previously installed candidate; that is defect evidence, not proof for a new implementation or full platform release matrix.

## Caveats / Not Found

- No product changes, tests, controlled cutover or installed-runtime execution were performed here. Recommendations need implementation and fresh independent verification.
- Existing Python branch binding is a reader contract; no public Core BranchBindingStore writer was found or needed. Do not import Guru private writers or synthesize migration binding ownership.
- The bounded complete-group rule deliberately rejects duplicate archived roots or groups with no execution authority; supporting those is separate scope unless requirements explicitly change.
- #31 remains completed/closed. This follow-up neither reopens it nor requires #531 joint acceptance or business-tree writes.
- Memory quick lookup found no relevant task-specific entry; no memory-derived claim was used.

## Final planning convergence review

Reviewed `prd.md`, `design.md`, `implement.md` and `research/source-analysis.md` on 2026-10-13. This pass reads only those new documents against the source findings above; it does not introduce product edits or fresh execution evidence.

The core group rule now consistently requires exact ID/generation, one bound active execution authority, preserved independently reviewed predecessor peers, immutable-source agreement and full inventory. The design explicitly rejects absent legacy provenance versus present schema2 provenance; it permits matching schema1 peers/current authority. This resolves the previously ambiguous legacy/current mixed-source case without generic generation defaults. Replay consistently derives grouping from frozen original snapshots, and the unique-ID existing-binding requirement closes the previously identified session redirect gap. No contradiction was found in these rules.

Two actionable planning clarifications remain before implementation:

1. **Specify/test the extension missing-binding predicate.** `design.md` promises to preserve extension-specific missing-binding rules, but neither it nor the behavioral matrix defines the marker/entry-root policy. The existing public reader's predicate is `.trellis/guru-team/extension.json` being a file in the invocation root (`session_storage.py:165`). State which eligible migration/runtime entry roots cause an absent binding to reject, especially if extension markers differ among siblings. Add a native unique-ID/no-marker positive and a marker-present/no-binding zero-write negative. This uses the public reader boundary and does not authorize private extension inspection/writes or extend scope into business cutover.
2. **Name the actual installed migration entry.** `implement.md` step 5 promises the shipped migration CLI but gives no executable command/arguments. Supplied installed defect evidence uses a Node module invocation. Verify the registered public command before promising CLI execution; if migration is exposed only through the installed exported module, state and exercise that exact installed entry instead. This pass does not assert that a CLI is absent: product inspection was explicitly outside this convergence pass's read scope. Candidate installation/entrypoint provenance is an acceptance detail and should be concrete before proof is recorded.

These are bounded specification/proof details. They do not require reopening #31, downstream joint acceptance or original business-tree writes. No implementation authorization is inferred.

### Follow-up convergence

The clarified plan now defines the marker predicate across eligible runtime entry roots, freezes/rechecks its result and adds native-positive/marker-negative coverage. The installed command is also concrete, with caller workspace/session identity and real registered CLI/schema2 dispatch anchors documented by the main research owner. The installed-entry concern is resolved at planning level; no installed pass is claimed.

One topology qualifier remains: marker-driven `binding_required` applies only with a Git common directory. The public reader returns `None` immediately for Git-free facts (`session_storage.py:160`) before checking the marker, and Plan2 correctly rejects common binding input for Git-free topology. Requiring a binding solely because a Git-free root has the marker would therefore invent an impossible new obligation. Qualify the marker paragraph accordingly and include Git-free/no-binding compatibility in the matrix. With that qualification, no other issue was found in the changed planning paragraphs; the conclusion can be **planning ready**, never **implementation passed**.

### Final result

Verified the revised common-directory-only marker paragraph in `design.md`, the explicit Git-free marker/no-binding compatibility row in `implement.md`, and corresponding source-analysis anchor. The remaining topology qualifier is resolved. All actionable findings from this planning review are addressed: **planning ready**. Implementation, tests and installed-candidate acceptance remain future authorized work; this conclusion does not claim implementation passed.
