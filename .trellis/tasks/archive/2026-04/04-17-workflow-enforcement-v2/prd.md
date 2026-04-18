# Workflow Enforcement v2

## 一句话

让 AI 在长对话里不会忘记 Trellis task 存在，靠 **UserPromptSubmit hook 每轮注入一行短面包屑**，不靠 AI 自觉。

## 背景：3 个真实漂移场景（2026-04-17 提出）

1. **用户开场直接说需求** → AI 进了 workflow 但长对话后忘了
2. **`/continue` 缺"在哪、下一步干啥"的显式指引**
3. **回流无引导**：AI 走到 check 后被用户要求"回去改" → 改完直接结束，不知道要再走 check → update-spec

## 根因

- 工作流状态只在 session 开头注入一次
- 依赖"AI 自觉调 /continue"/"AI 自觉触发 skill"——违反公理"AI 跨轮次记忆不可靠"
- 长对话 context 压缩后，session-start 消息被挤出

---

## 设计（FP 简化版，2026-04-17）

原 PRD（~680 行）设计了 task.json schema 大改 + 7 条新 task.py 命令 + L1/L2/L3 三档面包屑 + skill 尾块 + class-2 prelude Step 0 等复杂机制。经 first-principles 重新审视，**绝大部分可砍**。

### Ground Truths（来自 fp-analysis 2026-04-17 round 3）

1. AI 跨轮次需要显式 re-grounding，机制是 per-turn 注入（hook 强制，不靠 AI）
2. Sub-agent context injection 与 workflow tracking 正交（前者已由 shared-hooks/inject-subagent-context.py + class-2 prelude 解决）
3. "失败" = phase 不推进；不需要显式 failed state
4. workflow.md 的 Phase 1.0/1.1/... 是**文档分层**，不是**运行时状态**；不应进 task.json
5. 现有 `task.json.status`（`planning`/`in_progress`/`completed`）已够区分任务大状态
6. 每加 1 个字段就增加一份"与文件系统不一致"的风险（minimize state）

### 最终最小集（4 件事）

1. **新 hook `inject-workflow-state.py`**（shared-hooks，Python，~90 行）
2. **9 平台 hook 配置加 UserPromptSubmit 事件**
3. **OpenCode plugin 等价 JS 实现**（Bun 不支持 Python hook）
4. **`task_store.py` 宽容老 legacy 字段**（读到 `current_phase: 0` / `next_action: [...]` 直接忽略）

### 决定**不做**的

- ❌ task.json 加 `current_phase` / `phase_history` / `checkpoints` / `last_subagent` / `last_action` 字段（全部）
- ❌ `task.py` 新命令 7 条（`next-phase` / `advance-phase` / `set-checkpoint` / `phase-history` / `check-consistency` / `rollback` 等）
- ❌ L1/L2/L3 面包屑分档 + fcntl.flock 并发锁（首版单档，无锁，真出问题再加）
- ❌ Skills 加 `📍 Workflow State` bash 尾块（skill 语义自带下一步提示）
- ❌ Class-2 pull-based prelude 加 MANDATORY Step 0 advance-phase（没 phase 要 advance）
- ❌ CI 静态检查防 `current_phase: 0` 回潜（没这字段了）
- ❌ `phase.py` 255 行重写（multi_agent 遗留，本 task 不用）
- ❌ `check-consistency` 命令（首版不做，真出问题再加）

---

## 范围

**动**：
- `packages/cli/src/templates/shared-hooks/inject-workflow-state.py`（新建）
- `packages/cli/src/templates/opencode/plugins/inject-workflow-state.js`（新建）
- 9 个平台的 `settings.json` / `hooks.json` / agent JSON（加 UserPromptSubmit 事件引用）
- `packages/cli/src/templates/trellis/workflow.md` + `.trellis/workflow.md`（加 `[workflow-state:STATUS]...[/workflow-state:STATUS]` 区块作为 breadcrumb 单一事实源）
- `.trellis/scripts/common/task_store.py`（读取端宽容 legacy 字段，忽略 `current_phase` / `next_action`）
- `.trellis/scripts/common/task_store.py`（`cmd_create` 不再写 legacy 字段）
- spec 文档更新：`platform-integration.md` 加章节

