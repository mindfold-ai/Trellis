# PRD: Channel trusted context dirs for symlinked Trellis workspaces

Fixes #414.

## Problem

`jailedRealpath()` (packages/cli/src/commands/channel/context-loader.ts:37-55)
resolves `--file`/`--jsonl` targets to realpaths and requires them inside the
worker cwd. Users who persist `.trellis/tasks` / `.trellis/workspace` as
symlinks to an external directory (project dir replaced wholesale periodically)
get legitimate context files rejected. The check exists for a real reason
(2026-07-10 audit, #409 family: block `--file ../../etc/passwd` and
attacker-planted symlinks) and must NOT be weakened to lexical checking.

## Requirements

1. **Config allowlist**: `.trellis/config.yaml`
   ```yaml
   # channel:
   #   trusted_context_dirs:
   #     - /work/user/trellis_workspace
   ```
   Realpaths under any listed dir (after resolving the listed dir itself) are
   accepted in addition to cwd. Ships commented; empty/absent = no extra roots.
2. **Auto-trust, narrowly**: if `<cwd>/.trellis/tasks` or `<cwd>/.trellis/workspace`
   (exactly these two top-level entries, no recursion, nothing else) is itself a
   symlink, its realpath target dir is added to the trusted set for that spawn.
   Overridable/disable-able via `channel.auto_trust_trellis_symlinks: false`.
3. **Consistency**: the same trust set applies to all three containment sites:
   - `context-loader.ts` `jailedRealpath` (`--file`, `--jsonl`, jsonl `file:` entries)
   - `agent-loader.ts` realpath re-check (agentsRoot containment)
   - OMP extension template `resolveProjectFile`/`isInsideRoot`
   (extract a shared helper for the two CLI sites; the OMP template mirrors the
   logic with its own copy since templates are standalone).
4. Security property preserved: paths outside cwd AND outside the trusted set
   are still refused with the existing stderr warning; `..`-escapes and
   attacker-planted nested symlinks (e.g. `.trellis/tasks/<task>/evil ->
   /etc/passwd`) remain blocked unless their target is inside a trusted root.
5. Windows: config-list comparison is path-string based after realpath — no
   symlink dependency; junctions that realpath cleanly work the same.

## Non-goals

- No lexical-only containment (reopens the audit hole).
- No recursive symlink trust discovery.
- No per-worker CLI flag (config only; add later if requested).

## Acceptance criteria

- Repro from #414: `.trellis/tasks -> /ext/tasks` symlink, spawn worker with
  `--jsonl .trellis/tasks/x/implement.jsonl` → loads successfully with
  auto-trust on; with `auto_trust_trellis_symlinks: false` and no allowlist →
  refused as today.
- `--file /etc/passwd` and `--file ../../outside` still refused.
- A nested symlink `.trellis/tasks/x/evil -> /etc/passwd` (with `.trellis/tasks`
  NOT a symlink) is still refused.
- `trusted_context_dirs` entry accepts files under it regardless of symlinks.
- agent-loader honors the same trust set for `.trellis/agents` reached via a
  trusted root.
- Tests cover all above + config parsing (absent/empty/invalid entries warn and
  are skipped); full suite/lint/typecheck green.
