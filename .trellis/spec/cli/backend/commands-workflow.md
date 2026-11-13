# `trellis workflow` Command

`trellis workflow` lists and switches the project's active `.trellis/workflow.md`
template. It is the only command that deliberately replaces an existing
workflow variant in-place after init.

## Scenario: workflow marketplace templates and switcher

### 1. Scope / Trigger

Trigger: adding a user-facing command and init flags that change a runtime-parsed
template, marketplace lookup behavior, and `.trellis/.template-hashes.json`
ownership.

This spec applies when editing:

- `packages/cli/src/commands/workflow.ts`
- `packages/cli/src/utils/workflow-resolver.ts`
- `packages/cli/src/utils/workflow-hash-contract.ts`
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

- `native` (named legacy compatibility workflow during staged retirement)
- `native-delivery-v1` (fresh no-flag init default, Task schema 2.0 / Delivery API 1.0)
- `tdd`
- `channel-driven-subagent-dispatch`

Ownership contract:

- `native` and bundled `native-delivery-v1` are Trellis-managed. After writing either, refresh the
  `.trellis/workflow.md` hash with `updateHashes`.
- Every external/custom workflow is user-managed local content. After writing it,
  remove `.trellis/workflow.md` from `.trellis/.template-hashes.json` with
  `removeHash`.
- Reinitialization without an explicit workflow choice preserves the existing
  workflow's actual ownership. A missing workflow hash stays missing after both
  forced full reinit and add-platform reinit, even when `options.workflow`
  chooses the fresh `native-delivery-v1` default. Hash initialization must not adopt retained custom
  legacy/schema-2 content. Normal and forced update preserve its continuation
  and declared owners; only explicit workflow selection changes this authority.
- The fresh default does not switch existing managed legacy workflow bytes on
  no-explicit reinit. Legacy installations retain their actual contract until a
  reviewed migration; ordinary update still uses that installed declaration.
- Do not add `workflow.variant` or any other long-lived config field to make
  `trellis update` chase a selected variant. Switching is an explicit project
  action.

Runtime parser contract:

- Legacy workflow templates keep `## Phase Index`, `## Phase 1: Plan`,
  `#### X.Y` step headings, platform marker syntax, and all required
  `[workflow-state:*]` blocks.
- Delivery workflows keep `## Phase Index`, one structurally valid
  `[trellis-runtime-contract]` declaration, one continuation and public phase
  breadcrumb blocks. Semantic owners live in that Markdown; they do not need
  legacy Task phase/step headings. `get_context.py --mode runtime-contract`
  reads the validated Task workspace's declared API/schema/owners. No hook
  duplicates a Delivery route matrix.
- Every active workflow, whether bundled or supplied by an external author,
  must contain exactly one non-empty
  `[trellis-continuation]...[/trellis-continuation]` block. The current AI
  owns semantic execution of that block; `get_context.py --mode continuation`
  performs only deterministic structural extraction.
- SessionStart, per-turn workflow-state hooks, `trellis-start`, and
  `get_context.py --mode phase` read the current `.trellis/workflow.md`; do not
  duplicate variant-specific behavior in hook scripts or skills.
- `trellis-start` and `trellis-continue` read the active workflow's
  continuation block on every invocation. Workflow switching therefore takes
  effect immediately, and `.trellis/workflow.md.new` is never a runtime input.
- A missing, duplicated, empty, nested, unclosed, or mismatched continuation
  block fails closed as `invalid_continuation_contract`; there is no native,
  legacy-route, or project-inventory fallback.

Native source-of-truth contract:

- `packages/cli/src/templates/trellis/workflow.md` is the source of truth for
  the root repository's native workflow.
- `.trellis/workflow.md` is the dogfood native workflow. Its continuation body
  must match the bundled native continuation body; unrelated dogfood workflow
  guidance remains independently managed.
