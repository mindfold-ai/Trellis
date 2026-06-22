# agentCapable && !hasHooks 平台 trellis-start 适配 + workflow.md 平台矩阵补全

## Background

`packages/cli/src/configurators/shared.ts` 的 `filterCommands(ctx)` 当前规则：
```
if (ctx.agentCapable) return templates.filter(t => t.name !== "start");
```
设计前提是「agent-capable 平台都靠 SessionStart 类 hook 自动注入开场上下文，所以 user-facing `start` 命令/skill 冗余」。

此前提**对 `agentCapable && hasHooks` 平台成立**（Claude / Cursor / Kiro / Gemini / Qoder / CodeBuddy / Copilot / Droid / Pi），**对 `agentCapable && !hasHooks` 平台不成立**：

- **Codex**：通过专属 helper `resolveTrellisStartSkill`（原名 `resolveCodexTrellisStartSkill`）单独把 start 包成 `trellis-start` skill 塞回 `.agents/skills/`，绕开 filter。
- **ZCode**：本会话刚补了同形态调用（未 commit）；外部用户反馈 `trellis init --zcode` 后既找不到 `/trellis:start` 也找不到 `trellis-start` skill，这是触发本任务的原始反馈。
- **Reasonix**：configurator 注释明说"`/skill trellis-start` 可调用"但 `resolveAllAsSkills(ctx)` 同样被 filter 干掉，**注释与行为不一致，是 bug**。
- **OpenCode**：`.opencode/commands/trellis/` 走 `resolveCommands(ctx)` 也被 filter，用户无 `/trellis:start`。注意：OpenCode 实际上**有** `plugins/session-start.js` + `inject-workflow-state.js` plugin 等价于 hook 注入机制，registry 里的 `hasHooks=false` 是命名口径偏窄（指 SessionStart-style hook protocol，不指 plugin 注入）造成的；R1 后多写一份 user-invocable `start.md` 是冗余但安全，**不**建议改 `hasHooks` 字段。

另：`packages/cli/src/templates/trellis/workflow.md` 中所有按平台分支的 block（共 **13 处**：12 个 bracket block + 1 处 line 186 散文枚举），**完全没列 zcode / reasonix**。这两个平台用户读 workflow.md 时找不到对应分支提示。

完整调研结论见 `.trellis/tasks/06-22-platform-start-skill-coverage/research/`（8 篇维度报告 + summary）。

## Goal

根因修复 + 文档矩阵补全：让所有 `agentCapable && !hasHooks` 平台与所有已注册平台在「start skill 可用性」和「workflow.md 平台分支归属」两件事上一致正确，并删掉为绕过 bug 而存在的临时 helper。

## Requirements

### R1：`filterCommands` 根因修

`packages/cli/src/configurators/shared.ts` 的 `filterCommands`：
```
if (ctx.agentCapable && ctx.hasHooks) return templates.filter(t => t.name !== "start");
return templates;
```

效果：`agentCapable && !hasHooks` 平台（Codex / ZCode / OpenCode / Reasonix）自动获得 `trellis-start` skill 与 `start.md` slash command（按各平台输出路径），无需专属 helper。

同步更新 `filterCommands` 上面的 JSDoc，注明"strip 仅在 hook 平台启用；no-hook 平台靠 user-invocable start 兜底"。

### R2：删除 `resolveTrellisStartSkill` helper 与其全部调用点

- `packages/cli/src/configurators/shared.ts`：删除 `resolveTrellisStartSkill` 函数（约行 449-475）。
- `packages/cli/src/configurators/codex.ts`：删除该 import 及 `configureCodex` 内的调用块（约行 42-60）。
- `packages/cli/src/configurators/index.ts`：删除该 import 及 `codex.collectTemplates` 内的调用块（约行 224-233）。
- `packages/cli/src/configurators/zcode.ts`：删除本会话新加的两处调用（init 路径 + collect 路径）及 import。
- 不必删除任何测试——`resolveTrellisStartSkill` / `resolveCodexTrellisStartSkill` 无专门 unit test（调研维度 6 确认）。
- 兜底：实施完后跑 `grep -rn 'resolveTrellisStartSkill\|resolveCodexTrellisStartSkill' packages/cli/src/` 确认无遗留引用（changelog 历史 JSON 里允许保留）。

