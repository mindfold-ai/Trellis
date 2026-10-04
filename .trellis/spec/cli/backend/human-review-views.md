# Human review views

The shared `trellis-eli5-review` bundled skill owns human-facing task summaries.
`common/skills/brainstorm.md` calls plan mode at final review;
`common/commands/finish-work.md` calls finish mode after the dirty-code check
and before archive. Copilot's retained prompt sources carry equivalent routing.

The existing bundled-skill collector distributes the complete skill directory
through platform init/update template maps. The Python script is an explicitly
invoked review renderer, not a lifecycle hook or worker context provider.

The agent synthesizes structured input from evidence. The standard-library
renderer validates the documented fields, escapes content, restricts evidence
links to HTTPS or existing task-contained files, and atomically replaces only
the selected mode's HTML. Validation failure preserves previous output.
It does not determine whether a claim is true or whether approval occurred.

The reviewed plan JSON/HTML is preserved during finish. Missing historical
plan evidence produces a visible limitation. Reports live inside the task and
travel through the existing archive operation without changing task schema or
status transitions. Do not add report files to implement/check manifests.

Verification: `test/scripts/eli5-review.integration.test.ts` runs rendered
platform outputs, checks escape/link/write boundaries, preserves plan/evidence,
and exercises the actual archive command. `docs/examples/eli5-review` contains
redacted reconstructed project examples for visual review, not live acceptance.
