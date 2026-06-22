# 00 — Research Summary

- **Task**: `06-22-platform-start-skill-coverage`
- **Date**: 2026-06-22
- **Scope**: 8 维度调研，验证 PRD 提出的 R1（filterCommands 根因修）+ R2（删 helper）+ R3（workflow.md 矩阵补全）+ R4/R5 的事实面与风险面

## 每维度一句结论

1. **`filterCommands` fan-out 全图** (`01-`) — PRD 的根因定位准确；R1 后只影响 4 个 `agentCapable && !hasHooks` 平台（codex, zcode, opencode, reasonix），其余 12 平台行为不变。
2. **start 模板语义 + 调用方式** (`02-`) — start 模板只用 `{{PYTHON_CMD}}` + `{{CLI_FLAG}}`，跨平台渲染安全；codex 的 `<trellis-bootstrap>` 注入依赖 trellis-start skill 存在的契约 R1 后仍成立；codex 的"de-recursion"担忧不传染给其他三家。
3. **workflow.md 平台 block 盘点** (`03-`) — 共有 **13 个编辑点**（不是 PRD 预估的 8+ 个），其中 B8 (Phase 2.1 implement 普通 sub-agent block) **不应**加 zcode/reasonix（描述说"hook auto-handles"，对 pull-based 平台不适用），应改加进 B9 (`[codex-sub-agent]`)。
4. **OpenCode 深挖** (`04-`) — OpenCode 实际上有 `plugins/session-start.js` + `inject-workflow-state.js` 等价于 hook，`hasHooks=false` 是 registry 词义模糊导致；R1 后多写一份 user-invocable start.md 是冗余但安全；**不建议**改 hasHooks 字段。
5. **Reasonix runAs:subagent** (`05-`) — R1 后 trellis-start 以普通 skill 形式写入 `.reasonix/skills/`，与 `runAs: subagent` 的 trellis-check / trellis-implement **不冲突**（agentNames filter 只挡 implement/check，不挡 start）。
6. **测试影响面** (`06-`) — 只有一处测试断言需要改：`platforms.test.ts:280-307`（去掉末尾的多余 `, "trellis-start"`）；其余 11 处 trellis-start 引用都不受影响；`resolveTrellisStartSkill` 无专门 unit test，R2 删除时不需删测试；**建议**为 zcode / opencode / reasonix 各加 start 输出断言。
7. **migration / 升级影响** (`07-`) — codex / zcode 的 trellis-start 在 R1 前后 **byte-identical**，`trellis update` 不会误报；opencode / reasonix 是首次新增文件，无 modify 冲突；**不需要 migration manifest**（PRD 判断正确）。
8. **GitNexus impact**（`08-`） — index stale，未实跑 `impact()`，但 grep 等价分析显示 risk MEDIUM（条件只收紧不放宽），byte-identity 保护已足够；建议 implement agent 跑一次全仓 grep `resolveTrellisStartSkill|resolveCodexTrellisStartSkill` 兜底。

## 对 PRD 的修订建议（按优先级排）

### 高（影响 acceptance / 范围正确性）

1. **R3 数字与归类**：PRD 说"影响范围预估 8+ 处枚举块"——实际 **13 处**，包括 line 186 散文。建议改为"影响 13 处：B1/B3/B5/B7/B12 各一对（10 行）+ B9 升级一对（2 行）+ line 186 散文 1 行"。
2. **R3 排除 B8**：PRD 表述"归入 `[Claude Code, ... , Pi]` 一类"过于笼统。B8 (line 473-485) 描述"platform hook/plugin auto-handles"，对 zcode/reasonix 不准确，**应排除**。zcode/reasonix 归入 B9 (`[codex-sub-agent]`) 升级为 `[codex-sub-agent, ZCode, Reasonix]`。
3. **R6 测试断言更新点未列**：PRD R4 acceptance 没明说要改 `platforms.test.ts:280-307`，建议加入。

### 中（防回归 / 提升 verify 强度）

4. **新增 R4.x 断言测试**：为 zcode/opencode/reasonix 各加一条 init.integration 测试（assert start 文件存在）。PRD 当前依赖纯手工 verify，对四个平台中三个新加路径不够 robust。
5. **OpenCode 描述纠正**：PRD Background 说 opencode "无 SessionStart hook"——**事实不符**。opencode 有 `plugins/session-start.js`。建议改为"opencode 有 plugin-level 等价注入，但 user-invocable `/trellis:start` 仍缺，R1 补"。
6. **byte-identity 显式声明**：PRD Notes 加一句"R1 前后 codex / zcode 的 `.agents/skills/trellis-start/SKILL.md` byte-identical，update 路径无 spurious diff"。

### 低（文档完整性）

7. **codex de-recursion 边界**：PRD 可以注明"codex 的 SessionStart 移除是 fork_turns 继承导致的 codex-specific 问题，不影响 zcode/opencode/reasonix 未来加 hook 的可能"。
8. **R3 包含 line 186 散文**：PRD 只提到 `[bracket]` block，没提散文式枚举行（line 186），需补一条编辑项。
9. **全仓 grep 兜底**：PRD R4 加一条"`grep -rn 'resolveTrellisStartSkill\\|resolveCodexTrellisStartSkill' .` 全仓扫描，确认无 dist/coverage 之外的遗留引用"。

## 关键风险点（PRD 漏掉的）

- **B8 的 "hook auto-handles" 语义**：如果按 PRD R3 原文把 zcode/reasonix 加进所有 sub-agent 类 block，会把 B8 也覆盖到——但 B8 内容里包含"The platform hook/plugin auto-handles: reads implement.jsonl and injects ..."。这对 class-2 pull-based 平台不成立，会给 zcode/reasonix 用户传错信息。**必须**显式排除 B8 或新建独立段。
- **line 186 散文枚举遗漏**：纯文字句子里漏 ZCode/Reasonix 不会被 inject-workflow-state 解析器影响，但用户读 workflow.md 时找不到自己平台名，会误以为不被支持。属"UX 漏洞"但 PRD 未覆盖。
- **测试覆盖不足**：四个新覆盖平台中三个（zcode / opencode / reasonix）没有任何 start 输出断言，纯手工 verify 易回归。

## 调研未覆盖（task scope 之外）

- 没动 `.trellis/workflow.md` rendered output，按 PRD Out of Scope 处理
- 没动 `.trellis/spec/`
- 没跑 GitNexus `impact()` MCP 工具（index stale + grep 已足够）
- 没尝试为 zcode/reasonix 加 hook（PRD Out of Scope）
