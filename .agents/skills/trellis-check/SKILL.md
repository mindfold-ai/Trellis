---
name: trellis-check
description: "Comprehensive quality verification: spec compliance, lint, type-check, tests, cross-layer data flow, code reuse, and consistency checks. Use when code is written and needs quality verification, before committing changes, or to catch context drift during long sessions."
---

# Code Quality Check

## Active workflow ownership

Before formal work, load the validated Task workspace workflow with:

```bash
python3 .trellis/scripts/get_context.py --mode runtime-contract
python3 .trellis/scripts/get_context.py --mode continuation
```

A declared Delivery contract owns all formal routing. Default quality and
evidence refresh do not enter that routing or record lifecycle results; they
may use the verified exact Task's accepted scope and explicitly supplied code
or evidence even when no Delivery is selected. Stop on malformed or
unsupported contracts. For formal delivery_check/delivery_review, if the role
owner differs from this Skill, hand off to
that declared owner and stop; do not run a parallel native gate. Read
`.trellis/delivery-contract.md` and the exact current Delivery query before
recording results. Retain legacy behavior only for verified legacy Tasks or
Task-free work under an undeclared legacy workflow. A selected schema-2 Task
with `missing_runtime_contract` is an incompatible runtime and stops; do not
fall back to root planning. Task-free work creates no formal lifecycle result.


Comprehensive quality verification for recently written code. Combines spec compliance, cross-layer safety, and pre-commit checks.

---

## Profiles

Default `quality` runs the checks below and never records or advances lifecycle.
With schema-2 noDelivery, use TaskKey/accepted scope and the caller's explicit
quality/evidence scope. Load relevant specs; do not load root design/implement
or manifests as replacement Delivery planning, guess a Delivery, or create
Planning/Check/Review/readiness/Completion results. A task-scope-only injected
context supplies no formal Delivery authority. Binding/error/stale failures do
not downgrade to quality with another Task.
Explicit `delivery_check` follows the active workflow check owner and obligations,
then records only the actual formal Check result bound to the exact candidate.
Mechanical fixes require implementation to refresh its candidate and hand back
to Check; a dirty self-fix cannot pass the old candidate. A pass enters reviewing,
not readiness or delivery. `delivery_review` is an independent read-only carrier:
review the complete intended range with current planning and Check, report
findings only, do not self-fix, record gates or dispatch implementation.
Both formal profiles require an exact DeliveryKey/generation, current candidate,
validated PlanningRoot and applicable owner inputs from the actual dispatch or
current exact query. Missing/stale selection fails closed. An unspecified hook
envelope, including Codex SubagentStart without a prompt, cannot assert a formal
profile; the carrier must enforce the actual dispatch profile itself.

## Step 1: Identify What Changed

```bash
git diff --name-only HEAD
git status
```

## Step 2: Read Task Artifacts and Applicable Specs

For legacy quality, read the current task artifacts below. For schema-2 quality,
read accepted Task scope and explicit quality/evidence inputs; selected Delivery
artifacts are optional quality context. For either formal profile, read the
selected Delivery's artifacts and manifests, plus accepted whole Task scope:

- `prd.md`
- `design.md` if present
- `implement.md` if present

```bash
python3 ./.trellis/scripts/get_context.py --mode packages
```

For each changed package/layer, read the spec index and follow its **Quality Check** section:

```bash
cat .trellis/spec/<package>/<layer>/index.md
```

Read the specific guideline files referenced — the index is a pointer, not the goal.

## Step 3: Run Project Checks

Run the project's lint, type-check, and test commands. Fix any failures before proceeding.

## Step 4: Review Against Checklist

### Code Quality

- [ ] Linter passes?
- [ ] Type checker passes (if applicable)?
- [ ] Tests pass?
- [ ] No debug logging left in?
- [ ] No suppressed warnings or type-safety bypasses?

### Test Coverage

- [ ] New function → unit test added?
- [ ] Bug fix → regression test added?
- [ ] Changed behavior → existing tests updated?

### Spec Sync

- [ ] Does `.trellis/spec/` need updates? (new patterns, conventions, lessons learned)

> "If I fixed a bug or discovered something non-obvious, should I document it so future me won't hit the same issue?" → If YES, update the relevant spec doc.

### Scope Discipline

- [ ] Any tidying of code the task did not require?
- [ ] Any abstraction, config or extension point added for a case that does not exist yet?
- [ ] Any speculative fallback for a state that cannot occur?
- [ ] Any file changed that the acceptance criteria do not mention?
- [ ] Any workaround added at the caller instead of a fix where the behavior actually lives?

## Step 5: Cross-Layer Dimensions (if applicable)

Skip this step if your change is confined to a single layer.

### A. Data Flow (changes touch 3+ layers)

- [ ] Read flow traces correctly: Storage → Service → API → UI
- [ ] Write flow traces correctly: UI → API → Service → Storage
- [ ] Types/schemas correctly passed between layers?
- [ ] Errors properly propagated to caller?

### B. Code Reuse (modifying constants, creating utilities)

- [ ] Searched for existing similar code before creating new?
  ```bash
  grep -r "pattern" src/
  ```
- [ ] If the same value repeats, does it represent one stable concept whose callers must change together? Extract only then — two literals that merely happen to match today should stay separate.
- [ ] After batch modification, all occurrences updated?

### C. Import/Dependency (creating new files)

- [ ] Correct import paths (relative vs absolute)?
- [ ] No circular dependencies?

### D. Same-Layer Consistency

- [ ] Other places using the same concept are consistent?

---

## Step 6: Report and Fix

Report every violation you find. Then:

- Mechanical and local (lint nit, missing type, wrong import, dead branch, failing assertion) → fix in place, then re-run project checks.
- Design or judgment (naming a shared concept, moving a module boundary, changing a public interface, reassigning where behavior lives) → record the evidence and your recommendation, and stop. Do not rewrite it silently.

If a fix would touch files outside the current task's scope, say so and stop instead of widening the change.
