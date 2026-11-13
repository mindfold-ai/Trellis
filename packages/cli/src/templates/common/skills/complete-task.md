# Complete Whole Task

## Active workflow ownership

Before formal work, load the validated Task workspace workflow with:

```bash
python3 .trellis/scripts/get_context.py --mode runtime-contract
python3 .trellis/scripts/get_context.py --mode continuation
```

A declared Delivery contract owns all formal routing. Stop on malformed or
unsupported contracts. If the role owner differs from this Skill, hand off to
that declared owner and stop; do not run a parallel native gate. Read
`.trellis/delivery-contract.md` and the exact current Delivery query before
recording results. On `missing_runtime_contract`, this formal entry is unavailable: stop and return
to the active legacy workflow. Do not invent a native owner. Task-free work
creates no formal lifecycle result.

Require active completion owner = trellis-complete-task. Read root accepted
Task scope, source authority, current generation, all applicable historical
Delivery outcomes, stopped scope decisions, remaining/unallocated requirements
and their actual verification evidence. Do not infer completeness because every
known Delivery is delivered or because commits, PRs or archives exist.

Independently assess whole scope. Remaining work returns to scope/creation;
requirements revision returns to task_scope; implementation revision returns to
its affected Delivery owner. Missing evidence returns to its original producer
for refresh and may need no new Delivery. Blocked evidence never passes. Keep
concrete reasons and locators for each acceptance or return.

Only actual whole-scope acceptance records complete_task via delivery.py apply
--task <ref> --input <JSON-file> with current accepted_scope/generation and the
exact applicable delivery_result_ids. Keep the minimum recoverable completion
result; runtime does not decide semantic sufficiency. Fresh Completion after
formal reopen can accept still-applicable historical outcomes without a new
Delivery. Old generation gates/closure never authorize new execution.

Return to declared closure owner. Source disposition defaults no_mutation;
Issue closure, archive and cleanup remain separate operations with their own
actual authorization/outcomes. Completion never authorizes release publication.
