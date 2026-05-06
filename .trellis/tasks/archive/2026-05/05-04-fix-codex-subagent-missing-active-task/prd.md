# Fix: Class-2 平台子代理拿不到 active task

## Goal

修复 issue #225：在 codex（以及 copilot / gemini / qoder 等 class-2 平台）上，主会话 dispatch `trellis-implement` / `trellis-check` / `trellis-research` 子代理后，子代理跑 `task.py current` 显示 "no active task"，导致 prelude 流程退化为"问用户"，无法自动拉到 task 上下文。

让子代理在 class-2 平台上**有大概率能直接拿到正确的 task 路径**，恢复到与 hook-based 平台（claude / cursor 等）一致的体验。

## What I already know

### 根因链

- 0.5.0-rc 系列的 session-scoped active-task 改造（task `04-21-session-scoped-task-state`）让 active-task 按 session_id 存进 `.trellis/.runtime/sessions/<context-key>.json`
- codex 子代理是 codex 起的新会话，session_id 跟父不一样（或被 codex 抹掉），子代理的 context-key 找不到对应"信箱"，resolver 返回 None
- codex 平台只暴露了 `SessionStart` 和 `UserPromptSubmit` hook 给项目（`packages/cli/src/templates/codex/hooks.json`），`PreToolUse` 只对 Bash 触发 —— 没有任何 hook 时机能让父进程在 spawn 子代理那一刻注入上下文
- 这就是 beta.0 manifest 里写的「class-2 platform 走 pull-based prelude」的由来：codex / copilot / gemini / qoder 共用一个 prelude（`packages/cli/src/configurators/shared.ts:498` `buildPullBasedPrelude`），让子代理自己 `task.py current` 拉
- 而 `task.py current` 在子代理里查不到 session 信箱 → bug

### 为什么 hook-based 平台没事

claude code 有 `PreToolUse(Task)` / `PreToolUse(Agent)` hook（`packages/cli/src/templates/claude/settings.json:42`），主会话 spawn 子代理那一刻 trellis 在父进程跑 `inject-subagent-context.py` 把 task 上下文写进子代理 prompt。这条路在 codex 上不存在。

### 受影响平台清单（4 个）

通过 `applyPullBasedPreludeMarkdown` / `applyPullBasedPreludeToml` 应用 prelude 的平台：

- `codex`（TOML，`packages/cli/src/configurators/index.ts:220`）
- `gemini`（Markdown，`index.ts:291`）
- `qoder`（Markdown，`index.ts:334`）
- `copilot`（Markdown，`index.ts:402` —— reuse Cursor agents）

hook-based 平台（claude / cursor / opencode / kiro / codebuddy / droid）不受影响，本 task 不应该让它们的行为有任何变化。

## Assumptions (validated through prior discussion)

- 主会话进程能正确解析自己的 active task（env 里有 `CODEX_SESSION_ID`，`task.py current` 在主会话里是 work 的）—— 这是整个方案的前提
- AI 大概率会遵循 workflow.md `[workflow-state:in_progress]` 的 per-turn breadcrumb 指令，特别是当指令措辞够硬 + 有反向约束时
- "传 task 路径"比"传 session_id 让子代理回查"少一跳，更稳

## Requirements

### R1. Prompt-protocol 主路（class-2 平台）

主会话 dispatch `trellis-implement` / `trellis-check` / `trellis-research` 时，**dispatch prompt 必须把 active task 路径作为头部一行明文写出**，格式：

```
Active task: <task path, e.g. .trellis/tasks/05-04-fix-codex-subagent-missing-active-task>

<rest of dispatch prompt...>
```

主会话靠 `python3 ./.trellis/scripts/task.py current` 拿路径（已可用）。

子代理 prelude 改为先看 prompt 头部有没有 `Active task: <path>` 行：

- 有 → 直接用这个路径读 prd / implement.jsonl / check.jsonl
- 没有 → fallback 跑 `task.py current --source`
- 还是没有 → 跑单-session 兜底（R3）
- 都失败 → 问用户

### R2. workflow.md 加硬约束

`packages/cli/src/templates/trellis/workflow.md` 的 `[workflow-state:in_progress]` 区块加一条 sub-agent dispatch protocol：

> When you spawn `trellis-implement` / `trellis-check` / `trellis-research`, your dispatch prompt **MUST** start with one line:
>
> `Active task: <task path from \`task.py current\`>`
>
> No exceptions on class-2 platforms (codex / copilot / gemini / qoder). Without this line the sub-agent will not have task context.

`inject-workflow-state.py` 在 status=in_progress 时 per-turn 注入这段 → AI 不容易忘。

### R3. 单-session 保险兜底（纯数量判断）

