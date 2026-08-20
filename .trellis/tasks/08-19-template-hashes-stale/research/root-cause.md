# Root cause: cross-platform key collision in the template receipt

## Confirmed finding

`.trellis/.template-hashes.json` records, under a `.claude/` key, the hash of a
*different platform's* template that happens to share the same relative path
below its platform root.

| receipt key | recorded hash | what actually hashes to it |
|---|---|---|
| `.claude/agents/trellis-implement.md` | `73b56b3047c0…` | `templates/codebuddy/agents/trellis-implement.md` |
| `.claude/agents/trellis-research.md` | `add4aa4259de…` | `templates/codebuddy/agents/trellis-research.md` (also `qoder/`, identical) |

The bytes actually on disk hash to `563d4103381e…` and `ca9b81549ca8…`, which
match `templates/claude/agents/*` exactly. So the written file is correct; the
receipt entry beside it is not.

## Why it is a collision and not a stale entry

The pre-upgrade (0.6.7) content and the post-upgrade content of
`.claude/agents/trellis-implement.md` are the *same* hash, `563d4103381e…`.
The file did not change across the upgrade. The recorded value matches neither
version, so it was never produced by this path at any version — it came from
another platform's template tree.

CodeBuddy is not even installed in these repositories: there is no `.codebuddy`
directory and the receipt holds no `codebuddy` key. The collector is reading
template trees for platforms the user never selected.

`trellis-research.md` is byte-identical between `codebuddy/` and `qoder/`, so
which one "wins" is not observable there; `trellis-implement.md` differs
between them and resolves to CodeBuddy, i.e. last-write-wins over a key that
has dropped its platform segment.

## Where to look

`update.ts` builds `filesToHash` from three sources (~line 2700):

    for (const file of changes.newFiles)        filesToHash.set(file.relativePath, file.newContent)
    for (const file of changes.autoUpdateFiles) filesToHash.set(file.relativePath, file.newContent)
    for (const file of changes.changedFiles)    // verifies content === file.newContent first

Only the third branch compares against disk. That asymmetry is worth fixing on
its own — `updateHashFromFile()` already hashes post-write bytes — but it is
NOT the cause here, because the disk bytes are correct and the recorded value
comes from another platform's tree. The defect is upstream of this, in whatever
builds the `relativePath` key for agent templates.

## Blast radius note

Any fix must be checked against the whole receipt, not the two files that
surfaced this. The same basename appears under ~17 platform template roots
(`agents/trellis-implement.md` exists for claude, codebuddy, qoder, trae,
gemini, cursor, grok, omp, pi, reasonix, snow, kimi, zcode, droid, opencode…),
so any other collector keying below a platform root can collide the same way.
Enumerate collectors; do not spot-check `.claude/agents/**`.
