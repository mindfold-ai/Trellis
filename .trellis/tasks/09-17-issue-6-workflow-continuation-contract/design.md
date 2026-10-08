# Design: workflow-owned continuation contract

## 1. Ownership model

The implementation separates three facts instead of collapsing them into one
route table:

1. **Session binding facts** are owned by the existing active-task resolver.
2. **Lifecycle status** remains in `task.json.status` as a coarse task fact.
3. **Resume semantics** are owned by the current workflow's single
   `[trellis-continuation]` block.

The entry templates orchestrate these sources but do not interpret workflow
steps. The extractor validates syntax but does not interpret semantics.

## 2. Continuation parser

Add a small Python module under
`packages/cli/src/templates/trellis/scripts/common/` and mirror it into
`.trellis/scripts/common/`. Keeping continuation parsing separate from
`workflow_phase.py` avoids turning the phase parser into a generic semantic
router and gives the structural protocol one testable owner.

Suggested public surface:

```python
class ContinuationContractError(ValueError):
    error_type: str

def extract_continuation_contract(workflow_path: Path) -> str:
    """Return the body verbatim or raise a typed structural error."""
```

The parser scans marker lines rather than using one permissive regex. A small
state machine can distinguish all required failures deterministically:

- `missing_block`
- `duplicate_block`
- `empty_body`
- `missing_close`
- `missing_open`
- `mismatched_marker`
- `nested_block`

All become the external category `invalid_continuation_contract` while retaining
the structural subtype in diagnostics. Marker recognition is exact after
trimming line whitespace; unrelated Markdown is preserved inside the body.

## 3. CLI extraction flow

Extend `common/git_context.py` with `continuation` in `--mode` choices. In that
branch:

1. resolve `.trellis/workflow.md` from the current invocation repository;
2. call the structural parser;
3. print the body without reordering or platform filtering;
4. use `argparse`'s non-zero exit path for typed diagnostics.

`get_context.py` must not `chdir` to the task workspace for continuation mode.
That preserves the Issue contract: task facts may come from a linked worktree,
while the active continuation contract comes from the invocation repository's
current workflow. Existing resolver errors still fail before non-default modes,
so stale/conflict/ambiguous bindings cannot run continuation.

No parser branch reads task status, artifacts, Git history, project inventory,
or conversation history. No branch writes files.

## 4. Thin canonical entries

Rewrite the two canonical command templates.

### `trellis-start`

- Run default `get_context.py` for exact facts and inventory display.
- Run `--mode phase` for broad initial-entry/Phase Index guidance.
- If the exact current-task section is empty, follow only the current
  workflow's no-task initial entry.
- If an exact current task exists, run `--mode continuation` and execute that
  contract with the already loaded facts.
- If context resolution or continuation extraction fails, stop and report the
  typed result.

### `trellis-continue`

- Run default `get_context.py` for exact current-task facts.
- If no exact current task exists, report the stable token `no_current_task`
  and stop.
- Otherwise run `--mode continuation` and execute that workflow-owned body.
- Do not inspect project inventory or artifact presence to select a task/step.

The common templates remain the only semantic source for platform projections.
Update skill/command descriptions in `configurators/shared.ts` so auto-trigger
metadata no longer promises status/artifact routing.

## 5. Root native migration

Add exactly one continuation block to the root-owned native workflows:

- `packages/cli/src/templates/trellis/workflow.md` and dogfood
  `.trellis/workflow.md` for native.

Move the effective cases currently described by entry route tables into the
native workflow. The contract may reference workflow steps, skills, agents,
typed exits, live-fact checks, and recovery owners because it is Markdown
executed by the current AI, not a general-purpose code route graph. Preserve
each legacy native case as a named `native.*` route.

The fixed marker protocol applies to every active workflow, but marketplace and
custom workflow authors own migration of their content. This candidate restores
the `marketplace` gitlink to the base revision and does not make marketplace
migration a root release dependency. The Guru Trellis preset in
`castbox/guru-trellis#419` consumes no marketplace workflow components, so that
external migration does not block its continuation work.

