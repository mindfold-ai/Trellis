# Implement: Rename Pi trellis subagent tool

## Execution Order

### 1. Template: Rename tool + add validation

File: `packages/cli/src/templates/pi/extensions/trellis/index.ts.txt`

1.1 Add `isTrellisAgent()` helper function (place near `readAgentDefinition` or `normalizeAgentName`):
```ts
function isTrellisAgent(projectRoot: string, agent: string): boolean {
  // agent is already normalized to trellis-* by the caller
  return existsSync(join(projectRoot, ".pi", "agents", `${agent}.md`));
}
```

1.2 Update `SUBAGENT_DISPATCH_PROTOCOL` comment (line 786):
```
// ... registered with the `trellis_subagent` tool ...
```

1.3 In `registerTool()` call:
- `name: "trellis_subagent"`
- `label: "Trellis Subagent"`
- Update `agent` param description to mention trellis-research

1.4 In `execute` handler, add validation at entry (before `getContextKey`):
```ts
execute: async (...): Promise<PiToolResult> => {
  const agentName = normalizeAgentName(input.agent ?? "trellis-implement");
  if (!isTrellisAgent(projectRoot, agentName)) {
    return {
      content: [{ type: "text", text: `...error + community guidance...` }],
      details: { agent: agentName, error: "not a trellis workflow agent" },
    };
  }
  // ... existing code continues
},
```

1.5 Verify: template string must remain valid TypeScript (no syntax errors from template interpolation)

### 2. Settings: Remove packages array

File: `packages/cli/src/templates/pi/settings.json`

2.1 Remove the entire `"packages"` array:
```json
{
  "enableSkillCommands": true,
  "extensions": ["./extensions/trellis/index.ts"],
  "skills": ["./skills"],
  "prompts": ["./prompts"]
}
```

### 3. Tests: Update assertions

File: `packages/cli/test/templates/pi.test.ts`

3.1 Line 111: `'name: "subagent"'` → `'name: "trellis_subagent"'`
3.2 Lines 96-104: Remove pi-subagents package assertion block

File: `packages/cli/test/configurators/platforms.test.ts`

3.3 Line 801: `'name: "subagent"'` → `'name: "trellis_subagent"'`
3.4 Lines 857-864: Remove pi-subagents package assertion block

File: `packages/cli/test/regression.test.ts`

3.5 Line 5057: `'name: "subagent"'` → `'name: "trellis_subagent"'`

### 4. Build and verify

```bash
cd /home/shane/mycode/Trellis
npm run build
npm test
```

### 5. Validation commands

```bash
# Check template output contains correct tool name
grep 'trellis_subagent' packages/cli/src/templates/pi/extensions/trellis/index.ts.txt

# Check settings.json has no packages key
grep -c '"packages"' packages/cli/src/templates/pi/settings.json  # should be 0

# Run relevant test files
npx jest packages/cli/test/templates/pi.test.ts
npx jest packages/cli/test/configurators/platforms.test.ts
npx jest packages/cli/test/regression.test.ts -t "subagent"
```

## Risky Points

- Template file is a `.txt` template — must verify TypeScript compiles after changes (no stray backticks, template literals break)
- Test line numbers may shift if surrounding code changes — verify exact match text, not line numbers
- `isTrellisAgent` uses `existsSync` which is already imported — no new imports needed
