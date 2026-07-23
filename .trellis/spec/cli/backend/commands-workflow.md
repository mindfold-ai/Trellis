# `trellis workflow` Command

`trellis workflow` lists and switches the project's active `.trellis/workflow.md`
template. It is the only command that deliberately replaces an existing
workflow variant in-place after init. `--save <id>` instead populates the
per-task variant library (`.trellis/workflows/<id>.md`) without touching the
active workflow; how consumers resolve a task's selected variant is specified
in `workflow-state-contract.md`.

## Scenario: workflow marketplace templates and switcher

### 1. Scope / Trigger

Trigger: adding a user-facing command and init flags that change a runtime-parsed
template, marketplace lookup behavior, and `.trellis/.template-hashes.json`
ownership.

This spec applies when editing:

- `packages/cli/src/commands/workflow.ts`
- `packages/cli/src/utils/workflow-resolver.ts`
- `packages/cli/src/commands/init.ts` workflow-selection code
- `packages/cli/src/configurators/workflow.ts`
- `marketplace/workflows/**`
- workflow-related tests

### 2. Signatures

CLI signatures:

```text
trellis workflow
trellis workflow --list
trellis workflow --template <id>
trellis workflow --marketplace <source> --template <id>
trellis workflow --template <id> --force
trellis workflow --template <id> --create-new

trellis workflow --save <id>
trellis workflow --marketplace <source> --save <id>
trellis workflow --save <id> --force

trellis init --workflow <id>
trellis init --workflow-source <source> --workflow <id>
```

Resolver signatures:

```typescript
export const NATIVE_WORKFLOW_ID = "native";

export interface ResolvedWorkflowTemplate {
  id: string;
  type: "workflow";
  name: string;
  description?: string;
  path: string;
  content: string;
  source: "bundled" | "marketplace";
}

export interface WorkflowTemplateListing {
  id: string;
  type: "workflow";
  name: string;
  description?: string;
  path: string;
  source: "bundled" | "marketplace";
}

export function listWorkflowTemplates(options?: {
  source?: string;
}): Promise<{ templates: WorkflowTemplateListing[]; errorMessage?: string }>;

export function resolveWorkflowTemplate(
  id: string,
  options?: { source?: string },
): Promise<ResolvedWorkflowTemplate>;
```

Configurator signature:

```typescript
export interface WorkflowOptions {
  projectType: ProjectType;
  skipSpecTemplates?: boolean;
  packages?: DetectedPackage[];
  remoteSpecPackages?: Set<string>;
  workflowMdOverride?: string;
}
```

### 3. Contracts

Marketplace entries use `type: "workflow"` and point to one markdown file:

```json
{
  "id": "tdd",
  "type": "workflow",
  "name": "TDD Workflow",
  "description": "Trellis workflow variant that drives Phase 2 with one red / green / refactor behavior slice at a time",
  "path": "workflows/tdd/workflow.md",
  "tags": ["workflow", "tdd", "testing"]
}
```

Required built-ins:

- `native`
- `tdd`
- `channel-driven-subagent-dispatch`

Ownership contract:

- `native` is Trellis-managed. After writing it, refresh the
  `.trellis/workflow.md` hash with `updateHashes`.
- Every non-native workflow is user-managed local content. After writing it,
  remove `.trellis/workflow.md` from `.trellis/.template-hashes.json` with
  `removeHash`.
- Do not add `workflow.variant` or any other long-lived config field to make
  `trellis update` chase a selected variant. Switching is an explicit project
  action. (Per-task selection via `task.json.workflow` is task-scoped state,
  not config — it does not violate this rule.)
- `--save <id>` writes only `.trellis/workflows/<id>.md`. It never touches
  `.trellis/workflow.md` or `.trellis/.template-hashes.json` — no
  `updateHashes`, no `removeHash`, whether the resolved template is native or
  marketplace.

Library ownership contract (`.trellis/workflows/`):

