# Investigate session identity propagation gaps (CodeBuddy, OMP #517)

## Goal

Find out, for every platform Trellis supports, whether the session identity that
hooks resolve is still reachable when the agent later runs `task.py` through its
shell/bash tool. Where it is not, record why and what the platform actually
offers instead.

This is a research task. It ends in a written per-platform matrix and a
recommendation, not in a fix.

## Background

Two reports share one root cause:

- **#517 (Oh My Pi)**: the OMP extension resolves a context key from
  `sessionManager.getSessionId()` and injects workflow-state with it, but never
  writes it into `process.env`. When the agent runs `task.py start` from the
  bash tool, `resolve_context_key()` finds nothing and falls into degraded mode
  ("Session identity not available; active-task pointer not persisted"). The
  breadcrumb keeps saying `no_task` even after a task was started.
- **CodeBuddy (community report, 2026-08-05)**: `active_task.py:61` declares
  CodeBuddy's session source as `CODEBUDDY_SESSION_ID`. CodeBuddy does not
  export that variable, so `.trellis/.runtime/sessions/` is never created and
  the same degraded mode results.

Verified while triaging the CodeBuddy report:

- The templates under `templates/codebuddy/` are byte-identical on `main` and
  `feat/v0.7-beta`, so this is not a 0.7 regression.
- No Trellis hook denies a tool call anywhere in the codebase — the only two
  `permissionDecision` values in the tree are `"allow"`. Workflow enforcement is
  advisory. That is a separate concern from this task and must not be folded in.

## Scope

In scope:

- Every entry in `_ENV_SESSION_KEYS` in `active_task.py`, plus any supported
  platform missing from it.
- For each: does the platform export its session id into child processes? Does
  its hook stdin carry a session id? Does the Trellis-side extension or hook
  write `TRELLIS_CONTEXT_ID` back into the environment?
- Whether the fallback chain in `resolve_context_key()` can recover on its own,
  and what the user-visible symptom is when it cannot.

Out of scope:

- Implementing fixes. Any fix lands as follow-up tasks per platform.
- Hard workflow gating (blocking writes without an active task). Related in
  symptom, unrelated in cause — track separately.

## Requirements

- Produce a per-platform matrix under `research/` covering, for each platform:
  session id in hook stdin (yes/no/unknown), session env var exported to bash
  children (yes/no/unknown), Trellis-side re-export of `TRELLIS_CONTEXT_ID`
  (yes/no), resulting behavior (works / degraded), and the evidence for each
  cell.
- Mark every cell as **verified** (reproduced or read from platform docs, with a
  link or file:line) or **assumed**. Do not present an assumption as a finding.
- Identify which platforms share the OMP failure shape (resolves a key but never
  re-exports it) versus the CodeBuddy shape (declared env var the platform never
  sets).
- Recommend one containment approach that covers the whole class rather than
  N per-platform patches, and state its tradeoffs.

## Acceptance Criteria

- [ ] `research/platform-session-identity.md` contains the matrix with every
      platform in `_ENV_SESSION_KEYS` accounted for, each cell marked verified or
      assumed.
- [ ] The CodeBuddy claim (`CODEBUDDY_SESSION_ID` never set) is either confirmed
      by a real repro or explicitly marked unverified with the reason.
- [ ] #517's OMP diagnosis is checked against current `main` and confirmed or
      corrected.
- [ ] A written recommendation covering the class, with tradeoffs, and a list of
      the follow-up tasks it would spawn.
- [ ] Findings sufficient to answer whether CodeBuddy folds into #517 or needs
      its own issue.

## Open Questions

- Can we verify CodeBuddy and OMP locally, or does this need a community repro?
  Platforms we cannot run bound what "verified" can mean here.
- Is a generic fallback (deriving a stable key from cwd + parent pid, say)
  acceptable, or does correctness require true per-session identity? This
  decides whether the recommendation is one change or N.