**不动**：
- `workflow.md` 的 Phase 1.x/2.x/3.x 主结构（保持 AI 查询文档语义）——仅末尾或适当位置加 breadcrumb 区块
- 3 个 agent-less 平台（kilo/antigravity/windsurf）——接受弱保障
- 既有 hook（SessionStart、PreToolUse:Task）保留
- `task.json` schema（保持 status 三值，不加字段）
- 所有 skill 模板（不加尾块）

---

## 执行清单

### Step 1 — workflow.md 加 breadcrumb 区块（单一事实源）[必做]

文件：
- `packages/cli/src/templates/trellis/workflow.md`（模板源）
- `.trellis/workflow.md`（项目自用，与模板源同步）

在 workflow.md 末尾（或合适位置）加一节，采用和现有 `[Platform, ...]...[/Platform, ...]` tag 风格一致的 breadcrumb 区块：

```markdown
## Workflow State Breadcrumbs

<!-- Injected per-turn by UserPromptSubmit hook (inject-workflow-state.py).
     Edit the text inside each [workflow-state:STATUS]...[/workflow-state:STATUS]
     block to customize flow reminders. Users who fork the Trellis workflow
     only need to edit this file, not the hook script. -->

[workflow-state:planning]
Complete prd.md via trellis-brainstorm skill; then run task.py start.
[/workflow-state:planning]

[workflow-state:in_progress]
Flow: implement → check → update-spec → finish
Check conversation history + git status to determine current step; do NOT skip check.
[/workflow-state:in_progress]

[workflow-state:completed]
User commits changes; then run task.py archive.
[/workflow-state:completed]
```

**设计约定**：
- Tag 名 `[workflow-state:STATUS]`：和 hook 输出的 `<workflow-state>` XML tag 对齐；`:` 后是 task.json 的 `status` 字段值
- 用户自定义 status（如 `reviewing` / `blocked`）只需在 workflow.md 加对应 tag block，hook 自动识别
- hook 输出会自动前缀 `Task: <id> (<status>)` 行，tag body 里不用重复写 header

**完成标志**：
- 模板和项目 workflow.md 都含 3 个默认 breadcrumb block
- `[workflow-state:...]` 正则匹配成功

### Step 2 — 新 hook：`inject-workflow-state.py` [必做]

文件：`packages/cli/src/templates/shared-hooks/inject-workflow-state.py`

核心逻辑：
1. `find_trellis_root()` 从 CWD 向上查找 `.trellis/` 目录（顺带解决 CWD 漂移 / submodule 场景——`hook-path-robustness` 的最小修复）
2. `get_active_task(root)`：读 `.trellis/.current-task` → 读指向的 `task.json` 的 `id` + `status`
3. `load_breadcrumbs(root)`：正则解析 `workflow.md` 的 `[workflow-state:STATUS]` block；每条模板**fallback 到硬编码默认**（workflow.md 缺 / 坏 / 部分缺 tag 时仍能工作）
4. `build_breadcrumb(id, status, templates)`：`str.format()` 套入 task_id，包进 `<workflow-state>` XML 标签
5. 输出 Claude 多平台兼容格式：`{"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": "..."}}`
6. 无 active task / 无 `.trellis/` → 静默退出 0
7. **未知 status（workflow.md 没 tag + 硬编码 fallback 也没）** → 输出通用 breadcrumb：`Task: <id> (<status>) — refer to workflow.md for current step`（不静默退出，保证自定义 status 不"随机不工作"）

**容错策略（三档）**：
1. workflow.md 不存在 → 全 fallback 到硬编码
2. workflow.md 有但无 tag → 全 fallback
3. workflow.md 有部分 tag（比如只有 `in_progress`）→ 有的用 md，没的用 fallback

保证 hook **永不 crash**，workflow.md 再怎么改都不会打断用户对话。

**正则**（支持 hyphen 等常见 status 命名）：
```python
r"\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n(.*?)\n\s*\[/workflow-state:\1\]"
```
- `[A-Za-z0-9_-]+` 覆盖 `in-review` / `blocked-by-team` / `in_progress` 等自定义命名
- `re.DOTALL` 让 `.` 匹配换行
- 反向引用 `\1` 确保开闭 tag 的 status 名匹配

**行数估计**：~110 行（比纯硬编码版多 ~20 行）。

