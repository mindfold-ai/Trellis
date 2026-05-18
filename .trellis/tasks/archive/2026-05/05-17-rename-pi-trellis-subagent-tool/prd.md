# Rename Pi trellis subagent tool to avoid community conflict

## Goal

Avoid tool-name collision between Trellis's built-in Pi subagent tool (`subagent`) and the community `nicobailon/pi-subagents` package (which also registers `subagent`). Also provide clear guidance when AI tries to use the Trellis tool for non-Trellis agents.

## Confirmed Facts (from code inspection)

### Current state

- Template file: `packages/cli/src/templates/pi/extensions/trellis/index.ts.txt`
- Tool registered as `name: "subagent"`, `label: "Subagent"`
- `pi/settings.json` references `npm:pi-subagents` (nicobailon/pi-subagents) — both register `subagent` → conflict
- `tintinweb/pi-subagents` registers `Agent` tool — no direct conflict with Trellis, but AI needs to know it exists as alternative

### Trellis workflow agents (3 total)

| Agent | Definition file | JSONL context |
|---|---|---|
| trellis-implement | `.pi/agents/trellis-implement.md` | `implement.jsonl` |
| trellis-check | `.pi/agents/trellis-check.md` | `check.jsonl` |
| trellis-research | `.pi/agents/trellis-research.md` | *(none — research agent discovers files itself)* |

- `trellis-research` is already recognized by all platform hooks (`AGENTS_ALL`)
- Currently missing from Pi extension's `TRELLIS_AGENT_JSONL` mapping — intentional (research doesn't need curated spec context)
- `normalizeAgentName()` auto-prefixes `trellis-` for shorthand names like `"implement"`

### Code paths to change

1. **Template**: `packages/cli/src/templates/pi/extensions/trellis/index.ts.txt`
   - Tool `name` (line 1075), `label` (line 1076), `description`
   - `agent` param description
   - `SUBAGENT_DISPATCH_PROTOCOL` comment (line 786)
   - New: `isTrellisAgent()` helper — checks `existsSync(.pi/agents/trellis-{agent}.md)`
   - New: validation in `execute` handler using `isTrellisAgent()`

2. **Settings**: `packages/cli/src/templates/pi/settings.json`
   - Remove `packages` array — no longer need to disable pi-subagents (name conflict resolved)

3. **Tests** (3 files):
   - `packages/cli/test/templates/pi.test.ts` line 111 + pi-subagents assertion
   - `packages/cli/test/configurators/platforms.test.ts` line 801 + pi-subagents assertion
   - `packages/cli/test/regression.test.ts` line 5057

### NOT affected

- `inject-subagent-context.py` — checks platform-native tool names (Cursor's "Subagent", etc.), not Pi extension tools
- Other platform templates (claude/cursor/codex/etc.) — have their own agent dispatch mechanisms

## Requirements

1. Rename tool from `subagent` to `trellis_subagent`
2. Restrict to agents with a valid `trellis-*` definition file in `.pi/agents/`. File-exists check, not a hardcoded allowlist. Future `trellis-review` etc. auto-qualify.
3. When `trellis-{agent}.md` does not exist, stop with error + guidance to use community packages

## Decisions

1. **Hard stop**: execute returns error text when `trellis-{agent}.md` doesn't exist in `.pi/agents/`. AI sees error → switches to community tool.

2. **Static guidance**: error lists both community tool names (`subagent` from nicobailon/pi-subagents, `Agent` from tintinweb/pi-subagents). AI will try whichever is installed. If neither, AI abandons sub-agent use.

3. **Label**: `"Trellis Subagent"` — clear differentiation from community `"Subagent"`.

4. **File-exists gate, not allowlist**: validation checks `existsSync(.pi/agents/trellis-{agent}.md)`. Future `trellis-*` agents auto-qualify with zero code change.

## Acceptance Criteria

- [ ] Tool registered as `name: "trellis_subagent"`, `label: "Trellis Subagent"`
- [ ] `agent` param description shows any `trellis-*` agent with a definition file
- [ ] Agent validation: `trellis-implement.md`, `trellis-check.md`, `trellis-research.md` all pass (exist → proceed)
- [ ] Agent validation: non-existent `trellis-xxx` → execute returns error text listing community alternatives
- [ ] Shorthand names (`"implement"`, `"check"`, `"research"`) still work (via `normalizeAgentName`)
- [ ] 3 test assertion lines updated: `'name: "subagent"'` → `'name: "trellis_subagent"'`
- [ ] Existing related tests still pass (extension structure, Pi events, bash injection, etc.)
- [ ] `SUBAGENT_DISPATCH_PROTOCOL` comment updated to reference `trellis_subagent`

## Out of Scope

- Adding `research.jsonl` — research agent discovers files at runtime, no curated context needed
- Updating `inject-subagent-context.py` — that hook handles platform-native tools, not Pi extension tools
- Dynamic detection of community package installation
- Other platform templates (Claude/Cursor/Codex/etc.) — each has own agent dispatch mechanism

## Manual Verification (post-build)

```bash
# 1. Build and link
cd /home/shane/mycode/Trellis
npm run build
npm link

# 2. Create test repo
mkdir -p /tmp/test-trellis-subagent && cd /tmp/test-trellis-subagent

# 3. Init Trellis with Pi
trellis init --pi -y -f --overwrite -u testing

# 4. Create a test task
python3 ./.trellis/scripts/task.py create "Test subagent rename" --slug test-subagent

# 5. Install community subagent package (registers `Agent` tool)
pi install -l npm:@tintinweb/pi-subagents

# 6. Test scenarios (via pi conversations)
```

| # | Scenario | Expected |
|---|----------|----------|
| 6a | `trellis_subagent(agent="implement", prompt="...")` | Works — spawns trellis-implement with task context |
| 6b | `trellis_subagent(agent="check", prompt="...")` | Works — spawns trellis-check with task context |
| 6c | `trellis_subagent(agent="research", prompt="...")` | Works — spawns trellis-research |
| 6d | `trellis_subagent(agent="custom-agent", prompt="...")` | Hard stop — error text lists community `subagent` / `Agent` alternatives |
| 6e | AI given task "write a function", AI uses `Agent` tool | `Agent` tool handles it normally (community package) |
| 6f | `trellis_subagent` injects task context (prd.md etc.) | Sub-agent prompt contains "## Trellis Task Context" |
| 6g | Main session chat history does NOT leak into sub-agent | Sub-agent gets clean prompt: agent definition + task context + delegated task |
| 6h | Main agent receives sub-agent output | `execute` returns `{ content: [{ type: "text", text: <subagent output> }] }` |
