# 01 — `filterCommands` fan-out 全图

- **Query**: 列出 `filterCommands` 所有调用链 + 现行 vs R1 后每个平台 start 输出位置
- **Scope**: internal
- **Date**: 2026-06-22

## `filterCommands` 直接调用点（in `packages/cli/src/configurators/shared.ts`）

| 函数 | shared.ts 行号 | 调用 filterCommands 时的命名空间转换 |
|---|---|---|
| `resolveAllAsSkills(ctx)` | 354–366 | 输出 `trellis-<name>` SKILL.md（普通 placeholders） |
| `resolveCommands(ctx)` | 374–379 | 输出 `<name>` 纯命令文件（无 frontmatter wrap） |
| `resolveAllAsSkillsNeutral(ctx)` | 419–433 | 输出 `trellis-<name>` SKILL.md（neutral placeholders） |

注：`resolveSkills(ctx)` / `resolveSkillsNeutral(ctx)` 只接 `getSkillTemplates()`（即 `common/skills/` 下 auto-triggered 的 skills），**不经 filterCommands**，所以 start 不会从那里出现。

## 上游调用者（按平台分组，从 `packages/cli/src/configurators/`）

| 平台 | configurator 文件 | 调用的解析器 | 当前 (filterCommands `agentCapable`) 行为 |
|---|---|---|---|
| claude-code | claude.ts:135,142 | resolveCommands + resolveSkills | start filtered |
| cursor | cursor.ts:30,39 | resolveCommands + resolveSkills | start filtered |
| opencode | opencode.ts:89,94 | resolveCommands + resolveSkills | start filtered |
| codex | codex.ts:38; index.ts:217 | resolveAllAsSkillsNeutral | start filtered（trellis-start 由 `resolveTrellisStartSkill` 单独补） |
| kilo | kilo.ts:21,27 | resolveCommands + resolveSkills | agentCapable=false → start kept |
| kiro | kiro.ts:29; index.ts:272 | resolveAllAsSkills | start filtered |
| gemini | gemini.ts:40,50; index.ts:300,309 | resolveCommands + resolveSkillsNeutral | start filtered |
| antigravity | antigravity.ts:21,27 | resolveCommands + resolveSkills | agentCapable=false → start kept |
| devin | devin.ts:21,30 | resolveCommands + resolveSkills | agentCapable=false → start kept |
| qoder | qoder.ts:33,43 | resolveCommands + resolveSkills | start filtered |
| codebuddy | codebuddy.ts:34,40 | resolveCommands + resolveSkills | start filtered |
| copilot | copilot.ts:32,41; index.ts:401,406 | resolveCommands + resolveSkills | start filtered |
| droid | droid.ts:31,37 | resolveCommands + resolveSkills | start filtered |
| pi | pi.ts:26,36,63,74 | resolveCommands + resolveSkills | start filtered |
| reasonix | reasonix.ts:38,70 | resolveAllAsSkills (filtered against agentNames) | start filtered（agentNames 不含 trellis-start，所以 filter 不掉 reasonix 自己的 agent-replace；但 filterCommands 在更上游已经把 start 拿掉了） |
| zcode | zcode.ts:38,55,78; (`resolveCommands` line 55,103) | resolveAllAsSkillsNeutral + resolveCommands | start filtered（trellis-start 由 `resolveTrellisStartSkill` 单独补） |

## 平台矩阵：(agentCapable, hasHooks) × 当前 start 输出 × R1 后 start 输出

