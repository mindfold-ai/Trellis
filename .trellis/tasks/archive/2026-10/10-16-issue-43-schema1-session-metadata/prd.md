# Issue #43: Native schema-1 session maintenance compatibility

## Goal

Allow users to inspect and prepare maintenance for a supported predecessor Task when shared session storage contains records produced by the original native schema-1 writer, without manually editing or deleting sessions.

## Source and confirmed background

- Exact requirement source: https://github.com/castbox/Trellis/issues/43 (read 2026-10-16; no comments).
- Remote baseline: `upstream/main` at `138961cbcac8367d15abe3d9d2f06101fa921cf6`. Current planning checkout is `dde5f90903e9299236e3574d4dfab6441daec09d`; it predates the maintenance implementation. Research uses the remote baseline, not absent local files.
- Historical native writer evidence: `43fffc170927c85d9f7fc106cc5a059e80d4530b:packages/cli/src/templates/trellis/scripts/common/active_task.py:677-724`. It writes metadata followed by schema-1 identity/path fields and `current_run: null`.
- The baseline Core classifier requires exactly four fields for schema-1 (`packages/core/src/task/maintenance.ts:80-85`). CLI `inspectBindings` classifies each session before filtering its ownership (`packages/cli/src/commands/maintenance/bindings.ts:104-115`). Thus a supported old record can prevent inspection even when it belongs to another Task.

## Requirements

- R1: Recognize the original schema-1 writer format, including its known metadata and optional nonempty session/conversation/transcript string aliases. Retain support for the existing four-field schema-1 shape and other already supported carriers. Unknown fields and malformed metadata remain unsupported.
- R2: Attribute supported path carriers using their original workspace, current Task locator and repository common directory. Only selected carriers enter the selected Task's dispositions or retirements; metadata confers no current lifecycle authority.
- R3: Exercise conversion and historical closeout through existing public maintenance APIs. Selected sessions follow the fixed prepared plan; unselected Task/session bytes and modes remain unchanged. Preserve existing same-operation recovery and rollback behavior.
- R4: Add Core regression coverage derived from actual old writer output and CLI integration coverage using real Git/shared session storage. Retain metadata in fixtures rather than stripping it to fit the old parser.
- R5: Report exact matching CLI/Core source/build identity and validation commands/results for Guru #575 adoption. Upstream validation does not establish downstream installation, conversion, native continuation or release acceptance.

## Acceptance matrix

| ID | Scenario | Observable acceptance |
| --- | --- | --- |
| A1 | Selected schema-1 record with writer metadata | Core returns `path1 / matches=true`; inspect and prepare succeed without source mutation. |
| A2 | Writer's optional aliases and existing minimal schema-1 | Recognized without weakening the closed field set or changing other carrier kinds. |
| A3 | Supported other Task/workspace/common-dir record | Ownership does not match; no selected action/retirement; bytes/modes survive apply, recover and rollback. |
| A4 | Conversion in real Git/shared storage | Fixed selected replacement/preservation occurs; original snapshots are retained; same-operation recovery and rollback honor original preimages. |
| A5 | Historical closeout in real Git/shared storage | Raw Task history is archived before selected retirement; unselected state is preserved; recovery and rollback retain existing semantics. |
| A6 | Unknown field or invalid known metadata | Existing typed unsupported-carrier failure remains; no arbitrary format acceptance. |
| A7 | Candidate evidence | Matching pair source SHA, versions, build commands and scoped results are recorded; limitations and Guru-owned gates remain explicit. |

## Out of scope

No new session model, current-writer relaxation, permanent dual authority, public conversion algorithm copy into Guru, global package changes, real business migration, session/worktree cleanup, attack/concurrency/crash hardening, package release or Issue #40 reacceptance. Do not bypass Guru's canonical committed-and-clean `source_locked` prerequisite. No unresolved product or acceptance decision remains within the Issue's stated scope.
