# Research: `configure` vs `collectTemplates` inventory (Phase 1)

- **Query**: For each of the 21 platforms in `AI_TOOLS`, what does `configure` do
  that `collectTemplates` does not, what does `collectTemplates` cover that
  `configure` does not, and is the file set genuinely identical or only assumed?
- **Scope**: internal (`packages/cli/src/configurators/`, `commands/update.ts`,
  `utils/manifest-prune.ts`, `test/configurators/`, `test/regression.test.ts`)
- **Date**: 2026-08-06
- **Method**: static read of all 21 configurators + **empirical differential run**
  (see "How the file sets were verified"). Nothing in this document marked
  "verified" is inferred from reading alone.

---

## TL;DR

- **20 of 21 platforms are pure file emission** and are convergeable with no
  residue at all.
- **1 platform (codex) is `partly`** — one named imperative residue that cannot
  be a `Map<path, content>`: it creates an intentionally-empty directory.
- **The file sets are genuinely identical**, not assumed — verified by running
  both paths and diffing, for all 21 platforms, under both the POSIX and the
  Windows (`python3`→`python`) rendering modes. Zero path differences, zero byte
  differences.
- **The existing byte-parity test is one-directional** and does not prove this.
  It asserts `collectTemplates ⊆ disk`; it never asserts `disk ⊆ collectTemplates`.
  The whole class of "configure writes a file collectTemplates forgot" — which
  has already shipped once (see §Historical) — is uncovered.
- **One live divergence found**, in the `--with-statusline` opt-in path. It is
  half-deliberate: the exclusion from `collectTemplates` is intentional and
  test-locked, but a downstream consequence (manifest pruning) appears
  unintended and is user-visible. Details in §Live divergence. **Not fixed.**
- Three more sites are **latent** divergences that are currently correct only by
  accident (§Latent hazards).

---

## Summary table

Verdicts: **convergeable** = pure file emission, `configure` can be replaced by
"write `collectTemplates()`" with no loss. **partly** = pure emission plus a
named imperative residue that must survive. **not** = cannot be expressed as a map.

| # | Platform | `collectTemplates` lives at | Files | Verdict | Blocking / residual behavior |
|---|---|---|---|---|---|
| 1 | `claude-code` | `index.ts:175-194` | 52 | **convergeable** | none in the default path. `withStatusline` option is a *separate* opt-in branch — see §Live divergence |
| 2 | `cursor` | `index.ts:198-215` | 52 | **convergeable** | none |
| 3 | `opencode` | `opencode.ts:86-100` | 55 | **convergeable — already done** | `configure` literally iterates `collectOpenCodeTemplates()` (`opencode.ts:106-112`). Reference implementation |
| 4 | `codex` | `index.ts:223-250` | 54 | **partly** | (a) `ensureDir(.codex/skills)` — deliberately-empty dir, `codex.ts:169`; (b) `preserveCodexAgentModelKeys` post-processor, `codex.ts:187`; (c) stderr warning, `codex.ts:223-232` |
| 5 | `kilo` | `index.ts:254-259` | 46 | **convergeable** | none |
| 6 | `kiro` | `index.ts:263-289` | 53 | **convergeable** | none |
| 7 | `gemini` | `index.ts:293-321` | 52 | **convergeable** | none |
| 8 | `antigravity` | `index.ts:325-330` | 46 | **convergeable** | none |
| 9 | `devin` | `index.ts:334-339` | 46 | **convergeable** | none |
| 10 | `qoder` | `index.ts:343-365` | 52 | **convergeable** | none |
| 11 | `codebuddy` | `index.ts:369-390` | 53 | **convergeable** | none |
| 12 | `copilot` | `index.ts:394-431` | 53 | **convergeable** | none in the configurator. The managed-block merge for `copilot-instructions.md` lives in `update.ts:906-911`, already factored as a post-processor |
| 13 | `droid` | `index.ts:435-453` | 53 | **convergeable** | none |
| 14 | `pi` | `pi.ts:35-68` | 51 | **convergeable** | none |
| 15 | `reasonix` | `reasonix.ts:29-55` | 47 | **convergeable** | none |
| 16 | `zcode` | `zcode.ts:38-76` | 53 | **convergeable** | none. stderr warning at `zcode.ts:116-122` is not a file and not a residue |
| 17 | `trae` | `index.ts:469-491` | 52 | **convergeable** | none |
| 18 | `omp` | `omp.ts:20-54` | 49 | **convergeable** | none |
| 19 | `grok` | `grok.ts:32-58` | 49 | **convergeable** | none |
| 20 | `kimi` | `kimi.ts:64-87` | 49 | **convergeable** | none |
| 21 | `snow` | `snow.ts:75-107` | 55 | **convergeable** | none |

