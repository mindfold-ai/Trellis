# Technical design

## Boundaries

The new companion plugin lives under `plugins/codex/`. It contains the Codex
manifest, hook registration, a small Node.js dispatcher, byte-identical copies
of the shared hook runtimes, and user-facing documentation. Project-local hooks
remain the default, while `codex.hook_mode: plugin` makes init/update omit them.

## Data flow

1. Codex loads `plugins/codex/.codex-plugin/plugin.json` and auto-discovers
   the canonical `hooks/hooks.json` lifecycle-hook file.
2. After the user reviews the plugin hooks, Codex invokes the dispatcher for
   `UserPromptSubmit` or a matching `SubagentStart` event.
3. The dispatcher reads the Codex event payload once, resolves the project directory from
   the payload's `cwd` (falling back to the process cwd), and walks upward until
   it finds `.trellis/`.
4. If no Trellis root exists, it exits 0 with no output. Otherwise it runs the
   corresponding Python runtime from the plugin bundle with the original JSON
   payload on stdin, sets `CODEX_PROJECT_DIR` to the discovered root, and
   forwards stdout/stderr and the exit status.

This keeps workflow state, task/session resolution, specs, skills, and agent
profiles in the repository while the reviewed plugin owns all executed hook
code. Tests require bundled runtimes to match the shared template bytes.

## Compatibility and rollout

- Project-local `.codex/hooks.json` remains the default. Plugin users opt into
  `codex.hook_mode: plugin` and remove existing local hooks once; subsequent
  init/update runs omit those paths. Reverting to `project` restores the
  existing generated-hook behavior.
- The plugin hooks use `PLUGIN_ROOT` in their commands, with the documented
  `CLAUDE_PLUGIN_ROOT` compatibility fallback for hosts that expose the legacy
  variable.
- The plugin does not enable Codex features, change sandbox policy, or bypass
  approval for tools and commands outside the registered hook definitions.

## Failure handling

The dispatcher is fail-open for unrelated projects: discovery failures,
malformed hook input, missing Python, or missing bundled runtime files produce
no context and a successful exit. A bundled hook's output and exit status are
preserved when it can be executed.

## Testing

Static tests validate the manifest and hook event structure. Dispatcher tests
exercise a temporary Trellis root with a malicious local hook, a non-Trellis
directory, and no local hooks. Configurator/update tests prove plugin mode omits
local hooks without changing the default project mode.
