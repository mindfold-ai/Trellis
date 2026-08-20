# Make the session idempotency fingerprint survive a date rollover

Child of `08-19-vendored-runtime-edge-cases`. Independent of its sibling
`08-19-runtime-defensive-guards` — no ordering between them.

**This task needs a `design.md` before `task.py start`.** Unlike its sibling it
is a semantics change, not a defensive guard: it alters how existing pending
markers are matched, so the compatibility question has to be settled on paper
first.

## Problem

`add_session.py:1151`. The resume/idempotency marker is derived from `today`
(`YYYY-MM-DD`), via `compute_record_fingerprint(developer, today, title, ...)`.

Failure sequence:

1. `add_session.py` writes the journal entry and updates `index.md`.
2. The commit step fails — or the process is interrupted between the two.
3. The user retries after midnight.
4. `today` is now different, so the recomputed fingerprint differs.
5. `classify_record()` does not find the pending marker.
6. The retry **appends a second session** instead of resuming the first.

The window is small but the failure is silent and corrupting: the journal ends
up with two entries for one session, and `index.md` rows and journal blocks
disagree about how many sessions exist.

Raised by copilot-pull-request-reviewer on `platypeeps/hoa-manager#275` and
verified against the source.

## The design question

The fix cannot simply drop `today` from the fingerprint, because markers already
written by the current scheme must stay resolvable — a repo mid-retry when the
fix lands must not be stranded with a pending marker nothing will ever match.

`design.md` must settle:

- What replaces `today` as the stable component, and whether the fingerprint
  stays date-derived at all.
- How already-written markers are matched after the change: a migration, a
  dual-read fallback that tries both schemes, or a documented one-time break.
- Whether the marker format needs a version tag so a future change to this has
  a cheaper path than this one did.
- Whether `classify_record()` should distinguish "no marker" from "marker in an
  older scheme", since those warrant different behavior.

## Acceptance Criteria

- [ ] A session interrupted after the journal and index writes but before the
      commit, retried after a date rollover, **resumes** the existing entry
      rather than appending a second one.
- [ ] A marker written under the pre-change scheme is still resolvable after the
      change — pinned by a test that constructs one in the old format.
- [ ] The same-day retry path keeps working exactly as it does today.
- [ ] Two distinct sessions on the same day still produce distinct fingerprints;
      the fix must not over-collapse and start resuming unrelated sessions.
- [ ] The fix lands in the fork template **and** its in-repo vendored copy in the
      same change, so the byte-identical regression guard stays green.
- [ ] Full CLI suite green (baseline 1829/1829).

## Out of scope

- The two defensive guards — sibling task.
- Re-rolling the eight consumer repos.