**完成标志**：
- 脚本存在，单元测试覆盖：3 种 status 正常输出 / workflow.md 缺失 fallback / workflow.md 部分 tag fallback / 用户自定义 status（含 `in-review` 带 hyphen）识别 / 未知 status 走通用 fallback 不静默
- mock stdin `{"cwd": "/tmp/foo"}` + `/tmp/foo/.trellis/.current-task` 存在 → 输出正确 JSON
- 无 `.trellis/` 时静默退出 0

### Step 3 — 9 平台 hook 配置接线 [必做]

每个平台的 hook 配置文件加 UserPromptSubmit 事件：

| 平台 | 事件名 | 配置文件 | hook 脚本分发 |
|------|--------|---------|-------------|
| Claude | `UserPromptSubmit` | `templates/claude/settings.json` | 自动（已走 `writeSharedHooks()`）|
| Cursor | `beforeSubmitPrompt` | `templates/cursor/hooks.json` | 自动 |
| Qoder | `UserPromptSubmit` | `templates/qoder/settings.json` | 自动 |
| CodeBuddy | `UserPromptSubmit` | `templates/codebuddy/settings.json` | 自动 |
| Droid | `UserPromptSubmit` | `templates/droid/settings.json` | 自动 |
| Gemini | `UserPromptSubmit`（若支持，否则 fallback `BeforeTool`）| `templates/gemini/settings.json` | 自动 |
| Copilot | `userPromptSubmitted`（camelCase + bash/powershell 双字段）| `templates/copilot/hooks.json` | 自动（`getSharedHookScripts()` 遍历，跳过 session-start/inject-subagent）|
| **Codex** | `UserPromptSubmit`（⚠️ 用户需手动开 feature flag）| `templates/codex/hooks.json` | **⚠️ 手动**（见下方）|
| Kiro | **⚠️ 降级**：暂不支持 per-turn 注入 | n/a | n/a |

**Codex 特殊处理（Finding #1 CRITICAL）**：

`configurators/index.ts` 的 codex 分支当前用 `getCodexHooks()` 只读 `templates/codex/hooks/`，**不自动分发 `shared-hooks/`**。必须二选一：

- **方案 A（推荐）**：改 `configureCodex` 调用 `writeSharedHooks(path.join(codexRoot, "hooks"))`，和其它平台对齐
- **方案 B**：把 `inject-workflow-state.py` 也塞进 `packages/cli/src/templates/codex/hooks/`（双 source，维护成本高）

本 task 采方案 A，同步修改 `configureCodex()` + `collectTemplates.codex` 分支。

**Codex 用户 feature flag（Finding #5）**：

Codex 的 hook 机制需要用户在 `~/.codex/config.toml` 里设置：
```toml
[features]
codex_hooks = true
```

默认关闭 → hook 根本不 fire。本 task 的处理：
- `templates/codex/config.toml` 模板加注释说明
- `trellis init --codex` 执行时 stderr 输出 warning：`Codex hooks require features.codex_hooks = true in ~/.codex/config.toml. See trellis docs.`
- spec 文档章节里列为前置条件

**Kiro 降级（Finding #4）**：

Kiro 当前只有 `agentSpawn` hook（sub-agent 生命周期），**没有主会话 per-turn hook 入口**。把 `userPromptSubmit` 塞进 agent JSON 很可能只触发子代理场景或根本不生效，且可能引入子代理二次注入。

本 task 处理：
- 不给 Kiro 接线 UserPromptSubmit
- 在 spec 文档 Kiro 行标注 "per-turn injection not supported; awaiting upstream"
- 把 "Kiro UserPromptSubmit 等价事件调研" 留给 `04-17-subagent-injection-per-platform` task 的 Kiro 验证分支

命令格式参考现有 SessionStart：
```json
{
  "type": "command",
  "command": "{{PYTHON_CMD}} <config-dir>/hooks/inject-workflow-state.py",
  "timeout": 5
}
```

7 个"自动分发"平台：脚本通过 `collectSharedHooks()` / `writeSharedHooks()` 自动写到各平台 hooks 目录，不需手动改 configurator。

**完成标志**：
- 7 平台（Claude/Cursor/Qoder/CodeBuddy/Droid/Gemini/Copilot）hook 配置含 UserPromptSubmit（或等价事件）条目
- Codex：`configureCodex` 改造完成，`trellis init --codex` 写入 `inject-workflow-state.py` + config 里含 UserPromptSubmit 且有 feature flag 警告
- Kiro：不接线，spec 里明确标注
- 每平台 init 到 /tmp 后，hook 配置里 UserPromptSubmit 事件能正确指向 `inject-workflow-state.py`（文件存在）
- 现有测试（init.integration.test.ts / configurators.test.ts）更新覆盖新 hook

