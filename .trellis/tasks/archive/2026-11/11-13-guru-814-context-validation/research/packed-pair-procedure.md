# Research: Packed CLI/Core maintenance procedure

- Query: Find the supported matching CLI/Core pack and install procedure, reusable installed-public maintenance harnesses, candidate identity checks, and an available Python 3.9 runtime.
- Scope: Internal repository research and local interpreter discovery. No build, pack, install, or test execution.
- Date: 2026-11-13

## Findings

### Supported local pair procedure

The current CLI and Core manifests both declare `0.7.0-castbox.6`. The CLI source dependency is `workspace:*`. Packing must rewrite it to the exact Core version. The maintenance verification contract requires Core to build before CLI and requires the exact packed pair to be installed in a throwaway consumer (`.trellis/spec/cli/backend/commands-maintain.md:179`).

After the implementation owner stops changing source and build inputs, the proof owner can run these commands from the repository root. Replace the two absolute placeholder directories with fresh private directories. Read actual tarball names from pack output.

```sh
pnpm --filter @mindfoldhq/trellis-core build
pnpm --filter @mindfoldhq/trellis build
node packages/cli/scripts/release-preflight.js verify-packed-cli
pnpm --filter @mindfoldhq/trellis-core pack --pack-destination /absolute/candidate
pnpm --filter @mindfoldhq/trellis pack --pack-destination /absolute/candidate
npm install --prefix /absolute/private-prefix --ignore-scripts --no-audit --no-fund /absolute/candidate/mindfoldhq-trellis-core-0.7.0-castbox.6.tgz /absolute/candidate/mindfoldhq-trellis-0.7.0-castbox.6.tgz
```

`verify-packed-cli` packs the CLI into a temporary directory and checks its packed manifest. It rejects a Core dependency that differs from the shared exact version (`packages/cli/scripts/release-preflight.js:240-283`). It does not install the pair or exercise maintenance.

The paired local installation follows `.trellis/spec/cli/backend/release-process.md:325-345`. The archived command example is `.trellis/tasks/archive/2026-10/10-17-issue-46-legacy-archive-resume/research/guru-577-handoff.md:19-21`. These local commands do not authorize a tag, upload, npm publication, or downstream adoption.

Preserve the candidate source snapshot before packaging. Source SHA alone cannot identify uncommitted source bytes. Record the actual tarball checksums and installed public plan candidate for the proof. Do not build or pack while another owner changes source or copied templates.

### Best reusable installed-public harness

The closest reusable loader and tools fixture is:

`.trellis/tasks/archive/2026-10/10-17-issue-46-legacy-archive-resume/research/verify-packed-candidate.mjs`

Its existing invocation is:

```sh
node .trellis/tasks/archive/2026-10/10-17-issue-46-legacy-archive-resume/research/verify-packed-candidate.mjs /absolute/private-prefix /absolute/new-report.json
```

It resolves `@mindfoldhq/trellis` from the installed prefix with `createRequire`, imports its public `maintenance` namespace, and resolves installed Core exports. It checks that CLI version, Core version, and the CLI exact Core dependency agree (`verify-packed-candidate.mjs:13-28`). This prevents a source-tree import from standing in for installed package proof.

The tools section performs `inspectToolsTarget`, `prepareToolsInstallation`, and `applyMaintenance` through the installed public SDK (`verify-packed-candidate.mjs:72-76`). It uses the installed bundled workflow content and explicit replacement decisions for inspected conflicts.

The later public-bin `prepare`, `preview`, `apply`, `recover`, and `resume` calls exercise **task_resume**, not recovery of the tools operation (`verify-packed-candidate.mjs:91-103`). Therefore, running the archived harness alone does not prove tools recovery/resume on the original tools recovery reference.

For this Task, reuse the installed loader and the narrow tools fixture in the proof owner's current harness. Exercise the original tools operation with this public sequence:

```js
const inspection = await maintenance.inspectToolsTarget({ root });
const plan = await maintenance.prepareToolsInstallation(reviewedToolsInput);
const preview = maintenance.previewMaintenance(plan);
const applied = await maintenance.applyMaintenance(plan, { state_dir });
const recovered = await maintenance.recoverMaintenance({
  recovery_ref: applied.recovery_ref,
});
const resumed = await maintenance.resumeMaintenance({
  recovery_ref: applied.recovery_ref,
});
```

`reviewedToolsInput` is the complete tools input prepared from the inspection and chosen bundled workflow. The snippet does not replace its actual input contract. Assert the original operation identity and recovery reference through apply, recover, and resume. Check actual installed native contract/context consumers and preservation of selected Task, peer checkout, session carriers, and unrelated files. Public wrappers are defined in `packages/cli/src/commands/maintenance/api.ts:175-215`.

For fresh-process public-bin proof, the installed binary is:

```text
/absolute/private-prefix/node_modules/@mindfoldhq/trellis/bin/trellis.js
```

