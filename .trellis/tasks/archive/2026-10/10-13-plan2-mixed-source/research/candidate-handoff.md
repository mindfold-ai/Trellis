# Local offline candidate handoff (not delivered)

This is an independent upstream Task. Issue #31 remains closed. No downstream
#531 Check, joint acceptance, real migration or business completion is required
or claimed. This document prepares artifact facts locally; it is not an outbound
message, installation approval or publication.

## Artifact identity

Product commit: **not yet created**. Source is main at
`fdb88e8e220b42df0f0b78f8b939e072d36b9be1` plus the reviewed four-file diff,
SHA256 `dd98725f2a3d6e4d3d888d5ca21e8dc1ae9da69a1dc4f6d132255348fa42f2e0`.
Complete source manifest digest (excluding Task evidence):
`2dd21f6287f0b4ee5d3ed7e8734feeaacdf2df5ca07106a0e261e46b4d3aac68`.
These are uncommitted local candidate facts, not a published public API.

| Input | Absolute path | SHA256 |
| --- | --- | --- |
| New CLI | `/tmp/plan2-mixed-source-candidate-9981ff40b934/packs/mindfoldhq-trellis-0.7.0-castbox.3.tgz` | `5aeeb81ca72508081b7dd94ddb7a19f69444714f78b3a38858d908196cc77916` |
| Fixed Core | `/tmp/plan2-worktree-copies-candidate-q9h3iZ/packs/mindfoldhq-trellis-core-0.7.0-castbox.3.tgz` | `45bbfee507ed4964649610f703a90ba01c5f5cea21fb95d0845f92ed45302967` |

The Core input is unchanged from fixed source
`1e40014023de53ddfd9368b3fb4d0a7a31e92293`. New CLI dependencies lock Core to
exact `0.7.0-castbox.3`. All 713 CLI and 270 Core installed package files match
their respective tar bytes and modes, with no extra files. Source manifests
before build and after pack are identical. See the candidate root's
`package-install-manifest.json` and `build-install-commands.json`.

## Contract and adoption

Plan schema remains `2.0`, Task schema `2.0`, Delivery API `1.0`; command flags,
Core projection and Python/runtime contracts are unchanged. The added explicit
contract is `source.task_schema: "mixed"` with row
`source_task_schema: "legacy"|"1.0"` required for mixed conversions and defer.
Selectors are forbidden on current/history-only and all homogeneous rows.
Both conversion and defer validate frozen original snapshots strictly with the
declared public validator. Existing full inventory, authority, preservation,
resume and third-state safeguards still apply.

The package version is intentionally unchanged for this controlled offline
artifact. Older same-version CLIs do not support the new fields. Bind the exact
tar hashes, never version alone; do not publish a same-version npm replacement.
After independently authorizing a fresh isolated installation, install both
exact tar inputs together using `npm install --prefix <fresh-install> --cache
<owned-cache> --ignore-scripts --no-audit --no-fund <new-cli-tar> <fixed-core-tar>`.
Verify installed files and use `<fresh-install>/node_modules/@mindfoldhq/trellis/bin/trellis.js`.

Construct the complete owner-reviewed plan from the actual installation version
and original raw Task/artifact/workflow/template/session/binding inventories.
Use `node <installed-bin> migrate --from <actual-source-version> --plan
<reviewed-complete-plan> --dry-run`, retain the unchanged-tree proof and back up
the exact preview write set before authorized execution. Do not adopt another
fixture's Task projection, history, bindings, gates or complete plan.

## Evidence and remaining boundaries

Source checks and source independent review pass. All five packed synthetic
variants passed in final attempt5; see `candidate-validation-results.md` and
`candidate-evidence.json`. They cover full28/3 schema1/legacy/archive conversion,
both sibling plan orders, fault-after-schema2 recovery, plain public-bin replay,
exact raw preservation, source/target/binding byte/mode third states and exact
rollback. Ten installed Python3.9 routes and eight strict deferred-source
rejections ran. Final independent complete-candidate audit passes; see candidate-quality-review.md.
Read-only whole-Git proof uses explicit `GIT_OPTIONAL_LOCKS=0` and
`PYTHONDONTWRITEBYTECODE=1`; ordinary Git may refresh index caches outside this
isolation. Prior failed harness attempts are retained and disclosed. Local Node is
v26.9.0; minimum Python is actual `/usr/bin/python3` 3.9.6. This is not Node20
CI, business or release proof.

Real sample classification is separate from full-plan preview, isolated
execution and business recovery. No real sample full Plan2 preview/execution,
business install switch or #406 completion is claimed. Product commit,
publication, release, real rehearsal and outbound handoff retain their separate
authorization boundaries.
