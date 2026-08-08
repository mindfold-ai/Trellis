# Design

## The shape

One change runs through everything: **the turn pool is what the file contains,
not what the model's last context window contained.**

Today each adapter reconstructs the agent's *working context* — which is what a
compaction event is for. Recall wants the *record*. Those are different
artifacts and the code currently only produces the first.

```
file  →  [adapter]  →  turn pool  →  extract / context / search
                          ↑
                 today: post-compaction view
                 after: every dialogue turn, boundary marked
```

## Per adapter

Each drops history a different way, so each needs its own edit, but the rule is
identical: stop discarding, start marking.

| Adapter | Today | After |
|---|---|---|
| codex | `turns = []` on `compacted`, refilled from `replacement_history` | keep collected turns; append a boundary marker; `replacement_history` is **not** re-added as turns — it summarises turns already in the pool |
| claude | `isCompactSummary` user event resets turns, leaves one `[compact summary]` turn | keep collected turns; the summary becomes a boundary marker |
| pi | last `compaction` entry truncates the active path | keep the full active path; mark where the truncation was |
| zcode | compaction markers replace earlier dialogue | same |

The `replacement_history` / summary text is worth keeping as marker content —
it tells a reader what the model itself thought mattered — but it must not be
counted as dialogue, or every compacted session gains phantom turns.

## Multi-agent Codex turns

`agent_message` events carry the real user instructions in multi-agent runs,
shaped `Message Type: NEW_TASK | MESSAGE, Task name: …, Sender: …, Payload: …`.

Two hazards:

1. **Assistant turns are duplicated.** In `019fd5a3` each assistant reply
   appears once as `agent_message` and once as `message/assistant`, adjacent.
   Admitting both doubles the assistant side. Dedupe on content, and verify
   against a session that contains both forms.
2. **Not every `agent_message` is dialogue.** `NEW_TASK` and `MESSAGE` carry
   instructions; other shapes are coordination chatter. Parse the envelope
   rather than admitting the type wholesale, and say in the report which shapes
   were treated as dialogue.

## Grok adapter

```
~/.grok/sessions/<url-encoded-cwd>/<session-id>/chat_history.jsonl
```

Top-level `type`: `user` | `assistant` | `reasoning` | `tool_result` | `system`.
Keep `user` and `assistant`; the rest is noise by the existing rules.

cwd comes from the directory name, URL-decoded — that is what project scoping
needs. `prompt_history.jsonl` at the cwd level is a prompt log, not the
conversation; it may be useful for listing sessions cheaply, but the
conversation comes from `chat_history.jsonl`.

**No database.** `session_search.sqlite` is a search index and is ignored.
This is deliberate: the OpenCode reader was reverted in 0.6.0-beta.4 because a
native SQLite dependency broke Windows installs. Do not add one here, and do
not reach for `mem/internal/sqlite-readonly.ts` either — it exists and is
pure TS, but Grok does not need it and a dependency added "because it's
available" is how the last one arrived.

Grok sessions carry compaction-shaped events too, so this adapter implements
the new pool rule from the start rather than inheriting a fix later.

## Search scoring

Score is `(3 × user_hits + asst_hits) / total_turns`. Adding pre-compaction
turns moves both numerator and denominator, and the compaction summary
restates content that is now also present as turns.

Dedupe explicitly rather than by dropping turns. Then measure: run the old and
new scorer over the same real corpus and report the distribution of the
difference. "Scores changed" is expected; an unexplained *ranking* change is
not, and matters more than the absolute numbers.

## Risks

- **Phantom turns.** Re-adding `replacement_history` as turns while also
  keeping the originals inflates every compacted session. The marker approach
  avoids it; a test should pin it.
- **Silent partial recovery.** If a platform genuinely cannot recover
  pre-compaction content, the output must say so. A truncated conversation that
  looks whole is the failure this task exists to remove.
- **Corpus size.** More turns per session means more work per search. Measure
  the search timing before and after on the real corpus; the skill documents
  ~0.85s project-scoped and ~3s global, so a regression there is user-visible.