`.trellis/scripts/common/active_task.py:resolve_active_task()` 加 fallback：

- 当 `resolve_context_key()` 返回 None 或对应信箱不存在时
- 扫 `.trellis/.runtime/sessions/*.json`：
  - **恰好 1 个**文件 → 读这个文件的 `current_task` 当 active task 返回，标记 `source_type="session-fallback"` 让 user 一眼看出是兜底来的
  - 其他情况（≥2 个文件 / 没有文件）→ 维持原行为返回 None
- **不加时间窗**。session 文件的生命周期由 `task.py finish` / `task.py archive` 自然管理（archive 时 `clear_task_from_sessions()` 会清掉所有指向被 archive task 的 session 文件）；孤儿文件只会在"用户开窗 → start task → 关窗不 finish → 也不 archive 该 task"的极少数 corner case 出现，且 fallback 退化为返回 None（子代理转去问用户），不会变得更糟。

`set_active_task()` **不走兜底** —— 写入必须有显式 context_key，否则维持现状（拒绝写入）。这条保护 04-21 多窗口隔离不被破坏。

### R4. 类型/源标注

`ActiveTask.source` 增加 `session-fallback` 这个值，便于 `task.py current --source` 输出辨识：

```
Current task: .trellis/tasks/05-04-foo
Source: session-fallback (single recent session)
```

让用户/调试者一眼看出这是兜底拿到的，不是精确匹配。

## Acceptance Criteria

- [ ] `buildPullBasedPrelude(agentType)` 输出包含"先读 dispatch prompt 中 `Active task:` 行，找不到再跑 `task.py current`"的指令
- [ ] `workflow.md` `[workflow-state:in_progress]` 区块包含 sub-agent dispatch protocol 硬约束
- [ ] `resolve_active_task()` 实现 R3 兜底逻辑：单 session + 时间窗内 → 返回兜底，多 session 或过期 → 返回 None
- [ ] `ActiveTask.source` 区分 `session` / `session-fallback` / `none`
- [ ] `task.py current --source` 输出能区分精确匹配 vs 兜底
- [ ] 单测覆盖：
  - prelude 文案生成（`shared.test.ts`）
  - workflow.md 包含 dispatch protocol（`templates/trellis.test.ts` 或新增）
  - `resolve_active_task` 兜底分支（3 case：恰好 1 个 / ≥2 个 / 0 个）
  - `set_active_task` **不**走兜底（regression）
- [ ] 实际在 codex 跑一遍 trellis-implement / trellis-check / trellis-research，验证子代理能拿到 task
- [ ] hook-based 平台（claude / cursor 等）行为零变化（regression test 现有 suite 全绿）

## Definition of Done

- 所有 R1-R4 实现，单测全绿
- `pnpm test` 通过
- `pnpm lint` / typecheck 通过
- `trellis update --migrate`（如需 migration）能正确升级旧项目的子代理 prelude 文案 —— 因为 prelude 是 `trellis init` / `trellis update` 写出去的静态文件，所以新版需要让用户更新
- 在 codex 上做一次 e2e 验证（dispatch trellis-implement，子代理能找到 task 并 read prd.md）
- workflow.md 改动在 docs-site changelog 里点一笔

## Technical Approach

### 改动点

| # | 文件 | 改动 | 类型 |
|---|---|---|---|
| 1 | `packages/cli/src/configurators/shared.ts:498` `buildPullBasedPrelude()` | prelude 文案改成"先看 prompt 头部 Active task: 行" | 模板 |
| 2 | `packages/cli/src/templates/trellis/workflow.md` `[workflow-state:in_progress]` | 加 sub-agent dispatch protocol 硬约束 | 模板 |
| 3 | `.trellis/scripts/common/active_task.py:resolve_active_task` | 加单 session 兜底分支 | runtime |
| 4 | `packages/cli/src/templates/trellis/scripts/common/active_task.py` | 跟 #3 同步（脚本模板镜像） | 模板 |
| 5 | `.trellis/scripts/common/active_task.py:ActiveTask` + `task.py cmd_current` | source 增 `session-fallback` 类型 | runtime |
| 6 | `packages/cli/test/configurators/shared.test.ts` | 测 prelude 新文案 | 测试 |
| 7 | 新增 / 已有 test 加 `resolve_active_task` 兜底分支测试 | runtime 测试 | 测试 |

### Trellis migration

prelude 是 `trellis init` 写到磁盘的静态文件。本次改动后，旧项目需要 `trellis update --migrate` 才能拿到新 prelude 文案。所以本 release 应该是带 migration 的（hash-verified rewrite，不强制覆盖用户自定义）。

### 不做的事

