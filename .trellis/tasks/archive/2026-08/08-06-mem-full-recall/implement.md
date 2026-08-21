# Implementation plan

Ordered so the measurement exists before the thing it measures changes.

## 1. Baseline first

Before touching an adapter, capture on the real local corpus:

- `trellis mem extract 019fd5a3` turn count (expected 5)
- search scores and ranking for 2–3 queries, project-scoped and global
- search wall-clock, project-scoped and global

Write these into the task's `research/`. Without them, "scores changed" later
has nothing to compare against.

## 2. Codex adapter — compaction

Stop `turns = []`. Keep collected turns, append a boundary marker carrying the
`replacement_history` text, do **not** re-add that history as turns.

**Verify:** `extract 019fd5a3` recovers the pre-compaction turns; count against
the raw file (27 dialogue events across the three segments, per the PRD).

## 3. Codex adapter — multi-agent turns

Admit `agent_message` envelopes that carry instructions. Dedupe assistant
content that appears in both `agent_message` and `message/assistant`.

**Verify:** `019fd5a3`'s user side appears; assistant turns are not doubled;
counts stated against the raw file. Report which envelope shapes you admitted.

## 4. Claude, Pi, ZCode — same rule

Each drops history differently; apply the same "keep and mark" treatment.

**Verify per adapter** against a real compacted session from the local corpus.
If you cannot find one for a platform, say so rather than asserting it works.

## 5. Search dedupe + measurement

Make the scorer dedupe explicitly. Re-run step 1's queries. Report the score
distribution change and, separately, any ranking change with the reason.

## 6. Grok adapter

`chat_history.jsonl` per session, cwd URL-decoded from the directory name, no
database. Wire into `MemSourceKind`, the platform filter, and the per-command
dispatch — grep for how `zcode` is registered and follow it; that is the most
recently added adapter.

**Verify:** `search` / `extract` / `context --platform grok` all work;
project scoping works; `npm ls` shows no new dependency.

## 7. Full gate

`pnpm build`, `lint`, `typecheck`, `test` from the repo root (core has its own
suite and this task is mostly core). `lint:py` unchanged. Report counts against
the current baseline.

Re-run the search timing from step 1 and report the delta.

## Rollback

Steps 2–4 are per-adapter and independently revertible. Step 6 is additive.
Step 5 is the only one that changes existing behavior for existing platforms,
so it is the one to revert first if ranking turns out worse.
