# Trellis on DeepSeek Harness (dsh)

dsh is a **class-2 pull-based** Trellis host: no session-start hook auto-injects
workflow context, so the agent loads the Trellis skills on demand through its
skill-loader tool.

| Capability | Status |
| --- | --- |
| Skills (`.agents/skills/trellis-*/SKILL.md`) | Works — dsh discovers this shared root natively |
| Entry skills (`.dsh/skills/trellis-*/SKILL.md`) | Works — dsh's own project skill root (highest rank) |
| Context hooks | None — pull-based: skills read `.trellis/` files directly |
| Sub-agents | None shipped — implement/check/research run inline via the workflow skills |

## Quick start

```bash
trellis init --dsh -u your-name
dsh web        # or: dsh --profile headless "start a Trellis task for ..."
```

In dsh:

1. Open a session in the project root and describe the work in natural
   language. For a new task the agent should load the `trellis-start` skill,
   which reads the current task state from `.trellis/` and routes to
   `trellis-brainstorm` (unclear requirements), `trellis-before-dev` (about to
   write code), `trellis-check` (done coding), or `trellis-update-spec`
   (learned something worth capturing).
2. Entry skills are `trellis-start` / `trellis-continue` / `trellis-finish-work`
   in `.dsh/skills/`. You can also ask for them by name at any time.
3. Type `/trellis:finish-work` is a slash-command convention from other hosts —
   dsh has no slash palette, so say "finish the trellis task" instead, and the
   agent loads `trellis-finish-work`.

## File map

- `.agents/skills/` — auto-triggered workflow skills (`trellis-before-dev`,
  `trellis-brainstorm`, `trellis-check`, `trellis-break-loop`,
  `trellis-update-spec`) plus the bundled `trellis-meta` /
  `trellis-spec-bootstrap` / `trellis-session-insight` skills. Byte-identical
  to Codex / Gemini CLI / Pi / Kimi writes into the same shared root.
- `.dsh/skills/` — dsh-private entry skills (`trellis-start` /
  `trellis-continue` / `trellis-finish-work`).
- `.trellis/` — specs, tasks, workspace memory, and the shared scripts the
  skills invoke (`get_context.py`, `task.py`, ...).

## Notes

- Skill scripts pass `--platform dsh` to `get_context.py`; the value is used
  as a platform-scoped context key.
- The shipped `minimal` agent preset composes only `bash` +
  `str_replace_editor`; the default presets include `web_search` and the
  filesystem/terminal tools the skills assume.
- dsh has no project-level sub-agent definition surface, so Trellis ships no
  `trellis-implement` / `trellis-check` / `trellis-research` agent prompts
  here — the workflow skills run those phases inline in the main session.
