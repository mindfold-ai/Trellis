# 用 K8s 理解 Trellis

> 如果你熟悉 Kubernetes，这篇文档会帮你快速理解 Trellis 的设计思想。

---

## 目录

1. [K8s 核心概念速览](#一k8s-核心概念速览)
2. [Trellis 与 K8s 的类比](#二trellis-与-k8s-的类比)
3. [调谐机制详解](#三调谐机制详解)
4. [完整工作流](#四完整工作流)
5. [为什么这样设计](#五为什么这样设计)

---

## 一、K8s 核心概念速览

### 1.1 命令式 vs 声明式

**命令式**：描述"怎么做"
```bash
# 一步一步告诉系统如何操作
current_pods=$(kubectl get pods -l app=nginx --no-headers | wc -l)
if [ $current_pods -lt 3 ]; then
  kubectl run nginx --image=nginx:1.19
fi
```

**声明式**：描述"要什么"
```yaml
# 只说期望的最终状态
apiVersion: apps/v1
kind: Deployment
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: nginx
        image: nginx:1.19
```

| 维度 | 命令式 | 声明式 |
|------|--------|--------|
| 关注点 | 过程（How） | 结果（What） |
| 执行者 | 用户编排每一步 | 系统自动调谐 |
| 幂等性 | 需要额外处理 | 天然幂等 |
| 错误恢复 | 需要用户介入 | 系统自愈 |

### 1.2 控制循环

K8s 的核心是 **控制循环**（Control Loop）：

```
Desired State          Actual State
(用户声明)              (系统观察)
      |                     |
      +---> Controller <----+
                |
            Observe → Diff → Act → Repeat
```

**威力示例**：
```
我声明：要 3 个 nginx Pod

某 Pod 被意外删除 → Controller 检测到 2 ≠ 3 → 自动创建 1 个
我修改声明为 5 个  → Controller 检测到 3 ≠ 5 → 自动创建 2 个

无需人工干预，系统自动检测、自动恢复、自动适应变化。
```

---

## 二、Trellis 与 K8s 的类比

### 2.1 架构对应

```
┌─────────────────────────────────────────────────────────────┐
│  Kubernetes                                                 │
│                                                             │
│  YAML Manifest ──> Controller ──> Actual State              │
│  (期望状态)         (调谐循环)      (实际状态)                │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│  Trellis                                                    │
│                                                             │
│  Task 目录     ──> Dispatch + Ralph Loop ──> 符合规范的代码  │
│  (期望状态)         (调谐循环)                 (实际状态)     │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 核心组件对照

| Kubernetes | Trellis | 说明 |
|------------|---------|------|
| YAML Manifest | Task 目录 | 声明期望状态 |
| Controller | Dispatch | 按阶段编排执行 |
| Reconciliation Loop | Ralph Loop | 验证未通过就继续循环 |
| Pod/Container | Agent | 实际执行单元 |
| ConfigMap | jsonl + Hook | 注入配置/上下文 |
| Actual State | 最终代码 | 经过调谐后的产物 |

### 2.3 关键洞察

K8s 解决的问题：**基础设施的复杂性** —— 用声明式屏蔽底层细节，Controller 负责调谐。

Trellis 解决的问题：**AI 开发的不确定性** —— 用声明式定义期望（prd.md + 规范），Ralph Loop 负责调谐。

两者的共同点：
- 用户只声明"要什么"，不操心"怎么做"
- 系统持续调谐，直到实际状态符合期望
- 出现偏差时自动修复

> 接下来，第三章将详解调谐机制（Hook + Ralph Loop），第四章将展开完整工作流（Phase 1-4）。

---

## 三、调谐机制详解

Trellis 的调谐由两个机制配合完成：**Hook 注入** 和 **Ralph Loop**。

### 3.1 Hook 注入

**时机**：每次调用 Subagent 时自动触发

**作用**：将 jsonl 中引用的文件内容注入到 Agent 的上下文

```
Plan/Research Agent 提前查找需要的文件
            │
            ▼
    写入 implement.jsonl / check.jsonl
            │
            ▼
    Dispatch 调用 Subagent
            │
            ▼
    Hook 拦截，读取 jsonl，注入文件内容
            │
            ▼
    Subagent 收到完整上下文，开始工作
```

**jsonl 文件示例**：
```jsonl
{"file": ".trellis/spec/backend/index.md", "reason": "Backend guidelines"}
{"file": "src/api/auth.ts", "reason": "Existing auth pattern"}
```

**为什么这样设计**：
- 避免上下文过载（Context Rot）—— 只注入当前阶段需要的内容
- 可追溯 —— jsonl 记录了每个 task 用了哪些上下文
- 解耦 —— Agent 不需要自己搜索，专注于执行

### 3.2 Ralph Loop

**本质**：一个程序化的质量门禁，拦截 Agent 的停止请求，验证未通过就强制继续。

**触发时机**：Check Agent 尝试停止时

**流程**：

```
Check Agent 尝试停止
        │
        ▼
SubagentStop Hook 触发 ralph-loop.py
        │
        ▼
    有 verify 配置？
        │
   ┌────┴────┐
   是        否
   │         │
   ▼         ▼
执行验证命令   检查完成标记
(pnpm lint)   (从输出解析)
   │         │
   ▼         ▼
┌──┴──┐   ┌──┴──┐
│通过  │   │齐全  │
│     │   │     │
▼     ▼   ▼     ▼
allow block allow block
(停止) (继续) (停止) (继续)

最多循环 5 次，超过强制放行
```

**verify 配置示例**（worktree.yaml）：
```yaml
verify:
  - pnpm lint
  - pnpm typecheck
```

**为什么用程序而不是让 AI 自己判断**：
- 程序验证可靠 —— lint 通过就是通过，不依赖 AI 的判断
- 可配置 —— 不同项目可以配置不同的验证命令
- 防止无限循环 —— 最多 5 次迭代，超过强制放行

**局限性**：
- 复杂的架构问题或逻辑 bug 可能需要人工介入
- 依赖规范文件的质量，规范不清晰则检查效果有限

---

## 四、完整工作流

### 4.1 阶段总览

```
Task 目录
├── prd.md           (任务期望)
├── implement.jsonl  (实现阶段的上下文)
├── check.jsonl      (检查阶段的上下文)
└── task.json        (元数据)
        │
        ▼
┌───────────────────────────────────────────────┐
│  Phase 1: implement                           │
│  ─────────────────                            │
│  Agent: Implement Agent                       │
│  注入: prd.md + implement.jsonl 引用的文件     │
│  任务: 根据需求和规范写代码                     │
└───────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────┐
│  Phase 2: check                               │
│  ─────────────────                            │
│  Agent: Check Agent                           │
│  注入: check.jsonl 引用的规范文件              │
│  任务: 检查代码是否符合规范，发现问题自己修复    │
│  调谐: Ralph Loop 验证，未通过继续修复          │
└───────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────┐
│  Phase 3: finish                              │
│  ─────────────────                            │
│  Agent: Check Agent (带 [finish] 标记)        │
│  注入: finish-work.md (Pre-Commit Checklist)  │
│  任务: 提交前完整性检查                        │
│        - lint/typecheck/test 是否通过         │
│        - 文档是否同步                          │
│        - API/DB 变更是否完整                   │
│  调谐: 跳过 Ralph Loop（check 已验证过）       │
└───────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────┐
│  Phase 4: create-pr                           │
│  ─────────────────                            │
│  任务: 创建 Pull Request                      │
└───────────────────────────────────────────────┘
        │
        ▼
    符合规范的代码 + PR
```

### 4.2 异常路径

如果 Check Agent 报告无法修复的问题，Dispatch 可以调用 **Debug Agent** 进行深度分析。这不是默认流程，而是异常处理。

---

## 五、为什么这样设计

### 5.1 一键启动完整工作流

`/trellis:start` 或 `/trellis:parallel`（Claude Code 专有）一键启动，AI 自动完成整个流程：

```
Plan → Implement → Check → Finish → PR
```

用户不需要一步步指导，每个阶段该做什么、该参考哪些规范，都已经定义好了。

### 5.2 开发规范的持续沉淀

```
规范存放在 .trellis/spec/
        │
        ▼
AI 参考规范执行 ──> 发现问题 ──> 更新规范
        │                         │
        └─────────────────────────┘
              规范越用越好
```

Thinking Guides 帮助发现"didn't think of that"的问题。

### 5.3 防止上下文腐烂

上下文过多会导致 LLM：
- **分心**（Distraction）—— 被无关信息干扰
- **混淆**（Confusion）—— 信息相互矛盾
- **冲突**（Clash）—— 新旧信息打架

Trellis 分阶段注入：
- implement 阶段：需求 + 相关代码
- check 阶段：开发规范
- finish 阶段：提交检查清单

每个阶段的 Agent 只收到与其任务相关的上下文。

### 5.4 程序化质量控制

```
传统方式：
  "请检查代码质量" ──> AI 说"我检查过了" ──> 真的检查了吗？

Trellis 方式：
  Ralph Loop 执行 pnpm lint ──> 通过才放行 ──> 程序保证
```

不依赖 AI 自己判断，用程序强制验证。

### 5.5 可追溯

| 记录 | 内容 |
|------|------|
| jsonl | 每个 task 用了哪些上下文 |
| workspace | 每次 session 的工作内容 |
| task.json | task 的完整生命周期 |

出问题时可以追溯是缺了哪个文件，或者规范不清晰。

---

## 总结

| 概念 | K8s | Trellis |
|------|-----|---------|
| 期望状态 | YAML Manifest | Task 目录 (prd.md + jsonl) |
| 执行单元 | Pod/Container | Agent |
| 调谐循环 | Controller | Dispatch + Ralph Loop |
| 配置注入 | ConfigMap | Hook + jsonl |
| 最终产物 | Running Pods | 符合规范的代码 |

**核心思想一致**：声明期望 → 系统调谐 → 最终一致。
