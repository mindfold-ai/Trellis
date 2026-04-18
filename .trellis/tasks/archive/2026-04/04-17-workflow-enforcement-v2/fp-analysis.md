# 第一性原理分析：Trellis 工作流可靠性

**Date**: 2026-04-17
**Trigger**: 用户观察到 3 个工作流漂移问题（见 prd.md 背景）
**Method**: first-principles-thinking skill（Phase 0-5 完整走完）

---

## 公理（5 条）

1. **AI 对话记忆是易失的** — transformer 上下文有硬上限，compaction 是常态。违反 = AI 忘了注入过的规则
2. **AI 不能自己调 slash command** — 命令必须用户触发。AI 最多建议。任何依赖"AI 自己 /continue"的设计必然失效
3. **Hook 是唯一确定的注入通道** — 它依赖平台事件（SessionStart、UserPromptSubmit、PreToolUse、Stop、SubagentStop），不依赖 AI 意志
4. **文件跨 compaction 持久，对话不持久** — Trellis 本来强调的原则，这是能用的杠杆
5. **AI 看不见的状态 = 不存在的状态** — 文件写了但没被读 ≈ 没写。没有强制 touch-point 的话，状态就是死的

---

## 问题本质

**核心问题**：Trellis 的工作流状态**落在磁盘**，但**一次 session 只注入一次给 AI**（SessionStart）。这一次注入到下一次 compaction 之间，AI 行为由**易失的对话记忆**主导，而不是磁盘状态 —— 结果磁盘状态跟 AI 实际行为**脱钩**。

**成功判据**（可度量）：
- 50+ 轮对话后，AI 仍能说出当前 phase，无需用户提醒
- AI 想跳过 `[必做]` step 时必须撞到一个 touch-point 被拦
- 用户说"回去重改"时，自动 phase 重置 + AI 走完整 re-entry 路径（implement → check → 可能 update-spec / break-loop），无需用户手工列步骤

---

## 假设挑战（7 条）

| 假设 | 挑战 | 公理 | 判定 |
|---|---|---|---|
| "AI 会记住 session-start 注入的工作流" | 公理 1：记忆衰减 + compaction 清掉。T=0 注入管不到 T=50 | 1 | 丢弃 |
| "用户会用 /continue 恢复" | 公理 2：用户实际说"修下 X"，不说"/continue"。这个命令为永远不发生的仪式设计 | 2 | 丢弃 |
| "AI 会在该触发 skill 的时候自己触发" | 公理 1：描述匹配是概率的，观察到会漏 | 1 | 改造 — skill 不能当唯一强制 |
| "PreToolUse on Task hook 覆盖所有 phase 转换" | 公理 3：只在 AI spawn sub-agent 时 fire。AI inline 改代码（小 fix）= 零 hook = phase 不可见 | 3 | 丢弃 — 有大覆盖洞 |
| "`task.json.current_phase` 就够了" | 公理 5：写了但没注入 = AI 读不到 = 跟不存在一样 | 5 | 改造 — 必要但不充分 |
| "Slash command 是 AI 学"下一步"的渠道" | 公理 2：AI 调不了。"下一步"指引必须来自 AI 不用问就看得见的地方 | 2, 5 | 丢弃 |
| "回流是 AI 能判断的边缘情况" | 公理 1 + 观察：AI 在 check/update-spec 后标"完成"，用户的"回去改"被处理成新 fix，默默跳过质量门 | 1, 3 | 丢弃 — 必须显式状态重置 |

---

## Ground Truths（5 条）

1. **工作流状态必须每轮都注入，不是每 session 一次** — 否则按公理 1 必然失效
2. **`UserPromptSubmit` hook 是唯一的杠杆点** — 13 平台里 9 个原生支持（只有 kilo/antigravity/windsurf 没）
3. **每个 skill/command 输出末尾必须显式写"你现在在哪、下一步是啥"** — `/audit` 那种模式
4. **回流 = `set_phase` + 重新进入下游**，不是"改了就完事"
5. **Phase 转换必须经过一个 touch-point** — 要么 `task.py set-phase`（显式），要么 skill/command 完成（隐式写）。AI 只在对话里说"切换" = 状态跟现实脱节

---

## 推理链

