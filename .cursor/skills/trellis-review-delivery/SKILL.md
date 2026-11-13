---
name: trellis-review-delivery
description: "Independent complete-range Delivery review and separate readiness, routed to the active workflow owner. Use for formal Delivery Review after applicable Check."
---

# Review Delivery

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

## Native full Review

Require owner full_review = trellis-review-delivery and a current Delivery in
reviewing with applicable formal Check. Read the complete intended candidate
and full range, per-Delivery planning/manifests, accepted Task scope and required
evidence. Dispatch an independent existing checker with `Profile: delivery_review`
and exact DeliveryKey, planning_root, candidate/range and read-only instruction;
on inline-only hosts obtain an independent review carrier before declaring pass.
Carrier reports findings and performs no fixes or lifecycle writes. Unavailable
independence is blocked, not passed. Newest-commit-only review is insufficient.

Assess returned findings and scope. Findings route the same Delivery to the
earliest affected owner with rework reason/affected_results. Only real pass may
record record_gate(full_review) through delivery.py apply --task <ref> --input
<JSON-file>, using API 1.0, exact key/phase and stable producer result_id.

## Native readiness

Separately assess applicable full Review, current slice sufficiency, supported
profile, target/payload obligations, approvals and remaining Task work. Record
record_gate(readiness) only when ready. Its predecessor is the current full
Review result; pass advances to publishing. Do not push, merge, complete a Task
or manufacture another owner's gate. Lost outputs return to their producer.
