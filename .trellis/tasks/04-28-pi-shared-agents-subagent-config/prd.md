# research: Pi shared agents skills and subagent config

## Goal

Research how Trellis Pi support should handle shared Agent Skills and per-subagent configuration. The concrete user prompt came from a screenshot showing `.agents/` next to `.pi/settings.json` with `"skills": ["./skills"]`, plus a question about whether Pi subagents can use different models/thinking levels and whether that should be implemented by the Trellis plugin.

## What I already know

* Current Trellis Pi init writes:
  * `.pi/settings.json`
  * `.pi/prompts/trellis-*.md`
  * `.pi/skills/<skill>/SKILL.md`
  * `.pi/agents/trellis-*.md`
  * `.pi/extensions/trellis/index.ts`
* Current Pi settings template points `skills` at `./skills`.
* Trellis already writes shared Agent Skills to `.agents/skills` for Codex, and the local project has both `.agents/skills` and `.pi/skills`.
* Pi official docs say Pi loads skills from `.pi/skills/` and `.agents/skills/` in cwd and ancestor directories.
* Pi official docs also say project `.pi/settings.json` can reference other skill directories, e.g. `"skills": ["../.claude/skills"]`.
* `pi-subagents` is an external Pi extension for subagent delegation. It supports:
  * project agents in `.pi/agents/{name}.md`
  * legacy project agents in `.agents/{name}.md`
  * model/thinking/fallback model fields in agent frontmatter
  * project-level `.pi/settings.json -> subagents.agentOverrides`
  * inline per-run overrides like `reviewer[model=...,thinking=...]`
* Current Trellis Pi extension does not parse model/thinking fields from agent frontmatter and does not expose model/thinking in the `subagent` tool input.

## Assumptions

* Trellis should avoid taking a runtime dependency on `pi-subagents` unless there is a strong reason.
* Trellis should minimize duplicate generated skills when Pi can consume `.agents/skills` natively.
* Trellis should preserve deterministic `trellis init --pi` behavior and template tracking.
* Model/thinking customization should be explicit and testable.

## Research Summary

See `.trellis/tasks/04-28-pi-shared-agents-subagent-config/research/pi-shared-agents-subagent-config.md`.

## Recommended Direction

Use a two-part design:

1. **Skills**: keep Pi on Trellis-owned `.pi/skills` in this MVP; move Pi to shared `.agents/skills` only after shared Agent Skill text is platform-neutral or explicitly canonical.
2. **Subagent config**: keep Trellis's own `.pi/extensions/trellis/index.ts` subagent tool, but adopt the useful `pi-subagents` configuration shape for model/thinking/fallback/tool/skill fields.

Do not vendor or install `pi-subagents` as the default Trellis implementation. It is feature-rich, but it would make Trellis Pi behavior depend on a third-party extension's runtime semantics and release cadence.

## Implementation Decision for This MVP

The implementation keeps Trellis-owned Pi skills under `.pi/skills` and keeps `.pi/settings.json` pointed at `"./skills"`. Pi can natively discover `.agents/skills`, but the current Trellis shared skill output is still platform-rendered: Codex command references can differ from Pi command references. Pointing Pi at Codex-rendered `.agents/skills` in this pass would risk platform-wrong workflow text. Shared `.agents/skills` should be enabled for Pi only after those skills are rendered platform-neutral or an explicitly canonical shared rendering is chosen.

The implemented MVP therefore focuses on Pi subagent configuration: `.pi/agents/*.md` frontmatter can provide `model`, `thinking`, and `fallbackModels`, and the Trellis `subagent` tool accepts per-call `model` and `thinking` overrides. The generated extension maps those values to Pi CLI `--model <model[:thinking]>` or `--thinking <level>` arguments while preserving the existing Trellis prompt/context behavior and Windows-safe launcher.

## MVP Requirements

* Pi init/update must keep Trellis-owned workflow skills under `.pi/skills` for now.
* Pi settings must keep `"skills": ["./skills"]` and must not point Pi at Codex-rendered `.agents/skills`.
* `AI_TOOLS.pi.supportsAgentSkills` must stay unset until Pi intentionally owns or shares `.agents/skills`.
* Current template-rendering differences must be handled before sharing `.agents/skills` across Codex and Pi:
  * Codex renders command refs like `$start`.
  * Pi renders command refs like `/trellis-start`.
  * Only a small subset of skills currently differs, but shared output should not become platform-wrong.
* Trellis Pi agent definitions must support model configuration through frontmatter, at least:
  * `model`
  * `thinking`
  * `fallbackModels`
* Trellis Pi `subagent` tool must accept per-call overrides:
  * `model`
  * `thinking`
* Child Pi launch must pass model/thinking through Pi CLI:
  * `--model <model>` for model
  * append `:<thinking>` to model when no thinking suffix already exists, or pass `--thinking <level>` if no model override is used.
* Tests must assert:
  * Pi settings still points at `.pi/skills` intentionally.
  * Pi collected templates include `.pi/skills` files, not `.agents/skills` files.
  * generated extension parses model/thinking and maps them to correct CLI args.
  * generated extension preserves Windows-safe launcher, stdin prompt transport, cancellation handling, bounded output, context propagation, and final assistant output extraction.

## Deferred Requirements

* Pi may consume shared `.agents/skills` later, but only after shared Agent Skill output is platform-neutral or an explicitly canonical rendering is chosen.
* If Pi later owns or shares `.agents/skills`, re-evaluate `AI_TOOLS.pi.supportsAgentSkills` and update managed-path tracking at the same time.
* Per-call `skills` / `skill` and `tools` overrides remain out of scope for this MVP.

## Open Questions

* Should shared `.agents/skills` be rendered with a neutral Trellis skill context, or should platform-specific command references be removed from shared skills entirely?
* Should Trellis Pi agents stay in `.pi/agents/` (preferred by `pi-subagents`) or move to legacy `.agents/{name}.md` for one shared project agent root?
* Should per-call model override be part of the Trellis `subagent` tool schema immediately, or should MVP only support static agent frontmatter?

## Out of Scope

* Replacing Trellis's Pi extension with `pi-subagents`.
* Adding background subagent runs, agent manager UI, chains, intercom, or worktree isolation.
* Moving Pi workflow skills to `.agents/skills` before shared skill rendering is platform-neutral.

## Technical Notes

* Relevant local files:
  * `packages/cli/src/configurators/pi.ts`
  * `packages/cli/src/templates/pi/settings.json`
  * `packages/cli/src/templates/pi/agents/*.md`
  * `packages/cli/src/templates/pi/extensions/trellis/index.ts.txt`
  * `packages/cli/src/configurators/shared.ts`
  * `packages/cli/src/types/ai-tools.ts`
* External reference:
  * `https://github.com/nicobailon/pi-subagents`
* Official local docs inspected:
  * `~/.nvm/versions/node/v24.10.0/lib/node_modules/@mariozechner/pi-coding-agent/README.md`
  * `~/.nvm/versions/node/v24.10.0/lib/node_modules/@mariozechner/pi-coding-agent/docs/skills.md`
