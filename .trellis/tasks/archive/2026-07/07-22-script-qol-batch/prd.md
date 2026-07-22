# PRD: Script QoL batch — journal flags, task tree, meta flag

Three independent, small script improvements. Fixes #394 and #402; the third is a
maintainer request (no issue).

## 1. `add_session.py` structured content (#394)

- New repeatable flags: `--change <text>`, `--test <text>`, `--next-step <text>`.
- Rendering: each provided value becomes one bullet under its section
  (Main Changes / Testing / Next Steps). Testing bullets keep the `[OK] ` prefix.
- **Placeholder elimination**: a section with zero provided values is OMITTED
  entirely from the rendered entry — never render `(Add details)` /
  `(Add test results)` again. This applies to legacy calls without the new flags.
- `--title/--summary/--commit` behavior unchanged; auto-commit behavior unchanged
  (entries now never contain placeholders, so the issue's auto-commit complaint
  is resolved by construction).

Acceptance: legacy call renders Summary + Git Commits + Status only (no
placeholder sections); full call renders all sections with the given bullets;
tests assert both renderings and that no placeholder strings appear.

## 2. `task.py list` tree view (#402)

- `task.py list` (and `list --mine`) renders child tasks indented under their
  parent using `parent`/`children` from task.json, e.g.:
  ```
  - 07-01-parent-task/ (in_progress)
    └─ 07-02-child-a/ (planning)
    └─ 07-03-child-b/ (completed)
  ```
- Children whose parent is not in the listed set fall back to flat display.
  Orphan/cycle safety: never crash or loop on dangling parent refs.
- `task.py list --json` gains nothing new (parent/children already in task.json;
  verify they are present in the JSON output and add them if missing).

Acceptance: parent with two children renders the tree; flat tasks unchanged;
dangling parent ref renders flat without error; --json includes parent/children.

## 3. `task.json` meta field access

- `task.py create --meta key=value` (repeatable) populates the `meta` object.
  Malformed values (no `=`, empty key) → error exit 1 naming the bad value.
- New subcommand `task.py set-meta <task-dir> <key> <value>` — sets/overwrites
  one key on an existing task; same path validation as other subcommands.
- Values stored as strings; no nesting, no type coercion (YAGNI).

Acceptance: create with two --meta flags → both in task.json meta; set-meta adds
and overwrites; malformed --meta errors; consumers (linear_sync hook) unaffected.

## Shared constraints

- All changes mirrored byte-identically between `.trellis/scripts/` dogfood and
  `packages/cli/src/templates/trellis/scripts/` templates.
- Follow script-conventions.md; probe-test pattern for all three items.
- No behavior change to archive/start/current or the injection hooks.
