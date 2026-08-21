# Prune receipt entries whose file no longer exists

## Problem

`.trellis/.template-hashes.json` gains entries but never loses them. When a
file that was once recorded disappears from disk and is no longer something
Trellis writes, its entry survives every subsequent `trellis update`.

Found during the `0.6.16-sd.4` fleet rollout: `sd-github-review`'s receipt
carried four `.trellis/scripts/__pycache__/*.pyc` entries for files that had
long since been deleted. `trellis update` neither re-added nor removed them.
They were pruned by hand, which is the whole point of filing this — a receipt
that needs manual maintenance is not a receipt.

A dead entry is not cosmetic. Anything reading the manifest as "files Trellis
owns" sees a path Trellis does not own: `getConfiguredPlatforms` infers
installed platforms from manifest keys, and `uninstall` builds its removal
plan from them.

## Root cause

`pruneOrphanManifestKeys` (`utils/manifest-prune.ts`) already removes manifest
keys no platform configurator owns — but it opens with a blanket exemption:

    // Always preserve .trellis/ entries
    if (key.startsWith(".trellis/") || key === ".trellis") { kept[key] = value; continue; }

Its two stated reasons for the exemption both hold only for entries whose file
still exists:

  1. uninstall removes `.trellis/` wholesale via `rm -rf`, so manifest accuracy
     there cannot cause data loss;
  2. `update` needs those entries to detect user-modified workflow files.

Neither reason applies to an entry with no file behind it. Nothing is detected
about a file that is not there, and nothing is protected from a `rm -rf` that
does not consult the manifest.

The exemption cannot be narrowed in place: `pruneOrphanManifestKeys` runs at
`update.ts:2243`, before `collectTemplateFiles` builds the `.trellis/` template
set at `update.ts:2276`, so at that point it cannot tell a `__pycache__`
leftover from a template file the user deliberately deleted.

## Scope

A second, narrower prune in `update.ts`, alongside `collectUnchangedFileHashRepairs`,
where the resolved `templates` map is in scope. An entry is stale only when
**all three** hold:

  - the key is under `.trellis/` (everything else is already covered by
    `pruneOrphanManifestKeys`);
  - the key is not in the template set for this run;
  - no file exists at that path.

Out of scope: entries for files the user deliberately deleted. Those are still
in the template set, so the second condition rejects them and `analyzeChanges`
keeps classifying them `userDeletedFiles`. Removing such an entry would make
the next `update` see the path as `new` and silently reinstate a file the user
removed on purpose — a worse bug than the one being fixed.

Also out of scope: `.trellis/` entries whose file still exists but which are
absent from the template set (`.trellis/spec/**` and friends). They are
excluded from hash tracking to begin with; leaving them alone is conservative.

## Acceptance Criteria

- [ ] A receipt entry under `.trellis/` with no file on disk and no template is
      removed by one `trellis update` run, on both the early-return
      ("Already up to date!") path and the full update path.
- [ ] An entry for a template file the user deleted is NOT removed, and the
      file is NOT reinstated.
- [ ] An entry whose file still exists is never removed, whether or not it is
      in the template set.
- [ ] Non-`.trellis/` behaviour is unchanged; `pruneOrphanManifestKeys` keeps
      its existing contract and tests.
- [ ] The count of pruned entries is reported in the update summary. A prune
      that reports nothing reads as "nothing was stale".
- [ ] Regression tests cover each criterion above, driven through the real
      `update()` entry point rather than by calling the collector directly.

## Verification

`pnpm typecheck && pnpm lint && pnpm build && pnpm test` clean, and the
`test/regression.test.ts` parity guard still byte-matches `.trellis/scripts/*`
against `packages/cli/src/templates/trellis/scripts/*`.

## Outcome

Fixed. `collectStaleTrellisHashKeys` in `update.ts` sits beside
`collectUnchangedFileHashRepairs`, where the resolved `templates` map is in
scope, and both write-back sites consume it — including the early-return
"Already up to date!" exit, which is the clean tree a user updates *in order
to* repair the receipt. `removeHashes` in `template-hash.ts` drops the keys in
one rewrite rather than one per key.

`pruneOrphanManifestKeys` was left untouched. Its `.trellis/` exemption is
still correct for everything it can see at the point it runs.

### What the field audit changed about the scope

Enumerating every repo on disk with a `.trellis/` directory — rather than
working from the eight this had been assumed to cover — found eleven, one of
them Trellis itself, and turned up one live stale-looking entry:

    ~/repos/ai/Trellis   .opencode/package.json   recorded, no file on disk

That is **not** this defect. `.opencode/package.json` is a shipped template
(it carries `"type": "module"` so `.opencode/lib/*.js` and `plugins/*.js` load
as ESM), so it is a respected deletion, and pruning it would reinstate the file
on the next update. It is pinned by the
"leaves entries outside .trellis/ to pruneOrphanManifestKeys" test precisely so
a later widening of this prune cannot swallow it.

It is, separately, a real defect in this repository's own dogfood tree: there
is a `.opencode/package-lock.json` with no manifest beside it. Filed as an
observation, not fixed here.

### Verification

Each new test was run against the un-fixed source first. The two that assert a
prune fail there:

    AssertionError: expected [ …(166) ] to not include '.trellis/scripts/__pycache__/get_cont…'
      ✗ removes an entry for a file that is gone and is not a template
      ✗ removes it on the 'Already up to date!' path too

The three that assert something is *kept* pass both before and after, which is
what they are for.

Full gate on the fixed tree: `pnpm typecheck`, `pnpm lint`, `pnpm build` clean;
`pnpm test` 77 files / 1854 tests passed (1849 before, +5); `lint:py`
0 errors; `py_compile` over every tracked `.py` clean; `.trellis/scripts` still
byte-identical to `packages/cli/src/templates/trellis/scripts`.
