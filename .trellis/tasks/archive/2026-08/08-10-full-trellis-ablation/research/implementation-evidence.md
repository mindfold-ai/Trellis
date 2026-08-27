# Implementation evidence

- The v2 template hash manifest is the authoritative managed-file boundary.
- `pruneOrphanManifestKeys()` removes poisoned user-owned legacy entries before
  uninstall planning and must also guard ablation.
- `getConfiguredPlatforms()` derives ownership from current per-platform
  template collectors. GitNexus rates modifying it medium-risk; consume it
  unchanged.
- `commands/uninstall.ts` owns one structured-file dispatch table and a
  plan/render/confirm/execute flow. Extracting `buildStructuredFileSpecs`,
  `buildPlan`, and `executePlan` has low upstream GitNexus impact, but existing
  observable uninstall behavior must remain frozen.
- `utils/uninstall-scrubbers.ts` provides pure non-throwing ownership-aware
  scrubs for hooks JSON, OpenCode package JSON, Pi settings, Codex TOML, and
  managed Markdown blocks.
- `writeFileAtomic()` and versioned template-hash persistence are existing
  atomic-state precedents.
- Full ablation can use these primitives. Selective ablation cannot safely
  filter filenames because shared settings/skills/agents contain multiple
  Trellis functions; it is deferred.
- Release manifests contain changelog/migration data but no capability
  provenance; version baselines are deferred.

GitNexus planning-base results:

| Symbol | Risk | Impact |
| --- | --- | --- |
| `uninstall` | Low | CLI registration plus three integration suites |
| `buildPlan` | Low | uninstall and second-order CLI/tests |
| `executePlan` | Low | uninstall and second-order CLI/tests |
| `buildStructuredFileSpecs` | Low | plan -> uninstall -> CLI/tests |
| `getConfiguredPlatforms` | Medium | init/update/uninstall/platform flows |

Rerun impact on the exact implementation index immediately before edits and
run `detect-changes` before commit.