Active-task `[workflow-state:planning*]`, `[workflow-state:in_progress*]`, and
other relevant breadcrumbs become broad prompts to load the continuation block.
They must not duplicate the detailed route table.

## 6. Install, update, and switch behavior

Do not add a second production validator in TypeScript. Runtime structural
validation remains in the Python extractor, avoiding two parsers that can
drift. Root template tests validate bundled and dogfood native content, while
existing fixture-based integration tests install/switch mock workflows and
invoke the shipped extractor against the resulting active file.

Existing whole-file ownership remains unchanged:

- pristine native workflows update normally;
- modified workflow files remain in place and receive `.new`;
- non-native workflows remain user-managed;
- only `.trellis/workflow.md` is read at runtime, never `.new`;
- each extractor call reads from disk, so workflow switch has no cache.

## 7. Test architecture

### Structural parser tests

Add focused Python-runtime regression cases for valid, missing, duplicate,
empty, unclosed, missing-open, mismatched, and nested markers. Assert exact exit
status, diagnostic category/subtype, path, and output body.

### Entry projection tests

Generate every affected platform entry from the registry and assert:

- start/continue derive from the canonical common templates;
- active-task paths invoke `--mode continuation`;
- legacy status/artifact route text is absent;
- continue exposes `no_current_task`;
- neither entry instructs inventory-based selection.

### Legacy route fixtures

Assert each named native route from the pre-migration route table against both
the bundled and dogfood native continuation Markdown. This documents native
parity without creating a second executable authority or depending on external
marketplace workflow content.

### Cross-worktree and resolver outcomes

Extend the existing cross-worktree installed-runtime tests:

- bind a task in the linked worktree;
- keep distinct continuation text in invocation and linked workflows;
- assert task facts come from linked while `--mode continuation` returns the
  invocation workflow body;
- corrupt or conflict the binding and assert continuation is not executed.

### Init/update/switch tests

Extend `workflow.integration.test.ts` to prove valid blocks survive fresh init,
managed update, non-native switch, conflict-to-`.new`, and immediate switch.
Use a fixture workflow whose continuation text differs from native.

### Semantic neutrality tests

Use sentinel words in surrounding workflow/task content and assert extraction
does not manufacture pass/finding/typed-exit/readiness/completion/authorization
conclusions. The test should verify exact returned bytes rather than blacklist
all possible English terms from user-authored Markdown.

## 8. Documentation and spec updates

Update the existing specs rather than creating an unrelated subsystem:

- `commands-workflow.md`: general workflow validity, root-native ownership, and
  switch/runtime rules.
- `workflow-state-contract.md`: breadcrumb versus continuation ownership.
- `platform-integration.md`: canonical entry projection invariant.
- `script-conventions.md`: continuation extractor/error behavior if needed.
- `trellis-meta` workflow references: authors edit only the continuation block,
  not platform route tables.

## 9. Risks and mitigations

- **Parser accepts malformed nesting.** Use a line-oriented state machine and
  exact negative fixtures rather than a single DOTALL regex.
- **Python template/dogfood drift.** Run byte-diff validation for the Python
  runtime twins. Separately assert that the bundled and dogfood workflow
  continuation bodies match without claiming unrelated workflow text parity.
- **External workflow is not migrated.** Fail closed at runtime and leave the
  migration to that workflow's author; do not mask it with a native fallback.
- **Platform entry drift.** Test generated maps across the platform registry,
  not a hand-picked path list.
- **Workflow switch appears stale.** Invoke the extractor after each switch in
  integration tests and avoid any module-level content cache.
- **Breadcrumb becomes a second route table.** Add assertions that active-task
  breadcrumbs point to continuation without retaining the legacy rows.
- **Overreach into resolver semantics.** Treat resolver output as immutable
  input; do not modify active-task storage or selection algorithms.

## 10. Rollback

The change is template/runtime compatible and does not add persisted state.
Rollback consists of reverting the parser mode, entry templates, root-native
workflow blocks, documentation, and tests together. No data migration or
marketplace cleanup is required. A partial rollback is unsafe because old entry
route tables and new workflow contracts would reintroduce dual authority.