The archived harness demonstrates these public commands:

```sh
node /absolute/private-prefix/node_modules/@mindfoldhq/trellis/bin/trellis.js maintain prepare --input /absolute/input.json --json
node /absolute/private-prefix/node_modules/@mindfoldhq/trellis/bin/trellis.js maintain preview --plan /absolute/plan.json --json
node /absolute/private-prefix/node_modules/@mindfoldhq/trellis/bin/trellis.js maintain apply --plan /absolute/plan.json --state-dir /absolute/state --json
node /absolute/private-prefix/node_modules/@mindfoldhq/trellis/bin/trellis.js maintain recover --recovery /absolute/original-operation.json --json
node /absolute/private-prefix/node_modules/@mindfoldhq/trellis/bin/trellis.js maintain resume --recovery /absolute/original-operation.json --json
```

Use the actual `recovery_ref` returned by apply. The placeholder operation path is not a value to infer or fabricate. A tools prepare input must use the tools operation kind and input, rather than the archived task-resume input.

### Focused fixture and alternate loader references

- `packages/cli/test/commands/maintenance-tools.integration.test.ts:378-491` provides a focused real-Git target/peer tools installation fixture. It covers preparation, apply, repeated apply of the same operation, recovery, preservation, and actual native tools. It imports source internals, so it does not establish packed public exports or installed dependency resolution.
- `.trellis/tasks/archive/2026-11/11-05-issue-64-legacy-formal-reactivation/evidence/candidate-smoke.mjs` provides a newer installed-bin loader and command logging pattern. Its scope is formal archive reactivation. Do not inherit its filesystem fault injection or broader task conversion scenarios for this targeted tools proof.
- Historical harnesses remain unchanged. Adapt only the necessary loader and normal fixture into a current Task harness owned by the proof owner.

### Artifact bytes, modes, and dependency resolution

An existing verifier compares both tarballs against a prior isolated install:

`.trellis/tasks/archive/2026-10/10-17-issue-47-snapshot-hash-reuse/research/verify_packed_files.py`

It does not build, pack, install, or publish. Its arguments are:

```sh
/usr/bin/python3 .trellis/tasks/archive/2026-10/10-17-issue-47-snapshot-hash-reuse/research/verify_packed_files.py --core-tgz /absolute/core.tgz --cli-tgz /absolute/cli.tgz --prefix /absolute/private-prefix --repo /absolute/source-checkout --source-head FULL_SHA --expected-file-count CURRENT_COUNT --output /absolute/new-bytes-report.json
```

The verifier checks packed manifests, installed bytes/modes, installed file inventory, exact paired dependency, and Core resolution from the CLI consumer. The report output must not exist. Its historical default file count is `1013`; derive the actual current inventory and pass the current count explicitly. Do not reuse that old count as an acceptance requirement. Its source-HEAD check does not capture a dirty source snapshot.

### Candidate identity and original recovery

`packages/cli/src/commands/maintenance/shared.ts:296-347` computes candidate identity from actual package manifests and durable package bytes/modes under `bin`, `src`, and `dist`. Python `__pycache__`, `.pyc`, and `.pyo` files are excluded.

An installed package can omit `src` even when the source checkout contains it. Capture the candidate returned by the **installed public prepare**. Do not substitute the source-tree candidate fingerprint. Tarball checksum, source snapshot, and installed plan candidate identify different parts of the proof.

Recovery validates the executing candidate against the original plan. A different package build returns `candidate_mismatch`, even if the version labels are equal. A newly fixed candidate cannot silently resume an old candidate's historical operation. Prepare/apply/recover/resume proof must use one stable installed pair and one original operation reference. This boundary is explicit in `.trellis/spec/cli/backend/commands-maintain.md:166-177`.

### Available minimum Python runtime

Local interpreter discovery found no `python3.9` command on PATH. `/usr/bin/python3 --version` returned:

```text
Python 3.9.6
```

No interpreter installation is needed. Select this executable consistently for the public maintenance operation:

```sh
export TRELLIS_PYTHON_CMD=/usr/bin/python3
/usr/bin/python3 -B /absolute/target/.trellis/scripts/get_context.py --mode continuation
```

Use the same override for inspect, prepare, apply, recover, resume, and fresh public-bin processes. `TRELLIS_PYTHON_CMD` is the production selection override. `TRELLIS_PROBE_PYTHON`, used by one archived harness, only selects that harness's direct native runner unless the harness also sets the production override.

The Python floor and same-environment requirement are specified in `.trellis/spec/cli/backend/configurator-shared.md:475-530`. Tools recovery/resume rerun native postvalidation even for an already-applied operation. `TRELLIS_SKIP_PYTHON_CHECK=1` does not prove Python 3.9 compatibility.