- **不**让 codex 上游加 hook（这是上游的事，trellis 控制不了）
- **不**改 hook-based 平台（claude / cursor 等）的子代理上下文注入逻辑 —— 它们已经 work
- **不**把"传 session_id 让子代理回查"作为方案 —— 比传路径多一跳且不稳

## Decision (ADR-lite)

**Context**: codex 等 class-2 平台没有 sub-agent dispatch hook，pull-based prelude 依赖子代理自己跑 `task.py current`，但 04-21 session-scoped 改造让子代理的 session_id 跟父不匹配 → 查不到 task。

**Decision**: 双层防御 ——

1. **主路：prompt 协议**。AI 在 dispatch 文案里把 task 路径明文带上，由 workflow.md per-turn breadcrumb 强制约束。
2. **兜底：单 session 智能 fallback**。resolver 在没有精确匹配时，仅当 `.runtime/sessions/` 里只有 1 个最近活跃的 session 文件时使用它。

**Consequences**:
- 主路依赖 AI 听话，但 per-turn breadcrumb 让大部分情况下能听话
- 兜底覆盖 "AI 忘了带 / 第三方 prompt 重写" corner case，但只在单窗口场景生效（不破坏 04-21 多窗口隔离）
- 多窗口 + AI 忘记带 = 子代理仍然问用户（可接受，比污染好）
- 不需要 codex 上游配合，所有改动在 trellis 内部

## Out of Scope

- codex 上游 feature request（建议另开 issue 跟踪，但不阻塞本 task 落地）
- 把 session_id 在子代理 env 里继承（依赖 codex 行为，trellis 改不了）
- 重构 04-21 的 session-scoped 设计本身
- 优化 hook-based 平台的子代理注入路径（已 work）
- 国际化 / i18n 子代理 prelude 文案

## Open Questions（待用户决策）

### Q1. ~~单 session fallback 的时间窗~~（已 resolve）

**决策**：不加时间窗，纯数量判断。理由：`task.py archive` 会通过 `clear_task_from_sessions()` 清掉指向被 archive task 的 session 文件，正常生命周期下不会有孤儿；极少数"开窗 start 后既不 finish 也不 archive"的孤儿场景下 fallback 退化为返回 None，等价于现状，可接受。

### Q2. ~~workflow.md dispatch protocol 措辞~~（已 resolve）

**决策**：选项 B（硬规则，不加反向约束）。文案：

> When you spawn `trellis-implement` / `trellis-check` / `trellis-research`, your dispatch prompt **MUST** start with one line:
>
> `Active task: <task path from task.py current>`
>
> No exceptions on class-2 platforms (codex / copilot / gemini / qoder). Without this line the sub-agent will not have task context.

理由：与现有 workflow.md breadcrumb 风格一致（"do NOT edit code in the main session" 是同种调子），AI 听话率够用，避免选项 C 的"事中检查"啰嗦污染主会话输出。

### Q3. ~~tests 里 codex e2e 怎么覆盖~~（已 resolve）

**决策**：选项 B —— vitest 单测覆盖代码逻辑 + 加一份手动验证清单（不是脚本，是 markdown 步骤清单），任何人（包括 issue #225 用户）都能照着跑一遍验证修复。

具体：

- 单测覆盖：prelude 文案生成（`shared.test.ts`）、workflow.md 内容（`templates/trellis.test.ts` 或新增）、resolver fallback 三分支（`active_task` 单测，需新建或扩展）
- 手动 e2e 文档：放在 task dir 里 `manual-verify.md`，列出在 codex 里跑一遍的具体步骤（创建 task → start → dispatch trellis-implement → 验证子代理读到 prd.md）。完成后随 task archive 一起留档作为参考。
- 自动化 codex e2e 不做（mock codex ≠ 真 codex；codex 协议变了 mock 也得跟，ROI 低）。

## Research References

无外部 research 需要 —— 设计已在对话中收敛，相关 spec 和源码都在 repo 内。implement.jsonl / check.jsonl 会列出需要 sub-agent 读的 spec 文件。

## Technical Notes

- `_ENV_SESSION_KEYS` (`.trellis/scripts/common/active_task.py:48-60`) 列了 codex 用 `CODEX_SESSION_ID` / `CODEX_THREAD_ID`
- `resolve_context_key()` (`active_task.py:378`) 是核心解析入口，兜底放这附近
- prelude 模板替换基于 `replacePythonCommandLiterals` 处理 `python3` / `py -3` 跨平台兼容
- `inject-workflow-state.py` 是 per-turn breadcrumb hook，从 `workflow.md` 的 `[workflow-state:STATUS]` block 里抽内容
- 04-21 的 PRD（`.trellis/tasks/04-21-session-scoped-task-state/prd.md`）解释了为什么不能把 fallback 做得太激进
