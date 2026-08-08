# Recover full conversations across compaction; add Grok adapter

## Goal

`trellis mem` should be able to hand back a whole past conversation. Today it
cannot when the session was compacted — and the content it drops is still
sitting in the file it just read.

Three problems, one task because they were all found in one investigation and
two of them touch the same code path.

## How this surfaced

A Codex session (`019fd5c2`) used `mem-recall` to review another Codex session
(`019fd5a3`). The reviewing agent gave up on the tool and said so in its own
summary:

> 这个 session 发生过两次 compact，`trellis mem extract` 只返回了残缺的两轮内容；
> 以上结论是结合原始 Codex rollout 从第一条事件恢复出来的完整脉络。

It read the raw rollout instead. The tool's own consumer routed around it.

## Problem 1 — compaction discards recoverable history (all platforms)

Measured on `019fd5a3`: the rollout holds **457 events** with compaction events
at lines 184 and 329. Every pre-compaction message is still in the file.
`trellis mem extract` returns **5 turns**.

`adapters/codex.ts:174`:

```ts
if (obj.type === "compacted") {
  const rh = obj.payload?.replacement_history;
  turns = [];                    // discards everything already collected
```

This is not a Codex quirk. All four adapters do the same:

| Adapter | Mechanism |
|---|---|
| codex | `compacted` → `turns = []`, replaced by `replacement_history` |
| claude | `isCompactSummary` user event → resets turns, one `[compact summary]` turn |
| pi | last `compaction` entry truncates the active path |
| zcode | compaction markers replace earlier dialogue |

The reasoning is sound **for search scoring** — counting a topic once before
compaction and again in the summary would inflate the score. It is wrong for
**recall**, where the user asked for the conversation and the conversation is
right there.

### Decision (settled 2026-08-06)

**Every real dialogue turn in the file enters the shared pool, including
pre-compaction turns.** No flag, no per-command divergence.

This is a change to the *corpus*, not to how each command selects from it:

| Command | Selection — unchanged | What changes |
|---|---|---|
| `extract` | whole session, `--grep` optional | pre-compaction turns are now in it |
| `context` | hit turns + `--around` neighbours, budgeted | `--grep` can now match pre-compaction content it could never see |
| `search` | one excerpt per session, for ranking | a session whose topic lives only before a compaction stops scoring near zero |

Measured on `019fd5a3`: 10 dialogue events before the first compaction, 4
between the two, 13 after — **27 in the file, 5 returned**. Fourteen of those
are discarded purely by the compaction rule.

The compaction boundary is rendered as a marker in the output, not as a
replacement, so a reader can see where the model's own context was cut.

Cleaning rules do not change. That same file holds 102 `reasoning`, 90
`custom_tool_call` and 95 `token_count` events; none of them become turns.
This recovers dialogue that was hidden, it does not admit noise.

Search scoring must now dedupe explicitly, because the compaction summary and
the turns it summarises are both in the pool and would otherwise count the
same topic twice. Compare scores on a real corpus before and after; report any
movement and why.

A compacted session must never look complete when it is not. If content is
still unrecoverable, say so in the output.

## Problem 2 — multi-agent sessions lose the entire user side

The same session is a multi-agent run. The user's instructions arrive as
`agent_message` events shaped
`Message Type: NEW_TASK | MESSAGE, Task name: …, Sender: /root, Payload: …`.
The adapter only recognises `payload.type === "message"` with role
`user`/`assistant`.

Result: across 457 events there is exactly **one** `message/user`, and it is a
`<recommended_plugins>` injection that cleaning correctly strips. Every real
instruction is invisible. This is independent of compaction — such a session
loses its user side even uncompacted.

Assistant turns meanwhile appear **twice** (once as `agent_message`, once as
`message/assistant`), so naive inclusion would double them. Dedupe on content,
and confirm against a session that has both.

## Problem 3 — no Grok adapter

Storage, confirmed on this machine:

```
~/.grok/sessions/<url-encoded-cwd>/<session-id>/chat_history.jsonl
~/.grok/sessions/<url-encoded-cwd>/prompt_history.jsonl
~/.grok/sessions/session_search.sqlite
```

`chat_history.jsonl` carries the conversation with a top-level `type` of
`user` / `assistant` / `reasoning` / `tool_result` / `system`. cwd is
URL-encoded in the directory name, which is what project scoping needs.

**`session_search.sqlite` is only a search index and can be ignored.** That
matters: the OpenCode reader was reverted in 0.6.0-beta.4 because a native
SQLite dependency broke Windows installs. Grok needs no database at all. (Note
`mem/internal/sqlite-readonly.ts` already exists — a pure-TS reader — so even
a future SQLite need would not require a native dependency. Relevant to
restoring OpenCode later; out of scope here.)

Grok sessions also carry compaction-shaped events, so Problem 1 applies to
this adapter from day one rather than as a follow-up.

## Requirements

- Recall must be able to return the conversation that exists in the file. Where
  it cannot, the output says what was lost and why.
- All adapters behave consistently. A user should not have to know which
  platform a session came from to know whether they got the whole thing.
- Multi-agent Codex sessions expose their user side, without duplicating
  assistant turns.
- Grok adapter with no database dependency, and no new native dependency of any
  kind.
- Search scores are either unchanged or the change is quantified and justified.

## Acceptance Criteria

- [ ] `trellis mem extract 019fd5a3` returns the conversation, not 5 turns.
      Compare against the raw rollout and state the counts.
- [ ] A compacted session that still loses content says so in its output.
- [ ] The multi-agent user turns in `019fd5a3` appear, assistant turns are not
      duplicated, and the count is verified against the raw file.
- [ ] `trellis mem search/extract/context --platform grok` works; project
      scoping by cwd works; no SQLite and no native dependency added.
- [ ] Search scores before/after are compared on a real corpus and the
      difference is reported.
- [ ] Existing mem tests pass; new behavior is covered per adapter, driving
      real fixture files rather than mocks.

## Out of Scope

- Restoring the OpenCode reader.
- Any indexing, caching or daemon. `trellis mem` is stateless by design.
- Changing the cleaning rules for system prompts and tool noise.