- `packages/cli/src/templates/trellis/workflow-delivery-v1.md` owns the bundled
  native Delivery workflow, the fresh no-flag init default. Explicit `native`
  remains the named temporary legacy compatibility workflow; implicit reinit
  preserves actual installed content and ownership. This repository's current
  legacy Task/workflow is not automatically activated or migrated. Explicit
  install/switch preflights exact installed runtime capabilities and active
  schema combinations; same package version alone does not prove Delivery API
  availability. Current SDK `/task` and explicit legacy execution remain isolated
  compatibility paths. Their global retirement is future breaking-release work;
  #31 native/API/migration acceptance requires no downstream or joint evidence.
- Marketplace and custom workflow repositories own migration of their workflow
  content to the structural protocol. This root repository must not advance a
  marketplace gitlink merely to make those external workflows valid.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| `trellis workflow --template <id>` and current workflow is modified | Exit 1 with guidance to use `--force` or `--create-new`; do not prompt, even on a TTY |
| Interactive `trellis workflow` picker and current workflow is modified | Prompt for overwrite, create-new, or skip |
| `--create-new` | Write a generated `workflow.md.new` file beside `.trellis/workflow.md`; do not change active workflow or hash file |
| `--force` | Overwrite active workflow and apply the bundled/external hash contract |
| Missing workflow id | Throw `WorkflowResolveError` / command error; CLI exits non-zero |
| Marketplace index fetch fails | List can still show bundled native with warning; resolve fails with workflow-specific error |
| Workflow entry path is missing, not `.md`, absolute, or contains `..` | Fail with workflow-specific error |
| `init --workflow missing-id` | Reject; do not print and return success |
| `init --workflow tdd` | Write marketplace content and remove `.trellis/workflow.md` hash |
| `trellis update` after switching to external/custom | Treat workflow as modified/user-managed; never silently restore native |
| `native-delivery-v1` on an installation without executable API 1.0 | Diagnose before writes; require reviewed runtime reapply/upgrade |
| Workflow activation with incompatible active Task schemas | Diagnose before writes; D1 does not migrate records implicitly |

### 5. Good/Base/Bad Cases

- Good: `trellis workflow --template tdd` replaces a pristine native workflow,
  removes the workflow hash, and later `trellis update` leaves TDD content in
  place.
- Base: `trellis init --workflow native` writes bundled native workflow and
  keeps `.trellis/workflow.md` hash-tracked.
- Bad: `trellis workflow --template tdd` writes TDD content and records the TDD
  hash. The next `trellis update` sees a pristine file and overwrites it with
  native workflow.

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
- Custom legacy and schema-2 workflow -> `init --force --yes` without workflow
  flags -> normal and forced update preserves exact content, owners and absent
  workflow hash. Exercise the add-platform fast path as well as full reinit.
- Marketplace native mirror matches bundled native workflow when the mirror file
  exists.
- Real `marketplace/workflows/tdd/workflow.md` planning breadcrumbs include the
  TDD gates: observable behavior slices, public interface under test, and mock
  boundaries.
- Fresh native init and the dogfood native workflow contain one valid
  continuation block and retain the named native continuation routes.
- Switching to a custom workflow whose continuation differs from native changes
  the next extraction immediately.
- `--create-new` and update conflict files do not affect runtime extraction;
  only `.trellis/workflow.md` is read.
- Invalid active workflow contracts fail without native or inventory fallback.

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

Workflow hash ownership is projected by the pure `projectWorkflowHashes` helper:
bundled IDs track the selected content, and user-managed IDs remove the workflow
hash while retaining unrelated entries. The command saves that projection only
after its content write; explicit migration uses the same projection inside its
reviewed, frozen receipt write set without live receipt rereads.


## Python operation boundary

Workflow preview and force application use the [shared Python selection contract](./configurator-shared.md#scenario-python-selection-across-process-boundaries-issue-53). Resolve before rendering and native preflight. Preview still skips the installed native preflight; `.new`, local edits and hash ownership keep their existing semantics.
