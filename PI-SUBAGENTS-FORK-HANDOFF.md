# Trellis Pi-Subagents Fork Handoff

This branch contains the locally validated Trellis Pi-subagents delivery and is intended for controlled validation in another project folder.

## Release Source

- Fork: `https://github.com/coding-chong/Trellis-win-fixed.git`
- Branch: `feat/pi-subagents-backend`
- Release commit: `060fbdae5e7751641e5b55a7ecbf8b46c314c516`
- Required migration ancestor: `da241032ec1295158048be85948d6ce12bdc9ffd`

A branch name is not sufficient provenance. Before touching a target project, clone the fork and verify the exact release commit:

```powershell
git clone --branch feat/pi-subagents-backend --single-branch `
  https://github.com/coding-chong/Trellis-win-fixed.git `
  <TRELLIS_CHECKOUT>

$trellis = (Resolve-Path <TRELLIS_CHECKOUT>).Path
$expected = '060fbdae5e7751641e5b55a7ecbf8b46c314c516'
$parent = 'da241032ec1295158048be85948d6ce12bdc9ffd'

if (git -C $trellis status --short) { throw 'Trellis checkout is not clean.' }
$actual = (git -C $trellis rev-parse HEAD).Trim()
if ($actual -ne $expected) { throw "Unexpected Trellis release: $actual" }
git -C $trellis merge-base --is-ancestor $parent $actual
if ($LASTEXITCODE -ne 0) { throw 'Required migration commit is absent.' }
git -C $trellis merge-base --is-ancestor $expected $actual
if ($LASTEXITCODE -ne 0) { throw 'Required telemetry release commit is absent.' }
```

Stop before injection if the URL, clean-tree check, release SHA, or either ancestor check fails. Record the verified SHA in the target-local validation report.

## Build The Verified CLI

Run from the verified Trellis checkout:

```powershell
Set-Location $trellis
pnpm install --frozen-lockfile
pnpm build:core
pnpm --filter @mindfoldhq/trellis build
```

Do not invoke a globally installed Trellis CLI for this validation. The local CLI must be built first because its `dist/cli/index.js` is generated.

## Choose One Target Path

### New Project

Use this only when the target has no `.trellis/` and no Trellis-managed `.pi/` assets:

```powershell
Set-Location <TARGET_PROJECT_ROOT>
node "$trellis/packages/cli/bin/trellis.js" init --pi --yes --no-monorepo -u <DEVELOPER_NAME>
```

The generated canonical Pi contract is portable `bash`. Do not silently replace it with Windows `pwsh` based only on the host OS. A Windows `pwsh` profile requires an explicit, separately validated provider overlay using the home-relative `@4fu/pi-pwsh` provider.

### Existing Project

Use this only when the target already contains `.trellis/.version` and `.trellis/.template-hashes.json`:

```powershell
$script = "$trellis/packages/cli/scripts/migrate-trellis-pi-subagents.ps1"
pwsh -NoProfile -File $script -ProjectRoot <TARGET_PROJECT_ROOT> -WhatIf
```

Review the listed targets. Exit 0 with `would be migrated` is eligible for apply; `No changes required` is already current. Any customization or hash/contract error is a fail-closed stop. Do not force or manually overwrite a managed file.

Apply only after a clean WhatIf:

```powershell
pwsh -NoProfile -File $script -ProjectRoot <TARGET_PROJECT_ROOT>
```

Record the emitted manifest:

```text
<TARGET_PROJECT_ROOT>/.trellis/.migrations/pi-subagents/<timestamp>/manifest.json
```

Rollback preflight:

```powershell
pwsh -NoProfile -File $script -RollbackManifest <ABSOLUTE_MANIFEST_PATH> -WhatIf
```

Use a full rollback only when validation fails or the project owner requests it. Prefer testing full rollback in a disposable copy.

## Provider-Free Checks

After injection, start a new Pi session from the target or use `/reload`. Before launching a model child:

```powershell
Set-Location <TARGET_PROJECT_ROOT>
rg -n 'npm:pi-subagents@0\.46\.0' .pi/settings.json
rg -n 'thinking: medium|defaultContext: fresh|maxSubagentDepth: 0|nestedPiBoundary: unenforced' .pi/agents -g 'trellis-*.md'
rg -n 'TRELLIS_ENABLE_LEGACY_SUBAGENT|PI_SUBAGENT_CHILD' .pi/extensions/trellis/index.ts
Test-Path .pi/extensions/context-telemetry/index.ts
```

Run `/subagents-doctor` without dispatching a child. The default registry must contain `subagent`, `subagent_supervisor`, and `subagent_wait`, but not `trellis_subagent`. Never enable `TRELLIS_ENABLE_LEGACY_SUBAGENT` during normal validation.

For a Git target, record `git status --short` before and after. For a non-Git target, use hashes, file inventory, and validation output; do not claim staged-file or diff evidence.

## One Visible Canary

Create a small target-local Trellis task and run one fresh `trellis-research` child through visible async `functions.subagent` workflowScript. Use `async:true`, `mission:false`, medium thinking, explicit `review:false` acceptance, an absolute task-local output path, and a task payload beginning with:

```text
Active task: <TARGET_TASK_PATH>
```

Do not use `trellis_subagent`, resume, fork, nested Pi, OM, MCP, or auto-compact inside the child. Retain the workflow ID, child run ID, session path, output path, and telemetry sidecar. Verify `pwsh` only when using the explicit Windows overlay. The advisory policy must be reported truthfully as `nestedPiBoundary: unenforced`.

The generic pi-subagents acceptance prompt may show optional `noStagedFiles` and `diffSummary` examples even when they are not requested. They are non-gating report-format noise. Do not treat them as runtime-verified Git evidence, and do not add unsupported `scmMode` or `scmEvidence` fields.

## Required Report And Boundaries

Write a target-local report containing source URL/SHA, injection path, before/after hashes or Git status, WhatIf/apply/rollback results, registry, workflow/child/session/output references, effective tools/extensions/thinking/context/depth, telemetry secrecy checks, commands and failures, residual risks, and confirmation that legacy remained default-disabled.

Do not modify this source checkout during target validation. Do not access provider secrets. Do not push additional refs, create a PR, publish npm, or claim a hard OS nested-Pi boundary while arbitrary shell authority remains enabled.
