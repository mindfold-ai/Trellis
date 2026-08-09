# Implementation plan — Phase 2

Step 1 is the safety net and must land, mutation-proven, before any platform is
touched. Everything after it is mechanical and independently revertible.

## 1. Build the missing oracle

Add the reverse assertion: for every platform, every file `configure` writes to
disk appears in `collectTemplates`. The existing test only asserts the forward
direction (`platforms.test.ts:180-210`).

- Derive the platform list from the registry. No hard-coded names.
- Run under both rendering modes (default, and Windows `python3` → `python`).
- Assert idempotency: running a path twice yields identical output.
- Add the `.claude/hooks/statusline.py` exemption as a **named constant with a
  comment** citing why it is excluded and the manifest-pruning consequence.

**Verify:** mutation — remove one file from one platform's `collectTemplates`,
show the new assertion fails, restore, show it passes. Report both outputs.
Without this proof the rest of the task is unguarded.

## 2. Convert the plain emitters

Every platform except `codex` and `claude`. Follow `configureOpenCode`
(`opencode.ts:106-112`) exactly.

Do them in small batches, running the suite after each. If a platform does not
convert mechanically, stop and report it — do not force it.

**Verify after each batch:** full suite green, and the step-1 assertion green.

## 3. `claude.ts`

Its `copyDirFiltered` walk is a second description of the file set. Make the
walk feed the map; the writer consumes the map. Keep the statusline behavior
exactly as it is — it is out of scope and separately test-locked.

## 4. `codex.ts`

Converge the emission. Keep `ensureDir(codexRoot/skills)` as the single residual,
with a comment stating that an intentionally empty directory cannot be expressed
as a path→content pair.

`preserveCodexAgentModelKeys` is already build-map → post-process → write; it
should survive as a map post-processor, not be inlined into the writer.

## 5. Call out the three behavior changes

`snow.ts:145`, `copilot.ts:37-40`, `reasonix.ts:77` start going through the
`python3` → `python` rewrite. Add a test that would have failed before the
change — a file under one of those platforms containing `python3`, asserting it
is rewritten on the Windows path. Name this in the report as an intentional
behavior change.

## 6. Full gate

`pnpm build`, `lint`, `typecheck`, `test`, `lint:py`, and
`diff -rq .trellis/scripts packages/cli/src/templates/trellis/scripts -x __pycache__`
silent. Report test counts against the 1649 baseline.

Then `git grep` for any platform whose file list still appears in two places and
report what is left.

## Rollback

Step 1 is additive — a test, safe to keep regardless. Steps 2-4 are per-platform
and each revertible on its own. Step 5 is a test plus the behavior it documents.
