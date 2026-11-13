# Independent upstream scope revision

Human instruction (2026-10-13): #31 must not be blocked by #531, need not be its prerequisite, requires no joint acceptance; revise scope as needed.

Current authority: live castbox/Trellis#31 and `../prd.md`. Updated source snapshot: `source-issue-current.md`. The earlier snapshot, review loops and candidate reports remain historical evidence of their former scope.

## Accepted change

- Retain Task schema 2.0 / Delivery API 1.0, versioned `/task/v2`, fresh native default, D1/D2, rework/withdrawal/recovery, Completion/Closure separation, platform context, upstream reviewed migration/rollback/reapply and controlled custom interface/version diagnosis.
- Actual Guru integration/private migration, paired candidates and joint acceptance are outside #31. No #531 progress/result is an upstream gate, and no dependency is established.
- Global unversioned SDK replacement and destructive legacy execution retirement move to independent future breaking-release work. The retained `/task`, plan 1.0 and explicit legacy workflow remain isolated compatibility paths with documented replacements and future cutover obligations, never dual authority in schema 2.

## Previous findings

F2/P4 was real missing global retirement under the former scope; it is now deferred/out of scope, not implemented or counted as fixed. F3/P5 was missing joint evidence under the former scope; that obligation is explicitly removed, not relabeled as a passed integration. Native/interface checks remain required. The clean-review streak restarts at 0/2 for the revised stable candidate. First revised-scope review found a real pull-quality/noDelivery conflict and five related documentation/evidence-wording issues; all must be corrected before a clean round can count. Native local/manual/Git-free owners require actual samples; public PR fact/owner/recovery contracts use source and objective verifier fixtures, with actual schema-2 remote owner execution explicitly unverified and outside the required live sample set.

## Source alignment and evidence

Upstream PR #33 is merged as `ad56d408`; its tree equals tested source `bfff3db2`. The bound Task branch had not included the approved single-file Linear fixture fix; its exact merged bytes are now copied into this worktree so current candidate review does not regress the Ubuntu fix. This is source alignment, not a new product behavior.

Existing CI 38319040291: Ubuntu/Python3.9, CLI2169, Core475 plus one existing optional SQLite skip, Linear22. These results apply to the merged source. Scope/docs/template-header changes need fresh focused validation and exact candidate review; old tar manifests are not relabeled as freshly packed artifacts.

Issue/Task Closure, archive, cleanup and software release remain separate. This revision performs no #531 read, message or mutation.