**Convergeable: 20/21. Partly: 1/21 (codex). Not convergeable: 0/21.**

Nothing in any configurator does any of the things the PRD warned about, with
the single exception noted for codex:

| PRD's list of blockers | Found? | Where |
|---|---|---|
| merging into a user-owned file | **No** — not in any configurator. Exists only in `update.ts:239-247` (`buildCopilotInstructionsTemplate`) and `update.ts:229-237` (`buildAgentsMdTemplate`), both already post-processors over the map | — |
| preserving local edits | **Once**, and already shaped as a map post-processor | `codex.ts:127-142`, called from `codex.ts:187` and `update.ts:921` |
| reading what exists on disk and branching | **Once** — same as above | `codex.ts:135` |
| `chmod` / permissions | **No** — zero in the 21 platform configurators. The only `executable: true` in the whole tree is `workflow.ts:140`, which writes `.trellis/scripts` and is not a platform | — |
| creating a directory whose existence is the point | **Once** | `codex.ts:169` |
| ordering constraints between writes | **No** — verified by construction: every configurator writes disjoint paths, and `configure` is idempotent for all 21 (verified) | — |

---

## How the file sets were verified

Static reading cannot answer "is the file set genuinely identical". These were
measured. Scripts in the session scratchpad (not committed); reproduce with
`packages/cli/dist` built from current `src` (dist confirmed newer than src).

**Run 1 — default path, all 21 platforms.** For each platform: `configurePlatform(id, tmpdir)`
into a clean temp dir, recursive walk of the result, set-diff and byte-diff
against `collectPlatformTemplates(id)`.

> Result: **`onlyOnDisk: []`, `onlyInTemplates: []`, `contentMismatch: []` for all
> 21.** File counts in the table above are from this run. One non-file residue:
> `codex` reports one empty directory, `.codex/skills`.

**Run 2 — Windows rendering.** Same, with `setResolvedPythonCommand("python")`.
This matters because `collectPlatformTemplates` applies the `python3`→`python`
rewrite uniformly via `replaceInMap` (`index.ts:142-148, 620-625`) while
`configure` applies it at ~30 scattered call sites; a missed call site is
invisible on macOS/Linux.

> Result: **no divergence on any platform.**

**Run 3 — idempotency.** `configure` twice into the same dir, byte-compare
snapshots.

> Result: **all 21 idempotent.** No ordering or accumulate-on-rerun behavior.

**Run 4 — conditional/stateful paths** (the ones runs 1-3 cannot reach):

| Scenario | Result |
|---|---|
| `claude-code` with `{withStatusline: true}` | **diverges** — `onlyOnDisk: [".claude/hooks/statusline.py"]`, `contentMismatch: [".claude/settings.json"]`. See §Live divergence |
| `codex` re-init over an agent toml the user edited with `model = "gpt-5-codex"` | **diverges by design** — user keys survive on disk (correct); `collectPlatformTemplates("codex")` does *not* contain them. Compensated at `update.ts:920-922`. See §Codex |

---

## Live divergence: `--with-statusline`

**This is the one finding to act on. It has not been fixed.**

### What happens

`configureClaude` under `options.withStatusline === true` does two things that
`collectTemplates` does not describe:

1. writes `.claude/hooks/statusline.py` — `claude.ts:125-130`
2. injects a `statusLine` key into `.claude/settings.json` via `injectStatusLine`
   — `claude.ts:49-56`, called from `claude.ts:83-88`

`collectPlatformTemplates("claude-code")` (`index.ts:175-194`) has no knowledge of
either. Verified: with the flag on, `statusline.py` is on disk and absent from the
map, and `settings.json` bytes differ from the map's entry.

### Which half is deliberate

The **exclusion itself is intentional and locked by a test**:

- `templates/claude/index.ts:66-72` — "intentionally NOT part of `collectTemplates`
  — `trellis update` must never force-install it on opted-out projects."
- `test/regression.test.ts:976-986` — asserts `.claude/hooks/statusline.py` is
  **not** in the collected keys, because `analyzeChanges()` treats
  collected-but-absent as `newFiles` and would install it on everyone.
