# Filesystem Safety — Atomic Writes & Destructive-Op Guards

> Cross-cutting contract for any code that **writes, deletes, moves, or
> overwrites** files in a user's repo. Trellis ships as a CLI that runs inside
> real git repos, so a truncated write or a mistargeted delete is user data
> loss, not a transient bug. These are the guardrails the 2026-07-10 audit's
> two root causes distilled to.

Applies to: `commands/update.ts`, `commands/uninstall.ts`, `utils/*`,
`core/channel/**`, and the shipped Python under `templates/trellis/scripts/`.

---

## 1. Atomic writes — never truncate a state file in place

**Rule**: a file that holds durable state (attribution manifest, `task.json`,
`config.yaml`, session pointer, channel events cursor) must be written
**temp-in-same-dir + rename**, never `fs.writeFileSync(path, ...)` /
`path.write_text(...)` directly. In-place writes truncate the target as their
first step, so a crash / Ctrl-C / ENOSPC mid-write leaves a half-file. A
truncated `.template-hashes.json` heals to `{}` (every managed file then looks
user-modified); a truncated `task.json` reads back as `None` (the task vanishes
from `task.py list`).

### Signatures

```ts
// packages/cli/src/utils/atomic-write.ts
export function writeFileAtomic(filePath: string, data: string | Uint8Array): void
// writes `<dir>/.<basename>.<pid>.tmp` then fs.renameSync over filePath;
// removes the tmp and rethrows on failure. Same-dir tmp keeps rename atomic.
```

```python
# templates/trellis/scripts/common/io.py
def write_json(path: Path, data: dict) -> bool
# tempfile.mkstemp(dir=path.parent) -> os.fdopen write -> os.replace(tmp, path);
# unlinks tmp and re-raises on BaseException (Ctrl-C included).
```

### Wrong vs Correct

```ts
// Wrong — truncates on entry; a crash here corrupts the manifest to {}
fs.writeFileSync(hashesPath, JSON.stringify(payload, null, 2));

// Correct
writeFileAtomic(hashesPath, JSON.stringify(payload, null, 2));
```

> **Note**: atomic write fixes the *crash window*. It does **not** fix
> concurrent last-writer-wins (multiple processes RMW the same file). File
> locking / seq reconciliation is a separate, still-open concern.

---

## 2. Path & name safety — validate at the chokepoint, before `path.join`

**Rule**: any user- or agent-supplied string that becomes a path segment must be
validated **before** it flows into `path.join` / `shutil.move` / `rmSync`. A
name like `../../x` resolves outside the intended tree and a later recursive
delete escapes the store.

| Concern | Guard | Location |
|---|---|---|
| channel / worker name | `assertSafeName(name, kind)` — `^[A-Za-z0-9._-]+$`, rejects `.`/`..` — called inside `channelDir` (the single chokepoint every path helper passes through) | `core` + `cli` `channel/store/paths.ts` |
| `task.py archive <name>` target | `is_within_tasks_dir(task_dir_abs, repo_root)` — dir must be a direct child of `.trellis/tasks/` | `scripts/common/task_utils.py` |
| rename-dir migration source | `dirHasManifestEntries(fromDir, hashes)` — only auto-move a dir Trellis provably created | `commands/update.ts` |

> **Why the chokepoint, not the entrypoint**: validating inside `channelDir`
> (not in each of create/rm/run) means one guard covers every current and future
> caller. `spawn.ts` had long *asserted* this — a "CLI layer already validates
> names" comment — while no such validation existed; adding the guard at the
> `channelDir` chokepoint is what finally made that comment true.

```ts
// Correct: guard lives in the shared path builder
export function channelDir(name: string, project = currentProjectKey()): string {
  assertSafeName(name);
  return path.join(projectDir(project), name);
}
```

---

## 3. Destructive-op ownership / backup gate

Before deleting, moving, or overwriting anything that **could be user data**,
one of these must hold. Pick by operation:

