# Issue #25: reference-only task creation

## Goal

Official task.py create accepts a reference_only Issue source without altering source relation or downstream closure authority. Authority: https://github.com/castbox/Trellis/issues/25.

## Requirements

- Accept exact_source and reference_only for Issue creation; retain no_issue default and existing source validation.
- Preserve source, stable TaskId and generation through normal read, session start, rename and archive.
- Retain creation scaffold, base branch, context, hooks and no-start behavior; reject invalid source and duplicate identities without partial tasks.
- Align help, workflow guidance, dogfood and shipped templates; generate dist through the normal build.
- reference_only never implies complete delivery or Issue closure. No new GitHub action.
- Do not add follow_up/parent creation support, old-record migration, alternate writers or changes to Guru ownership.

## Acceptance Criteria

- [x] Full official CLI reproduction creates a planning task with generation 0 and exact reference_only source.
- [x] Normal lifecycle and session operations preserve source and identity.
- [x] exact_source/no_issue and common invalid-source/identity regressions pass.
- [x] Template parity, lint, typecheck, Python checks, build and applicable integration/regression tests pass.
- [x] A clean installed project uses the generated creator successfully.

## Boundary

This upstream delivery is a prerequisite for Guru #489, not its release completion. Guru schema and source-pin/environment continuation remain downstream work.
