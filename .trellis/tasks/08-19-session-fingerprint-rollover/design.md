# Design: date-independent session fingerprint with exact legacy resolution

Settles the four questions the PRD leaves open.

## 1. What replaces `today`

Nothing. The `date` field is **removed** from the fingerprint payload rather
than substituted.

The field's only discriminating power was separating two sessions with
byte-identical prose, commits, branch, package, tests and next steps recorded on
different days. That separation is already provided, and provided better, by the
state machine: `cmd_add_session` maps `STATE_COMMITTED` to `STATE_ABSENT` before
the append path runs (`add_session.py:1163`), so an already-committed record is
never adopted no matter what its fingerprint is. A finished session cannot be
resumed by a later identical request; only a **pending** one can.

So the question is only ever "is there an uncommitted record in this worktree
matching these exact inputs?" — and that question has no date in it. Adding one
does not make the match safer; it makes an interrupted retry fail to find its
own record.

This also satisfies the PRD's over-collapse criterion directly: two distinct
sessions on the same day differ in title or summary or commits, so they still
differ in fingerprint. Removing `date` cannot merge them, because `date` was
equal for both of them anyway.

## 2. How already-written markers are matched

Exact recomputation, not a date window.

A v1 entry renders `**Date**: <YYYY-MM-DD>` two lines below its own marker
(`generate_session_content`), so the date that produced a legacy fingerprint is
recoverable **from the entry itself**. Resolution therefore needs no guessing:

1. Compute the v2 (dateless) fingerprint and its marker.
2. If any journal entry carries that marker, use it. Done — this is every
   post-change record, and the cost is the existing single scan.
3. Otherwise scan for entries carrying **any** `MARKER_PREFIX` line in v1 form.
   For each, read its own `**Date**:` value, recompute the v1 fingerprint from
   the current inputs plus that date, and compare against the marker actually
   written there.
4. A unique match means this request's record already exists under the old
   scheme: return that v1 marker as the *effective* marker and let the rest of
   the operation proceed against it unchanged.

Rejected: a bounded ±1 day window. It happens to cover the midnight case in the
PRD but silently fails a retry resumed on Monday from Friday's interruption —
the same defect, one weekend wide, and harder to notice for having been
"handled".

The resumed entry keeps its v1 marker. It is not rewritten. It is an in-flight
record about to be committed; rewriting the marker mid-repair would mean a
journal edit that no state in the machine accounts for.

## 3. Marker version tag

Yes. The marker gains one:

    v1  <!-- trellis-session: fp=<hex16> -->
    v2  <!-- trellis-session: v=2 fp=<hex16> -->

Without it, "is this marker v1 or v2?" is undecidable — both are 16 hex
characters — and step 3 above would have to attempt legacy recomputation against
every marker including v2 ones. With it, the scan can skip anything already
carrying `v=`, and any future scheme change gets the cheap path this one did not
have: read the tag, dispatch, no format archaeology.

## 4. Should `classify_record` distinguish "no marker" from "older scheme"?

No — and the design is arranged so it never has to.

Legacy resolution runs **before** `classify_record` and collapses to a single
value: the effective marker. `classify_record` keeps its current signature and
its current single-scheme contract, and every downstream consumer
(`find_marker_entries`, the journal-recorded and index-recorded repair paths,
the post-commit `content_at_head` re-read) is unchanged.

Pushing the distinction into `classify_record` would spread scheme awareness
across the whole state machine to represent a state — "found, but old" — that
has no distinct behavior: an old-scheme pending record is resumed exactly like a
new-scheme one.

## Shape of the change

`add_session.py` only. No other script, no CLI/TypeScript surface.

    _fingerprint_payload(...)          new; the shared payload dict
    compute_record_fingerprint(...)    loses the `today` parameter
    compute_legacy_fingerprint(...)    new; v1, takes a date, lookup-only
    render_marker(fp)                  emits the v=2 form
    render_legacy_marker(fp)           new; emits the v1 form
    resolve_effective_marker(...)      new; steps 1-4 above
    cmd_add_session                    calls the resolver, drops `today` from
                                       the fingerprint call

`today` stays in the function — `generate_session_content` still renders it, and
`create_new_journal_file` still takes it. Only its role as fingerprint input is
removed.

Two v1 entries whose recomputed fingerprints both match is treated the same way
the existing duplicate-marker case is: an error that refuses to guess. It is not
reachable without a hand-edited journal, but the existing path already declines
to guess in exactly this situation and the new one should not be more willing.

## Compatibility and rollback

Forward: a v1 pending record is resumed by a post-change run (step 3).

Backward: a v2 pending record met by a pre-change binary is not resumed — it
would append a second entry. This is the honest limit of the design, and it is
narrower than it looks: it needs a downgrade *while a record is pending*, which
means an interrupted session and a version rollback inside the same window.
Accepted rather than mitigated; mitigating it would mean writing both markers
into every entry, which puts a permanent cost on every record to buy a case that
requires two rare things at once.

Rollback is `git revert` of the single commit. No stored state migrates, so
there is nothing to undo — v1 markers were never rewritten, and any v2 marker
written in the interim degrades to the backward case above.