- The `settings.json` half is compensated downstream: `preserveExistingClaudeStatusLine`
  (`update.ts:697-733`, called at `update.ts:924`) re-reads the user's on-disk
  `statusLine` and grafts it onto the fresh template, so update does not clobber
  it. `claude.ts:41-47` documents that `injectStatusLine` mirrors that function
  byte-for-byte precisely so the two agree.

So far, coherent.

### The half that looks unintended

Nothing accounts for `manifest-prune.ts`. Chain, **verified empirically**:

1. `trellis init --with-statusline` writes `.claude/hooks/statusline.py` and the
   init write-recorder captures it → it lands in `.trellis/.template-hashes.json`.
   (verified: `startRecordingWrites` set contains it)
2. `pruneOrphanManifestKeys` (`manifest-prune.ts:125-165`) builds its "known keys"
   set from `collectPlatformTemplates()` for configured platforms plus migration
   `from`/`to` paths (`manifest-prune.ts:62-80`). `statusline.py` is in neither —
   it is excluded from `collectTemplates` by design, and
   `test/regression.test.ts:966-974` asserts it is deliberately absent from
   migrations too.
3. Therefore the next `trellis update` or `trellis uninstall` prunes it.
   **Verified**: `pruned: ['.claude/hooks/statusline.py']`, still on disk, no
   longer tracked.

### User-visible consequence

For a user who opted in with `trellis init --with-statusline`, after their first
subsequent `trellis update`:

- **`statusline.py` is frozen forever.** It is untracked, so `update` never
  refreshes it. This is not hypothetical — that file has shipped real bug fixes
  (`0.5.0-beta.14` fixed a Windows crash where `sys.stdout.detach()` threw on
  typed streams). An opted-in user who updates before the fix ships never
  receives it.
- **`trellis uninstall` leaves it behind.** Uninstall unlinks manifest entries;
  this one is gone from the manifest. The user gets an orphan `.claude/hooks/`
  file after uninstalling.
- Meanwhile `.claude/settings.json` keeps its `statusLine` entry (correctly
  preserved by `update.ts:697`), so the setting points at a file uninstall
  did not remove.

**Severity: low, and narrow** — only affects users who passed `--with-statusline`.
**Is it a live bug?** The freeze and the uninstall orphan are real and I can find
no comment or test acknowledging either; both read as unintended fallout from a
deliberate exclusion. Reported, not fixed, per the PRD.

**Phase 2 implication:** the `withStatusline` branch is the one place where
"`configure` = write `collectTemplates()`" is genuinely wrong for `claude-code`.
It must survive as an explicit post-write step keyed off the option, and it must
not restate the base file list.

---

## Test coverage: what the oracle actually asserts

The PRD calls the byte-identity assertion "already asserted" and treats it as the
safety net. It is weaker than that.

**`test/configurators/platforms.test.ts:180-210`** — "configurePlatform writes
collected templates byte-for-byte for every platform":

```js
for (const [relativePath, expectedContent] of templates) {   // line 196
  expect(fs.existsSync(targetPath)).toBe(true);              // line 198-201
  expect(readConfiguredFile(platformDir, relativePath)).toBe(expectedContent);
}
```

It iterates **`collectTemplates`** and checks each entry against disk.

| Direction | Asserted? |
|---|---|
| every `collectTemplates` entry exists on disk with identical bytes | **yes** |
| every file `configure` wrote appears in `collectTemplates` | **no — nothing asserts this** |

So a file that `configure` writes and `collectTemplates` omits passes the suite
silently. That is precisely the failure mode the PRD is worried about, and it is
the one the oracle does not cover. My Run 1 covers it today; nothing in CI does.

Other tests touching both paths, and what they leave uncovered:

| Test | Asserts | Gap |
|---|---|---|
| `platforms.test.ts:116-131` | each platform is detected from its own tracked files | uses the write-recorder, but only checks detection, not set equality |
| `platforms.test.ts:1330-1356` (`pi` "writes tracked templates exactly") | 3 hand-picked files | "exactly" is a misnomer — it is a spot check, not set equality |
| `platforms.test.ts:840-939` (`zcode` "writes only .zcode-owned skills") | specific absences (`.agents/skills` must not exist) | hand-enumerated negatives only |
| `regression.test.ts:8283-8294` | one copilot agent file matches | single file |
| `regression.test.ts:976-986` | `statusline.py` absent from collected keys | locks the exclusion; says nothing about the manifest consequence |
| `codex.test.ts:149-235` | `preserveCodexAgentModelKeys` unit behavior | does not compare the two paths |

