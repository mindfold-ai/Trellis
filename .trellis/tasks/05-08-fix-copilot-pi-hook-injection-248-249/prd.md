# Fix Copilot SessionStart-ignored (#248) + Pi missing workflow-state injection (#249)

## Goal

Fix two related platform bugs where the Trellis workflow breadcrumb fails to reach the AI:

- **[#248](https://github.com/mindfold-ai/Trellis/issues/248)** Copilot ignores `SessionStart` hook output (Copilot itself prints a diagnostic noting it discarded our 20213-char output). User asks whether we should consider another injection path.
- **[#249](https://github.com/mindfold-ai/Trellis/issues/249)** Pi platform extension never injects `[workflow-state:STATUS]` breadcrumbs from `workflow.md`. The Pi `input` and `before_agent_start` hooks parse the context key but emit nothing. Result: Pi users see no Trellis workflow guidance, AI directly edits files instead of running brainstorm → implement → check.

Both versions reported on **0.5.6**.

## What I already know (from main-session triage)

### #248 Copilot
- `packages/cli/src/templates/copilot/hooks.json` ships **two** hooks: `SessionStart` (runs `session-start.py`, ignored by Copilot) and `userPromptSubmitted` (runs `inject-workflow-state.py`).
- The user's screenshot shows Copilot's own diagnostic line `Trellis SessionStart diagnostics emitted (20213 chars); Copilot currently ignores sessionStart hook output.` — Copilot accepts the hook config (no error) but silently discards the output.
- Open question: does Copilot's `userPromptSubmitted` hook actually inject output into the model context? If yes, the workflow IS reaching the model and the SessionStart noise is just noise → drop SessionStart from hooks.json. If no, both paths are broken and we need a different injection path (e.g. agent prompt prelude, README breadcrumb, manual `/trellis:start`).

### #249 Pi
- User's diagnosis is precise. `packages/cli/src/templates/pi/extensions/trellis/index.ts.txt` lines 962–997:
  - `session_start` (962): only `getContextKey` + UI notify, no `<session-overview>` injection.
  - `before_agent_start` (969): builds task context (prd + jsonl) only — for sub-agents, fine.
  - `input` (988): `getContextKey` + `return {action:"continue"}` — **no workflow-state injection**.
- Equivalent of Claude's UserPromptSubmit is Pi's `input` hook. Should run `inject-workflow-state.py` (or inline the equivalent logic) and return `additionalContext` / `systemPrompt` merge.
- Secondary: `session_start` should inject `<session-overview>` (developer / git / active tasks) and the `subagent` tool registration could carry a `promptSnippet` telling the main agent it should dispatch sub-agents.

## Open Questions (need research)

- (Q1) Does Copilot's `userPromptSubmitted` hook actually inject hook stdout into model context? Or is it also silently ignored?
- (Q2) If both Copilot hooks are ignored, what injection paths does Copilot offer? (`copilot-instructions.md`, custom instructions, prompt files, MCP, agent system prompt extension, …)
- (Q3) What's Pi's contract for `input` hook return value to inject `additionalContext`? Is there a documented `additionalContext` field in `input` hook return? Or do we have to mutate `event.messages` / return `systemPrompt`?
- (Q4) Pi `subagent` tool — does Pi support `promptSnippet` / `promptGuidelines` field on tool registration to push usage hints into the main agent's system prompt?

## Implementation paths (preliminary, refine after research)

### #248 Copilot — paths under consideration

- **Path A (preferred if Q1=yes)**: drop `SessionStart` from `copilot/hooks.json`, keep only `userPromptSubmitted`. Same play as 0.5.5 did for Codex.
- **Path B (if Q1=no)**: write workflow breadcrumb into `.github/copilot-instructions.md` or another always-loaded prompt path.
- **Path C (always)**: regardless of A/B, leave the existing `<trellis-bootstrap>` notice mechanism in place (already works: `inject-workflow-state.py` emits it on `no_task` turns instructing the AI to invoke `$trellis-start`).

### #249 Pi — paths under consideration

- **Path A**: Pi `input` hook spawns `inject-workflow-state.py` (Python child process, like Codex / Claude do) and returns its stdout as `additionalContext`. Highest reuse, lowest drift.
- **Path B**: inline the workflow-state extraction logic in TS (no Python child process). Less reuse but no Python dependency in Pi extension runtime.
- Path A wins if Pi `input` hook accepts spawning child processes synchronously / async without UX issues. Otherwise Path B.

## Out of Scope (explicit)

- Re-architecting Copilot's hook system (it's a client-side limitation, can't fix from Trellis).
- Adding new platform-level config knobs for either.
- Pi extension feature work beyond workflow-state injection (e.g. `<session-overview>`, subagent `promptSnippet`) — track as follow-up if research shows they're tangled.

## Acceptance Criteria

- [ ] (#248) Copilot users on a fresh Trellis project see workflow guidance reach the model on first turn (verified by reproducing the issue and observing model output references workflow phases).
- [ ] (#248) The "Copilot currently ignores sessionStart hook output" diagnostic stops appearing (or is deliberately accepted as no-op noise with a documented reason).
- [ ] (#249) Pi users on a fresh Trellis project see `<workflow-state>` content in the AI's context on user-prompt-submit. Reproduced by running `inject-workflow-state.py` equivalent through Pi extension and checking the `systemPrompt` / `additionalContext` returned.
- [ ] (#249) Pi extension regression test added (or manual reproducer documented) asserting `input` hook returns workflow-state-bearing content.

## Definition of Done

- Tests added/updated where applicable.
- Lint / typecheck / CI green.
- Both issues closed with a comment summarizing the fix and version.
- Changelog entry in 0.5.8 manifest + docs-site changelog.

## Technical Notes

- **Files likely touched**:
  - `packages/cli/src/templates/copilot/hooks.json` — drop SessionStart entry (Path A) OR keep noise as documented (Path B).
  - `packages/cli/src/templates/copilot/hooks/session-start.py` — possibly remove if Path A and no longer referenced.
  - `packages/cli/src/templates/pi/extensions/trellis/index.ts.txt` — `input` hook implementation (#249 main fix).
  - `packages/cli/src/configurators/copilot.ts` — adjust if SessionStart removed.
  - Regression tests: `packages/cli/test/regression.test.ts` — add `[issue-248]` / `[issue-249]` checks.
- **Pi extension distribution**: the `.txt` extension on `index.ts.txt` suggests this template is copied verbatim into user projects (extension is loaded by Pi at runtime). Changes here ship through `trellis init` / `trellis update`.

## Research References

(to be filled by trellis-research sub-agent runs — see `research/` directory)
