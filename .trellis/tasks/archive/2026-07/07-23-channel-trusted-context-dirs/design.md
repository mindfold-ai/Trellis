# Design: channel trusted context dirs

## Trust-set resolution (once per spawn)

New helper in `packages/cli/src/commands/channel/context-trust.ts`:

```ts
resolveTrustedRoots(cwd: string): string[]
```

1. Read `.trellis/config.yaml` `channel.trusted_context_dirs` (string list) via
   the existing targeted line-parser pattern (see Pi extension
   readContextInjectionLimits / codex.ts readers — no YAML lib). Invalid or
   non-existent entries: stderr warning, skipped.
2. Unless `channel.auto_trust_trellis_symlinks` is explicitly false: for
   `.trellis/tasks` and `.trellis/workspace`, `lstat` each; if symlink, push
   `realpathSync(entry)`.
3. Return realpaths, deduped.

## Containment check change

`jailedRealpath(target, cwd)` → `jailedRealpath(target, cwd, trustedRoots)`:
accept when `real` is under `cwdReal` OR under any trusted root (same
`root === real || real.startsWith(root + path.sep)` test). Refusal warning now
mentions `channel.trusted_context_dirs` as the remedy (discoverability).

`readFileBlock`'s lstat re-check: keep, but allow when the resolved path is
inside a trusted root (same predicate — pass the roots down).

`agent-loader.ts`: same — containment against agentsRoot OR trusted roots.

## OMP extension template

`resolveProjectFile`/`isInsideRoot` in
`packages/cli/src/templates/omp/extensions/trellis/index.ts.txt` gets the same
two-step logic with its own minimal config reader (template is standalone; no
imports from CLI). Keep the code shape close enough to diff by eye.

## Config template

`channel:` section in config.yaml already exists (worker_guard) — extend its
comment block with the two new commented keys.

## Test plan

Integration tests under packages/cli/test/commands/ following existing channel
test patterns: build trust scenarios with real tmp dirs + symlinks (skip
symlink-creation tests on Windows via the existing platform-skip helper if one
exists; otherwise `process.platform !== "win32"` guard). Matrix per acceptance
criteria. Config parser unit tests colocated.

## Risks

- Trust predicate must use the SAME normalization (realpathSync) on both sides
  of the comparison — path-prefix bugs on macOS /private/tmp vs /tmp aliasing
  are the classic trap; tests must run under os.tmpdir() to catch it.
- Do not touch store/paths.ts assertSafeName (different mechanism, same audit
  family) — out of scope.