- Everything under `.trellis/workflows/` is user-managed local content: never
  hash-tracked, never touched by `trellis update` (the directory is never in
  update's desired-file map, same as `tasks/`). Refreshing a saved variant
  means re-running `--save <id> --force`.
- Library ids must match `^[A-Za-z0-9_-]+$` — the same charset the per-task
  resolvers accept (`common/workflow_selection.py`), so every saved id is
  resolvable and a task.json value can never escape `.trellis/workflows/`.
- `--save` composes with `-m/--marketplace <source>` exactly like
  `--template`, and never composes with the active-workflow write modes
  (`--template`, `--create-new`).
- `--list` additionally prints a `Library (.trellis/workflows/):` section
  listing the `.md` ids found on disk (sorted); the section is omitted when
  the directory is absent or empty.

Marker validation contract (`--save` only; warn, never block):

- After writing the library file, `--save` checks the saved content for the
  runtime parser markers and prints a single stderr warning listing whatever
  is missing: `## Phase Index`, at least one `#### X.Y` step heading, and the
  six native `[workflow-state:*]` blocks (`no_task`, `planning`,
  `planning-inline`, `in_progress`, `in_progress-inline`, `completed`).
- The file is still written and the command exits 0 — consumers degrade to
  generic breadcrumbs / partial phase detail where markers are absent.
- Warnings go to stderr; stdout stays reserved for command output.

Runtime parser contract:

- Every workflow template must keep `## Phase Index`, `## Phase 1: Plan`,
  `#### X.Y` step headings, platform marker syntax, and all required
  `[workflow-state:*]` blocks.
- SessionStart, per-turn workflow-state hooks, `trellis-start`, and
  `get_context.py --mode phase` read the resolved workflow file (the active
  task's `.trellis/workflows/<id>.md` when selected, else the current
  `.trellis/workflow.md` — resolution order in `workflow-state-contract.md`);
  do not duplicate variant-specific behavior in hook scripts or skills.

Native source-of-truth contract:

- `packages/cli/src/templates/trellis/workflow.md` is the source of truth for
  native workflow.
- If `marketplace/workflows/native/workflow.md` exists, tests must enforce byte
  identity with the bundled native template.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| `trellis workflow --template <id>` and current workflow is modified | Exit 1 with guidance to use `--force` or `--create-new`; do not prompt, even on a TTY |
| Interactive `trellis workflow` picker and current workflow is modified | Prompt for overwrite, create-new, or skip |
| `--create-new` | Write a generated `workflow.md.new` file beside `.trellis/workflow.md`; do not change active workflow or hash file |
| `--force` | Overwrite active workflow and apply the native/non-native hash contract |
| Missing workflow id | Throw `WorkflowResolveError` / command error; CLI exits non-zero |
| Marketplace index fetch fails | List can still show bundled native with warning; resolve fails with workflow-specific error |
| Workflow entry path is missing, not `.md`, absolute, or contains `..` | Fail with workflow-specific error |
| `init --workflow missing-id` | Reject; do not print and return success |
| `init --workflow tdd` | Write marketplace content and remove `.trellis/workflow.md` hash |
| `trellis update` after switching to non-native | Treat workflow as modified/user-managed; never silently restore native |
| `--save <id>` where id fails `[A-Za-z0-9_-]+` | Exit 1 with invalid-id error before any resolve/fetch |
| `--save <id>` combined with `--template` or `--create-new` | Exit 1; the library write never composes with active-workflow modes |
| `--save <id>` and `.trellis/workflows/<id>.md` exists | Exit 1 with guidance to re-run with `--force`; `--force` overwrites the library file only |
| `--save missing-id` | `WorkflowResolveError` surfaced as command error; nothing written |
| `--save` of a template missing parser markers | Write the file, exit 0, one stderr warning listing the missing markers |
| `trellis update` with saved library files present | Leave `.trellis/workflows/` untouched |

### 5. Good/Base/Bad Cases

- Good: `trellis workflow --template tdd` replaces a pristine native workflow,
  removes the workflow hash, and later `trellis update --skip-all` leaves TDD
  content in place.
- Good: `trellis workflow --save tdd` writes `.trellis/workflows/tdd.md` while
  `.trellis/workflow.md` and `.template-hashes.json` stay byte-unchanged, and
  a later `trellis update` leaves the library file alone.
- Base: `trellis init --workflow native` writes bundled native workflow and
  keeps `.trellis/workflow.md` hash-tracked.
- Bad: `trellis workflow --template tdd` writes TDD content and records the TDD
  hash. The next `trellis update` sees a pristine file and overwrites it with
  native workflow.
- Bad: `--save` removes the `.trellis/workflow.md` hash (or records one for the
  library file). The command mutated the hash contract of a file it never
  wrote, or turned user-managed library content into a Trellis-owned template.

### 6. Tests Required

Unit tests:

- `resolveWorkflowTemplate("native")` returns bundled content without fetch.
- Marketplace workflow resolution fetches `index.json` and one markdown file.
- Missing id errors mention workflow templates, not spec templates.
- Invalid / escaping workflow paths fail before fetch or file read.

Integration tests:

- `init --workflow native` keeps `.trellis/workflow.md` hash-tracked.
- `init --workflow tdd` writes marketplace content and removes the hash.
- `init --workflow-source <source> --workflow custom-id` writes custom content.
- `init --workflow missing-id` rejects.
- `trellis workflow --template tdd` writes marketplace content and removes the
  hash.
- Explicit `--template` with modified workflow fails even when `stdin.isTTY` is
  true.
- `--create-new` writes a generated `workflow.md.new` file beside `.trellis/workflow.md` and does not touch the active
  workflow or hash.
- `trellis update` after switching to non-native does not restore native.
- Marketplace native mirror matches bundled native workflow when the mirror file
  exists.
- Real `marketplace/workflows/tdd/workflow.md` planning breadcrumbs include the
  TDD gates: observable behavior slices, public interface under test, and mock
  boundaries.
- `--save tdd` writes the library file; `.trellis/workflow.md` and
  `.template-hashes.json` are byte-unchanged.
- `--save` on an existing library file fails without `--force` and overwrites
  with it.
- `--save` of a variant missing `[workflow-state:*]` blocks warns on stderr and
  still writes the file; `--save native` emits no marker warning.
- `--save` combined with `--template` or `--create-new` fails.
- `--list` shows saved library ids in a `Library` section.
- `trellis update` leaves saved library files intact.

Runtime parsing validation:

```bash
python3 ./.trellis/scripts/get_context.py --mode phase
python3 ./.trellis/scripts/get_context.py --mode phase --step 2.1
python3 ./.trellis/scripts/get_context.py --mode phase --step 2.2 --platform codex
python3 ./.trellis/scripts/get_context.py --mode phase --step 2.1 --platform codex-sub-agent
python3 ./.trellis/scripts/get_context.py --mode phase --step 2.1 --platform claude
```

### 7. Wrong vs Correct

#### Wrong

```typescript
// Records non-native content as the pristine template hash.
fs.writeFileSync(".trellis/workflow.md", tddContent);
updateHashes(cwd, new Map([[PATHS.WORKFLOW_GUIDE_FILE, tddContent]]));
```

This makes `trellis update` auto-replace TDD with bundled native workflow later.

#### Correct

```typescript
fs.writeFileSync(".trellis/workflow.md", tddContent);
removeHash(cwd, PATHS.WORKFLOW_GUIDE_FILE);
```

Missing hash means update conservatively treats the workflow as user-managed and
routes it through the normal modified-file decision path.

#### Wrong

```typescript
if (isInteractive()) {
  await promptForOverwrite();
}
```

An explicit `trellis workflow --template tdd` can hang in a TTY even though it is
a scriptable command path.

#### Correct

```typescript
const explicitTemplate = Boolean(options.template);
if (explicitTemplate || !isInteractive()) {
  throw new WorkflowCommandError("... use --force or --create-new ...");
}
```

Only the no-argument interactive picker may prompt for conflict resolution.

#### Wrong

```typescript
// Treats a library save like an active-workflow switch.
fs.writeFileSync(".trellis/workflows/tdd.md", finalContent);
removeHash(cwd, PATHS.WORKFLOW_GUIDE_FILE);
```

This mutates the hash contract of `.trellis/workflow.md`, a file the `--save`
path never wrote.

#### Correct

```typescript
fs.writeFileSync(".trellis/workflows/tdd.md", finalContent);
// No updateHashes / removeHash: the library is user-managed by definition.
```

Hash absence is what keeps `trellis update` away from the library — never add
library paths to `.template-hashes.json`.