| 平台 | agentCapable | hasHooks | 当前 start 输出路径 | R1 后 start 输出路径 |
|---|---|---|---|---|
| claude-code | ✅ | ✅ | （SessionStart hook 注入；filter 掉 start.md / SKILL.md） | 无变化 |
| cursor | ✅ | ✅ | （SessionStart hook 注入；filter 掉） | 无变化 |
| opencode | ✅ | ❌ | **空**（无 hook 也无 start.md/skill；session-start.js plugin 实际有作用但 registry 标 hasHooks=false） | `.opencode/commands/trellis/start.md` |
| codex | ✅ | ❌ | `.agents/skills/trellis-start/SKILL.md`（通过 `resolveTrellisStartSkill` 单独补） | `.agents/skills/trellis-start/SKILL.md`（通过 `resolveAllAsSkillsNeutral` 自然产出，byte-identical） |
| kilo | ❌ | ❌ | `.kilocode/workflows/start.md` | 无变化 |
| kiro | ✅ | ✅ | （SessionStart hook 注入；filter 掉） | 无变化 |
| gemini | ✅ | ✅ | （SessionStart hook 注入；filter 掉） | 无变化 |
| antigravity | ❌ | ❌ | `.agent/workflows/start.md` | 无变化 |
| devin | ❌ | ❌ | `.devin/workflows/trellis-start.md` | 无变化 |
| qoder | ✅ | ✅ | （SessionStart hook 注入；filter 掉） | 无变化 |
| codebuddy | ✅ | ✅ | （SessionStart hook 注入；filter 掉） | 无变化 |
| copilot | ✅ | ✅ | （SessionStart hook 注入；filter 掉） | 无变化 |
| droid | ✅ | ✅ | （SessionStart hook 注入；filter 掉） | 无变化 |
| pi | ✅ | ✅ | （Pi extension session_start 注入；filter 掉） | 无变化 |
| reasonix | ✅ | ❌ | **空**（注释说 `/skill trellis-start` 可用但 filterCommands 干掉了 → 注释/行为不一致） | `.reasonix/skills/trellis-start/SKILL.md` |
| zcode | ✅ | ❌ | `.agents/skills/trellis-start/SKILL.md`（本会话新加的 `resolveTrellisStartSkill` 调用补；未 commit） | `.agents/skills/trellis-start/SKILL.md`（通过 `resolveAllAsSkillsNeutral` 自然产出，byte-identical） |

## Verify：R1 后 9 个 `agentCapable && hasHooks` 平台不会被波及

新条件 `if (ctx.agentCapable && ctx.hasHooks) return filter`。9 个平台 (claude-code, cursor, kiro, gemini, qoder, codebuddy, copilot, droid, pi) 两个标志都为 true，仍命中 filter，start 不会被多写出来。**风险 = 0**，PRD 的风险评估正确。

## Verify：4 个 `agentCapable && !hasHooks` 平台 R1 后都能产出 start

- **codex**：`resolveAllAsSkillsNeutral` 不再 filter `start` → 输出 `trellis-start` SKILL.md（neutral 渲染，与现 `resolveTrellisStartSkill(ctx)` byte-identical，因为后者也走 `resolvePlaceholdersNeutral` + 同 frontmatter wrap）。
- **zcode**：同 codex（也走 `resolveAllAsSkillsNeutral`）。
- **opencode**：`resolveCommands` 不再 filter → 写 `.opencode/commands/trellis/start.md`（无 frontmatter wrap）。
- **reasonix**：`resolveAllAsSkills` 不再 filter → 写 `.reasonix/skills/trellis-start/SKILL.md`（普通 placeholders，cmdRefPrefix=`/skill trellis-`）。`agentNames` filter 只挡 trellis-implement / trellis-check，不挡 trellis-start。

## Implications for PRD

- PRD 现状判断完全准确。无需修订核心方案。
- 但 PRD 表述说"`resolveAllAsSkillsNeutral(ctx)` / `resolveAllAsSkills(ctx)` / `resolveCommands(ctx)` 会自然产出 start"——其中 `resolveAllAsSkills(ctx)` 路径是 reasonix 唯一用户，需要 verify reasonix 的"agentNames 不挡 trellis-start"假设（见维度 5）。
- 字节一致性已确认：codex/zcode 的 trellis-start 在 R1 前后字节相同 → trellis update 不会误报 modify（见维度 7）。
