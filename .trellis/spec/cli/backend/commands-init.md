# `trellis init` Spec Selection

## 1. Scope / Trigger

Use this contract when changing spec selection in `commands/init.ts`, the init
CLI options, workflow scaffold generation, or creator bootstrap tasks.

## 2. Signatures

```text
trellis init --empty-spec
trellis init -y --empty-spec
trellis init --empty-spec --registry <source>
```

`InitOptions.emptySpec?: boolean` and `WorkflowOptions.emptySpec?: boolean`
carry the project-wide choice. `WorkflowOptions.skipSpecTemplates` retains its
separate meaning: a remote template replaced local scaffolding in single-repo
mode. Do not use it to suppress shared guides for existing monorepo flows.

## 3. Contracts

- `from scratch` and plain `-y` keep generating the existing starter docs.
- Empty spec skips all spec scaffolding: no spec root is created in a fresh
  project, and no backend, frontend, guides, or package spec files are added.
- Existing spec files are untouched, including during forced reinitialization.
- Runtime/platform files, developer identity, workspace and task setup continue.
- Monorepo empty spec is selected once for the whole project, before any
  per-package template downloads. Package config is still written normally.
- Explicit `--empty-spec` skips spec registry parsing, lookup, downloads and
  new registry config persistence. It does not disable workflow template lookup.
- Built-in/custom marketplace and direct-registry interactive flows offer an
  empty choice. An unavailable custom registry offers abort (default) or empty;
  it must never be misclassified as a direct download.
- The creator bootstrap task remains available. Empty mode makes creating
  project-specific specs optional, uses domain-neutral guidance and sets
  `relatedFiles: []`; it must not require absent starter docs.
- No persistent empty-mode marker is required. Update does not regenerate
  built-in spec scaffolding.

## 4. Validation & Error Matrix

| Input | Result |
| --- | --- |
| `-y` | Existing generic starter docs |
| `--empty-spec` (with or without `-y`) | No generated spec files |
| `--empty-spec --registry <source>` | Ignore unused spec registry; no access |
| `--empty-spec --template <id>` | Throw `--empty-spec cannot be used with --template.` before writes |
| Interactive direct registry with empty choice | No download or spec generation |
| Failed non-interactive registry lookup | Existing failure behavior |

## 5. Good / Base / Bad Cases

- Good: a Linux kernel project chooses empty spec, retains the runtime, and
  later decides whether to document kernel-specific conventions.
- Base: an existing `trellis init -y` automation receives the same starter docs.
- Bad: skipping backend/frontend docs but still writing shared guides or
  instructing the bootstrap task to fill nonexistent backend/frontend paths.

## 6. Tests Required

Use the real-temp filesystem integration harness in
`test/commands/init.integration.test.ts` (#658). Verify absence of the spec
root, presence of runtime files, byte-preservation of existing specs, no spec
hash entries for a fresh empty init, optional bootstrap guidance, no registry
access for explicit empty mode, and unchanged default/remote installation.
Exercise single-repo and project-wide monorepo paths, with and without `-y`.

## 7. Wrong vs Correct

Wrong: guard only `writeBackendDocs()` / `writeFrontendDocs()`. Guides and
package directories are still created by their parent scaffold operation.

Correct: gate the entire spec creation operation in `createWorkflowStructure()`
with the resolved global empty-spec choice, preserving all other runtime setup.
