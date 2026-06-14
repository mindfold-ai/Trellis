# Docs-Site Sync Matrix

> When Trellis changes **workflow**, **platforms**, **commands**, or **skills**, which docs-site pages must update in lockstep. A concrete "Audit ALL Writers" checklist for documentation.

---

## Why This Exists

Docs-site is a submodule that lags behind template code. Missing a doc-update on a shipping change produces false claims (docs say "run `init-context`" when the command has been removed). This has happened — see the init-context-removal task (2026-04-23) where 8 MDX pages still referenced the removed command after one implementation pass.

Rule of thumb: **if the change touches `packages/cli/src/templates/` or `packages/cli/src/migrations/`, grep the matrix below before merging.**

---

## Trigger 1: Phase Structure Changes

Scope: any edit to `packages/cli/src/templates/trellis/workflow.yaml` or `packages/cli/src/templates/trellis/workflow/**/*.md` that adds/removes a step, renames a phase, or changes required/optional/once tags.

| File (en + zh) | What to sync |
|---|---|
| `start/install-and-first-task.mdx` | Phase 1/2/3 walkthrough block (around line 215-240 in en) — keep step numbers + action verbs in sync with `workflow.yaml` phase index |
| `start/everyday-use.mdx` | Task lifecycle ASCII diagram + any per-phase bash examples |
| `advanced/architecture.mdx` | Phase overview diagrams (if present) |
| `concepts/workflow.mdx` (if exists) | Phase definition sections |

### Grep command

```bash
cd docs-site && grep -rln "Phase 1\|Phase 2\|Phase 3\|phase-1\|phase-2\|phase-3\|workflow\.yaml\|workflow/" \
  --include="*.mdx" | grep -v "release/\|changelog/\|blog/"
```

---

## Trigger 2: Platform Add / Remove / Rename

Scope: any edit to `AI_TOOLS` in `packages/cli/src/types/ai-tools.ts`, `_SUBAGENT_CONFIG_DIRS` in `task_store.py`, or platform-tagged blocks in `workflow.yaml` body files.

### Add a new platform

| File (en + zh) | What to sync |
|---|---|
| `ai-tools/<platform>.mdx` | **NEW FILE** — platform-specific setup + quirks page |
| `ai-tools/index.mdx` (if exists) | List entry for the new platform |
| `docs.json` | Add navigation entry to **both** `languages[0]` (en) and `languages[1]` (zh) groups |
| `start/install-and-first-task.mdx` | Platform table (hook-inject vs pull-based vs agent-less) |
| `advanced/multi-platform.mdx` | Class-1 / Class-2 / agent-less grouping table |
| `advanced/appendix-d.mdx` (platform quirks) | Add quirks row if any |
| `release/` mirror copies | Release-frozen copies update on next release-cut, not immediately |

### Remove a platform

| File | What to sync |
|---|---|
| `ai-tools/<platform>.mdx` | Delete the page |
| `ai-tools/index.mdx` | Remove list entry |
| `docs.json` | Delete navigation entries (both languages) |
| `start/install-and-first-task.mdx`, `advanced/multi-platform.mdx`, `advanced/appendix-d.mdx` | Remove references |
| `changelog/<version>.mdx` | Changelog entry documenting the removal |

### Rename (e.g. "iFlow" removed) — same as remove + migration note in changelog.

### Grep command

```bash
cd docs-site && grep -rln "<platform-name>" --include="*.mdx" --include="*.json"
```

---

## Trigger 3: `task.py` Command Add / Remove / Rename

Scope: any edit to `task.py` subparser registrations or the split modules it dispatches to (`task_store.py`, `task_context.py`).

| File (en + zh) | What to sync |
|---|---|
| `advanced/appendix-b.mdx` | **`task.py` subcommand reference table** — add/remove row |
| `start/everyday-use.mdx` | Task lifecycle flow arrow + per-step bash examples |
| `advanced/appendix-c.mdx` | If the change affects `task.json` fields, update schema comments |

### Evidence of past drift

The `init-context` removal (2026-04-23) touched all three files above; the first-pass sweep missed them. Only a follow-up review question ("哪些文档站地方需要更新") caught them.

### Grep command

```bash
cd docs-site && grep -rln "task\.py <subcommand-name>\|`<subcommand-name>`" --include="*.mdx" \
  | grep -v "release/\|changelog/"
```

---

## Trigger 4: Skill Add / Remove / Rename

Scope: any edit to `packages/cli/src/templates/common/skills/` or `packages/cli/src/templates/{platform}/skills/`.

| File (en + zh) | What to sync |
|---|---|
| `start/everyday-use.mdx` | Skill table at top (around line 15-18) + individual skill description sections |
| `advanced/appendix-b.mdx` | Skill reference table (if present) |
| `start/install-and-first-task.mdx` | Phase walkthrough skill names |
| Skill Routing table across workflow docs | Must match `workflow.yaml` / workflow body per-platform splits |

