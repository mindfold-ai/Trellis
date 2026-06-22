# 04 — OpenCode 深挖

- **Query**: opencode 的 hook / plugin / SessionStart 等价物全貌；R1 后写 start.md 是否符合 opencode 调用约定
- **Scope**: internal
- **Date**: 2026-06-22

## OpenCode init 时写哪些文件

`configureOpenCode(cwd)`（`packages/cli/src/configurators/opencode.ts`）走两步：

1. `walkOpenCodeTemplateDir()`：扫描 `packages/cli/src/templates/opencode/` 整棵树（排除 `.d.ts` / `.js.map` / `bun.lock` / `__pycache__` / `node_modules` / `.gitignore`），按相对路径写到 `.opencode/`。
2. 追加：
   - `resolveCommands(ctx)` → `.opencode/commands/trellis/<name>.md`（**R1 受影响处**——当前 filterCommands 把 start 拿掉）
   - `collectSkillTemplates(".opencode/skills", resolveSkills(ctx), resolveBundledSkills(ctx))` → `.opencode/skills/trellis-<auto>/SKILL.md`（注意 `resolveSkills` 走 `getSkillTemplates()`，**不**经 filterCommands，所以这里和 start 无关）

## `.opencode/` 下的 hook / plugin / SessionStart 等价物

OpenCode 模板树（`packages/cli/src/templates/opencode/`）含：

```
agents/
lib/
  session-utils.js
  trellis-context.js
plugins/
  session-start.js
  inject-workflow-state.js
  inject-subagent-context.js
package.json
```

三个 JS plugin 都是 OpenCode 的 plugin 系统加载（`package.json` 声明 `@opencode-ai/plugin` 依赖）。每个 plugin 都是 factory function (`export default async ({ directory, client }) => ...`)。

| Plugin | 触发时机 | 作用 |
|---|---|---|
| `session-start.js` | `chat.message` event（用户每次发消息进来时；plugin 在第一次时把 context inject 进 message text part，并标记 sessionID processed） | **等价于 SessionStart hook**：注入 identity / git / tasks / journal 等会话上下文 |
| `inject-workflow-state.js` | 每次 `chat.message` | **等价于 UserPromptSubmit hook**：从 `.trellis/workflow.md` 的 `[workflow-state:STATUS]` block 解析出 breadcrumb 并注入 |
| `inject-subagent-context.js` | `tool.execute.before`（parent 准备 spawn sub-agent 时） | sub-agent context push 注入 |

## OpenCode hasHooks=false 是否需要纠正？

`AI_TOOLS.opencode.templateContext.hasHooks = false` (`packages/cli/src/types/ai-tools.ts:186`)。

但事实上 opencode 有完整的 plugin 等价 hook 链路。registry 标 `hasHooks=false` 应理解为：
- "不使用 Trellis bundle 的 Python shared-hooks (`packages/cli/src/templates/shared-hooks/`)"
- "OpenCode 用自己的 JS plugin 系统替代"

这是 **registry 词义模糊**导致的次生 bug 源头：`filterCommands` 用 `ctx.hasHooks` 做"是否需要 user-facing start"的判定，对 opencode 来说语义错配——opencode 实际上有 session-start.js plugin 已经注入了开场上下文，**不需要**再多一个 `/trellis:start` slash command 也能工作。

但只要 R1 不破坏现有 plugin 注入，多一份 user-invocable start 没有副作用（只是冗余）。OpenCode 实际是"hook 充足 + 多个 user-facing fallback"，相对 zcode/reasonix（hook 缺失 + 完全依赖 user-invocable）是不同的处境。

## R1 后 `.opencode/commands/trellis/start.md` 是否符合 OpenCode 调用约定？

OpenCode slash command 约定（从现有模板观察）：
- 目录 `.opencode/commands/trellis/<name>.md` → 用户输入 `/trellis:<name>` 触发
- 当前 init 后已有 `.opencode/commands/trellis/continue.md`、`finish-work.md`（因为 `resolveCommands` 输出这两个）
- R1 后再加 `start.md` → 用户能用 `/trellis:start`

约定上 **符合**。验证方法：跑 `trellis init -u test --opencode` 后看 `.opencode/commands/trellis/` 是否同时含 continue/finish-work/start.md。

## OpenCode 是否需要修改 hasHooks 字段？

不建议改。理由：
1. 改 hasHooks=true 会让 filterCommands 反向 filter 掉 start（即 R1 前后行为又翻回原样）——抵消本任务目标。
2. registry 字段语义是"Trellis-bundle Python shared-hooks 是否安装"，opencode 用自家 JS plugin → 字段值合理。
3. opencode 已经有完整 plugin 链路，R1 后多写 user-facing start.md 是冗余但安全。

## Implications for PRD

- PRD Background 把 OpenCode 描述为 "待 verify——`.opencode/commands/trellis/` 走 `resolveCommands(ctx)` 也被 filter；它无 SessionStart hook，用户没有 `/trellis:start`"。本节 verify 结果：
  - "被 filter 掉" ✅ 正确
  - "无 SessionStart hook" ❌ **不准确**——它有 `plugins/session-start.js`，等价 SessionStart hook，已经能注入开场上下文
  - "用户没有 `/trellis:start`" ✅ 正确（slash command 没有，但 session-start plugin 替代了用户主动调用）
- 建议 PRD 修订 OpenCode 一段：明说 opencode 已有 plugin-level 注入，R1 让用户多一个 user-invocable 兜底（同时为 plugin 失败 / 用户主动重新加载场景留口子），不与现有机制冲突。
- PRD 现有 acceptance criteria "跑 `trellis init` 在 codex / zcode / opencode / reasonix 四个平台分别产出 trellis-start skill / start command"对 opencode 是正确的（写 command 而非 skill）。无需改动 acceptance。
