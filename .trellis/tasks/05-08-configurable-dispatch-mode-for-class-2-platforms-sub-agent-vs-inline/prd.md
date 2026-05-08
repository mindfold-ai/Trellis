# Configurable dispatch mode for class-2 platforms (sub-agent vs inline)

## Goal

Let users opt out of Trellis's "main session must dispatch trellis-implement / trellis-check sub-agents" default and instead let the main agent edit code inline. Configured project-wide via `.trellis/config.yaml`. Removes the friction Codex users have hit with `wait_agent` self-deadlock, fork_turns inheritance, and other multi-agent_v2 footguns — for users who'd rather just let the main agent do everything.

## What I already know

- `.trellis/config.yaml` already exists (session_commit_message / max_journal_lines / hooks / packages / default_package). Read by `update.ts:465` (loadUpdateSkipPaths) — pattern to follow.
- Current dispatch rule lives in `packages/cli/src/templates/trellis/workflow.md` `[workflow-state:in_progress]` block (lines 187–191):
  > "**Main-session default (no override)**: dispatch the `trellis-implement` / `trellis-check` sub-agents — the main agent does NOT edit code by default."
- This block is parsed by `inject-workflow-state.py` (UserPromptSubmit hook) and injected per-turn as `<workflow-state>` text.
- A per-turn override already exists (line 191): user message must explicitly contain "do it inline" / "no sub-agent" / "你直接改" / "别派 sub-agent" / "main session 写就行" / "不用 sub-agent" → main session edits inline that turn only.
- Class-2 platforms (codex / copilot / gemini / qoder) hit sub-agent footguns hardest because they have no PreToolUse(spawn_agent) hook to intercept and Codex `multi_agent_v2` is still `Stage::UnderDevelopment`.
- Class-1 platforms (claude / cursor / opencode / kiro / codebuddy / droid) tolerate dispatch better but the rule still applies to them.

## Assumptions (temporary)

- The new config knob is **opt-in** (default = current behavior, sub-agent dispatch). No existing user is affected unless they edit config.yaml.
- The per-turn user-message override stays orthogonal to the config-level setting — config sets the default, per-turn override flips it for one turn.

## Open Questions

(none — all resolved below.)

## Resolved Questions

- (Q1) Scope: **Codex-only**. Knob lives under a Codex-scoped section. Other platforms unaffected.
- (Q2) `.codex/agents/trellis-{implement,check,research}.toml` files: **always write** at init / update. Inline mode is a runtime behavior change, not a file-output change. User can still manually invoke sub-agents if they want.
- (Q3) "main agent check" in inline mode: **load existing `trellis-check` skill**, run lint/typecheck/tests, fix issues directly. Reuses existing `.agents/skills/trellis-check/SKILL.md` content; only the executor changes (main session vs spawned sub-agent).

## Existing infrastructure to reuse (from `workflow.md` exploration)

`workflow.md` already has a per-step platform-block mechanism. Each Phase 2.x step has content scoped via `[Platform A, Platform B, ...]` markers:

- `#### 2.1 Implement` — has separate blocks for `[Claude Code, Cursor, OpenCode, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]` (dispatch), `[Codex]` (dispatch with extra prelude), `[Kiro]` (dispatch with prelude), `[Kilo, Antigravity, Windsurf]` (inline: load `trellis-before-dev` skill + read prd.md + implement directly).
- `#### 2.2 Quality check` — same pattern; the non-agent-capable block says "load `trellis-check` skill and verify".
- `#### 1.3 Configure context` — non-agent-capable block says "skip this step. Context is loaded directly by the `trellis-before-dev` skill in Phase 2".

`packages/cli/src/templates/trellis/scripts/common/workflow_phase.py` already filters these blocks by `--platform` flag (`get_context.py --mode phase --step 2.1 --platform codex` returns the Codex block).

**This means inline-mode content for Codex doesn't need to be authored — it already exists in the `[Kilo, Antigravity, Windsurf]` blocks.** Implementation just needs to make Codex *behave* as if it's in those blocks when config says `inline`.