**Note for Phase 2 acceptance.** The PRD says "if a test needed editing to pass,
that is a behavior change". Given the above, the converse also holds: *the
current tests passing does not prove equivalence in the uncovered direction.*
Adding the reverse assertion (`disk ⊆ collectTemplates`, modulo a named
allowlist for `statusline.py`) would turn the oracle into a real one. That is an
addition, not an edit, so it does not violate the no-behavior-change rule.

---

## Latent hazards — currently correct by accident

Three sites where `configure` writes content **without** `replacePythonCommandLiterals`
while `collectPlatformTemplates` applies it uniformly through `replaceInMap`
(`index.ts:142-148`, applied at `index.ts:623-624`). They agree today **only
because those particular template files contain no `python3` literal** (verified:
grep count 0 in all four files). Any future edit adding one produces a
Windows-only permanent phantom-drift report on `trellis update`.

| Site | Written raw at | Collected + rewritten at | `python3` count today |
|---|---|---|---|
| `.snow/SNOW.md` | `snow.ts:145` | `snow.ts:67` → `replaceInMap` | 0 |
| `.github/copilot-instructions.md` | `copilot.ts:37-40` | `index.ts:426` → `replaceInMap` | 0 |
| `.reasonix/skills/<agent>/SKILL.md` | `reasonix.ts:77` | `reasonix.ts:51` → `replaceInMap` | 0 |

A fourth, structural rather than content-based:

| Site | Hazard |
|---|---|
| `claude.ts:62-92` (`copyDirFiltered`) | `configure` derives Claude's file set by **walking the template source directory**; `collectTemplates` re-derives it from `getClaudeAgents()` + `getClaudeSettings()`. Two independent descriptions. They agree today because `getAllAgents()` (`templates/claude/index.ts:44-57`) also reads the directory dynamically, and the only other non-excluded file is `settings.json`. Adding any new file at a new location under `src/templates/claude/` — e.g. a root-level `foo.json`, or a new subdirectory — ships via `configure` and is silently invisible to `collectTemplates`. Converging Claude onto the map removes this hazard entirely. |

`opencode` had the same shape and **already solved it**: `walkOpenCodeTemplateDir()`
(`opencode.ts:47-77`) is called by `collectOpenCodeTemplates()`, and
`configureOpenCode` (`opencode.ts:106-112`) just writes that map. One walk, one
description. This is the pattern Phase 2 should generalize.

---

## Per-platform detail

Grouped by shape. Platforms in the same group are identical in structure; the
evidence is given once per group.

### Group A — `configure` already derives from `collectTemplates` (1)

**`opencode`** — `opencode.ts:106-112`:

```ts
export async function configureOpenCode(cwd: string): Promise<void> {
  for (const [relPath, content] of collectOpenCodeTemplates()) {
    const absPath = path.join(cwd, relPath);
    ensureDir(path.dirname(absPath));
    await writeFile(absPath, content);
  }
}
```

Already converged, zero residue. **convergeable (no-op).** Use as the template
for the shared writer.

### Group B — plain emitters, no state, no options (18)

`cursor`, `kilo`, `kiro`, `gemini`, `antigravity`, `devin`, `qoder`, `codebuddy`,
`copilot`, `droid`, `pi`, `reasonix`, `zcode`, `trae`, `omp`, `grok`, `kimi`,
`snow`.

(Group A 1 + Group B 18 + Group C 1 + Group D 1 = 21.)

Every one has the same shape: `ensureDir` a few directories, then `writeFile` /
`writeSkills` / `writeAgents` / `writeSharedHooks` over content resolved from the
same helpers `collectTemplates` uses. Representative — `configureGrok`
(`grok.ts:63-89`) against `collectGrokTemplates` (`grok.ts:32-58`): same three
loops, same three roots, same resolvers, different verbs.

- **What `configure` does that `collectTemplates` does not:** nothing except
  `ensureDir` calls, and every one of those is immediately followed by writes
  into that same directory (verified by audit of all `ensureDir` call sites), so
  the directory is created as a side effect of writing files into it. Not a
  residue.
- **What `collectTemplates` covers that `configure` does not:** nothing, on any
  of them.
- **Identical, or assumed?** Verified identical — Runs 1-3.
- **Verdict: convergeable.**

Two non-file notes, neither blocking:

