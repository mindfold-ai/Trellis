# Deliver Selected Slice

## Active workflow ownership

Before formal work, load the validated Task workspace workflow with:

```bash
python3 .trellis/scripts/get_context.py --mode runtime-contract
python3 .trellis/scripts/get_context.py --mode continuation
```

A declared Delivery contract owns all formal routing. Stop on malformed or
unsupported contracts. If the role owner differs from this Skill, hand off to
that declared owner and stop; do not run a parallel native gate. Read
`.trellis/delivery-contract.md` and the exact selected or explicitly referenced
historical Delivery query for the chosen route before recording results. An
absent current selection does not erase an exact retained historical identity.
On `missing_runtime_contract`, this formal entry is unavailable: stop and return
to the active legacy workflow. Do not invent a native owner. Task-free work
creates no formal lifecycle result.

Require the active publication/delivery owner for the requested operation to be
trellis-deliver. Distinguish two routes before acting:

- Normal forward publication/delivery requires the exact current Delivery in
  publishing, its current scope/plan/candidate and applicable Planning, Check,
  full Review and readiness. Phase alone proves none of them. Rework changes
  through affected owners. Read actual authorization before external operations.
- Original-producer recovery starts from actual already-successful facts. Read
  the exact Task/Delivery/generation and the original producer's retained
  candidate/result identity, then verify the real local artifact/commit or live
  PR/publication/merge facts. A missing current selection, publishing phase or
  applicable gate is not grounds to repeat a successful external action or to
  manufacture a new gate. Use an explicit exact historical reference and the
  public runtime's historical_success recovery contract. Unknown identity,
  changed retained result content, conflicting facts or a different producer
  stops recovery. Never infer the historical Delivery from inventory.

Recovery verification is read-only; recording the same observed success is the
only projection write. Recover publication and delivery separately under their
actual declared owners. Recovery does not authorize new publication, delivery,
commit, push, PR creation or merge, and does not create current approvals.

- local_commit: verify actual exact local commit contains reviewed content. Dirty
  work follows the scoped commit owner; clean committed work needs no empty commit.
- manual: verify accepted retained/exported artifact with immutable locator and
  content identity; supports Git-free delivery and requires no synthetic Git facts.
- pull_request: authorized publication records actual PR facts separately;
  delivery requires live merged PR, reviewed head, merge and target facts under
  the chosen repository-supported policy. Ready PR alone is not delivery.

Normalize actual facts with stable producer result IDs and delivery.py apply
--task <ref> --input <JSON-file> record_publication / record_delivery. Projection
performs no remote action. Recover lost remote-success stdout by reading actual
success and recording the same result; never repeat successful push/PR/merge.
Historical_success preserves observed historical outcome even after gate drift,
without creating current approvals. Conflict/stale input stops, not overwrites.
Release the exact terminal selection through delivery.py release, preserve Task
binding, and return to the declared Completion owner. Delivery is not Task complete.
Task-free manual Git/GitHub work does not create formal lifecycle results.