The repository CI minimum-version compile route uses Python 3.9 and redirects bytecode to a temporary cache (`.github/workflows/ci.yml:49-59`). This researcher did not run compilation. A `-B` native invocation is useful for direct compatibility checks, but must not replace any accepted cold-cache/ordinary-import candidate regression that intentionally permits bytecode creation.

## Files Found

| Path | Purpose |
| --- | --- |
| `packages/core/package.json` | Core version, exports, and build command. |
| `packages/cli/package.json` | CLI version, bin, workspace dependency, and template-copy build. |
| `packages/cli/scripts/release-preflight.js` | Supported exact packed CLI dependency verification. |
| `packages/cli/src/commands/maintenance/api.ts` | Public maintenance SDK functions. |
| `packages/cli/src/commands/maintenance/shared.ts` | Candidate identity and original recovery engine. |
| `packages/cli/test/commands/maintenance-tools.integration.test.ts` | Focused real target/peer tools fixture. |
| `.../10-17-issue-46-legacy-archive-resume/research/verify-packed-candidate.mjs` | Installed loader, tools setup, and separate task-resume proof. |
| `.../10-17-issue-47-snapshot-hash-reuse/research/verify_packed_files.py` | Tarball-to-installed bytes/modes and pair resolution verifier. |
| `.../11-05-issue-64-legacy-formal-reactivation/evidence/candidate-smoke.mjs` | Alternate installed loader and public-bin command logging. |

## External References and Related Specs

No new external documentation was needed for this bounded command and harness lookup. The repository's current public maintenance, configurator, and fixed-version delivery contracts define the procedure. Relevant versions are CLI/Core `0.7.0-castbox.6`, maintenance API `1.0`, and the observed local Python `3.9.6`.

## Caveats / Not Found

- No build, pack, install, benchmark, test, or native context compatibility check was executed during this research. Interpreter version discovery is the only runtime observation recorded here.
- No existing drop-in harness was found that proves the exact current tools-only installed public prepare/apply/recover/resume sequence on the same original tools reference. Existing loaders and focused fixtures provide the necessary reusable pieces.
- The archived tools/task-resume harness inherits the host environment. A current proof must isolate its fixture and session environment and select the intended Python for both maintenance and direct native consumers.
- Do not reuse archived absolute paths, file counts, candidate fingerprints, or recovery references.
- This is targeted maintenance acceptance. It does not establish a release matrix, Windows launcher behavior, Guru installation/adoption, or downstream business acceptance.

## Additional Requested Fixture Lookup

- Query: Locate an existing real-writer schema-2 cross-worktree fixture with a declared runtime. The implementation owner requested locators only.
- Scope: Existing test source; no fixture execution or new implementation.
- Date: 2026-11-13

The closest complete real-writer positive path is `packages/cli/test/scripts/delivery-v2.integration.test.ts:629-639`, named `resolves sibling-worktree selection and preserves Task binding through formal reopen`. Its first portion is sufficient for the cross-worktree query setup:

- `:18-21`: `install()` copies shipped Python scripts and writes the native runtime declaration from `packages/core/test/fixtures/task-v2/native-multi.json`.
- `:63-69`: beforeEach invokes real `task.py create` with `--schema-version 2.0 --no-start` and discovers the created Task path.
- `:83-90`: helpers invoke public `delivery.py apply` for `accept_scope` and `create_delivery`, using declared owner IDs and actual authority file digests.
- `:629-639`: initializes real Git, adds a sibling, installs the declaration there, invokes `task.py start`, prepares a Delivery, selects it, then queries `delivery.py current --json` from the sibling. The later stop/completion/reopen operations are unnecessary for a narrow positive query fixture.

For the actual bundled workflow text and distinct caller/selected continuation, use `packages/cli/test/scripts/delivery-prunable-worktree.integration.test.ts:18-26,74-125`. Its setup creates main/live/stale registered worktrees, installs `workflow-delivery-v1.md`, changes only the invocation checkout's continuation text, creates a real schema-2 Task in the live sibling, and starts it. Reuse the normal setup rather than its subsequent prunable/error cases. Add the existing delivery-v2 accept/create/select sequence only if the target consumer requires a selected Delivery.

`packages/cli/test/templates/delivery-hook-identity.integration.test.ts:270-365` provides a separate positive cross-worktree installed-hook pattern. It selects a linked Task through public `delivery.py select` from the caller and confirms linked context. Its `seedDeliveryContext` helper (`packages/cli/test/templates/delivery-fixture.ts:8-35`) applies Core domain operations and writes the aggregate directly. It is therefore less suitable when proof must include real `task.py create` and public `delivery.py apply` writer provenance.

The existing `cross-worktree-session.test.ts` setup uses a legacy Task and an undeclared synthetic workflow. Do not treat that setup as an executable schema-2 runtime fixture. A declared runtime and a schema-2 Task must match before the context consumer can succeed. This lookup did not run any lifecycle command in the real checkout or any test fixture.