### Step 4 — OpenCode plugin 等价实现 [必做]

文件：`packages/cli/src/templates/opencode/plugins/inject-workflow-state.js`

OpenCode 用 Bun JS plugin。绑 `chat.message` 事件（等价 UserPromptSubmit）。逻辑和 Python 完全一致：
- 向上查找 `.trellis/`
- 读 `.current-task` + task.json
- 查表输出面包屑
- 原地 mutate message 或加 additionalContext（按 OpenCode plugin API）

参考既有 `opencode/plugins/inject-subagent-context.js` 的风格。

**完成标志**：
- plugin 能被 Bun 加载
- 手动冒烟：OpenCode 里跑 dummy task，面包屑能注入

### Step 5 — `task_store.py` + sub-agent hook 清理 legacy [必做]

**Finding #2 #3 合并处理**：不只要让 task_store 不写 legacy，还要让 sub-agent hook 不回写（否则"声明去 legacy"永远做不干净）。双 task_store.py 都要改。

#### 5.1 `task_store.py` 双源同步（Finding #3）

两处都改，内容一致：
- `.trellis/scripts/common/task_store.py`（项目自用）
- `packages/cli/src/templates/trellis/scripts/common/task_store.py`（模板源）

**`cmd_create()`**（L147-L180 附近）：
- 删除 `"current_phase": 0,` 行
- 删除 `"next_action": [{...6 条...}],` 块
- 其它字段保持

**`read_task()` 或 `normalize_task()`**：
- 读到老 task.json 里的 `current_phase` / `next_action` 字段 → 忽略（不反序列化到对象），不报错
- 不做主动 migration 写回 —— 用户下次 `task.py` 写任务时自动不写 legacy 字段

#### 5.2 `inject-subagent-context.py` 删除 `update_current_phase()`（Finding #2）

当前 `packages/cli/src/templates/shared-hooks/inject-subagent-context.py` 的 `update_current_phase()` 函数（L110 附近）在每次 `PreToolUse:Task` 触发时往 `task.json["current_phase"]` 写入，和"不用 legacy 字段"矛盾。

**处理**：
- **删除** `update_current_phase()` 函数
- **删除** 主流程中的调用
- **同步删除** `packages/cli/src/templates/opencode/plugins/inject-subagent-context.js` 的等价逻辑（JS 版的 phase 写入）

不破坏任何功能——新 `inject-workflow-state.py` 只读 `task.json["status"]`，不依赖 `current_phase`。

#### 5.3 `phase.py` 处理

`.trellis/scripts/common/phase.py`（multi_agent 遗留，255 行）读 `current_phase` 和 `next_action`，但：
- 已由 `04-17-update-cleanup-deleted-templates` manifest 清理（`multi_agent/` 整个目录删）
- `phase.py` 唯一的 consumer 是 `multi_agent/create_pr.py`，随之一起删
- **本 task 不动 `phase.py`**，它在 migration 后自然失效

**完成标志**：
- 新建 task 的 task.json **不含** `current_phase` 和 `next_action`
- 老 task.json 带 legacy 字段时，读取不报错
- spawn sub-agent 后 task.json 不被写入 `current_phase` 字段（Python + OpenCode JS 都验证）
- 单元测试覆盖"老 schema 读取" + "spawn sub-agent 后 task.json 字段集合"
- 双 task_store.py 代码 diff 一致

### Step 6 — 测试 + 手动冒烟 [必做]

**单元测试**：
- `inject-workflow-state.py`：
  - 3 种 status（planning/in_progress/completed）正常输出
  - workflow.md 缺失 → fallback 到硬编码
  - workflow.md 部分 tag（只有 in_progress）→ 有的用 md，没的 fallback
  - 自定义 status（`reviewing` / `in-review` 带 hyphen）识别
  - 未知 status（既无 tag 也无 fallback）→ 通用 breadcrumb 不静默退出
  - CWD 漂移（子目录 / submodule）→ 向上查找 `.trellis/`
- `task_store.py`（双源）：新建 task 无 legacy 字段；读老 task.json 不报错
- `inject-subagent-context.py`：spawn sub-agent 后 task.json 不含 `current_phase`（回归）

