# PRD: Codex — durable sub-agent model config (auto default KEPT)

Fixes #459; covers the model-config item of #442. Target release: 0.6.9.

## Problem

0.6.8 made `codex.dispatch_mode` default `auto`: Trellis sub-agents dispatch as
native Codex subagents, which silently inherit the main session model. Users on
expensive main models get every sub-task on the same model — token cost and
latency regress with no opt-in. Generated `.codex/agents/trellis-*.toml` have no
`model` / `model_reasoning_effort` fields.

Maintainer decision (posted on #459): revert default to `inline`.

## Requirements

### 1. Keep `auto` default (maintainer decision REVERSED 2026-07-23)

After deliberation: `auto` stays the default. Rationale: sub-agent dispatch is
Trellis's architectural default on every other capable platform (Claude Code,
Cursor, ...), where sub-agents equally inherit the main model; Codex inline was
a stopgap before #445, not a design choice. NO code change to
DEFAULT_CODEX_DISPATCH_MODE or routing. If the in-progress implementation
already flipped defaults, REVERT those edits.

Instead, discoverability fixes:
- config.yaml template codex section comment: document that `auto` dispatches
  sub-agents which inherit the main model unless the agent toml pins one, with a
  pointer to the toml knob.
- Spec (platform-integration.md codex section): document the model-inheritance
  behavior and the tuning knob.

### 2. Sub-agent model keys survive update (revised by maintainer)

- Users configure sub-agent models by editing the generated
  `.codex/agents/trellis-*.toml` directly (matches Codex official docs), adding:
  ```toml
  model = "gpt-5.6-luna"
  model_reasoning_effort = "low"
  ```
- `trellis init --codex` / `trellis update` regeneration PRESERVES existing
  user-set `model` and `model_reasoning_effort` top-level keys in these three
  files: extract them from the old file content, re-emit them (after
  `sandbox_mode`) into the freshly rendered template. Only these two keys; all
  managed keys (name/description/sandbox_mode/developer_instructions) come from
  the template.
- Static template tomls gain commented hint lines
  (`# model = "..."` / `# model_reasoning_effort = "low"` — low is
  field-verified sufficient by the #459 reporter).
- NO new config.yaml section (decision: the toml is the natural home; config
  indirection rejected).
- Template-hash interaction: verify update does not raise a modified-file
  conflict for files whose only delta vs pristine is these two preserved keys
  (integrate with the existing hash flow the same way other per-project renders
  do).

## Non-goals

- Per-agent (research vs implement vs check) model overrides — later if asked.
- No runtime model routing; the toml is the only lever (Codex native spawn).

## Acceptance criteria

- `dispatch_mode` defaults and routing behavior are byte-identical to 0.6.8
  (auto default; auto/sub-agent/inline semantics unchanged).
- User-added `model` / `model_reasoning_effort` in any of the three trellis-*.toml
  survive `trellis update` regeneration verbatim; all other manual edits keep
  today's modified-file behavior.
- Fresh init tomls contain commented hints (`# model = ...`,
  `# model_reasoning_effort = "low"`), no active model lines.
- Update raises no spurious modified-file conflict when the only delta is the
  two preserved keys.
- config.yaml template + platform-integration.md document inheritance + knob.
- Full suite, lint, typecheck green.
