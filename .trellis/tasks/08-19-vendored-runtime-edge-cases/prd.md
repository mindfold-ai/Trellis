# Harden vendored runtime edge cases found by bot review

Parent task. The work lives in the two children; this task owns the source
requirement set, the task map, and the final integration review. It has no
direct implementation of its own.

## Source requirement

Three findings raised by copilot-pull-request-reviewer against the vendored
Trellis runtime on `platypeeps/hoa-manager#275`, one of the 0.6.16-sd.1 consumer
rollout PRs. Each was checked against the source before being recorded; all
three hold up.

They are **pre-existing** in the runtime, not introduced by the rollout. They
were deferred rather than fixed inline because six consumer repos had already
merged the roll by the time they surfaced; fixing them in the fork at that point
would have re-drifted all six for changes unrelated to the version bump.

Related findings from the same review pass **were** fixed inline, in
`fix(scripts): address the bot review findings on the vendored runtime` — path
containment, `--platform Codex` case folding, dead `if not <Path>` guards,
`--json` usage text, dead assignments, and undocumented `except: pass`. These
three are what was left on the table.

## Task map

| child | covers | shape |
|---|---|---|
| `08-19-runtime-defensive-guards` | non-list `children` aborting task creation after the write; unguarded `stat()` inside an advisory validate check | lightweight, PRD-only |
| `08-19-session-fingerprint-rollover` | date-derived idempotency fingerprint breaking retry across midnight | needs `design.md` — semantics change |

The split is along that line deliberately. The first two are defensive guards
with no compatibility surface. The third changes how existing pending markers
are matched, so it carries a migration question the other two do not. Bundling
them would have made two one-line fixes wait on that design.

**No ordering between the children.** They touch different files
(`task_store.py` / `task_context.py` versus `add_session.py`) and can land in
either order.

## Cross-child acceptance criteria

- [ ] Both children are archived.
- [ ] Every fix reached the fork template **and** its in-repo vendored copy, so
      the byte-identical regression guard is green.
- [ ] Full CLI suite green at the end (baseline 1829/1829).
- [ ] The three findings are resolvable against the review threads they came
      from — the deferral replies on hoa-manager#275 point here.

## Out of scope

Re-rolling the eight consumer repos. These ride along with the next roll rather
than justifying one. Until then the consumers keep the runtime they merged,
which is byte-identical across all eight and matches the fork template as of
`f0daf4f3ed6c`.
