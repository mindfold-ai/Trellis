# Native Delivery Workflow (API 1.0)

This is the fresh no-flag `trellis init` default, using Task schema 2.0 / Delivery
API 1.0. It can also be explicitly selected with `trellis init --workflow native-delivery-v1`
or `trellis workflow --template native-delivery-v1`. Explicit `native` names the
temporary legacy compatibility workflow; implicit reinitialization preserves the
actual installed workflow and its ownership. Existing active legacy Tasks require
reviewed migration; selecting this workflow does not migrate them. Current SDK
`/task` and explicit legacy execution remain isolated compatibility paths.
Their global retirement is future breaking-release work outside #31; native
acceptance requires no downstream adoption or joint evidence.

Read `.trellis/delivery-contract.md` for public types, operations and errors.
The Markdown owners below decide semantic sufficiency. Runtime commands only
validate and record their actual facts. No reader creates or advances work.

[trellis-runtime-contract]
{
  "delivery_api": "1.0",
  "task_schema": "2.0",
  "profiles": ["local_commit", "manual", "pull_request"],
  "owners": {
    "task_scope": "trellis-start",
    "creation": "trellis-start",
    "planning": "trellis-brainstorm",
    "implementation": "trellis-start",
    "check": "trellis-check",
    "full_review": "trellis-review-delivery",
    "readiness": "trellis-review-delivery",
    "publication": "trellis-deliver",
    "delivery": "trellis-deliver",
    "completion": "trellis-complete-task",
    "closure": "trellis-finish-work"
  }
}
[/trellis-runtime-contract]

## Phase Index

| Phase | Owner | Evidence / exit |
| --- | --- | --- |
| Task scope | trellis-start | Root PRD accepted scope; no implementation activation |
| Delivery creation | trellis-start | Stable Delivery UUID before Planning; explicit selected slice/profile |
| Planning | trellis-brainstorm | Per-Delivery PRD/design/implement/manifests; actual accepted planning result |
| Implementation | trellis-start | Exact candidate handed to formal Check |
| Check | trellis-check (delivery_check) | Required checks bound to candidate; pass only enters reviewing |
| Full Review and readiness | trellis-review-delivery | Independent complete-range review; separate slice readiness result |
| Publication and delivery | trellis-deliver | Actual profile outcome; local commit, accepted artifact or merged PR |
| Task Completion | trellis-complete-task | Whole accepted scope and causal evidence independently accepted |
| Closure/archive/cleanup | trellis-finish-work | Consume Completion; source disposition separate from archive and cleanup |

[trellis-continuation]
1. Read the exact session Task and `python3 .trellis/scripts/delivery.py current --json`.
   Stop on resolver, API, schema, workflow-owner or stale-selection errors. Inventory
   is display-only. Never select its sole item or create a replacement during resume.
2. `no_current_task` returns to task-free work or the explicit Task scope owner.
   `no_current_delivery` is legal: trellis-start decides scope work or an explicitly
   accepted first/next slice; trellis-complete-task decides whole-scope acceptance,
   missing evidence refresh or validation-only reopen. Creating a Delivery needs a
   real slice; missing output or evidence alone is not a new slice.
3. `terminal_delivery` returns to its original owner to release the exact selection.
   Preserve Task binding for Completion. Do not replace selection automatically.
4. `current` routes by public phase: planning -> trellis-brainstorm;
   implementing -> trellis-start; checking -> trellis-check delivery_check;
   reviewing -> trellis-review-delivery; publishing -> trellis-deliver.
   Owner roles and IDs must match this active declaration. A custom workflow's
   declaration and continuation replace these native semantics.
5. Validate applicability separately from phase. Missing Check/Review output returns
   to the original producer. Changed scope, plan, candidate, base or obligations
   require that owner's judgment; return the same undelivered Delivery to the
   earliest affected same/earlier owner through qualified rework. Equivalent or
   unrelated changes may preserve results after the original owner's actual review.
   A clean commit after base integration needs fresh applicable gates, no empty
   or evidence-only commit. Commit facts do not prove Check/Review/readiness.
6. Findings return to the affected owner. Whole withdrawal/supersession records
   stopped with scope decision and current-stage owner; partial revision is same
   Delivery rework. Preserve existing commits, PR facts and identity.
7. Lost remote-success output returns to trellis-deliver to read live success and
   normalize the same producer result; historical_success records only actual
   historical facts and never manufactures current gate approval. Do not repeat
   push, PR, merge or other successful external mutation to recover stdout.
8. Whole Task acceptance belongs only to trellis-complete-task. All known slices
   delivered still may leave unallocated scope/evidence. Formal reopen preserves
   history and increments generation; historical gates/closure cannot authorize
   new execution. Fresh Completion can judge still-applicable historical outcomes
   without requiring a new Delivery. Source closure, archive and cleanup remain
   separate actions and cannot manufacture or revoke Completion.
[/trellis-continuation]

## Task scope and Delivery creation

Fresh initialization with this exact bundled workflow creates the known
guideline bootstrap Task, its accepted onboarding scope, and one `manual`
Delivery in planning. It records no Planning or later gate success. A custom
schema-2 workflow receives only a bootstrap Task with no accepted scope or
Delivery; its declared owners must judge scope and create the appropriate
Delivery/profile before Planning. Supported profiles alone do not authorize
bootstrap scope acceptance or profile selection.

