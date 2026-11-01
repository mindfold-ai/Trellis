# Mini-Trellis Memory Layer

> SessionStart orients from journal, spec indexes, and research. It does not create or drive tasks.

## Layers

| Layer | Path | Role |
|-------|------|------|
| Journal | `.trellis/workspace/<dev>/journal-*.md` | Per-developer session notes |
| Research | `.trellis/research/<topic>.md` | Topic inbox. `README.md` is not a topic |
| Spec | `.trellis/spec/**/index.md`, then linked files | Durable contracts. Short markdown |
| Recall | `mini-trellis mem recall "<query>"` | Project Markdown and cross-session dialogue |

## SessionStart contract

- Deliver a short memory entry and the active journal path; do not enumerate research topics or inject their bodies.
- Retrieve relevant rules and research on demand with `mini-trellis mem recall "<query>"`. Use `mini-trellis mem read "<ref>"` only when excerpts lack necessary context or conditions.
- Archived research remains searchable and is marked archived; it is not injected at startup.
- A note can declare successor lineage with front matter or a short preamble mark (`status: superseded` and/or `superseded_by: <repo-relative.md>`). A short chain is followed to the last current note inside the same document sources; recall can include one short excerpt of that note, and `mem read` shows the same path without its body. A missing, escaping, self, cyclic, or too-long target is reported and not treated as the current rule. Nested metadata, one edited section, a newer mtime, or a nearby source edit does not mark the whole note historical.
- After compact, restore the short entry and remember any confirmed conclusions that have not been saved.

## Remember

Save confirmed decisions and reusable findings in the relevant spec/research topic, updating an existing topic when possible. If a README or docs page already states the project description, update that file instead of copying it into a new note. Check the saved content, then record a short journal entry linking to it:

Keep confirmed rules short and faithful. Unconfirmed scope, exceptions, and implementation choices stay open or are labeled as inference, not added to the contract.

```bash
python3 ./.trellis/scripts/add_session.py \
  --title "Short title" \
  --commit - \
  --summary "What happened, what was decided, what to reuse" \
  --topic .trellis/research/example.md
```

Use the actual topic path; omit `--topic` for a handoff without a topic. The script writes journal/index and a relative topic link; it does not edit the topic. Verify the files before reporting completion. Skip ordinary changes and unconfirmed ideas. New notes follow the discussion language; updates keep the original document's language.

Promote durable boundaries into `.trellis/spec/` and link them from the matching `index.md`. Cold research can move into `.trellis/research/archive/`. When a whole note is replaced, leave a superseded mark on the old note pointing at the new path instead of deleting history:

```markdown
---
status: superseded
superseded_by: .trellis/research/new-topic.md
---
```
