# Design — Phase 2, converge the two descriptions

Phase 1's inventory (`research/configure-vs-collect-inventory.md`) is the input.
Its verdict: 20 of 21 platforms are pure file emission, `codex` has exactly one
line of irreducible imperative behavior, and `opencode` is already converged.

## Target shape

```
collectTemplates(platform)  →  Map<path, content>     ← the single description
configure(platform)         =  write(that map) + residual
```

`configureOpenCode` (`opencode.ts:106-112`) already does exactly this. It is the
reference; do not invent a different shape.

Residual means work that survives *after* the shared writer and cannot be
expressed as a path→content pair. Phase 1 found exactly one across the whole
registry: `ensureDir(codexRoot/skills)` (`codex.ts:169`), an intentionally empty
directory that is a documented user extension point. It stays, with a comment
saying why a map cannot carry it.

Anything else that looks like residue is verbosity and should disappear into the
map.

## The safety net has to be built first

The PRD assumed byte-identity between the paths was already asserted. It is not.
`platforms.test.ts:180-210` checks `collectTemplates ⊆ disk` and never the
reverse, so "configure writes a file collectTemplates forgot" is entirely
uncovered — and that bug has already shipped once (`manifests/0.5.7.json`, codex
`trellis-start`).

Phase 1 closed the gap with a throwaway script: both paths, 21 platforms, three
rendering modes, zero differences. That proof does not live in the repo.

**Step 1 is to make it live there.** Add the reverse assertion: every file
`configure` writes to disk must appear in `collectTemplates`. Derive the
platform list from the registry, never hard-code it. Without this, the
convergence has no oracle and "tests still pass" means nothing.

### It will fail immediately, and that failure is real

`trellis init --with-statusline` writes `.claude/hooks/statusline.py`, which
`collectTemplates` deliberately does not describe (test-locked at
`regression.test.ts:976-986`).

Do **not** fix that by adding statusline.py to `collectTemplates` — the
exclusion is intentional and separately tested. Encode it as a **named,
commented exemption** in the new assertion, pointing at the reason and at the
known consequence Phase 1 uncovered: the file is recorded in the hash manifest
at init, then `pruneOrphanManifestKeys` drops it as an orphan, so opted-in users
have a frozen hook after their first `trellis update`.

One exemption with a written reason is honest. A silently weakened assertion is
how the current mess happened.

## Converging changes behavior in three places — deliberately

Phase 1 flagged `snow.ts:145`, `copilot.ts:37-40` and `reasonix.ts:77`: these
write raw content while `collectTemplates` applies the `python3` → `python`
rewrite for Windows. They agree today **only because those four files happen to
contain no `python3`**.

After convergence they go through the rewrite, which is the correct behavior and
removes a latent Windows bug. Because it is a behavior change, it must be called
out explicitly and covered by a test that would have failed before — not left
for someone to discover in a diff.

## claude.ts needs care

Its length is `copyDirFiltered`, a template-directory walk. That walk is a
*second independent description* of the file set — the same defect in a
different form. Converging it means the walk produces the map, and the writer
consumes it. Its output matches today, so equivalence is checkable.

## Order and stopping rule

Platform by platform, tests green after each. A platform whose conversion is not
mechanical stops the run and gets reported, rather than being forced.

The reverse assertion added in step 1 is what makes each step safe: if a
conversion drops a file, the build fails instead of shipping a `trellis update`
that no longer manages it.

## Risks

- **The oracle is new.** If step 1's assertion is itself wrong, every later step
  inherits the error. It must be mutation-proven: delete a file from one
  platform's `collectTemplates` and confirm the assertion catches it.
- **Windows rendering.** Convergence routes three platforms through a rewrite
  they previously skipped. Test both rendering modes.
- **Idempotency.** `configure` runs on init and `collectTemplates` on update;
  running either twice must produce identical output. Phase 1 checked this
  empirically — keep it checked.
