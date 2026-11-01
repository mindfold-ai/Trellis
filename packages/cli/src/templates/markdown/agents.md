<!-- TRELLIS:START -->
# mini-trellis

This project uses mini-trellis as a memory layer. Working knowledge lives under `.trellis/`:

- `.trellis/spec/` — durable contracts (short markdown; read `index.md` first)
- `.trellis/research/` — topic inbox (`<topic>.md`; `README.md` is not a topic)
- `.trellis/workspace/` — per-developer journals

Record a session with `/mini-trellis:remember` (Claude/OpenCode), `/mini-trellis-remember` (Pi), `$mini-trellis-remember` (Codex), or the `mini-trellis-remember` skill (Cursor and DeepSeek Harness). When earlier decisions or relevant project rules are needed, use `mini-trellis mem recall "<topic or path>"`; expand evidence with `mini-trellis mem read "<ref>"`. No search is required for unrelated work. Promote lasting boundaries into spec with `mini-trellis-update-spec`.

Record only confirmed decisions, reusable research findings, or the session/compact handoff. Skip ordinary turns and unconfirmed guesses. New installs write notes without an automatic git commit; use `mini-trellis doctor` to check host wiring and `mini-trellis refresh --dry-run` before refreshing assets.

Keep confirmed rules short and faithful. Unconfirmed scope, exceptions, and implementation choices stay open or are labeled as inference, not added to the contract.

For a confirmed update, follow this short order: read the existing topic; edit that file; read it back and check the new rule, limits, and negations; run `python3 ./.trellis/scripts/add_session.py --title "..." --summary "..." --topic <actual-topic-path>`; read the journal and check its topic link. Journal-only success is not topic success; report partial writes accurately. New notes follow the requested or discussion language; updates preserve the document language.

When recall excerpts already answer the question with source and qualifiers, cite them and stop. Expand only missing context; do not repeat a lookup or fall back to dialogue-only `search` merely to reconfirm sufficient evidence.

mini-trellis does not create or drive tasks.

Managed by mini-trellis. Edits outside this block are preserved.
<!-- TRELLIS:END -->