- **`zcode`** — `zcode.ts:116-122` writes a one-shot hint to stderr ("ZCode loads
  hooks at session start, open a NEW session"), gated on `!VITEST && !TRELLIS_QUIET`.
  A console side effect, not a file. It must survive Phase 2 but it does not
  restate any file list, so it composes cleanly as a post-write step.
- **`copilot`** — the configurator itself is a plain emitter. The interesting
  behavior for this file lives in `update.ts`: at `update.ts:906-911` the map's
  `COPILOT_INSTRUCTIONS_PATH` entry is **overwritten** with
  `buildCopilotInstructionsTemplate(cwd)`, which merges the Trellis managed block
  into a possibly user-owned `.github/copilot-instructions.md`
  (`update.ts:239-247` → `update.ts:208-227`). On a fresh project the file is
  absent and `buildManagedBlockTemplate` returns the template verbatim
  (`update.ts:216-218`), so init and update agree — which is why Run 1 shows no
  divergence. **This is a merge-into-user-file, but it is already correctly
  factored as a post-processor over the map and is out of the configurator's
  scope.** Phase 2 should not move it.

### Group C — `partly`: `codex` (1)

`configureCodex` (`codex.ts:150-240`) vs `collectTemplates` (`index.ts:223-250`).
54 files, verified byte-identical (Runs 1-2). Three things `configure` does that
the map does not describe:

**(a) An intentionally-empty directory — the only true non-map behavior in the
whole registry.** `codex.ts:167-169`:

```ts
// Trellis ships no Codex-specific skills; the workflow skills all land in
// .agents/skills/ above, which Codex reads too. The directory is still
// created so users have the conventional place for their own Codex skills.
ensureDir(path.join(codexRoot, "skills"));
```

Verified: Run 1 reports `emptyDirs: [".codex/skills"]` for codex and for no other
platform. A `Map<path, content>` cannot express an empty directory. This is the
named residue that makes codex `partly` rather than `convergeable`.
Cross-reference: `manifest-prune.ts:7` cites "user-added `.codex/skills/<custom>/`"
as exactly the user-owned data the manifest must not claim — so the directory is
load-bearing and deliberate.

**(b) Preserved user edits.** `codex.ts:127-142` (`preserveCodexAgentModelKeys`)
reads each existing on-disk `.codex/agents/trellis-*.toml`, extracts the user's
`model` / `model_reasoning_effort`, and re-injects them into the fresh render.
Called from `codex.ts:187`.

- Verified: after a re-init over a user-edited toml, `model = "gpt-5-codex"`
  survives on disk; `collectPlatformTemplates("codex")` does **not** contain it.
- **Not a bug** — compensated at `update.ts:920-922`, which calls the *same
  exported helper* on the merged map before hash comparison, so update does not
  flag the user's edit as a conflict.
- Structurally this is already **"build map → post-process map → write"**, which
  is the shape the PRD asks for. `configureCodex` builds `agentTomls` as a map
  (`codex.ts:180-186`), post-processes it (`:187`), then writes it (`:188-190`).
  It is the closest thing in the codebase to the target design and should be
  preserved as-is.

**(c) A stderr warning.** `codex.ts:223-232` — the `features.hooks = true`
/ `/hooks` approval notice, gated on `!VITEST && !TRELLIS_QUIET`. Console side
effect, same category as zcode's.

**Verdict: partly.** Residue to name in the Phase-2 comment: *"`.codex/skills/`
is created empty on purpose — a `Map<path, content>` cannot express a directory
with no files, and Codex users need the conventional location for their own
skills."* (b) and (c) compose after the shared writer and do not restate the
file list.

### Group D — `claude-code`: convergeable base, opt-in branch (1)

Default path: 52 files, verified identical, no residue. **The base is convergeable.**

The `withStatusline` branch is covered in §Live divergence. For Phase 2 it is not
a blocker to converging the base file set — it is an extra post-write step
conditioned on an option that `collectTemplates` has no parameter for. Converging
Claude also retires the `copyDirFiltered` structural hazard described in §Latent
hazards.

---

## Historical: this class of bug has shipped before

Not speculation — it is in the shipped changelog. `migrations/manifests/0.5.7.json`:

> "fix(codex): write `trellis-start` skill on update path, not just init. 0.5.5's
> `configureCodex()` writes `.agents/skills/trellis-start/SKILL.md` … but
> `collectPlatformTemplates.codex.collectTemplates()` (used by `trellis update`)
> was missed. Result: users upgrading from 0.4.x to 0.5.5/0.5.6 ran the
> safe-file-delete migration that removed `.agents/skills/start/`, then
> `trellis update` regenerated all the other trellis-* skill dirs from
> `collectTemplates`, but never wrote `trellis-start`. Their AI then reported
> 'no .agents/skills/trellis-start/SKILL.md' on every turn…"

That is exactly the uncovered direction of the parity test (§Test coverage): a
file `configure` wrote that `collectTemplates` omitted. It shipped to users. The
fix at the time was to add the missing entry to the second list — this task
removes the second list.

---

## Structural notes for Phase 2

- **Three shapes of `collectTemplates` today.** 9 platforms go through the shared
  `collectBothTemplates` helper (`index.ts:151-170`): `claude-code`, `cursor`,
  `kilo`, `antigravity`, `devin`, `qoder`, `codebuddy`, `droid`, `trae`.
  4 are hand-rolled inline in `index.ts`: `codex`, `kiro`, `gemini`, `copilot`.
  8 delegate to a `collect*Templates` in their own file: `opencode`, `pi`,
  `reasonix`, `zcode`, `omp`, `grok`, `kimi`, `snow`. (9+4+8 = 21; matches the
  PRD's "roughly eight hand-rolled".)
- **The 8 that delegate already have the description in one file** next to
  `configure`. Those are the cheapest to converge — `configure` becomes a loop
  over the local `collect*`, exactly like `opencode`.
- **`replaceInMap` is applied once, centrally**, at `index.ts:623-624`. Any shared
  writer must apply the same rewrite, or apply it centrally on the way out, to
  keep the Windows path identical. This is the mechanism the §Latent hazards
  sites rely on and it is the reason converging *removes* those hazards.
- **All 21 `collectTemplates` are defined** — the `collectTemplates?:` optional in
  the `PlatformFunctions` interface (`index.ts:119`) has no platform using the
  undefined case. The "Undefined = platform skipped during update" comment
  describes a state that does not occur.
- **Empty-map risk.** `getConfiguredPlatforms` (`index.ts:536-571`) detects a
  platform by intersecting its `collectTemplates` keys under its own `configDir`
  with the hash manifest. Any Phase-2 change that alters a platform's key set —
  including path normalization — changes platform detection. Verified today: each
  platform's map contains at least one key under its own `configDir` (`kiro`,
  `antigravity`, `devin`, `snow` have nested `configDir` values like
  `.kiro/skills`, `.agent/workflows`; their maps satisfy this).

---

## Caveats / what I could not determine

- **Windows was simulated, not run.** Run 2 forces the resolved python command
  via `setResolvedPythonCommand("python")`, which exercises the same code path
  `init.ts` uses after probing. It does not exercise real Win32 path separators.
  `collectTemplates` keys are POSIX by construction (`toPosix`, `opencode.ts:66-69`)
  and the parity test splits on `/` before joining, so I expect no difference —
  but **a real Windows run is an unverified assumption**, not a measured result.
- **`--force` / `--skip` / `--append` write modes were not differentially tested.**
  All runs used `setWriteMode("force")`. In `skip` mode `writeFile` returns
  without writing (`file-writer.ts:160-165`), so on a dirty project `configure`
  legitimately produces fewer files than `collectTemplates` describes. That is
  expected behavior, not drift, but it means "configure output == collect output"
  only holds on a clean tree. Any Phase-2 test must init into a clean temp dir.
- **`trellis update`'s full end-to-end behavior was not re-verified** — I read
  `collectTemplateFiles` (`update.ts:~860-940`) and the two post-processors, and
  traced the manifest-prune consequence empirically, but I did not run a complete
  init→edit→update cycle for all 21 platforms.
- **The statusline consequence chain is verified through the prune step only.**
  I confirmed the key is pruned and the file survives on disk. I did **not** run
  a real `trellis uninstall` to confirm the orphan file is left behind; that step
  is inferred from `manifest-prune.ts:5-14` ("On uninstall, every manifest entry
  is unlinked") and is the documented contract, but it is inference.
- **The 1649-test baseline in the PRD was not re-measured.** I did not run the
  suite; this phase changed no code.
- **`emptyDirs` detection in Run 1 is post-hoc** — it reports directories with no
  files anywhere beneath them. `.codex/skills` was the only hit across all 21
  platforms, which corroborates the `ensureDir` call-site audit, but both are
  observations of the current template set rather than a proof.

## Related specs

- `.trellis/spec/cli/backend/platform-integration.md` — referenced from
  `codex.ts:222` for the Codex hooks-flag requirement (not read for this inventory)
- `packages/cli/src/templates/common/bundled-skills/trellis-meta/references/local-architecture/bundled-skills.md:57`
  — states the byte-identity contract between the two paths in user-facing docs
