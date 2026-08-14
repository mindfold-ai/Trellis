# Trellis on DeepSeek Harness (dsh)

dsh is a **class-2 pull-based** Trellis host. It discovers Trellis skills from
the project, uses native continuable sub-agents for isolated implementation and
review roles, and exposes a stable `DSH_SESSION_ID` to every managed shell.

| Capability | Without companion plugin | With `dsh-trellis` |
| --- | --- | --- |
| Shared and entry skills | Works | Works |
| Session-scoped active task | Works through verified `DSH_SHELL=1` + `DSH_SESSION_ID`, including nested launches | Managed per-execution identity can forward a distinct child session |
| Implement/check/research roles | Foreground native sub-agent | Background native sub-agent |
| Per-turn workflow breadcrumb | Not available | Injected from `workflow.md` |
| Event-driven child wait | Not available | `trellis_wait` |
| Utility commands | Not available | `/trellis-status`, `/trellis-finish` |

## Quick start

```bash
trellis init --dsh -u your-name
dsh web        # or: dsh --profile headless "start a Trellis task for ..."
```

In dsh:

1. Describe the work in natural language and load `trellis-start` when a
   session needs explicit Trellis bootstrap.
2. The main session dispatches `trellis-agent-research`,
   `trellis-agent-implement`, and `trellis-agent-check` through DSH's native
   `subagent` tool. Each child loads exactly one matching role skill.
3. Finish through `trellis-finish-work`, which preserves the required order:
   commit, archive, then journal.

## Companion plugin fallback contract

The Trellis adapter does not install a DSH profile plugin. Before dispatching a
role, check whether the `trellis_wait` tool is available:

- If available, use DSH's default continuable background mode, continue
  independent work, then call `trellis_wait` once with the returned child id.
- If unavailable, dispatch the child initially with `run_in_background: false`
  so the dependent workflow gate cannot overtake it.

Never replace either path with shell sleep, polling loops, `job_output`, or
repeated agent-list polling.

## Nested host sessions

DSH inherits ordinary environment variables from the process that launches it.
If that outer process is already an active Trellis session,
`TRELLIS_CONTEXT_ID` would otherwise override the inner `DSH_SESSION_ID`.
DSH rebuilds its complete `DSH_*` namespace for each managed shell, so the beta
adapter treats `DSH_SHELL=1` together with `DSH_SESSION_ID` as the current DSH
identity and resolves it before an inherited generic override, even without the
plugin. The optional plugin additionally contributes a trusted
`DSH_TRELLIS_CONTEXT_ID` when it must forward a child identity that differs
from the shell's own session id.

## File map

- `.agents/skills/` — shared workflow and bundled skills, byte-identical to
  the other Agent Skills writers.
- `.dsh/skills/trellis-{start,continue,finish-work}/` — DSH-private entry
  skills.
- `.dsh/skills/trellis-agent-{research,implement,check}/` — child-only role
  skills; implement/check include the pull-based task context prelude.
- `.dsh/DSH.md` — this operator guide.
- `.trellis/` — workflow, specs, tasks, workspace journal, and shared scripts.

## Notes

- Generated Python commands use `python3` in source templates and are rendered
  to the detected Windows launcher during `trellis init` / `trellis update`.
- Role dispatch prompts start with `Active task: <task path>`. This exact task
  path is the child's primary context source; children must not guess globally.
- Each `dsh --profile headless` invocation creates a fresh DSH session. Do not
  expect an active-task pointer to persist across separate headless calls; keep
  the workflow in one session or explicitly resume its returned session id.
- The optional companion plugin is maintained separately at
  <https://github.com/SajoLuo/dsh-trellis>.