**集成测试**：
- 7 平台（Claude/Cursor/Qoder/CodeBuddy/Droid/Gemini/Copilot）init 后 hook 配置含 UserPromptSubmit 条目
- Codex init 后 `.codex/hooks/inject-workflow-state.py` 存在（验证 configureCodex 改造）+ `hooks.json` 含 UserPromptSubmit
- Kiro init 不含 UserPromptSubmit 条目（确认降级）
- OpenCode plugin 文件写入正确

**手动冒烟**（本项目，开 dummy task）：
- 创建 task → UserPromptSubmit hook fire → 面包屑出现
- `task.py start` → status 变 in_progress → 下轮面包屑更新
- `task.py finish` → status 变 completed → 面包屑提示 archive
- 改 `.trellis/workflow.md` 里 `[workflow-state:in_progress]` block → 下轮面包屑立即变（验证热更新）
- 自定义 status：手动改 task.json `status: "in-review"` + workflow.md 加 `[workflow-state:in-review]` → 面包屑正确识别
- spawn implement sub-agent → `task.json` **不**出现 `current_phase` 字段（回归 Finding #2）

### Step 7 — spec 文档 [必做·一次]

更新 `.trellis/spec/cli/backend/platform-integration.md`：
- 新章节 "Workflow State Injection: Per-turn breadcrumb"
- 9 平台的 UserPromptSubmit 事件对照表
- breadcrumb tag 约定（`[workflow-state:STATUS]...[/workflow-state:STATUS]`）
- 用户自定义 status 流程示例
- 设计决策说明（为什么不做复杂 state machine；为什么从 workflow.md 拉取 vs 硬编码）

---

## 完成标志（整体）

- [ ] `workflow.md`（模板 + 项目）含 3 个默认 `[workflow-state:STATUS]` block
- [ ] `inject-workflow-state.py` 新建 + 测试覆盖（3 status / workflow.md 缺失 fallback / 部分 tag fallback / 自定义 status 含 hyphen / 未知 status 通用 fallback / CWD 漂移）
- [ ] 7 平台（Claude/Cursor/Qoder/CodeBuddy/Droid/Gemini/Copilot）hook 配置加 UserPromptSubmit
- [ ] **Codex**：`configureCodex` 改造调用 `writeSharedHooks()`；`hooks.json` 加 UserPromptSubmit；config.toml 模板加 feature flag 注释；init stderr 打印 warning
- [ ] **Kiro**：降级，不接线；spec 标注"per-turn 待上游支持"
- [ ] OpenCode plugin JS 等价实现
- [ ] 双 `task_store.py`（`.trellis/scripts/` + `packages/cli/.../trellis/scripts/`）同步：不写 legacy + 宽容读取
- [ ] `inject-subagent-context.py`（Python 共享）+ OpenCode JS 插件删除 `update_current_phase()` 写入
- [ ] `pnpm test` + `python -m pytest .trellis/scripts/`（若有）全绿
- [ ] 手动冒烟：dummy task 3 种 status 面包屑 + 热更新 + 自定义 status 带 hyphen + spawn sub-agent 后 task.json 无 current_phase
- [ ] spec 文档章节落盘

---

## 非目标

- **不改 workflow.md 的 Phase 结构**
- **不存 phase 状态到 task.json**
- **不做面包屑分档 / 并发锁 / consistency 命令**（首版）
- **不管 class-2 pull-based prelude**（不加 Step 0）
- **不给 skill 加尾块**
- **不强制拦截**（PreToolUse 禁止某些 tool）
- **3 agent-less 平台不做**（kilo/antigravity/windsurf 接受弱保障）

---

## 工作量估计

| Step | 工作量 |
|------|--------|
| 1. workflow.md 加 breadcrumb 区块 | XS（~15 行 markdown，双源同步）|
| 2. `inject-workflow-state.py` | S（~110 行 Python，含 hyphen 正则 + 未知 status fallback）|
| 3. 平台 hook 配置接线 | M（7 平台 JSON + Codex configurator 改造 + Kiro 降级说明）|
| 4. OpenCode plugin | S（~100 行 JS）|
| 5. `task_store.py` 双源 + sub-agent hook 清理 | S（双 task_store + Python/JS 删 `update_current_phase`）|
| 6. 测试 + 冒烟 | M |
| 7. spec 文档 | S |

**总计 M**（比 FP 简化版 S-M 略涨，原因是 Codex/Kiro 专项处理 + sub-agent hook legacy 清理）。预计 1-2 个 session 完成。

