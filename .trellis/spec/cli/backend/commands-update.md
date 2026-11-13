# `trellis update` Command

`trellis update` reapplies the installed CLI's managed templates to a project
that already records the same version in `.trellis/.version`. A missing or
different installed version is rejected before project data is inspected.
Use `trellis init` for a new project.

## Entry and Plan

The command accepts `--dry-run`, `--force`, `--skip-all`, and
`--create-new`. The CLI collects current Python scripts, configuration,
workflow, AGENTS.md managed block, and templates for configured platforms.
It compares their bytes with `.trellis/.template-hashes.json` to classify
new, unchanged, user-deleted, safely replaceable, and user-modified files.

`.trellis/workflow.md` is a whole-file managed template because its headings
and status markers are parsed by runtime scripts. `AGENTS.md` merges only the
managed block. A workflow selected outside the bundled native template is
user-managed.

## Apply

`--dry-run` prints the plan without writes. For modified managed files,
`--force` overwrites, `--skip-all` preserves, and `--create-new` writes a
neighboring `.new` file. Interactive runs ask the user. User-owned files are
never silently overwritten.

The backup covers only current managed files and receipts; it does not
enumerate arbitrary project children. File writes preserve executable bits
where required. Hash receipts update only for files actually written.
A clean same-version reapply is idempotent.

## Verification

Test fresh initialization, a clean reapply, each conflict choice, managed
block preservation, user-deleted files, rollback after a write failure, and
rejection of a mismatched installed version before project-data reads.
Run the platform registry tests so generated assets remain synchronized.

## Independent maintenance boundary

[Independent maintenance](./commands-maintain.md) adds an explicit tools-only and
selected-task CLI/SDK boundary. It does not relax this document's ordinary
operation, current writer, or complete migration contracts.


## Python operation boundary

Resolve Python before installed-runtime preflight and template collection; use the same selection for comparison, writes and hashes. See [Python selection contract](./configurator-shared.md#scenario-python-selection-across-process-boundaries-issue-53).
