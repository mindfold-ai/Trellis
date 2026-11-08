# Public Plan2 migration convergence

## Source and scope

Reuse original `codex/plan2-workspace-version-and-bindings`, its uncommitted candidate and Task, and original history preservation `06cffb30`. Integrate main containing `b4f16651` / PR #66 without duplicating its current-v2 peer implementation. Original candidate bytes/task were backed up before integration. CLI/Core remain `0.7.0-castbox.6`; this is a reviewed source contract extension, not a replacement npm release.

## Versions and preservation

The global source/`--from` refers to the invocation installation. Independently validate each original installation version as a supported predecessor of the one target; keep frozen version bytes/modes through preview, apply, replay and caller rollback.

Add the closed `{sha256,mode}` alternative only to `files[].source` for `owner=preserve`, `action=preserve` descendants of a same-workspace inventoried Task. Task records, sessions, bindings, workflow/template inputs and writes/removals retain full raw snapshots. Hash live artifacts incrementally with bounded buffers. The SHA is a preimage check, not a backup. Recognize root Task records by exact same-workspace planned path; nested snapshot `task.json` remains an artifact.

## Identity and lifecycle

Group case-folded TaskId by actual generation; default zero only for positively recognized legacy. Preserve exact case and asserted provenance across a group. Only positively recognized source-less legacy defer/history asserts no provenance, independently of row order. One active plus one history archive may coexist per workspace; neither extra active nor extra archived copies are admitted.

Repeated completed, positively validated legacy/schema1 records may be entirely deferred as raw history without native projection, reopen, binding, Delivery or Completion, provided no valid source session in effective native storage or reviewed target session selects them. Incomplete repeated all-defer groups reject. Retain existing singleton predecessor defer behavior.

A unique unselected invocation `current` record may remain byte-identical and unbound; no omitted existing binding is excused. Sibling execution and inherited v2 peer groups retain existing binding obligations. PR #66 full parsed-record equality, unique current authority and lone-peer rejection remain unchanged. Only valid identity2/3 sources in effective native storage (common-dir Git, local Git-free) and strict target projections supply selection. Obsolete Git-local, path0/1 and invalid object carriers stay raw, without inferred selection; malformed JSON retains its original rejection. No authority is inferred from branch/path names.

## Legacy Guru metadata

Core's closed legacy classifier admits the seven historically evidenced Guru fields. Package paths are nullable; other historical fields retain their observed string/boolean/object types. Current record schemas do not change. Projections preserve ordinary business fields and keep retired Guru metadata only in complete original migration history; old gates cannot initialize native results.

## Verification and delivery

Use real Git/worktree fixtures, a real sparse 925 MiB preserved artifact, no-write drift/rejection checks, mixed-version replay/rollback, strict session/binding checks, Core and CLI full checks, and an independent complete-range review against origin/main. Record actual evidence; original candidate check claims are historical, not fresh passes. Merge only after current CI passes. Build both packages cleanly from the actual merged SHA and return source/tree/parents, lockfile and artifact identity. Downstream Guru logic, business snapshot differences, releases, attacks, races and crash hardening are excluded.
