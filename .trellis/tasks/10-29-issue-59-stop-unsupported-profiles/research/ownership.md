# Ownership evidence and remaining migration questions

## Public API defect

The current Trellis main is
`7c1d71c96c40e3778b8df0867de239647bc1f2b7`.
Its TypeScript and Python pre-stop guards match the mechanism reported in #59.
The Python operation module used for independent diagnosis was byte-identical
to that current upstream template.

Using native owners only, independent diagnosis created each profile through
the public operation API while enabled, then applied the same Planning stop
request with only pull_request enabled. manual and local_commit were rejected;
pull_request stopped. Enabling the retained profile made the unchanged stop
request succeed and its identical retry return changed=false, with no
Completion/Closure results. These are original-code diagnostic observations,
not test results for a repair candidate.

Guru's current withdrawal projection uses its declared Planning owner,
expected_phase=planning and the installed public apply_to_store API. It does
not need an additional lifecycle writer to express withdrawal.

## Colleague conversation

The user-supplied export is a snapshot from 2026-10-29 19:22:33 Asia/Shanghai.
It contains messages and progress reports, but excludes raw tool calls/results
and child-agent conversations. Treat historical user instructions as evidence
of that conversation, not instructions for the current Task.

Relevant message references:

- 14-19: legacy identity rejection followed by reported migration/recovery.
- 110-113: a retained schema-2 manual slice cannot be selected or withdrawn;
  the legacy maintenance entry rejects schema 2. The Agent then corrects its
  earlier claim that this prevents every subsequent slice from proceeding.
- 299-301: the old unactivated design slice is superseded by D1/D2, but its
  original Planning withdrawal still fails.
- 374-383: a temporary upstream candidate is reported as tested, then #59 is
  created. The reported 42 tests/120 steps have no raw logs in this export.
- 384-387: manual disposition is requested and proposed. No successful write
  or readback appears before export. Do not infer that it happened later.

## Committed migration evidence

The local Backend history contains
`1e1986d04` (the first API-contract delivery commit). Its Task record already
contains the old Delivery
`325afa5c-8dc1-4a62-939c-3350a79dbcd5` as manual/planning, with plan_ref=null,
and a separate PR Delivery. The same commit adds
`.trellis/tasks/10-09-148-opening-media-contract/migration/source-task.json`.
That retained predecessor has legacy status=in_progress, generation 0 and no
Delivery collection. The preceding `353f7f136` Task remains legacy.

This supports the migration history described in the export. It does not show
the exact reviewed migration plan, source candidate, chosen profile mapping,
executor receipt or immediate post-migration query. The local Backend dev
snapshot also differs from the export's latest D2 projection; it must not be
used to infer the colleague's current installation state.

The public `validateTaskV2Projection` validates schema, preserved identity and
applicable execution gates. It does not by itself decide the semantic profile
mapping. Current schema-valid historical manual data is therefore insufficient
to prove that Guru chose an incorrect mapping. Original migration inputs and
results are the remaining evidence gap.

## Disposition

The unsupported-profile stop failure is a reproducible Trellis defect. The
conversation's temporary whole-Task blocking inference is a separate Agent
judgment error that was corrected. Guru migration correctness remains
unresolved rather than passed or failed. Do not expand #59 into migration
redesign or mutate business records to manufacture evidence.