### R3：workflow.md 平台矩阵补全

`packages/cli/src/templates/trellis/workflow.md` 共 13 处编辑点。zcode / reasonix 归属规则：

**通用 sub-agent dispatch 类**（routing / research / configure / criteria / check）—— 加 `ZCode, Reasonix`：
- B1 (line 275/281)：Active Task Routing — sub-agent 列表
- B3 (line 356/364)：Phase 1.2 Research — sub-agent 列表
- B5 (line 383/426)：Phase 1.3 Configure context (curate jsonl)
- B7 (line 459/463)：Phase 1.5 Completion criteria
- B12 (line 527/541)：Phase 2.2 Quality check
- line 186 散文：`..., Pi (sub-agent-dispatch ...)` → `..., Pi, ZCode, Reasonix (sub-agent-dispatch ...)`

**Phase 2.1 implement 的 class-2 pull-based 段**（与 codex-sub-agent 同类）—— 改 B9：
- B9 (line 487/499) `[codex-sub-agent]` → `[codex-sub-agent, ZCode, Reasonix]`
  理由：zcode 走 `applyPullBasedPreludeMarkdown(getAllAgents())`，reasonix 不走 prelude 但通过 `runAs: subagent` skill spawn 隔离 loop，二者都需要 main agent 显式传 `Active task:` prefix（=class-2 pull-based 行为），和 codex-sub-agent 同档。

**Phase 2.1 implement 的 hook-driven 段（B8）—— 不加 zcode / reasonix**：
- B8 (line 473/485) `[Claude Code, Cursor, OpenCode, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]` **保持不变**
- 理由：B8 内容说"platform hook/plugin auto-handles: reads implement.jsonl and injects ..."，对 zcode / reasonix（pull-based）**不成立**，强行加进去会给用户传错信息。
- 注：OpenCode 在 B8 内是因为它 plugin 真的 auto-handles，与 hasHooks=false 的 registry 标签无关。

**inline 类 block 保持不变**（B2 / B4 / B6 / B11 / B13）—— 不加 zcode / reasonix（二者非 inline 平台）。

**B10（`[Kiro]` 独立段）保持不变**。

### R4：测试与 verify

#### R4.1 现有断言更新（已确认的唯一改动）
- `packages/cli/test/configurators/platforms.test.ts:295` 附近——去掉数组末尾的 `, "trellis-start"`（R1 后 codex 的 `.agents/skills/` 也通过 `resolveAllAsSkillsNeutral` 自然产出，断言列表不再需要单列）。

#### R4.2 新增断言测试（防回归）
为 zcode / opencode / reasonix 各在 `packages/cli/test/commands/init.integration.test.ts`（或就近的 platforms 测试文件）加一条 assertion，确认 init 后存在：
- zcode：`.agents/skills/trellis-start/SKILL.md` 与 `.zcode/commands/trellis/start.md`
- opencode：`.opencode/commands/trellis/start.md`
- reasonix：`.reasonix/skills/trellis-start/SKILL.md`

（codex 已有覆盖；R4.2 把"四个平台中三个没断言"的回归窗口堵上。）

#### R4.3 全局校验
- `pnpm --filter @mindfold/trellis test` 全绿
- `pnpm --filter @mindfold/trellis exec tsc --noEmit` 无错
- 手工 verify：临时目录跑 `trellis init -u test --codex` 与 `--zcode`，分别 `cat` 出 `.agents/skills/trellis-start/SKILL.md` 验内容字节一致（byte-identity）
- 同目录 `trellis update` 应**无 diff**（byte-identity 已在调研维度 7 端到端验证：同模板 + 同 resolver + 同 wrapper），不应误报 user-modified

### R5：commit & changelog