```
GT#1 + GT#2 → UserPromptSubmit hook 每轮注入 phase 面包屑（非一次性）

GT#3 + /audit 先例 → 每个 skill/command 输出尾部加
                    "📍 Workflow State + Next" 块

GT#4 + GT#5 → task.py 增加 set-phase + phase-history；
              回流 = 显式命令（用户说回去改 → AI 调 set-phase 2.1，
              下轮 hook 看到新 phase 注入 re-entry 序列）

以上合并 → 统一状态机：task.json 存
          { current_phase, phase_history, last_action, checkpoints }；
          hook 读 + 注入；skills 写 + 输出"下一步"；
          rollback 变更 phase。
```

---

## 方案细节（5 层 touch-point 重叠设计）

### 层 1 — SessionStart hook（已有，不改）
- 会话启动一次
- 输出：workflow 概要 + Phase Index + 指引

### 层 2 — UserPromptSubmit hook（新 ⭐）
- 每轮用户消息
- 输出：当前 phase + 下一步 + rollback re-entry（去重：phase 变了或每 5 轮刷一次）
- 面包屑 <500B

### 层 3 — PreToolUse on Task hook（已有）
- sub-agent spawn 时
- 输出：task context 注入（已工作）

### 层 4 — Skill 输出尾块（新）
- 每次 skill 完成
- 输出：本次做了什么 + 下一步 + 异常路径

### 层 5 — `task.py set-phase`（新）
- 显式调用（用户 /rollback 或 AI 推断）
- 行为：变更 current_phase + 追加 phase_history + rollback 时重置下游 checkpoints

**故意重叠**：漏掉一层不会级联失败。

---

## 验证

- [x] 每个结论能追到一条 GT
  - UserPromptSubmit ← GT#1, #2
  - Skill trailer ← GT#3
  - Rollback ← GT#4, #5
  - Touch-point 矩阵 ← GT#5
- [x] 每条 GT 都被覆盖
  - GT#1 → UserPromptSubmit hook
  - GT#2 → 选 UserPromptSubmit 而非 slash
  - GT#3 → skill trailer
  - GT#4 → set-phase + rollback 重置下游
  - GT#5 → touch-point 矩阵
- [x] 所有 phase 完整走完（5 公理 / 7 假设 / 5 GT / 推理链 / 5 层设计）

### Pre-mortem（12 个月后仍然漂移，为什么？）

| 可能失败 | 缓解 |
|---|---|
| 面包屑太啰嗦 AI 当噪音 | <500B 上限 + 高信号格式 |
| UserPromptSubmit 每轮 fire 太吵 | 去重：phase 变或每 5 轮刷一次 |
| agent-less 平台（kilo/antigravity/windsurf）没 hook | 已知限制，不 block 其他平台，fallback 靠更厚的 start.md |
| 回流措辞推断不准 | 显式 `/trellis:rollback` 命令兜底，AI 推断是建议路径 |
| phase_history 膨胀 | FIFO 限 20 条 |

### Inversion（什么会保证失败？）

- 依赖 AI 自觉调 /continue → 我们不做
- 只在 session 启动注入 → 我们改成每轮
- 靠模糊词匹配 rollback → 我们用显式命令

---

## 核心洞察（FP 分析揭示的）

1. **`/continue` 是为一个不发生的仪式设计的**。用户开场 + 正常对话中**没有理由**打 /continue —— 这个命令的整个存在假设就不成立。真正需要的是：不需要用户动作，每轮都注入。
2. **Skill 触发是概率性，不是确定性**。把工作流强制放在 skill 触发层是在赌 AI 自觉。状态机必须在 hook 层。
3. **Rollback 不是"撤销"，是"重新走下游"**。当前设计让回流变成"修一下就完"，直接跳过 check/update-spec —— 这是质量下滑的隐性路径。显式 set-phase + 自动 re-entry 面包屑是唯一能堵住的方式。

---

## 参考先例

- `/audit` skill：末尾 "recommended next commands" 的 pattern — 值得抄
- `gstack` workflow：引导式提示 + 确定性路由 — 值得抄
- Trellis 已有的 `inject-subagent-context.py`：证明 hook 注入可行 — 基础设施已具备
- `04-17-subagent-hook-reliability-audit` 的 Claude Code canary：证明 updatedInput 在 Claude Code 上工作 — 可以放心依赖 UserPromptSubmit