---

## 历史设计决策（仅保留）

### 原 PRD（2026-04-17 首版）的复杂设计

详见 git log。包括：
- task.json schema 大改（current_phase 字符串化 + phase_history + checkpoints）
- `task.py` 7 条新命令（next-phase / advance-phase / set-checkpoint 等）
- L1/L2/L3 三档面包屑 + fcntl.flock 并发锁
- Skills `📍 Workflow State` 尾块 × 7
- Class-2 prelude MANDATORY Step 0 advance-phase
- CI 静态检查防 schema 回潜

### Codex Cross-Review（2026-04-17 两轮）

对原 PRD 做过 2 轮 Codex review，累计 9 个 finding 全部被识别，但**在 FP 重新审视后，这些 finding 的前提都失效了**（因为它们基于复杂 state machine 设计，而简化版不再有 state machine）。

具体：
- R1 #1-8 / R2 #1-5 都针对原 PRD 的 `current_phase` 类型冲突 / NEXT_PHASE_RULES 断裂 / 并发锁 / 迁移顺序 / checkpoint 设计等
- 简化版无 phase 字段 / 无 checkpoint / 无规则表 / 无复杂迁移 → **这些 review finding 不再适用**

### FP 分析（2026-04-17 round 3）的核心洞察

**原 PRD 把 workflow.md 的排版层级（Phase 1.0/1.1/...）与运行时状态混为一谈**。分离后：
- workflow.md 是 AI 查询的**静态文档**
- `task.json` 只承载**任务生命周期**状态（`status` 三值），不承载 phase

每轮面包屑只需**提醒任务存在 + 指向静态 flow**，不需要精确到 sub-phase。AI 自己从对话 + git 状态判断当前步骤。

---

## Codex Cross-Review (Round 3，FP 简化版 PRD，2026-04-17)

**Reviewer**：gpt-5.3-codex via `mcp__codex-cli__codex` (reasoningEffort: high)
**Result**：6 findings，全部采纳

| # | Level | Issue | Resolution |
|---|-------|-------|-----------|
| 1 | CRITICAL | Codex 不走 shared-hooks 分发（hooks.json 会引用不存在脚本）| ✅ Step 3 增加 Codex 专门处理：`configureCodex` 改走 `writeSharedHooks()` |
| 2 | WARNING | `update_current_phase()` hook 仍写 legacy `current_phase`，和"去 legacy"声明矛盾 | ✅ Step 5.2 增加：删除 Python + OpenCode JS 的 `update_current_phase()` 函数 |
| 3 | WARNING | 双 `task_store.py`（项目 + 模板源）需同步改，PRD 漏提模板源 | ✅ Step 5.1 明写双源同步 + 集成测试断言 |
| 4 | WARNING | Kiro `agentSpawn` ≠ 主会话 `userPromptSubmit`，嵌 agent JSON 可能不生效或只影响子代理 | ✅ Step 3 Kiro 降级：不接线，spec 标注"per-turn 待上游支持" |
| 5 | WARNING | Codex hooks 需要用户手动开 `features.codex_hooks = true`，默认关闭 → hook 不 fire | ✅ Step 3 增加 feature flag 前置条件章节 + init stderr warning + config.toml 模板注释 |
| 6 | WARNING | 正则 `(\w+)` 不认 hyphen（`in-review` 等自定义 status 不匹配）+ 未知 status 静默退出→"随机不工作" | ✅ Step 2 正则改 `[A-Za-z0-9_-]+`；未知 status 输出通用 fallback breadcrumb |

用户已担心但非阻断：`phase.py` 遇 `current_phase = None` 不会崩溃（代码用 `data.get(..., 0) or 0`），最多语义退化。且 `phase.py` 会随 `multi_agent/` 目录一起在 `04-17-update-cleanup-deleted-templates` 的 migration 里清理。

---

## 关联

- 上游：`04-17-subagent-hook-reliability-audit`（UserPromptSubmit 可用性已验证）
- 同级：归属 `04-16-skill-first-refactor` 父 task
- 顺带解决：`04-17-hook-path-robustness` 的最小修复（新 hook 用 `find_trellis_root()` 向上查找，CWD 漂移不再影响）
- 分析文档：`./fp-analysis.md`（原 PRD 推理）+ 2026-04-17 round 3 FP 结论（见本 PRD "设计" 章节）
