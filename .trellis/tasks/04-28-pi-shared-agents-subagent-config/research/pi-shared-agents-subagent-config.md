# Pi Shared Agents / Subagent Config Research

## Input

The screenshot highlights:

* project root `.agents/`
* `.pi/settings.json`
* `.pi/settings.json -> "skills": ["./skills"]`

The discussion asks:

* whether Pi should reuse the `.agents` layer instead of writing separate `.pi/skills`;
* whether Pi Agent supports different models/thinking levels for subagents;
* whether subagent behavior should be implemented by the Trellis plugin;
* whether `https://github.com/nicobailon/pi-subagents` provides a better configuration model.

## Current Trellis Pi Shape

`packages/cli/src/configurators/pi.ts` currently writes:

```text
.pi/prompts/trellis-<command>.md
.pi/skills/<skill>/SKILL.md
.pi/agents/trellis-<agent>.md
.pi/extensions/trellis/index.ts
.pi/settings.json
```

`packages/cli/src/templates/pi/settings.json` currently contains:

```json
{
  "enableSkillCommands": true,
  "extensions": ["./extensions/trellis/index.ts"],
  "skills": ["./skills"],
  "prompts": ["./prompts"]
}
```

The current extension's `SubagentInput` only supports:

```ts
interface SubagentInput {
  agent?: string;
  prompt?: string;
  mode?: "single" | "parallel" | "chain";
  prompts?: string[];
}
```

There is no Trellis-side support today for `model`, `thinking`, `fallbackModels`, `skills`, or `tools` per agent/subagent call.

## Pi Native Skill Discovery

Pi official docs say skills are loaded from:

* global `~/.pi/agent/skills/`
* global `~/.agents/skills/`
* project `.pi/skills/`
* project `.agents/skills/` from cwd and ancestor directories
* packages
* `settings.json -> skills`
* CLI `--skill <path>`

The local installed Pi code confirms this:

* `dist/core/package-manager.js` collects ancestor `.agents/skills` directories.
* project `.agents/skills` is treated as auto-discovered project skills.
* `dist/core/resource-loader.js` resolves `settings.json -> skills` relative to the runtime cwd.

Pi docs also explicitly show cross-harness skill reuse:

```json
{
  "skills": ["../.claude/skills"]
}
```

This means Pi can consume `.agents/skills` without requiring Trellis to duplicate skills under `.pi/skills`.

## `pi-subagents` Findings

Repository: `nicobailon/pi-subagents`

Description from GitHub metadata:

> Pi extension for async subagent delegation with truncation, artifacts, and session sharing

README and source show it provides:

* builtin agents such as `scout`, `researcher`, `planner`, `worker`, `reviewer`, `oracle`;
* project agent discovery from `.pi/agents/{name}.md`;
* legacy project agent discovery from `.agents/{name}.md`;
* `.pi/agents` winning over `.agents` when names collide;
* agent frontmatter fields:
  * `model`
  * `fallbackModels`
  * `thinking`
  * `systemPromptMode`
  * `inheritProjectContext`
  * `inheritSkills`
  * `skills`
  * `tools`
  * `extensions`
  * `output`
  * `defaultReads`
  * `defaultProgress`
  * `interactive`
  * `maxSubagentDepth`
* project/user builtin overrides in settings:

```json
{
  "subagents": {
    "agentOverrides": {
      "reviewer": {
        "model": "anthropic/claude-sonnet-4",
        "thinking": "high",
        "fallbackModels": ["openai/gpt-5-mini"]
      }
    }
  }
}
```

Its execution path appends thinking to model when needed:

```ts
function applyThinkingSuffix(model, thinking) {
  if (!model || !thinking || thinking === "off") return model;
  if (model already ends with a thinking suffix) return model;
  return `${model}:${thinking}`;
}
```

It then passes model through Pi CLI:

```text
--model <model[:thinking]>
```

It disables skill inheritance unless configured:

```text
--no-skills
```

when `inheritSkills` is false.

## Pi CLI Model / Thinking Support

`pi --help` confirms:

```text
--model <pattern>    Model pattern or ID (supports "provider/id" and optional ":<thinking>")
--thinking <level>   Set thinking level: off, minimal, low, medium, high, xhigh
```

Examples from Pi help include:

```text
pi --model openai/gpt-4o "Help me refactor this code"
pi --model sonnet:high "Solve this complex problem"
pi --thinking high "Solve this complex problem"
```

So yes: child Pi processes can run different models/thinking levels if the extension passes the correct CLI args.

## Design Implications

### Shared Skills

Reusing `.agents/skills` is directionally correct because:

* Pi natively discovers it.
* Trellis already has a shared Agent Skills layer for Codex and adjacent tools.
* It avoids duplicate generated skill trees.
* It makes `.pi/settings.json` smaller and closer to Pi conventions.

But it should not be done by blindly pointing Pi at the current Codex-rendered `.agents/skills` output. Trellis common skill rendering is currently platform-aware:

* Codex context renders some command references as `$start`, `$finish-work`, etc.
* Pi context renders them as `/trellis-start`, `/trellis-finish-work`, etc.

Only `trellis-brainstorm` and `trellis-update-spec` differed in the local comparison, but that is enough to require a design decision:

* Either make the shared `.agents/skills` content platform-neutral;
* or accept one canonical rendering for all Agent Skills consumers;
* or keep platform-specific skill roots.

Recommendation: make shared `.agents/skills` content platform-neutral, then make Pi consume that shared root.

### Agent Definitions

`pi-subagents` reads project agents from `.agents/{name}.md`, but `.pi/agents/{name}.md` has higher priority and is the preferred project path.

Recommendation: keep Trellis Pi subagent definitions in `.pi/agents/` for now. Moving them to `.agents/{name}.md` would overload `.agents` with both Agent Skills (`.agents/skills`) and Pi-specific agent markdown. It is valid, but it makes ownership less clear and may collide with other tools that use `.agents/` differently.

### Subagent Model / Thinking

Trellis should support model/thinking directly in its own Pi extension. The minimal model is:

```yaml
---
name: trellis-check
description: Code quality check expert
model: anthropic/claude-sonnet-4
thinking: high
fallbackModels: openai/gpt-5-mini
---
```

Extension behavior:

* parse frontmatter from `.pi/agents/<name>.md`;
* apply per-call `model` / `thinking` overrides if present;
* otherwise use agent frontmatter;
* append `:<thinking>` to `--model` if the model has no thinking suffix;
* if no model is provided but thinking is provided, pass `--thinking <level>`;
* preserve the existing Trellis context prompt assembly.

This gives the requested behavior without importing the full `pi-subagents` runtime.

## Recommended MVP

1. Keep Trellis-owned `.pi/extensions/trellis/index.ts`; do not install `pi-subagents`.
2. Add `model`, `thinking`, `fallbackModels`, and optionally `skills` to Trellis Pi agent frontmatter and parser.
3. Add optional per-call `model` / `thinking` fields to the Trellis `subagent` tool schema.
4. Move common Trellis workflow skills for Pi to shared `.agents/skills` only after shared skill output is made platform-neutral or otherwise explicitly canonical.
5. Keep `.pi/agents` as the Trellis Pi agent definition root.

## Implementation Sketch

### Skills Root

Possible Pi configurator shape:

```ts
await writeSkills(
  path.join(cwd, ".agents", "skills"),
  resolveSharedAgentSkills(),
  resolveBundledSkills(sharedContext),
);
```

Settings can become:

```json
{
  "enableSkillCommands": true,
  "extensions": ["./extensions/trellis/index.ts"],
  "prompts": ["./prompts"]
}
```

or explicit:

```json
{
  "enableSkillCommands": true,
  "extensions": ["./extensions/trellis/index.ts"],
  "skills": ["../.agents/skills"],
  "prompts": ["./prompts"]
}
```

The first is more native because Pi auto-discovers `.agents/skills`. The second is more self-documenting but duplicates a native discovery path.

### Subagent Tool Input

```ts
interface SubagentInput {
  agent?: string;
  prompt?: string;
  mode?: "single" | "parallel" | "chain";
  prompts?: string[];
  model?: string;
  thinking?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  skills?: string[] | false;
}
```

### Child CLI Args

```ts
const modelArg = applyThinkingSuffix(input.model ?? agent.model, input.thinking ?? agent.thinking);
if (modelArg) args.push("--model", modelArg);
else if (thinking) args.push("--thinking", thinking);
```

## Tests To Add

* `packages/cli/test/configurators/platforms.test.ts`
  * Pi no longer writes `.pi/skills` if shared `.agents/skills` is chosen.
  * Pi template tracking includes `.agents/skills/...` when `supportsAgentSkills` is true.
* `packages/cli/test/templates/pi.test.ts`
  * extension parses agent frontmatter fields.
  * extension applies `model` and `thinking` CLI args.
  * per-call override wins over agent frontmatter.
  * existing Trellis context injection still happens.
* `packages/cli/test/regression.test.ts`
  * managed paths include `.agents/skills` for Pi if Pi is marked `supportsAgentSkills`.
  * generated settings match the chosen discovery strategy.

## Risk / Tradeoff

| Decision | Upside | Risk |
|---|---|---|
| Use `.agents/skills` for Pi | less duplication, follows Pi native discovery | shared content must be platform-neutral |
| Keep `.pi/agents` | clear Pi ownership, matches preferred `pi-subagents` path | does not fully consolidate agent definitions |
| Adopt config shape from `pi-subagents` | familiar to Pi users, supports model/thinking cleanly | Trellis must implement parsing/tests |
| Depend on `pi-subagents` | feature-rich immediately | external dependency, larger behavior surface, harder deterministic tests |

## Conclusion

The long-term implementation path is to reuse `.agents/skills` for shared Trellis skills, but not to move Trellis subagent definitions wholesale into `.agents` yet. For subagent model/thinking, Trellis should implement a small frontmatter/per-call config layer in its own Pi extension, using Pi CLI's native `--model` / `--thinking` support and borrowing the proven field names from `pi-subagents`.

Post-implementation note: the MVP intentionally keeps Trellis-owned Pi workflow skills under `.pi/skills` and keeps `.pi/settings.json -> "skills": ["./skills"]`. Shared `.agents/skills` remains deferred until the shared Agent Skill rendering is platform-neutral or explicitly canonical; pointing Pi at the current Codex-rendered `.agents/skills` would risk platform-wrong command references.
