# Guru #577 public capability handoff

## Candidate and ownership

Use the final PR source SHA and package identity recorded in `acceptance.md`,
`package-identity.json` and `packed-install-verification.json`. The package labels
remain 0.7.0-castbox.4; this is an unreleased source candidate, not the previously
published package with the same label. Version equality alone is insufficient.
Build/install both packages from this source. No global CLI, business repository,
private Guru owner or actual CMS Task was modified by this delivery.

## Reproduce the matching installable pair

From the exact source checkout, initialize its pinned submodules and run:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @mindfoldhq/trellis-core pack --pack-destination /absolute/candidate
pnpm --filter @mindfoldhq/trellis pack --pack-destination /absolute/candidate
npm install --prefix /absolute/private-prefix --ignore-scripts --no-audit --no-fund /absolute/candidate/mindfoldhq-trellis-core-0.7.0-castbox.4.tgz /absolute/candidate/mindfoldhq-trellis-0.7.0-castbox.4.tgz
node /absolute/private-prefix/node_modules/@mindfoldhq/trellis/bin/trellis.js maintain contract --json
```

Confirm `operation_kinds` includes `task_resume`, `archive_resume` says legacy and
schema1 / generation preserve / read-only archive, and both packages resolve to
this actual pair. Record source/build/API identities. Use the existing independent
tools installation owner if the target runtime requires cutover; do not copy its
algorithm or edit a version declaration to bypass compatibility.

## Public protocol

1. AI reviews selected archive, real delivery facts, manual archive explanation,
   current requested work, exact original active path, bindings and unfinished
   private responsibilities. Pending private Closure/Finish returns to that owner.
2. Public `inspect-task` accepts the archive and optional explicit
   `--original-task-ref` for attributable old path carriers. It does not require
   target dispatcher, current binding, Identity or Continuation to succeed first.
3. Submit `{kind:"task_resume",input:ArchivedTaskResumeInput}` or call
   `maintenance.prepareArchivedTaskResume`. The closed input is documented in
   `.trellis/spec/cli/backend/commands-maintain.md`; it adds `active_ref`, required
   `original_task_ref`, `resume_intent` and exact session dispositions to selected
   conversion. Do not infer former path from archive directory basename.
4. Review frozen write set, apply with external/ignored recovery state, and keep
   returned original recovery ref. `result.resumed_task` supplies actual TaskKey
   and active ref; generation does not advance. Original archive stays readable.
5. Lost output/ordinary partial state uses recover/resume of that operation, not
   another prepare/import. Rollback uses original write set and refuses later
   scope, files, identities or new sessions. Tools rollback retains compatibility
   checks and is a separate operation.
6. Invoke the target checkout's own native identity/continuation with actual
   session or supported explicit-task route, then the real next Guru owner. That
   owner decides current scope, required evidence and subsequent planning. Restore
   itself supplies no gate, Completion/Closure/Finish or new/empty Delivery.

## Evidence split

Public repository tests cover same-identity restoration, real native routing,
actual next public consumer, historical delivered outcomes, noDelivery scope
review, exact writes/retry/partial recovery and later-work-safe rollback. One
representative old installation is verified from the actual packed pair.

Guru #577 still owns its Markdown/Skill integration, private original-owner
maintenance and joint next-owner acceptance. Those results are not claimed by
this candidate, a mock or public Core DTO. Full multiplatform release matrix and
real CMS restoration remain outside this Issue.