Two breadcrumb-injection paths to wire (both currently embed the dispatch-style guidance for Codex):

- `[workflow-state:in_progress]` block in `workflow.md` lines 187–191 (per-turn breadcrumb via `inject-workflow-state.py`). Currently it's a single block keyed on `status=in_progress`, mentions dispatch + class-2 platform protocol + inline override touchphrase. Needs a parallel inline variant.
- `get_context.py --mode phase --step 2.1 --platform codex` (called by `/trellis:continue` step 4). Currently returns the `[Codex]` block. In inline mode should return the `[Kilo, Antigravity, Windsurf]` block.

- (Q4) Breadcrumb structure: **Option X (parallel tag blocks)**. Add `[workflow-state:in_progress-inline]` and `[workflow-state:planning-inline]` blocks alongside the existing `in_progress` / `planning` blocks. Hook reads config and picks the matching tag. `get_context.py --platform codex` swaps to `Kilo, Antigravity, Windsurf` block content when inline mode is on.
- (Q5) Config key + value: `codex.dispatch_mode: sub-agent | inline` (default `sub-agent`). nested under `codex:` in `.trellis/config.yaml`.
- (Q6) `task.json` per-task override: **out of scope**. Project picks one mode and sticks. Add later if real demand surfaces.
- (Q7) Mid-task config flip: hook reads config fresh on every turn, no caching. Next turn reflects new mode immediately. Step idempotency means mid-task flips are safe.
- (Q8) How does the new `codex.dispatch_mode` section reach existing users on `trellis update`?
  - Default Trellis update flow for config.yaml: file-writer hashes existing config.yaml against pristine template; on mismatch (which most users hit because they customize `session_commit_message` / `packages`), prompts `y/n/d`. `y` overwrites and loses user edits, `n` keeps user file but misses the new commented section. Both are bad. Hardcoding `codex:` in `update.ts` is wrong — every future config addition would need a one-off code change.
  - **Manifest-driven `configSectionsAdded`**. Add a new optional manifest field declaring which top-level config keys this release introduces. `update.ts` walks each version's manifest between user's old version and new version, collects all `configSectionsAdded` entries, and for each entry whose `sentinel` is missing from the user's target file, appends the section content extracted from the current bundled template. Generic, idempotent (sentinel check), zero `update.ts` change for future config additions — future releases just add an entry to their own manifest.
  - Manifest schema (added in 0.5.8 manifest):

    ```jsonc
    {
      "version": "0.5.8",
      "configSectionsAdded": [
        {
          "file": ".trellis/config.yaml",
          "sentinel": "codex:",                                       // user file must lack this token (comment or live) to trigger append
          "sectionHeading": "Codex (sub-agent dispatch behavior)"     // matches `# <heading>` line in template; section ends at next `#---` separator
        }
      ]
    }
    ```

  - Implementation:
    - `update.ts`: after the existing file-write loop, run `applyConfigSectionsAdded(manifestsBetween(oldVersion, newVersion))`. Walks each manifest's `configSectionsAdded` entries; for each entry, reads target file, checks for sentinel, on miss extracts the section from the bundled template and appends. ~30 LoC in `update.ts` + ~20 LoC for the section extractor + manifest type field.
    - Section extractor: locates the `#---` separator block whose first `# <line>` content matches `sectionHeading`, takes lines until the next `#---` separator (or EOF).
    - **Fresh `trellis init`**: template already has the new commented section, init writes it directly. The manifest field has no effect on init.
    - **Future releases**: add a new `configSectionsAdded` entry to that release's manifest. No code change.

Implementation impact: ~30 LoC in `update.ts` (`applyConfigSectionsAdded` + extractor) + ~10 LoC manifest TypeScript type / schema doc + the standard config.yaml template change.

## Two implementation options (resolved as Option X)

### Option X — Add parallel `[workflow-state:STATUS-inline]` tag blocks

