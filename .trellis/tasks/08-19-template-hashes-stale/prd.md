# Fix `.template-hashes.json` recording hashes that do not match the files written

## Problem

`trellis update` writes template files and records a SHA256 of each into
`.trellis/.template-hashes.json`. For some files the recorded hash disagrees
with the bytes actually written, and for others no entry is recorded at all.
Both make the receipt unusable as a drift signal: a clean vendored tree reports
as locally modified, so real customizations cannot be distinguished from noise.

This was found during the 8-repo fleet rollout to fork build `0.6.16-sd.1`.
The receipt was the primary tool for deciding which local edits were genuine,
and it produced false positives on every repo, forcing a byte-level content
comparison against `packages/cli/dist/templates` instead.

## Evidence

Root cause is confirmed: the receipt records another platform's template under
a `.claude/` key. Full detail in `research/root-cause.md`.

| receipt key | recorded | actually hashes to |
|---|---|---|
| `.claude/agents/trellis-implement.md` | `73b56b3047c0…` | `templates/codebuddy/agents/trellis-implement.md` |
| `.claude/agents/trellis-research.md` | `add4aa4259de…` | `templates/codebuddy/agents/trellis-research.md` |

Disk holds `563d4103381e…` / `ca9b81549ca8…`, matching `templates/claude/agents/*`
exactly, byte-identical across anomaly-metric-creator, rwbp-website and
sd-github-review. rwbp-website records no entry at all for a file that exists.

Not a stale entry: the 0.6.7 and 0.6.16-sd.1 content of
`.claude/agents/trellis-implement.md` hash the same, so the file never changed,
yet the recorded value matches neither. CodeBuddy is not installed in any of
these repos — no `.codebuddy` directory, no `codebuddy` key in the receipt.

The key has lost its platform segment, so the last platform walked wins.

## Scope

The receipt write-back in `trellis update`. `analyzeChanges` classifies a file
whose content already equals its template as `unchanged`, and the write-back
draws only from `newFiles`, `autoUpdateFiles`, and overwritten `changedFiles`.
`unchangedFiles` is never written back, so a wrong or absent entry beside an
already-correct file can never be repaired. See `research/root-cause.md`.

Note: an earlier reading of this blamed the key-construction path for dropping
a platform segment. That was disproved — the current collector emits the correct
hash, and 0.6.7 hashed bytes read from disk. The keys were always right; the
repair path was always missing.

Also in scope: the equivalent gap in `initializeHashes` at init time, if it
classifies already-matching files the same way.

Out of scope: files with legitimate mixed ownership, where a recorded hash is
expected to drift from the working tree after the repository edits its own
content. `.trellis/config.yaml`, `AGENTS.md` and `.github/copilot-instructions.md`
all mismatched in the same audit and are all correct to mismatch. Any fix must
leave those alone; a change that makes them "match" has broken them.

## Acceptance Criteria

- [ ] Immediately after `trellis init` and after `trellis update` on a clean
      tree, every entry in `hashes` matches an LF-normalized SHA256 of the file
      at that path, for all collectors — verified by enumerating the written
      file set, not by spot-checking `.claude/agents/**`.
- [ ] Every file the run writes that belongs in the receipt has an entry; no
      silent omissions of the `rwbp-website` kind.
- [ ] The three mixed-ownership paths above are still permitted to differ, and
      a test pins that so a future fix cannot quietly start hashing them whole.
- [ ] A receipt entry that is wrong or missing for a file already byte-identical
      to its template is corrected by one `trellis update` run. This is the
      regression that matters: it fails today no matter how many times update is
      run.
- [ ] A genuinely customized file is still NOT re-hashed by that same path, so
      the repair cannot silently bless local edits.
- [ ] A regression test stamps templates into a temp repo, poisons one receipt
      entry for a file that matches its template, runs the real update path, and
      asserts the entry is repaired — plus recorded-vs-actual agreement across
      the whole receipt.
