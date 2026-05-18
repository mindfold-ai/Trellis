# Design: Rename Pi trellis subagent tool

## Overview

Rename Trellis's Pi extension subagent tool from `"subagent"` to `"trellis_subagent"` to avoid name collision with the community `nicobailon/pi-subagents` package. Add agent-name validation via file-exists check on `.pi/agents/trellis-{agent}.md`.

## Architecture Boundaries

```
Pi process
  └─ extensions/trellis/index.ts  ← all changes HERE
       ├─ registerTool({ name: "trellis_subagent", ... })
       ├─ execute() → isTrellisAgent() gate → runSubagent() | error return
       └─ runSubagent() → readAgentDefinition() → runPi()
```

**No changes to:**
- `runSubagent()` — still calls `readAgentDefinition()` + `runPi()`
- `readAgentDefinition()` — already constrained to `trellis-*` files by prefix logic
- `inject-subagent-context.py` — handles platform-native tools only
- Other platform templates

## Data Flow

```
AI calls trellis_subagent(agent="implement", prompt="...")
  ↓
execute() entry
  ↓
normalizeAgentName("implement") → "trellis-implement"
  ↓
isTrellisAgent("trellis-implement")
  → existsSync(".pi/agents/trellis-implement.md") → true → proceed
  ↓
runSubagent() → readAgentDefinition() → runPi() → output
  ↓
return { content: [{ type: "text", text: output }] }
```

**Rejection path:**
```
AI calls trellis_subagent(agent="custom-agent", prompt="...")
  ↓
normalizeAgentName("custom-agent") → "trellis-custom-agent"
  ↓
isTrellisAgent("trellis-custom-agent")
  → existsSync(".pi/agents/trellis-custom-agent.md") → false
  ↓
return {
  content: [{ type: "text", text: "Error: trellis-custom-agent is not..." }],
  details: { agent: "trellis-custom-agent", error: "no agent definition" }
}
```

## `isTrellisAgent()` Design

```ts
function isTrellisAgent(projectRoot: string, agent: string): boolean {
  // agent is already normalized (trellis- prefix guaranteed by caller)
  return existsSync(join(projectRoot, ".pi", "agents", `${agent}.md`));
}
```

- Input: already-normalized agent name (e.g. `"trellis-implement"`)
- Output: `boolean`
- No allowlist — file-exists is the gate
- Future agents (e.g. `trellis-review`) auto-qualify when `.md` file is placed in `.pi/agents/`

## Validation Hook Point

Validation happens at the top of `execute()`, **before** `getContextKey()` or `runSubagent()`. This ensures:
- No context resolution for invalid agents
- No pi process spawned for invalid agents
- Clean error return to AI

## Error Message Format

```
`trellis_subagent` is only for Trellis workflow agents with a
definition file in .pi/agents/.

No definition found for: trellis-{agent}

For general-purpose sub-agents, use one of these community tools:
- `subagent` tool from npm:pi-subagents (nicobailon/pi-subagents)
- `Agent` tool from npm:@tintinweb/pi-subagents

If neither is installed, ask the user to either:
- Create .pi/agents/trellis-{agent}.md for your custom Trellis agent
- Install a community subagent package: pi install -l npm:@tintinweb/pi-subagents
```

## Settings Cleanup

`packages/cli/src/templates/pi/settings.json`:
- Remove entire `"packages"` array (currently has `npm:pi-subagents` with all features disabled)
- No more conflict → no need to disable community package
- Users decide whether to install community packages separately

## Test Changes

All `'name: "subagent"'` string assertions → `'name: "trellis_subagent"'`:
- `packages/cli/test/templates/pi.test.ts` line 111
- `packages/cli/test/configurators/platforms.test.ts` line 801
- `packages/cli/test/regression.test.ts` line 5057

Pi-subagents package assertions removed:
- `packages/cli/test/templates/pi.test.ts` lines 96-104
- `packages/cli/test/configurators/platforms.test.ts` lines 857-864

## Compatibility

- **Backward compatible?** No — tool name changes from `"subagent"` to `"trellis_subagent"`. AI caches old tool names → fresh session needed.
- **Existing projects after `trellis update`:** Settings template regenerated with new name, no `packages` entry. Existing `.pi/` installations get new extension code but may need manual settings cleanup if user already modified settings.json.
- **Community packages:** No interference. Community `subagent` and `Agent` tools work independently alongside `trellis_subagent`.
