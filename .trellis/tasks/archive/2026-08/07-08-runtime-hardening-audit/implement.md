# Audit and harden Trellis runtime scripts

## Implementation Checklist

- [ ] Read the curated JSONL context and relevant spec files before coding.
- [ ] Create an audit matrix in this task directory or a focused research file.
- [ ] Run GitNexus impact analysis for each function or class before editing it; warn before proceeding if impact is high or critical.
- [ ] Audit path handling in task resolution, task creation, archive, subtask linking, active-task selection, and JSONL context commands.
- [ ] Audit JSON read/write failure handling and update callers that need to distinguish missing, invalid, unreadable, and unwritable files.
- [ ] Audit `config.py` and `trellis_config.py` parser parity, malformed-file behavior, hook declaration handling, and warning policy.
- [ ] Audit lifecycle hook execution for fail-open semantics and diagnostic detail.
- [ ] Apply fixes to both `.trellis/scripts/common/*` and `packages/cli/src/templates/trellis/scripts/common/*`.
- [ ] Add regression tests for the concrete failure modes found by the audit.
- [ ] Run focused validation and `detect_changes({scope: "compare", base_ref: "main"})` before commit.

## Likely Validation Commands

```bash
pnpm --filter @mindfoldhq/trellis exec vitest run packages/cli/test/scripts packages/cli/test/templates/trellis.test.ts
pnpm --filter @mindfoldhq/trellis lint
pnpm --filter @mindfoldhq/trellis typecheck
```

Add or adjust these once the implementation scope is known.