The main session acting as trellis-start reads current source, package specs and
Task root `prd.md`, then obtains acceptance of overall scope. Create a Task with
`task.py create --schema-version 2.0`; this creates no implicit Delivery.
`task.py start` binds the Task only. Record accepted authority with `accept_scope`.
Choose one independently deliverable slice and supported profile. Allocate a
stable opaque UUID before Planning, record `create_delivery`, and explicitly
`delivery.py select --task <ref> --delivery <id>`. Task and Delivery IDs remain
stable through rework, commits, PR updates and integration. D2 gets a new ID.

## Planning

trellis-brainstorm reads source authority and writes to
`<task>/deliveries/<id>/`: `prd.md`, `design.md`, `implement.md`, manifests and
research. Root Task PRD remains whole-scope authority. Read real referenced specs;
review current artifacts and acceptance before recording `record_gate` for
planning. Only that actual acceptance enters implementing. Binding/start is not
acceptance. Plan revision returns the same undelivered Delivery to Planning.

## Implementation and Check

The main session calls trellis-before-dev and dispatches trellis-implement where
the host supports it, or executes inline with the same context. Dispatched agents
implement directly and do not recursively dispatch. Read Delivery manifests then
PRD/design/implement; Task root PRD supplies overall scope. Preserve other work.
When candidate is ready, record `begin_check` through the implementation owner.

trellis-check defaults to `quality`: ordinary lint/type/test/spec verification,
no lifecycle mutation. Explicit `delivery_check` reads current candidate and
obligations, runs required checks and records the real formal result only after
mechanical fixes are handed back to implementation for a fresh candidate. Pass
enters reviewing. Failure/findings return to the correct owner; blocked checks
are not passes. Neither quality checks nor a checker report proves full Review.

## Full Review and readiness

trellis-review-delivery requests an independent read-only `delivery_review`
carrier with the complete intended candidate/range, current Check and Delivery
planning. It assesses all accepted slice requirements, tests, safety, consistency
and remaining Task work; newest-commit-only review is insufficient. The carrier
reports findings with precise locations and never self-fixes or records lifecycle.
The formal full_review owner records actual passed review. Findings require rework.
Then independently assess slice sufficiency, applicable profile, publication
payload/target obligations, approvals and remaining work before recording readiness.
Full Review and readiness are separate results even though one Skill owns both.

## Publication and delivery profiles

trellis-deliver rechecks exact candidate/applicability and actual authorization.
Real dirty code follows the exact scoped commit owner; no empty commit is required.
Runtime projection itself does not push, publish, merge, close an Issue or authorize
those actions. Apply structured operations through
`delivery.py apply --task <ref> --input <JSON-file>`; use stable producer result IDs
for identical retries and stop on conflicting IDs or changed preimages.

| Profile | Actual delivery condition |
| --- | --- |
| local_commit | Applicable planning/Check/full Review/readiness plus exact local commit containing reviewed content; no PR required |
| manual | Same gates plus accepted retained/exported artifact with immutable locator/content identity; supports Git-free projects |
| pull_request | Same gates plus actual PR publication and live merged PR with exact reviewed head, merge and target facts under repository-supported policy |

Store actual publication separately; a ready PR is not delivered. Guru policy,
trailers and private transaction stages are not imposed on native profiles.
Task-free/manual Git/GitHub operations remain outside formal lifecycle results.

## Task Completion and closeout

trellis-complete-task reads current root accepted scope, every generation's
applicable delivery outcomes, stopped scope decisions, unallocated work and
verification evidence. Report remaining work, evidence pending, scope revision,
implementation revision or blocked to the corresponding owner. Only actual whole
scope acceptance records complete_task. Evidence refresh can require no Delivery.

trellis-finish-work consumes that exact Completion result. Default source
disposition is no_mutation; Issue closure requires explicit separate authorization
and actual outcome. Record close_task, then archive only the explicitly selected
completed Task. Archive cannot create Completion. Cleanup is separately scoped;
failure preserves Completion. Never infer ownership of other tasks/resources.

[workflow-state:no_task]
Load the active workflow continuation and exact task query. Task creation is explicit.
[/workflow-state:no_task]
[workflow-state:no_current_delivery]
Load the sole continuation for scope, next slice, Completion or evidence refresh.
[/workflow-state:no_current_delivery]
[workflow-state:task_error]
Stop on the concrete resolver/API/schema/owner diagnostic; do not infer another task.
[/workflow-state:task_error]
[workflow-state:planning]
Load the sole continuation; current Delivery planning artifacts require actual acceptance.
[/workflow-state:planning]
[workflow-state:implementing]
Load the sole continuation; use the current Delivery implementation owner.
[/workflow-state:implementing]
[workflow-state:checking]
Load the sole continuation; formal Check is distinct from quality verification.
[/workflow-state:checking]
[workflow-state:reviewing]
Load the sole continuation; full Review and readiness are independent results.
[/workflow-state:reviewing]
[workflow-state:publishing]
Load the sole continuation; recover actual publication/delivery through its producer.
[/workflow-state:publishing]
[workflow-state:delivered]
Load the sole continuation; release selection and assess whole Task Completion.
[/workflow-state:delivered]
[workflow-state:stopped]
Load the sole continuation; preserve stopped facts and assess revised Task scope.
[/workflow-state:stopped]
