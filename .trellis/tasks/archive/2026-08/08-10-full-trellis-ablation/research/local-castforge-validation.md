# Local CastForge validation

Date: 2026-08-10

Disposable worktrees from CastForge `f9b01de`:

- mechanical: `<temporary-root>/castforge-ablation-mechanical`
- comparison control: `<temporary-root>/castforge-ablation-control`
- comparison treatment: `<temporary-root>/castforge-ablation-treatment`

The canonical CastForge checkout was not modified. Recovery state was isolated
under `<temporary-root>/castforge-ablation-state` and was empty after the final
restore.

## Mechanical results

- Dry-run planned 107 managed-entry removals, one mixed-file scrub, and 44
  empty-directory prunes without changing the project or creating a transaction.
- Full ablation removed `.trellis`, `AGENTS.md`, `.codex/config.toml`, and
  `.codex/hooks.json` from the visible tree.
- `.claude/settings.json` retained its user-owned `env` and `enabledPlugins`
  fields while removing Trellis hooks and the exact Trellis `statusLine`.
- The current Codex template comments, `project_doc_fallback_filenames`, and
  `[agents].max_depth = 1` were removed; no `.codex/config.toml` content remained.
- `castforge/`, `docs/`, `examples/`, `README.md`, `LICENSE`, and
  `pyproject.toml` had no diff while ablated.
- Restore recovered 152 managed paths and returned the worktree exactly clean.
- After a second ablation, recreating `AGENTS.md` caused a one-path restore
  conflict. The NUL-delimited Git-status SHA-256 was
  `5c60cd34a3e89e49ac82d3be1baa0cfa5fcf7f03303a479ed8f1656c5652df0c`
  both before and after the failed restore, which is consistent with zero
  partial project writes but is not per-path byte/type/mode proof.
- Removing the conflicting file allowed exact restore; the transaction was
  deleted only after verification and the worktree was clean.

## Mechanical conclusion

The full-only command works as a reversible project activation subtraction for
this real installation. It preserves user-owned mixed settings, application
files, and exact Trellis bytes while failing closed on intervening changes.
