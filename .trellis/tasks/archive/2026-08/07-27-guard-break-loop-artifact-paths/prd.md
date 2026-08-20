# Guard trellis-break-loop artifact paths

## Goal

Make trellis-break-loop guidance verify referenced artifacts and files exist before relying on them, and report missing paths diagnostically instead of directing agents to act on absent evidence.

## Background

The expanded active-session review found one Trellis-owned issue in the
people-profiles command-pack refresh PR: Copilot correctly flagged the installed
`trellis-break-loop` instruction because it directed the agent through follow-up
artifact work without first proving the referenced artifacts existed. The
consumer PR fixed both `.agents` and `.claude` copies to keep platform mirrors
aligned, but the upstream Trellis templates still need the durable fix.

This is separate from the `_example` context-manifest issue, which is already
tracked by `07-23-align-task-validation-preflight`, and separate from
command-pack review/finish-work validators, which are pack-owned.

## Requirements

- Update the authoritative break-loop template sources, not only dogfood copies.
- Ensure the break-loop instruction tells agents to verify any named file,
  directory, task artifact, spec, or generated mirror exists before reading,
  updating, or citing it.
- If an expected artifact is missing, the skill should direct the agent to
  report that diagnostic and either use the closest existing source of truth or
  create a follow-up task, rather than implying the missing path was inspected.
- Preserve the skill's existing purpose: root-cause analysis, prevention
  mechanisms, systematic expansion, and knowledge capture.
- Keep all platform variants behaviorally aligned: common skill source, Codex
  skill, Copilot prompt, and dogfood `.agents` / `.claude` copies.
- Add or update tests that prove the shipped break-loop instructions include
  the existence-guard behavior and that platform mirrors do not drift from the
  source template.
- Do not broaden this task into command-pack review validators,
  `_example` task context generation, or consumer-specific PR fixes.

## Acceptance Criteria

- [ ] The authoritative break-loop template instructs agents to check existence
  before using or updating referenced artifacts.
- [ ] Missing artifact handling is diagnostic and non-fabricating: the agent
  reports the absent path and chooses an explicit recovery path.
- [ ] Common, Codex, Copilot, `.agents`, and `.claude` break-loop surfaces are
  updated together or are generated from one source without semantic drift.
- [ ] Regression coverage fails if the existence-guard wording is removed from
  a shipped break-loop surface.
- [ ] Template parity or hash-tracking coverage proves updated break-loop files
  are installed consistently for supported platforms.
- [ ] Relevant focused tests pass, along with any template consistency checks
  touched by the implementation.

## Notes

- Evidence source: people-profiles PR #3 review cycle fixed the issue locally in
  `.agents/skills/trellis-break-loop/SKILL.md` and
  `.claude/skills/trellis-break-loop/SKILL.md`.
- Keep this task PRD-only unless implementation discovers platform-specific
  template mechanics that need a short design note.