| Operation | Required guard |
|---|---|
| Delete a mixed-ownership file (e.g. `AGENTS.md`) | Strip only the managed block (`scrubManagedMarkdownBlock`); delete only if nothing user-authored remains. Never `unlinkSync` the whole file. |
| Move a dir that may be user-owned (rename-dir) | Ownership check (`dirHasManifestEntries`); unowned + target-absent → **skip** (safe even under `--force`, since skip never executes). |
| Overwrite a dir from a remote source | Download to a temp dir; `rm` + copy the old dir **only after** the download succeeds (`downloadWithStrategy` `overwrite`). Never delete-then-download. |
| Rename onto a possibly-existing target | `fs.existsSync(newPath)` first; skip/renumber instead of clobbering (`renameTracesToJournal`). Especially when the dir is excluded from backup. |
| `rm -rf` a tree with user data (`uninstall`) | `collectUncommittedTrellisData(cwd)` (git status over `spec/tasks/workspace`); scripted `--yes` fails closed unless `TRELLIS_ALLOW_DIRTY_UNINSTALL=1`. Disclosure must name what user data is deleted. |

**Env override precedent**: a fail-closed guard on a `--yes`/`--force` path gets
an explicit env bypass, mirroring `TRELLIS_ALLOW_HOMEDIR`
(`TRELLIS_ALLOW_DIRTY_UNINSTALL=1`). Warn-and-continue is not enough on
`--yes` — nobody reads scrollback in a script.

---

## 4. Dogfood twin sync

Shipped Python (`packages/cli/src/templates/trellis/scripts/**`) has a dogfood
twin at repo `.trellis/scripts/**`. When you change a shipped script, sync the
twin **iff** they were identical first (`diff` before `cp`); if the twin has
drifted, apply the same edit surgically so unrelated local drift is preserved.
`packages/cli/dist/**` and `.trellis/.backup-*/**` are generated/history —
never hand-edit.

---

## 5. Tests required

Every guard here leaves a runnable regression test whose assertion **fails
without the guard**:

- Atomic write: write-succeeds + no tmp leftover + original survives a failed write (`test/utils/atomic-write.test.ts`; Python covered via `task-archive` integration).
- Path traversal: `create '../../victim' --force` / `rm '../../victim'` throw and the external dir survives — reproduce in a sandbox (`test/channel/name-safety`, `test/commands/channel-name-safety`).
- Ownership/backup gates: unowned source skipped (`update-internals` rename-dir gate), `archive src` refused with `src/` intact (`task-archive` integration), overwrite-fails-preserves-spec (`template-fetcher-overwrite`), uninstall refuses dirty `--yes` (`uninstall-dirty-guard`, real git).

---

## Related

- [`trellis update` Command](./commands-update.md) — migration classification/apply
- [`trellis uninstall` Command](./commands-uninstall.md) — plan/execute phases
- [`trellis channel` Command](./commands-channel.md) — store paths, project buckets
- [Script Conventions](./script-conventions.md) — Python `io.py` contract
- [Migrations](./migrations.md) — rename/rename-dir/delete semantics

## Channel Context Trust Set (`channel.trusted_context_dirs`, #414)

Worker context containment (context-loader `jailedRealpath`, agent-loader,
OMP extension `resolveProjectFile`) accepts realpaths inside worker cwd **or**
inside a trusted root. Trusted roots resolve once per spawn
(`channel/context-trust.ts` `resolveTrustedRoots(cwd)`):

1. `.trellis/config.yaml` → `channel.trusted_context_dirs` (list; relative
   entries resolve against cwd; missing dirs warn + skip; each entry is
   realpath-canonicalized).
2. Auto-trust (disable with `channel.auto_trust_trellis_symlinks: false`):
   ONLY the top-level `.trellis/tasks` and `.trellis/workspace` entries, when
   they are themselves symlinks, contribute their realpath targets. No
   recursion — a nested symlink planted inside a task dir stays refused.

Containment predicate (identical at all three sites, byte-comparable):
`real === root || real.startsWith(root + path.sep)` — the `path.sep` suffix is
load-bearing (blocks `/work/ws-evil` matching trusted `/work/ws`). The OMP
template carries a standalone verbatim copy of the parser/resolver; changes
must be mirrored there. Do not relax to lexical checks — realpath containment
is the defense from the 2026-07-10 audit (#409 family).
