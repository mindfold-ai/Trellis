# Trellis Workflow Context Injection Map

> 精确到每个 Agent 的上下文注入详情

---

## Workflow 概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Main Agent (Human Interactive)                     │
│                                                                             │
│  SessionStart Hook 注入:                                                     │
│  ├─ workflow.md                    ~2,871 tokens                            │
│  ├─ start.md (command)             ~1,638 tokens                            │
│  ├─ get-context.sh output          ~748 tokens                              │
│  ├─ frontend/index.md              ~335 tokens                              │
│  ├─ backend/index.md               ~352 tokens                              │
│  └─ guides/index.md                ~586 tokens                              │
│                                    ─────────────                            │
│                           Total:   ~6,530 tokens                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ Task() 调用
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PreToolUse Hook (inject-subagent-context.py)            │
│                                                                             │
│  根据 subagent_type 分发到不同的 Agent，每个 Agent 有独立的上下文注入         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 各 Agent 详细上下文

### 1. Research Agent

**触发**: `Task(subagent_type="research")`

**不需要** `.current-task`，可以独立运行

| 来源 | 内容 | Tokens |
|------|------|--------|
| **Agent 系统 prompt** | `.claude/agents/research.md` | ~617 |
| **Hook 注入** | | |
| - 项目结构说明 | 静态模板 (spec 目录结构 + 搜索提示) | ~100 |
| - Prompt wrapper | Research 任务框架 | ~225 |
| - research.jsonl (可选) | 任务相关的额外搜索上下文 | 0-500 |
| **Total** | | **~942-1,442** |

```
Research Agent Context:
├─ research.md (agent definition)     ~617 tokens
├─ Project structure template         ~100 tokens
├─ Research prompt wrapper            ~225 tokens
└─ research.jsonl entries (if any)    0-500 tokens
                                      ─────────────
                              Total:  ~942-1,442 tokens
```

---

### 2. Implement Agent

**触发**: `Task(subagent_type="implement")`

**需要** `.current-task` 指向任务目录

| 来源 | 内容 | Tokens |
|------|------|--------|
| **Agent 系统 prompt** | `.claude/agents/implement.md` | ~513 |
| **Hook 注入** | | |
| - Prompt wrapper | Implement 任务框架 | ~112 |
| - implement.jsonl 内容 | 开发规范 (按任务配置) | 变量 |
| - prd.md | 需求文档 | ~200-500 |
| - info.md (可选) | 技术设计 | 0-500 |

**典型 implement.jsonl 示例** (来自 trellis-agents-gui 任务):
```jsonl
{"file": ".trellis/workflow.md"}           → ~2,871 tokens
{"file": ".trellis/spec/frontend/index.md"} → ~335 tokens
```

```
Implement Agent Context (typical):
├─ implement.md (agent definition)    ~513 tokens
├─ Implement prompt wrapper           ~112 tokens
├─ implement.jsonl entries:
│   ├─ workflow.md                    ~2,871 tokens
│   └─ frontend/index.md              ~335 tokens
├─ prd.md                             ~300 tokens (varies)
└─ info.md (optional)                 ~0-500 tokens
                                      ─────────────
                              Total:  ~4,131-4,631 tokens
```

---

### 3. Check Agent

**触发**: `Task(subagent_type="check")`

**需要** `.current-task` 指向任务目录

| 来源 | 内容 | Tokens |
|------|------|--------|
| **Agent 系统 prompt** | `.claude/agents/check.md` | ~708 |
| **Hook 注入** | | |
| - Prompt wrapper | Check 任务框架 | ~120 |
| - check.jsonl 内容 | 检查规范 (按任务配置) | 变量 |
| - prd.md | 需求文档 (理解意图) | ~200-500 |

**如果没有 check.jsonl，则使用 Fallback:**
```
Fallback check files:
├─ finish-work.md                     ~791 tokens
├─ check-cross-layer.md               ~1,160 tokens
├─ check-backend.md                   ~178 tokens
├─ check-frontend.md                  ~179 tokens
└─ spec.jsonl entries                 变量
```

**典型 check.jsonl 示例**:
```jsonl
{"file": ".claude/commands/finish-work.md"}      → ~791 tokens
{"file": ".claude/commands/check-frontend.md"}   → ~179 tokens
```

```
Check Agent Context (with jsonl):
├─ check.md (agent definition)        ~708 tokens
├─ Check prompt wrapper               ~120 tokens
├─ check.jsonl entries:
│   ├─ finish-work.md                 ~791 tokens
│   └─ check-frontend.md              ~179 tokens
└─ prd.md                             ~300 tokens (varies)
                                      ─────────────
                              Total:  ~2,098-2,598 tokens

Check Agent Context (fallback):
├─ check.md (agent definition)        ~708 tokens
├─ Check prompt wrapper               ~120 tokens
├─ Fallback files:
│   ├─ finish-work.md                 ~791 tokens
│   ├─ check-cross-layer.md           ~1,160 tokens
│   ├─ check-backend.md               ~178 tokens
│   └─ check-frontend.md              ~179 tokens
├─ spec.jsonl entries                 ~1,000-3,000 tokens
└─ prd.md                             ~300 tokens
                                      ─────────────
                              Total:  ~4,436-6,436 tokens
```

---

### 4. Debug Agent

**触发**: `Task(subagent_type="debug")`

**需要** `.current-task` 指向任务目录