```
[workflow-state:in_progress]
... dispatch trellis-implement / check ...
[/workflow-state:in_progress]

[workflow-state:in_progress-inline]   ← NEW
... main session loads before-dev skill, edits code, loads check skill ...
[/workflow-state:in_progress-inline]
```

`inject-workflow-state.py` reads `.trellis/config.yaml`; when `codex.dispatch_mode=inline` AND platform=codex, looks up `<status>-inline` tag instead of `<status>`. For `get_context.py --platform codex`, similarly: when inline mode is set, swap the platform name to `Kilo, Antigravity, Windsurf` (or read content from those blocks).

**Pros**: keeps the existing tag-block + platform-marker mechanism; clean separation between modes.
**Cons**: duplicates breadcrumb body for `[workflow-state:planning]` and `[workflow-state:in_progress]` (≈40 lines extra in workflow.md); two places to keep in sync.

### Option Y (rejected) — Single-source breadcrumb with mode-aware templating

Rejected: introduces a new templating layer for this single feature.

## Implementation plan (detailed)

### Files to add

- **`packages/cli/src/templates/trellis/scripts/common/trellis_config.py`** (new). Single helper:
  ```python
  def read_trellis_config(repo_root: Path | None = None) -> dict:
      """Read .trellis/config.yaml. Returns {} on missing/malformed."""
  ```
  Reuses `parse_simple_yaml` (resurrect from deleted `worktree.py` or rewrite minimal).

### Files to modify

- **`packages/cli/src/templates/trellis/config.yaml`** — add commented Codex section explaining `codex.dispatch_mode`.
- **`packages/cli/src/templates/trellis/workflow.md`** — add `[workflow-state:planning-inline]` and `[workflow-state:in_progress-inline]` blocks. Bodies describe the inline workflow (load `trellis-before-dev`, edit code, load `trellis-check`, run lint/type-check/tests, fix, then `trellis-update-spec` + commit).
- **`packages/cli/src/templates/shared-hooks/inject-workflow-state.py`** — read config; when `platform == "codex"` and `codex.dispatch_mode == "inline"`, look up `<status>-inline` tag with fallback to `<status>`.
- **`packages/cli/src/templates/trellis/scripts/common/workflow_phase.py`** (or `get_context.py` wrapper) — add `resolve_effective_platform()` that swaps `codex` → `kilo` (or any name in the `[Kilo, Antigravity, Windsurf]` block) when inline mode is on. The existing `filter_platform()` then surfaces the inline block content unchanged.
- **`packages/cli/src/migrations/types.ts`** (or wherever ManifestSchema lives) — add optional `configSectionsAdded: ConfigSectionAdded[]` field to manifest type. Type:
  ```typescript
  type ConfigSectionAdded = { file: string; sentinel: string; sectionHeading: string };
  ```
- **`packages/cli/src/migrations/manifests/0.5.8.json`** — declare the new section:
  ```json
  "configSectionsAdded": [
    { "file": ".trellis/config.yaml",
      "sentinel": "codex:",
      "sectionHeading": "Codex (sub-agent dispatch behavior)" }
  ]
  ```
- **`packages/cli/src/commands/update.ts`** — add `applyConfigSectionsAdded(manifests, cwd, templateBundle)` step after the existing file-writer loop. Iterates manifests between old and new version, dedupes entries by `file+sentinel`, for each entry checks user file, on missing sentinel extracts section from bundled template and appends. ~30 LoC + ~20 LoC for section extractor.
- **`packages/cli/test/regression.test.ts`** — `[issue-N-dispatch-mode]` regression test:
  - Default config: breadcrumb has dispatch text, step 2.1 with --platform codex returns Codex dispatch block.
  - `codex.dispatch_mode: inline`: breadcrumb has inline text, step 2.1 returns Kilo/Antigravity/Windsurf inline block.
  - `applyConfigSectionsAdded`: existing config.yaml lacking sentinel → after update, file contains appended section content from template; second run idempotent (sentinel now present, skipped).
  - Section extractor: synthesize a small fake template, assert extraction returns content between matching `#---` separator and next `#---` separator.

