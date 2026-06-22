# 02 — start 模板语义 + 各平台调用方式

- **Query**: start 模板做什么；4 个 `agentCapable && !hasHooks` 平台 R1 后用户怎么调它
- **Scope**: internal + historical
- **Date**: 2026-06-22

## start 模板语义（`packages/cli/src/templates/common/commands/start.md`）

四步流程，给"没有 SessionStart hook 的平台"在用户首次发消息时手动加载会话上下文：

1. 跑 `{{PYTHON_CMD}} ./.trellis/scripts/get_context.py` — 输出 identity / git status / current task / journal location
2. 跑 `... get_context.py --mode phase` — Phase Index、triage rules、planning artifact contract
3. 跑 `... get_context.py --mode packages` + cat `spec/guides/index.md` 与各 `spec/<package>/<layer>/index.md`
4. 根据当前 task 状态决定下一步动作（routes to brainstorm / phase step / asks for task creation consent）

模板里只有两种 placeholder：`{{PYTHON_CMD}}` 和 `{{CLI_FLAG}}`（步骤 2.1 调用示例处）。**不使用 `{{CMD_REF}}`，所以 cmdRefPrefix 在不同平台不影响 start 内容**。

## R1 后用户调用方式（按平台）

| 平台 | R1 后 start 出现位置 | 用户怎么调用 | 是否已经存在替代渠道 |
|---|---|---|---|
| codex | `.agents/skills/trellis-start/SKILL.md` | `$trellis-start`（codex 用 `$skill-name` 语法） | **是**：`inject-workflow-state.py` 的 `CODEX_NO_TASK_BOOTSTRAP_NOTICE` 在 no_task 状态会注入 `<trellis-bootstrap>` 块指示 AI 读 `trellis-start` skill |
| zcode | `.agents/skills/trellis-start/SKILL.md` | `$trellis-start`（zcode templateContext.cmdRefPrefix=`/trellis:`，但 skill 实际通过 zcode 的 skill picker 调用，名字是 `trellis-start`） | **否**：zcode 不 bundle `inject-workflow-state.py`，hooks 为空，session-start 无任何注入。完全靠 user-invocable |
| opencode | `.opencode/commands/trellis/start.md` | `/trellis:start`（opencode slash command，按目录 `.opencode/commands/trellis/<name>.md` → `/trellis:<name>`） | **部分**：opencode 有 `plugins/session-start.js`（chat.message hook，effectively a SessionStart）已经会注入 `buildSessionContext`；但 registry 标 hasHooks=false 表示"没有 Python 共享 hook"。详见维度 4 |
| reasonix | `.reasonix/skills/trellis-start/SKILL.md` | `/skill trellis-start`（reasonix templateContext.cmdRefPrefix=`/skill trellis-`；其 configurator 注释直接说"`/skill trellis-start` 可调用"） | **否**：reasonix 没有 session-start 等价物 |

## Codex 历史：SessionStart hook 被移除的"de-recursion"考量

证据：`packages/cli/src/migrations/manifests/0.5.7.json` 提到 0.5.5 "removed the SessionStart injection vector"（详见 changelog 中的 #240/#241 描述）。`packages/cli/src/configurators/codex.ts:42-47` 注释亦确认。

具体原因（在 0.5.7 manifest 内说明）：codex 的 SessionStart 注入路径会被 sub-agents 继承，导致 `spawn_agent` / `wait_agent` 死循环。结构性修复是关 `multi_agent` feature flag 并删 SessionStart hook，改为靠 `inject-workflow-state.py` 在 UserPromptSubmit 时注入 `<trellis-bootstrap>` 提醒 AI 读 trellis-start。

### 是否适用于 zcode/opencode/reasonix？

- **opencode**：opencode 有自己的 plugin 机制和 `isTrellisSubagent` 检查（plugins/session-start.js:49-52）专门跳过 sub-agent turns。所以 opencode 没有 codex 的 fork_turns 继承问题；plugin 仍然能用。
- **zcode**：zcode 完全不 bundle 任何 hook。**未来要不要加 SessionStart hook** 是另一个 issue；本任务只确保 user-invocable 的 trellis-start 存在。zcode 的 sub-agent 走 `.zcode/cli/agents/` + pull-based prelude（class-2 模型），所以即便加 SessionStart 也要照搬 opencode 的 sub-agent 跳过逻辑。
- **reasonix**：reasonix 是 skill-only 模型，没有 hook 概念；其 sub-agent 走 `runAs: subagent` skill frontmatter 隔离。也没有 codex 的 fork_turns 问题。但 reasonix 平台本身是否支持 hook 我没找到 evidence，本任务范围内不关心。

**结论**：codex 的 de-recursion 担忧**只针对 codex 自身的 fork_turns 行为**，不自动传染给 zcode/opencode/reasonix。本任务范围内（R1 + R2 + R3）不需要为这三家加 hook，只补 user-invocable start 即可。

## Implications for PRD

- PRD 已经在 R1/R2 中假设"R1 后用户能通过 user-invocable 的 start skill / command 调用"，与本节结论一致。
- 但 PRD 没明说 **codex 的 `<trellis-bootstrap>` 注入仍然依赖 `trellis-start` skill 存在**——R1 改完后这个依赖关系仍然成立，只是供给路径从 `resolveTrellisStartSkill` 变成 `resolveAllAsSkillsNeutral`，**byte-identical**（见维度 7）。可在 R2 删除 helper 前确认这条契约不被破坏，建议 PRD 加一句 "R1 后 codex 的 `<trellis-bootstrap>` notice 仍然能解析到同一份 SKILL.md"。
- PRD 未提 opencode plugin 的 session-start.js 实际等价于 hook 的事实——见维度 4，建议把 opencode 标为"已有 plugin-level session inject + R1 后还多一个 user-invocable `/trellis:start`，两者协同非冲突"。