| 来源 | 内容 | Tokens |
|------|------|--------|
| **Agent 系统 prompt** | `.claude/agents/debug.md` | ~483 |
| **Hook 注入** | | |
| - Prompt wrapper | Debug 任务框架 | ~130 |
| - debug.jsonl 内容 | 修复所需规范 | 变量 |
| - codex-review-output.txt (可选) | Codex 审查结果 | 0-2,000 |

```
Debug Agent Context (typical):
├─ debug.md (agent definition)        ~483 tokens
├─ Debug prompt wrapper               ~130 tokens
├─ debug.jsonl entries:
│   └─ (typically same as check)      ~970-1,970 tokens
└─ codex-review-output.txt (if any)   ~0-2,000 tokens
                                      ─────────────
                              Total:  ~1,583-4,583 tokens
```

---

### 5. Finish Agent (Check 的特殊模式)

**触发**: `Task(subagent_type="check")` 且 prompt 包含 `[finish]`

| 来源 | 内容 | Tokens |
|------|------|--------|
| **Agent 系统 prompt** | `.claude/agents/check.md` | ~708 |
| **Hook 注入** | | |
| - Prompt wrapper | Finish 任务框架 | ~125 |
| - finish.jsonl 或 fallback | finish-work.md | ~791 |
| - prd.md | 需求文档 | ~200-500 |

```
Finish Agent Context:
├─ check.md (agent definition)        ~708 tokens
├─ Finish prompt wrapper              ~125 tokens
├─ finish-work.md (or finish.jsonl)   ~791 tokens
└─ prd.md                             ~300 tokens
                                      ─────────────
                              Total:  ~1,924-2,424 tokens
```

---

## 完整 Workflow 上下文汇总

### 场景 1: 纯研究 (Research Only)

```
Main Agent (session start)           ~6,530 tokens
  └─ Research Agent                  ~942-1,442 tokens
                                     ─────────────
                             Total:  ~7,472-7,972 tokens
```

### 场景 2: 标准开发流程 (Implement → Check)

```
Main Agent (session start)           ~6,530 tokens
  ├─ Research Agent                  ~1,000 tokens (可选)
  ├─ Implement Agent                 ~4,131-4,631 tokens
  └─ Check Agent                     ~2,098-2,598 tokens
                                     ─────────────
                             Total:  ~13,759-14,759 tokens
```

### 场景 3: 完整开发流程 (Research → Implement → Check → Finish)

```
Main Agent (session start)           ~6,530 tokens
  ├─ Research Agent                  ~1,000 tokens
  ├─ Implement Agent                 ~4,300 tokens
  ├─ Check Agent                     ~2,300 tokens
  └─ Finish Agent                    ~2,100 tokens
                                     ─────────────
                             Total:  ~16,230 tokens
```

### 场景 4: Debug 循环

```
Main Agent (session start)           ~6,530 tokens
  └─ Debug Agent (per iteration)     ~2,000-4,500 tokens
                                     ─────────────
                             Total:  ~8,530-11,030 tokens per debug
```

---

## 重要说明

### 上下文是独立的，不是累加的

每个 Subagent 的上下文是**独立**的：
- Main Agent 有自己的 ~6,530 tokens
- 当调用 Implement Agent 时，它有自己独立的 ~4,300 tokens
- Implement Agent 结束后，它的上下文被丢弃
- Check Agent 启动时，又是独立的 ~2,300 tokens

**所以**：
- 不是 6,530 + 4,300 + 2,300 = 13,130 累加
- 而是在任一时刻，最大占用 = Main Agent + 一个 Subagent ≈ **10,000-11,000 tokens**

### Main Agent 会累积 Subagent 的输出

虽然 Subagent 上下文被丢弃，但：
- Subagent 的**输出结果**会返回给 Main Agent
- 这些结果会累积在 Main Agent 的对话历史中
- 一个完整 workflow 可能产生 ~3,000-5,000 tokens 的结果累积

### 实际峰值上下文

| 时刻 | 上下文占用 |
|------|-----------|
| Session 启动 | ~6,530 tokens |
| 调用 Research | ~6,530 (main) + ~1,000 (subagent) = ~7,530 |
| Research 结束 | ~6,530 + ~500 (结果) = ~7,030 |
| 调用 Implement | ~7,030 (main) + ~4,300 (subagent) = **~11,330** |
| Implement 结束 | ~7,030 + ~800 (结果) = ~7,830 |
| 调用 Check | ~7,830 (main) + ~2,300 (subagent) = **~10,130** |
| Check 结束 | ~7,830 + ~600 (结果) = ~8,430 |

**峰值: ~11,330 tokens** (在 Implement Agent 运行时)

---

## 占比分析

| 模型上下文 | Trellis 峰值占比 | 剩余可用 |
|-----------|-----------------|---------|
| 200k tokens | 5.7% | 188,670 |
| 128k tokens | 8.9% | 116,870 |
| 32k tokens | 35.4% | 20,670 |

---

## 优化建议

### 1. 精简 JSONL 文件
只包含任务真正需要的规范，不要包含 workflow.md（因为 Main Agent 已经有了）

### 2. 使用轻量级 Agent
- Research: ~1,000 tokens (最轻量)
- Finish: ~2,100 tokens (比 Check 轻)
- Check: ~2,300 tokens (标准)
- Implement: ~4,300 tokens (最重)

### 3. 减少不必要的 Research
如果已经知道要做什么，可以跳过 Research 阶段