### Code outline — inject-workflow-state.py

```python
def resolve_breadcrumb_key(status: str, platform: str | None, config: dict) -> str:
    if (platform == "codex"
        and config.get("codex", {}).get("dispatch_mode") == "inline"):
        return f"{status}-inline"
    return status

# in main():
config = read_trellis_config(root)
key = resolve_breadcrumb_key(status, platform, config)
body = templates.get(key) or templates.get(status)  # fallback to non-inline
```

### Code outline — workflow_phase.py

```python
def resolve_effective_platform(platform: str, config: dict) -> str:
    """codex+inline → 'kilo' (any name in the [Kilo, Antigravity, Windsurf]
    block works, since filter_platform matches by name presence)."""
    if (platform == "codex"
        and config.get("codex", {}).get("dispatch_mode") == "inline"):
        return "kilo"
    return platform

# in get_step():
effective = resolve_effective_platform(args.platform, read_trellis_config())
filtered = filter_platform(content, effective)
```

### Why the platform-swap trick works

`workflow.md` step bodies already differentiate via `[Platform A, ...]` markers:

- Codex+sub-agent: `[Codex]` block (dispatch + class-2 prelude)
- Codex+inline: virtually treated as in `[Kilo, Antigravity, Windsurf]` block (inline workflow)

`filter_platform` stays untouched. We just lie to it about which platform we are.

### What stays unchanged (existing infra)

- Per-turn user-message override (`do it inline` / `你直接改` / etc.) still works in BOTH modes — it's a per-turn flip, orthogonal to config.
- `task.json.status` machine (`planning` → `in_progress` → `completed`) unchanged.
- `.codex/agents/*.toml` files always written.
- `inject-subagent-context.py` unchanged (it only fires on actual sub-agent dispatch; in inline mode no sub-agent is dispatched).

### Test plan

1. Unit: `resolve_breadcrumb_key` / `resolve_effective_platform` table-driven (4 cases each: codex+inline, codex+sub-agent, codex+missing-config, non-codex).
2. Regression: read `workflow.md`, parse both `[workflow-state:in_progress]` and `[workflow-state:in_progress-inline]` blocks, assert sub-agent body mentions "dispatch" and inline body mentions "main session"+"trellis-before-dev".
3. End-to-end: synthesize stdin payload + temp `.trellis/config.yaml`, run `inject-workflow-state.py`, assert returned `additionalContext` contains expected text per mode.

## Implementation Plan (small PRs)

Since changes are tightly coupled (one feature, no partial-landing value), do it as **one PR**:

```
PR: feat(codex): config-driven dispatch mode (sub-agent | inline)

Files:
  + scripts/common/trellis_config.py            new (~30 LoC)
  M scripts/common/workflow_phase.py            +20 LoC (resolve_effective_platform)
  M templates/shared-hooks/inject-workflow-state.py  +25 LoC (resolve_breadcrumb_key + config read)
  M templates/trellis/workflow.md                +~80 LoC (two new -inline blocks)
  M templates/trellis/config.yaml                +~20 LoC (commented codex section)
  M src/commands/update.ts                       +~30 LoC (applyConfigSectionsAdded + section extractor)
  M src/migrations/types.ts                      +~10 LoC (ConfigSectionAdded type + manifest field)
  M src/migrations/manifests/0.5.8.json          +~6 LoC (configSectionsAdded entry)
  M test/regression.test.ts                      +~80 LoC (incl. configSectionsAdded idempotency + extractor unit)
```

Estimated total: ~280 LoC. One PR is reviewable.

## Inline mode is a full alternate workflow (not just "skip dispatch")

The mode change replaces the sub-agent dispatch chain with a main-session-only chain. Phase definitions diverge between modes:

