# Raw Session Recall

Task requirements, decisions, progress, and validation belong in the selected task artifacts. Reusable engineering conventions belong in `.trellis/spec/`. Resume from explicit task metadata and the validated current-session binding.

`trellis mem` can retrieve raw platform conversations on explicit request through the `trellis-session-insight` skill. These conversations remain in platform-owned stores such as `~/.claude/projects/`, `~/.codex/sessions/`, and `~/.pi/agent/sessions/`; they are not task ownership or active-task authority.

Finish-work archives completed tasks and reports validation and follow-ups. It does not create a separate session record or aggregate index.
