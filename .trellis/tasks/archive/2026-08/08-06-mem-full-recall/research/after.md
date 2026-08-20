# After — same measurements, same corpus, same machine

Everything here is measured with the workspace build after the change, minutes
after `baseline.md`. Same commands, same session ids.

## `extract` turn counts

| Session | Platform | Before | After | Reconciled against the raw file |
|---|---|---|---|---|
| `019fd5a3` | codex (multi-agent, 3 compactions) | 2 | **18** | 15 dialogue + 3 markers; file holds 1 `message/user` + 14 `message/assistant` = 15 |
| `019fac60` | codex (resumed, 1 compaction) | 143 | **145** | 144 dialogue + 1 marker; +1 is the assistant turn the old code discarded before the boundary |
| `29cd623e` | claude (4 compactions) | 100 | **1536** | 305 user + 1227 assistant + 4 markers — exact match to a raw re-scan with the same cleaning applied |
| `019f8466` | pi (1 compaction) | 83 | **181** | 180 dialogue + 1 marker |
| `019f9510` | grok (2 compactions) | n/a (no adapter) | **9** | 1 user + 6 assistant + 2 markers |

`019fac60` is the case that proves `replacement_history` is not a summary: the
rollout starts mid-conversation and the compaction event carries 141 verbatim
user turns that exist nowhere else in the file. Occurrence-counted dedupe keeps
its 15 separate `ok` turns and 8 separate `继续` turns as 15 and 8 — a plain
content `Set` would have collapsed them to one each and lost 24 real turns.

## Search timing

| Query | Scope | Before | After | Δ |
|---|---|---|---|---|
| `compaction` | project | 3.55 s | 3.56 s | +0.3 % |
| `mem adapter` | project | 3.31 s | 3.44 s | +3.9 % |
| `session insight` | project | 3.40 s | 3.49 s | +2.6 % |
| `compaction` | global | 52.21 s | 53.38 s | +2.2 % |
| `langfuse` | global | 54.68 s | 54.75 s | +0.1 % |
| `mem recall` | global | 54.06 s | 54.93 s | +1.6 % |

Global now also scans 589 Grok sessions that were not read before, so ~2 % for a
whole extra platform plus a much larger turn pool is the whole cost. The
dominant cost was and remains per-line `JSON.parse` over the rollout files.

Grok alone, global: **1.3 s** for 589 sessions.

## Search membership — full match sets, not the display cap

Run with `--limit 2000` so the numbers are match counts, not top-20 slices.

| Query | Scope | Before | After | Lost | Gained |
|---|---|---|---|---|---|
| `compaction` | global | 30 | 39 | 11 | 20 |
| `session insight` | project | 6 | 10 | 0 | 4 |

### The 11 lost matches — all one cause

Every lost session is Claude, and every one has the identical hit profile
`hits=1, u=1, a=0`:

```
claude/860b6554-391  0.1667  turns=18     claude/a532a7ab-3ee  0.0133  turns=226
claude/5528be80-c95  0.0625  turns=48     claude/b1b55343-15a  0.0118  turns=254
claude/f717a61c-9df  0.0492  turns=61     claude/7134b26d-48e  0.0109  turns=275
claude/051a0426-a08  0.0417  turns=72     claude/151e4de2-b39  0.0097  turns=308
claude/29cd623e-154  0.0300  turns=100
claude/683c57ee-7a9  0.0291  turns=103
claude/17183839-8be  0.0280  turns=107
```

These are exactly the sessions that carry a Claude compact summary. Their single
occurrence of the word "compaction" was inside Claude's own summary prose — the
conversation itself never used the word. The summary is now marker content and
markers are out of search scoring, so the session stops matching.

That is the intended consequence of the dedupe rule and it cuts both ways:
a topic Claude *paraphrased into English* in a summary is no longer findable by
that English word. It is a real recall trade, priced at 11 single-hit matches
whose top score was 0.17, against 20 sessions whose actual dialogue discusses
the topic and could not be found at all before.

### The 20 gained matches

All Codex, all with real dialogue hits in turns that `turns = []` used to throw
away — e.g. `codex/019fa836-e8d 0.0405 hits=3 turns=74`. The
`session insight` query gained 4 with no losses, including
`codex/019dbf04-f5a hits=18 turns=533`.

## Score movement on sessions present in both runs

Median Δscore is 0.0000 across all six queries: most sessions have no compaction
and are untouched. Movement is confined to compacted sessions, in two
directions:

- **Down** where the denominator grew and the hits did not.
  `codex/019fb201-980` on `langfuse`: 48.5 → 32.67 because `totalTurns` went
  2 → 3. The baseline score was an artifact — the session had been compacted
  down to two surviving turns, and dividing by 2 is what produced 48.5.
- **Up** where the recovered turns carry the keyword.
  `codex/019f17d6-d87` on `session insight`: 0.0444 → 0.0858 with turns
  225 → 711.

The baseline top hits were dominated by `turns=1` / `turns=2` sessions. That was
the scorer measuring how badly a session had been truncated, not how much it was
about the query.

## Corpus-wide sanity

365 Codex rollouts have two or more `compacted` events. Extracting all of them:

```
marker count == compacted-event count : 365 / 365
max turns after change                : 3002
mean turns after change               : 223.7
extraction wall clock                 : 43.5 s for 365 sessions
```

Recovered turns are prepended to the pool, which on a second or later
compaction also places them ahead of the earlier boundary marker. Across those
365 sessions, 32 items are recovered that late and **all 32 are re-injected
AGENTS.md / plugin preamble** — no real dialogue is misplaced on this corpus.

## Gate

```
pnpm build      ok
pnpm lint       ok  (core + cli)
pnpm typecheck  ok  (core build + cli tsc --noEmit)
pnpm test       core 344 passed, 1 skipped (19 files)   [baseline 326 passed / 7 failed / 1 skipped]
                cli 1654 passed (73 files)              [baseline 1653 passed / 1 failed]
```

No dependency added: `@mindfoldhq/trellis-core` still declares zero runtime
dependencies, `package.json` and `pnpm-lock.yaml` are untouched, and the only
imports in the changed mem modules are `node:fs`, `node:os`, `node:path`.
