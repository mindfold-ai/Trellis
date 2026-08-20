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

---

## Correction: the write path is already correct; the receipt has no repair path

The section above pointed at "whatever builds the `relativePath` key for agent
templates". That was wrong, and the evidence says so directly.

`collectClaudeTemplates()` in the current build yields the **correct** hash:

    .claude/agents/trellis-implement.md  563d4103381e   (= templates/claude/agents/*)
    .claude/agents/trellis-research.md   ca9b81549ca8

and 0.6.7's `initializeHashes` hashed `fs.readFileSync(fullPath)` — the bytes on
disk — so it could not have written a CodeBuddy hash under a `.claude/` key
either. Neither the current collector nor the 0.6.7 initializer can produce the
observed entry. The key never lost its platform segment.

### The actual defect

`analyzeChanges` (update.ts ~line 999):

    const existingContent = fs.readFileSync(fullPath, "utf-8");
    if (existingContent === newContent) {
      change.status = "unchanged";
      result.unchangedFiles.push(change);
    }

and the write-back (~line 2701) draws from exactly three buckets — `newFiles`,
`autoUpdateFiles`, and the subset of `changedFiles` that were actually
overwritten. **`unchangedFiles` is never written back.**

So once a file is byte-identical to its template, the receipt entry beside it is
frozen. Whatever it says — a hash from another platform's tree, a value from a
pre-0.6.7 version, or nothing at all — no subsequent `trellis update` can
correct it, because the file never leaves the `unchanged` bucket.

That is self-perpetuating by construction, and it explains both symptoms:

- **Wrong value** (`.claude/agents/*` holding CodeBuddy hashes): written long
  ago by some version, then frozen. The 0.6.7-vs-current content being identical
  is what *guarantees* it stays frozen, rather than being evidence against
  staleness as originally argued.
- **Missing entry** (rwbp-website): a file that already matched its template the
  first time it was seen was classified `unchanged` and so never recorded at all.

### Why the fix is small and provably safe

For `unchangedFiles`, `existingContent === newContent` holds by definition of the
branch. Recording `computeHash(newContent)` for those paths is therefore always
correct — it cannot overwrite a genuine local customization, because a
customized file would not be in this bucket.

The `filesToHash` asymmetry noted earlier (in-memory `newContent` vs disk bytes)
remains cosmetic here and is not the cause.

### What still needs checking

Whether `initializeHashes` at init time has the same gap for files that already
exist and already match — and whether any *other* consumer of `unchangedFiles`
assumes the receipt is authoritative.
