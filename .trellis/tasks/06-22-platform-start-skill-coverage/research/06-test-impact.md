# 06 — 测试影响面

- **Query**: R1 + R2 之后哪些测试断言会变；resolveTrellisStartSkill / resolveCodexTrellisStartSkill 是否有专门测试
- **Scope**: internal
- **Date**: 2026-06-22

## grep 结果（全工程范围）

`grep -rn "trellis-start" packages/cli/test/`：

| 文件 | 行号 | 现状断言 | R1+R2 后行为 | 需要改吗 |
|---|---|---|---|---|
| `test/configurators/index.test.ts` | 73 | `isManagedPath(".devin/workflows/trellis-start.md") === true` | 不受 R1 影响（devin 是 agentCapable=false 永远有 start） | 不需改 |
| `test/configurators/index.test.ts` | 145 | Windows 路径同上 | 同上 | 不需改 |
| `test/configurators/index.test.ts` | 413 | `result?.has(".pi/prompts/trellis-start.md") === false` | pi 是 agentCapable=true && hasHooks=true → R1 后仍 filter | 不需改 |
| `test/configurators/platforms.test.ts` | 280-307 | codex 写 shared skills 包含 trellis-start：`actualNames === [...expected.map(s => s.name), ...BUNDLED_SKILL_NAMES, "trellis-start"].sort()` | **需要改**——R1 后 `expected` (即 `resolveAllAsSkillsNeutral(...)`) 会自然包含 trellis-start，再 append 额外的 `"trellis-start"` 会让数组有重复 → `.toEqual` 失败 | 改：删除末尾的 `, "trellis-start"` |
| `test/configurators/platforms.test.ts` | 637 | qoder 测试 `actualSkillDirs).not.toContain("trellis-start")` | qoder 是 agentCapable && hasHooks → R1 后仍 filter | 不需改 |
| `test/configurators/platforms.test.ts` | 939 | pi 测试 `.pi/prompts/trellis-start.md` 不存在 | pi 仍 filter | 不需改 |
| `test/configurators/platforms.test.ts` | 1050 | pi collectTemplates 不含 `.pi/prompts/trellis-start.md` | pi 仍 filter | 不需改 |
| `test/commands/init.integration.test.ts` | 208-212 | codex init 后 `.agents/skills/trellis-start/SKILL.md` 存在 | R1 后仍存在（由 resolveAllAsSkillsNeutral 产出） | 不需改 |
| `test/commands/init.integration.test.ts` | 296-301 | kiro init 后 trellis-start skill **不**存在 | kiro 仍 filter | 不需改 |
| `test/commands/init.integration.test.ts` | 339, 353 | devin 写 trellis-start.md | 不受 R1 影响 | 不需改 |
| `test/commands/init.integration.test.ts` | 524 | pi 没有 trellis-start prompt | pi 仍 filter | 不需改 |

## 是否有专门测试 `resolveTrellisStartSkill` / `resolveCodexTrellisStartSkill`？

`grep -rn "resolveTrellisStartSkill\|resolveCodexTrellisStartSkill" packages/cli/test/`：**0 hit**。

→ 无单独的 unit test。该 helper 被间接覆盖（通过 codex 的 `configurePlatform('codex')` 集成测试 verify `.agents/skills/trellis-start/SKILL.md` 存在）。R2 删除 helper 时不需要同时删测试。

## R1 后新增 zcode / opencode / reasonix start 输出的测试需求

PRD R4 acceptance criteria 写"手工 verify 至少一种平台路径形态，其余看测试断言"。但目前 **zcode / opencode / reasonix 都没有任何 start 相关的断言**。如果完全靠手工 verify，未来回归很容易丢。

建议（PRD 修订点）：
- 在 `test/commands/init.integration.test.ts` 中加：
  - `#3* zcode platform writes trellis-start skill` → assert `.agents/skills/trellis-start/SKILL.md` 存在
  - `#3* opencode platform writes start slash command` → assert `.opencode/commands/trellis/start.md` 存在（同时 sanity: `.opencode/commands/trellis/finish-work.md` 仍存在）
  - `#3* reasonix platform writes trellis-start skill` → assert `.reasonix/skills/trellis-start/SKILL.md` 存在 + 不含 `runAs: subagent`（lock-in 维度 5 的结论）
- 或在 `test/configurators/platforms.test.ts` 中扩展现有 `configurePlatform(...)` 测试

## regression.test.ts 影响

`grep -n "filterCommands\|agentCapable\|hasHooks" test/regression.test.ts`：只有 4327-4328 行检查 pi 的 templateContext flags，与 R1 无关。

没有专门 regression 测试针对 filterCommands 当前的 `agentCapable` 单一条件。R1 后建议加一条 regression（PRD 没要求，但有助于防止再次回退）：

```
[platform-start-coverage] agentCapable && !hasHooks platforms get trellis-start
```

## 还有别的 trellis-start 引用吗

`grep -rn "trellis-start" packages/cli/src/` 之外的：
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py:67` — `CODEX_NO_TASK_BOOTSTRAP_NOTICE` 引用 trellis-start skill 名。R1 后 skill 还在，引用仍有效。
- `packages/cli/src/migrations/manifests/0.5.7.json` 注释里 — 历史 changelog，冻结。
- `packages/cli/dist/**` — 编译产物，不动。
- `packages/cli/coverage/**` — coverage 输出，不动。

## Implications for PRD

- PRD R4 已经覆盖"全部测试通过 + 手工 verify 四平台"，但**漏了一处必改测试**：`platforms.test.ts:280-307`。建议 PRD 显式列出"需要更新 platforms.test.ts:295 移除末尾 `, 'trellis-start'`"作为 R2 的子项。
- 建议 PRD 新增 R4.1（或扩 R4）：为 zcode / opencode / reasonix 各加一条 start 输出断言，避免靠纯手工 verify。
- R2 删 helper 时不需要同时删测试（无单测）。