| Phase | Sub-agent mode (default, current) | Inline mode |
|---|---|---|
| 1.1 Requirement exploration | `trellis-brainstorm` skill | `trellis-brainstorm` skill (same) |
| 1.3 Configure context | **Curate `implement.jsonl` / `check.jsonl`** (so dispatched sub-agents get spec injection) | **Skip** (no sub-agent to inject context to) |
| 1.4 Activate task | `task.py start` (same) | `task.py start` (same) |
| 2.1 Implement | Dispatch `trellis-implement` sub-agent | Main session: load `trellis-before-dev` skill, then edit code directly |
| 2.2 Quality check | Dispatch `trellis-check` sub-agent | Main session: load `trellis-check` skill, run lint/typecheck/tests, fix issues directly |
| 3.3 Spec update | Load `trellis-update-spec` skill (same) | Same |
| 3.4 Commit | Main session drives commit (same) | Same |

**Inline summary** (user's phrasing): `brainstorm → before-dev → main-agent-coding → main-agent-check → update-spec`.

Implementation knobs:

- `inject-workflow-state.py` reads config; emits different `[workflow-state:planning]` and `[workflow-state:in_progress]` body per mode. Probably needs two parallel tag blocks in `workflow.md` (e.g. `[workflow-state:planning]` + `[workflow-state:planning-inline]`) or one block with conditional substitution.
- The Trellis `continue` skill / its supporting scripts also need to honor the mode so `/trellis:continue` resumes into the right phase chain (e.g. when status=`in_progress`, inline mode should hand the AI the `before-dev` skill, not the dispatch instruction).
- `.codex/agents/*.toml` files unchanged. Sub-agent infrastructure stays installed; just the breadcrumb stops calling for it.

## Requirements (evolving)

- New config key in `.trellis/config.yaml` (exact name TBD via Q1/Q2).
- `inject-workflow-state.py` (UserPromptSubmit hook) reads the config and emits a different `[workflow-state:in_progress]` body when inline mode is selected.
- Two body variants in `workflow.md` (or one body + conditional substitution) covering sub-agent dispatch vs inline.
- Default = sub-agent (preserves current behavior). Existing users see no change.

## Acceptance Criteria (evolving)

- [ ] Default project (no config override) behaves identically to 0.5.7 — main session dispatches sub-agents.
- [ ] Setting `<config-key>: inline` makes `<workflow-state>` breadcrumb tell main session to edit code directly, no dispatch.
- [ ] Per-turn override phrases ("你直接改" / "do it inline") still work in both modes (in inline mode they become no-ops; in sub-agent mode they still flip to inline for that turn).
- [ ] Tests: at least 1 regression test asserting both breadcrumb variants render correctly.
- [ ] No breaking change for existing 0.4.x / 0.5.x users.

## Definition of Done

- Tests added/updated (unit/integration where appropriate)
- Lint / typecheck / CI green
- Docs updated: `.trellis/config.yaml` template comments + a docs-site section on the new knob
- Migration: none needed (additive config key)

## Out of Scope (explicit)

- Changing the **default**. Default stays sub-agent dispatch.
- Adding the knob to per-task `task.json` (deferred — see Q4).
- Adding new agent role files. Inline mode reuses existing infra; user just doesn't dispatch.

## Technical Notes

- Files likely touched:
  - `packages/cli/src/templates/trellis/config.yaml` — add commented-out example of the new knob
  - `packages/cli/src/templates/trellis/workflow.md` — add second `[workflow-state:in_progress]` body or a templating mechanism
  - `packages/cli/src/templates/shared-hooks/inject-workflow-state.py` — read config, pick body
  - `packages/cli/src/templates/trellis/scripts/common/` — add a simple yaml config reader if one doesn't exist (Trellis already has `parse_simple_yaml` in scripts; reuse)
  - `packages/cli/test/regression.test.ts` — assert both modes
- Existing `parse_simple_yaml` helper lives in `dist/templates/trellis/scripts/common/worktree.py` (deleted area, but pattern still applies). Or build a fresh reader.

## Research References

(none yet — research will be needed if Q1/Q2 yields a non-obvious answer; for now waiting on user preference)
