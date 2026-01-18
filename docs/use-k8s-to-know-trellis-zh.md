# 用 K8s 理解 Trellis

> 这篇文档用 K8s 的概念来解释 Trellis 的设计思路。如果你熟悉 K8s，理解 Trellis 会更直观。

---

## 目录
1. [两种范式的本质区别](#一两种范式的本质区别)
2. [K8s 的核心机制](#二k8s-的核心机制)
3. [Trellis 与 K8s 的类比](#三trellis-与-k8s-的类比)
4. [Trellis 的实际做法](#四trellis-的实际做法)
5. [总结](#总结)
---
## 一、两种范式的本质区别
### 1.1 命令式（Imperative）：描述"怎么做"
```bash
# 命令式：一步一步告诉系统如何操作
current_pods=$(kubectl get pods -l app=nginx --no-headers | wc -l)
if [ $current_pods -lt 3 ]; then
  for i in $(seq $current_pods 2); do
    kubectl run nginx-$i --image=nginx:1.19
  done
elif [ $current_pods -gt 3 ]; then
  kubectl delete pod $(kubectl get pods -l app=nginx -o name | tail -n +4)
fi
```
### 1.2 声明式（Declarative）：描述"要什么"
```yaml
# 声明式：只说期望的最终状态
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: nginx
        image: nginx:1.19
```
### 1.3 核心区别对照

| 维度 | 命令式 | 声明式 |
|------|--------|--------|
| 关注点 | 过程（How） | 结果（What） |
| 执行者 | 用户编排每一步 | 系统自动调谐 |
| 状态管理 | 用户负责 | 系统负责 |
| 幂等性 | 需要额外处理 | 天然幂等 |
| 错误恢复 | 需要用户介入 | 系统自愈 |
---
## 二、K8s 的核心机制
### 2.1 控制循环（Control Loop）
K8s 的核心是"控制循环"，也叫"调谐循环"（Reconciliation Loop）：
```
Desired State (用户声明)    Actual State (系统观察)
        |                           |
        +------> Controller <-------+
                    |
                 Observe  (观察实际状态)
                    ↓
                  Diff    (计算差异)
                    ↓
                   Act    (执行动作)
                    ↓
                 Repeat   (无限循环)
```
**这个模式的威力**：
```
场景：我声明要 3 个 nginx Pod

时刻 T1：集群有 0 个 Pod
  → Controller 检测：0 ≠ 3 → 创建 3 个 Pod

时刻 T2：1 个 Pod 被意外删除
  → Controller 检测：2 ≠ 3 → 创建 1 个 Pod

时刻 T3：某个节点宕机
  → Controller 检测：2 ≠ 3 → 在其他节点创建 1 个 Pod

时刻 T4：我修改声明为 5 个 Pod
  → Controller 检测：3 ≠ 5 → 创建 2 个 Pod

整个过程无需人工干预，系统自动检测问题、自动恢复、自动适应变化。
```
### 2.2 声明式的关键特性
**1. 幂等性（Idempotency）**
```bash
# 执行多少次结果都一样
kubectl apply -f deployment.yaml  # 第1次：创建
kubectl apply -f deployment.yaml  # 第2次：无变化
kubectl apply -f deployment.yaml  # 第100次：仍然无变化
```
**2. 自愈能力（Self-Healing）**
```
Pod 崩溃 → Controller 检测到 actual ≠ desired → 自动重建
节点宕机 → Controller 检测到 actual ≠ desired → 自动迁移
```
**3. 最终一致性（Eventual Consistency）**
```
传统思维：
  "执行命令 → 立即生效 → 返回成功"

K8s 思维：
  "接受声明 → 返回'已接受' → 异步调谐 → 最终达到期望状态"
```
---
## 三、Trellis 与 K8s 的类比
### 3.1 架构对应关系
**Kubernetes**:
```
YAML (期望状态) --> Controller (调谐循环) --> Actual State
```
**Trellis**:
```
Feature 目录 (期望状态)
├── prd.md (功能期望)
├── jsonl (代码规范引用)
└── feature.json (元数据)
        |
        v
    Dispatch 按阶段调用 Agent
        |
        ├─> implement (写代码)
        |
        ├─> check (代码规范检查) <──┐
        |       |                  | Ralph Loop
        |       └── 验证未通过 ────┘ (程序化循环控制)
        |
        ├─> finish (提交前完整性检查)
        |
        └─> create-pr
        |
        v
符合规范的代码 (Actual State)
```
Hook 在每次调用 Agent 时注入规范作为参考。
**调谐过程详解**：
Phase 1 - implement：
  - Dispatch 调用 Implement Agent
  - Hook 注入 prd.md + jsonl 引用的规范
  - Agent 参考规范写代码

Phase 2 - check（代码规范检查）：
  - Dispatch 调用 Check Agent
  - Hook 注入 check.jsonl 引用的规范（check-backend/frontend/cross-layer）
  - 检查代码是否符合开发规范、跨层数据流、代码复用等
  - 发现问题自己修复
  - Ralph Loop 程序化控制循环：
    - 如果配置了 verify 命令 → 执行命令验证（程序化，可靠）
    - 否则 → 检查 Agent 输出的完成标记
  - 验证通过才放行，否则 Agent 继续修复
  - 最多循环 5 次（防止无限循环）

Phase 3 - finish（提交前完整性检查）：
  - Dispatch 调用 Check Agent（prompt 带 [finish] 标记）
  - Hook 注入 finish-work.md（Pre-Commit Checklist）
  - 检查内容：
    - 代码质量：lint/typecheck/test 是否通过
    - 文档同步：.trellis/structure/ 是否需要更新
    - API 变更：schema、文档、客户端是否同步
    - DB 变更：migration、schema、相关查询是否更新
  - 跳过 Ralph Loop（check 阶段已验证过代码规范）
  - 确保工作完整可交付（代码 + 文档 + 测试 + 验证）

Phase 4 - create-pr：
  - 创建 Pull Request

异常路径 - debug：
  - 如果 Check Agent 报告无法修复的问题
  - Dispatch 可以调用 Debug Agent 进行深度分析
  - 这不是默认流程，而是异常处理

这里的"调谐"由 **Ralph Loop** 程序化控制：它拦截 Check Agent 的停止请求，验证是否真正完成（执行 lint/typecheck 或检查完成标记），未通过就阻止停止让 Agent 继续修复。这类似 K8s Controller 的调谐思想，但用程序而非 LLM 来控制循环。
### 3.2 核心组件对照

| Kubernetes | Trellis | 说明 |
|------------|---------|------|
| YAML Manifest | Feature 目录 | 声明期望状态（prd.md = 功能期望，jsonl 引用的规范 = 代码期望） |
| Controller 调谐循环 | Ralph Loop | 程序化拦截 Agent 停止，验证未通过就继续循环 |
| Actual State | 最终的代码 | 经过检查修复后符合规范的代码 |
| 验证机制 | verify 配置 | worktree.yaml 中配置的验证命令（如 pnpm lint） |
**关于 Hook**：Hook 是调谐过程的一部分——它在每次调用 agent 时注入规范文档，让 agent 有参考依据来判断代码是否符合期望。
### 3.3 自愈机制对比
**Kubernetes 自愈**：
```
Pod OOMKilled → Controller 检测 → 自动重启
容器 CrashLoopBackOff → Controller 检测 → 按退避策略重试
节点 NotReady → Controller 检测 → 迁移 Pod 到健康节点
```
K8s 的自愈是**被动检测 + 自动修复**：系统持续监控，发现问题自动处理。
**Trellis 自愈**：
Trellis 通过 **Ralph Loop**（SubagentStop Hook）实现程序化的循环控制：
```
Check Agent 尝试停止
        |
        v
SubagentStop Hook 触发 ralph-loop.py
        |
        v
有 verify 配置？
        |
        ├── 是 --> 执行配置的验证命令
        |            |
        |            ├── 全过 --> allow (停止)
        |            └── 失败 --> block (继续修复)
        |
        └── 否 --> 检查 Agent 输出的完成标记
                     |
                     ├── 标记齐全 --> allow
                     └── 缺标记 --> block

最多循环 5 次，超过强制放行
```
**具体机制**：
1. **程序化验证（推荐）**：
   - 在 `worktree.yaml` 中配置 `verify` 命令
   - Ralph Loop 执行这些命令来验证
   - 不依赖 AI 的输出，程序强制验证

2. **完成标记（回退方案）**：
   - 如果没配置 verify，检查 Agent 输出的标记
   - 标记从 `check.jsonl` 的 reason 字段生成
   - 要求 Agent 实际执行检查后才输出标记

3. **Check Agent 的自修复能力**：
   - Check Agent 定义明确说"Fix issues yourself, not just report them"
   - 发现问题后，用 Edit 工具直接修改代码
   - Ralph Loop 验证未通过会告诉 Agent 哪里失败

4. **finish 阶段跳过循环**：
   - prompt 带 `[finish]` 标记时跳过 Ralph Loop
   - 因为 check 阶段已经验证过了

**局限性**：
- 复杂的架构问题或逻辑 bug 可能需要人工介入
- 最多 5 次迭代，超过强制放行（防止成本失控）
- 依赖规范文件的质量，规范不清晰则检查效果有限
---
## 四、Trellis 的实际做法
### 4.1 Trellis 做了什么
**核心机制**：
```
Plan Agent 或 Research Agent 提前查找需要的文件
              │
              ▼
     写入 implement.jsonl / check.jsonl
              │
              ▼
     Hook 在调用 Subagent 时全量注入这些文件
              │
              ▼
     Subagent 收到完整的上下文，开始工作
```
**jsonl 文件示例**：
```jsonl
{"file": ".trellis/structure/backend/index.md", "reason": "Backend guidelines"}
{"file": "src/api/auth.ts", "reason": "Existing auth pattern"}
{"file": "src/middleware/", "type": "directory", "reason": "Middleware patterns"}
```
**Dispatch 的调用**：
```python
Task(subagent_type="implement", prompt="根据 prd.md 实现功能")
# Hook 自动注入 implement.jsonl 中的所有文件
```
### 4.2 这套流程的优点
1. **一键启动完整工作流**：
   - `/start` 或 `/parallel` 一键启动，AI 自动完成 Plan → Implement → Check → Finish → PR 整个流程
   - 用户不需要一步步指导，AI 按照预设的流程和规范自主执行
   - 每个阶段该做什么、该参考哪些规范，都已经定义好了
2. **开发规范的持续沉淀**：
   - 规范存放在 `.trellis/structure/`，是项目的知识资产
   - 每次发现问题（bug、遗漏、不一致）就更新规范
   - 规范越用越好：AI 参考规范执行，规范越清晰，执行效果越好
   - Thinking Guides 帮助发现"didn't think of that"的问题
3. **完整的端到端流程**：
   - 从需求分析（Plan）→ 实现（Implement）→ 检查（Check）→ 完成（Finish）→ PR
   - 每个阶段有明确的职责和检查点
   - 不是单点工具，而是完整的工作流
4. **防止上下文腐烂（Context Rot）**：
   - 上下文过多会导致 LLM 分心（Distraction）、混淆（Confusion）、冲突（Clash）
   - Trellis 分阶段注入：implement 阶段注入需求和相关代码，check 阶段注入开发规范，finish 阶段注入提交检查清单
   - 每个阶段的 Agent 只收到与其任务相关的上下文
5. **程序化质量控制**：
   - Ralph Loop 用程序拦截 Agent 停止，验证未通过就继续循环
   - `verify` 配置可以用 lint/typecheck 等命令验证，不依赖 AI 自己判断
   - 比纯靠 prompt 约束更可靠
6. **可追溯**：
   - jsonl 记录每个 feature 用了哪些上下文
   - agent-traces 记录每次 session 的工作内容
   - 出问题时可以追溯是缺了哪个文件，或者规范不清晰