### Grep command

```bash
cd docs-site && grep -rln "trellis-<skill-name>" --include="*.mdx" \
  | grep -v "release/\|changelog/\|blog/"
```

---

## Trigger 5: JSONL / Task Metadata Schema Changes

Scope: any edit to `implement.jsonl` / `check.jsonl` seed format, `task.json` schema, or consumer contracts (hook / prelude / `read_jsonl_entries`).

| File (en + zh) | What to sync |
|---|---|
| `advanced/appendix-c.mdx` | `task.json` schema block — every field has a comment; keep in sync with `task_store.py` |
| `start/everyday-use.mdx` | "Seeded on Create, AI Curates in Phase 1.3" section (or whatever replaces it) + sample JSONL blocks |
| `advanced/architecture.mdx` | Context injection diagrams if present |
| `concepts/*.mdx` | Seed vs curated row distinction if any conceptual page explains jsonl |

### Contract to keep in sync

- **Seed row schema**: `{"_example": "..."}` — no `file` field
- **Curated row schema**: `{"file": "<path>", "reason": "<why>"}`
- **Consumer behavior**: row without `file` is skipped by every consumer (hook, prelude, validate, list-context)
- **READY gate**: jsonl with only seed row → NOT ready (must have at least one curated row)

See `.trellis/spec/cli/backend/platform-integration.md` → "Agent-Curated JSONL Contract (Phase 1.3)" for the code-side contract.

---

## Trigger 6: Changelog & Migration

Every released version must have:

| File (en + zh) | What to sync |
|---|---|
| `changelog/v<version>.mdx` | Release notes — list user-visible changes, breaking-change warnings, upgrade steps |
| `docs.json` | Navigation entry for the new changelog page (both languages) |
| `release/` tree | Release-frozen copy — only updated on release-cut, not during develop |

Migration manifests in `packages/cli/src/migrations/manifests/` need matching changelog entries. The manifest's `changelog` + `aiInstructions` fields are the authoritative text; changelog MDX should link to or paraphrase them.

## Trigger 7: `.trellis/config.yaml` Template or Reader Changes

Scope: any edit to `packages/cli/src/templates/trellis/config.yaml`, config readers under `packages/cli/src/templates/trellis/scripts/common/`, or `configSectionsAdded` behavior in update manifests.

| File (en + zh, release + beta) | What to sync |
|---|---|
| `advanced/configuration.mdx` | Add/remove/rename config keys, defaults, accepted values, and update behavior |
| `advanced/appendix-a.mdx` | Update the `.trellis/config.yaml` one-line purpose if the file's responsibility changes |
| `start/everyday-use.mdx` | Update only if the key affects day-to-day task/session operations |
| `changelog/v<version>.mdx` | Document user-visible config behavior or migration delivery |

### Grep command

```bash
cd docs-site && grep -rln "config.yaml\|session_auto_commit\|codex.dispatch_mode\|update.skip" \
  --include="*.mdx" --include="docs.json" \
  | grep -v "node_modules/"
```

**Rule**: The template is the source of truth for shipped examples, but `advanced/configuration.mdx` is the user-facing reference. If a key is supported by code but intentionally absent from the current template (for example, legacy compatibility), the configuration page should say so explicitly instead of silently omitting it.

---

## Bilingual Discipline

**Every update under `*.mdx` must be done in BOTH `en/` and `zh/` paths.** The zh/ tree mirrors the en tree exactly — same file names, same section headings, same order.

### Common drift sources

1. Edited en, forgot zh → `zh/start/everyday-use.mdx` falls behind by weeks
2. Navigation entries added to `languages[0]` only → page renders in English sidebar only
3. Code blocks translated (don't translate code — only prose)

### Detection

```bash
cd docs-site
# Find pages that exist in en but not zh (or vice versa)
diff <(find . -name "*.mdx" -not -path "./zh/*" -not -path "./release/*" -not -path "./node_modules/*" | sed 's|^\./||' | sort) \
     <(find zh -name "*.mdx" | sed 's|^zh/||' | sort)
```

Non-zero output = orphan pages. Triage before merge.

---

## Non-Triggers (Don't Update Docs)

| Change | Why no doc update |
|---|---|
| Internal refactor with no user-visible behavior change | No user-facing contract changed |
| Bug fix that restores documented behavior | Docs already describe correct behavior |
| Test additions | Tests aren't user-facing |
| Migration manifest content changes | Already captured by `changelog/v<version>.mdx` |

---

## Audit Process Before Merging

1. Run the grep command from the trigger section that matches your change
2. Open each hit — is the page still accurate after your change?
3. For any hit that's stale: update both `en` and `zh` versions
4. If you added/removed pages: update `docs.json` navigation in both language trees
5. If the change impacts multiple triggers (e.g. a removed command + a removed platform), run all relevant greps

Mechanical > heroic. Don't rely on memory or review to catch drift.