- 单个 commit，包含所有上述改动。
- commit message 引用：(a) 本任务 dir `.trellis/tasks/06-22-platform-start-skill-coverage/`；(b) 外部用户反馈背景（zcode init 后缺 start）；(c) 净效果是删代码（helper + 三处调用块）+ 矩阵补全。
- migration manifest **不必新建**：
  - codex / zcode 的 `trellis-start` 内容 R1 前后 byte-identical（同模板 `common/commands/start.md` + 同 `resolvePlaceholdersNeutral` + 同 `wrapWithSkillFrontmatter`），update 路径无 spurious diff
  - opencode / reasonix 是首次新增文件，无 modify 冲突
  - 旧用户 `trellis update` 会自然看到 opencode / reasonix 新增的 start 文件，对应增量是友好补全，无破坏性

## Out of Scope

- 不改 OpenCode 的 sub-agent / hook 架构，只确保 `start` 被产出。
- 不修 registry 的 `hasHooks=false`（opencode 有 plugin 注入但词义偏窄是另一个话题，本任务不做正名）。
- 不动 `.trellis/workflow.md`（rendered output；本任务只改源模板 `packages/cli/src/templates/trellis/workflow.md`，等 `trellis update` 自动传播）。
- 不动 `.trellis/spec/` 文档。
- 不动 codex 历史 changelog `migrations/manifests/0.5.7.json`（冻结）。
- 不为 zcode / reasonix 加 SessionStart-style hook（codex 当年移除 SessionStart 是 `fork_turns` 继承导致的 codex-specific de-recursion 问题，不影响其他平台的可能性；但加 hook 是更大范围的架构变更，超出本任务）。

## Acceptance Criteria

- [ ] `filterCommands` 改为 `agentCapable && hasHooks` 才过滤 `start`，JSDoc 同步更新
- [ ] `resolveTrellisStartSkill` helper 及其在 codex.ts / index.ts / zcode.ts 的全部调用点已删除；`grep -rn 'resolveTrellisStartSkill\|resolveCodexTrellisStartSkill' packages/cli/src/` 无命中（changelog 历史 JSON 除外）
- [ ] `packages/cli/src/templates/trellis/workflow.md` 13 处编辑点按 R3 规则更新（含 B9 升级 + B8 保持原样 + line 186 散文）
- [ ] `platforms.test.ts:295` 附近的 `, "trellis-start"` 已去掉
- [ ] zcode / opencode / reasonix 三个平台各自的 start 输出在 init.integration 测试里有断言
- [ ] `pnpm --filter @mindfold/trellis test` 全绿，typecheck 无错
- [ ] 手工 verify：在临时目录 init codex 与 zcode，两者 `.agents/skills/trellis-start/SKILL.md` 字节一致；再跑 update 无 spurious diff
- [ ] Single commit，message 引用外部用户反馈与本 task（不带任何真实姓名）

## Notes

- **Ponytail 净效果**：删 helper + 三处调用块 + 一个 stale 断言，**删代码**而非加代码；workflow.md 是 doc 补全；唯一加代码的是 R4.2 的三条新断言测试（防回归必要）。
- **R1 风险面**：判定条件**只收紧不放宽**（`agentCapable` → `agentCapable && hasHooks`），9 个 hasHooks=true 平台仍被 filter，行为不变；只纠正 4 个被误伤的。
- **byte-identity 已端到端验证**（调研维度 7）：codex/zcode 的 `.agents/skills/trellis-start/SKILL.md` 在 R1 前后字节一致，因为：同模板源（`common/commands/start.md`）+ 同 resolver (`resolvePlaceholdersNeutral`) + 同 wrapper (`wrapWithSkillFrontmatter`)。`trellis update` 无误报。
- **codex de-recursion 担忧**不传染：codex 当年移除 SessionStart hook 是 `fork_turns` 继承导致的 codex-specific 问题，zcode/opencode/reasonix 未来想加 hook 不受此限制。
- **完整 research 索引**：`research/00-summary.md`。每篇维度报告末尾都有"Implications for PRD"段，本 PRD 已吸纳。
