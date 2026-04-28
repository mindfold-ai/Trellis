# 更新代码规范（Code-Spec）- 沉淀可执行契约

当你在调试、实现或讨论中获得了可复用经验，请更新对应 code-spec 文档。

**时机**：任务完成后、修复 bug 后、发现新模式时。

---

## Code-Spec First（关键规则）

本项目中与实现相关的“spec”优先指 **code-spec**：
- 可执行契约（而非纯原则）
- 明确签名、字段、环境键与边界行为
- 可验证的校验/错误行为

若变更涉及基础设施或跨层契约，必须达到 code-spec 深度。

### 必触发场景

- 新增/修改命令或 API 签名
- 跨层请求/响应契约变化
- 数据库 schema / migration 变化
- 基础设施集成（存储、队列、缓存、密钥、环境装配）

### 触发后必写内容（7 部分）

1. Scope / Trigger
2. Signatures（命令/API/DB）
3. Contracts（request/response/env）
4. Validation & Error Matrix
5. Good/Base/Bad Cases
6. Tests Required（含断言点）
7. Wrong vs Correct（至少一组）

---

## 何时应更新 code-spec

- 实现新功能（沉淀设计决策与契约）
- 做出重要设计选择（记录取舍）
- 修复 bug（记录坑点与约束）
- 发现可复用模式（标准化）
- 形成团队约定（写入质量规范）
- 出现新的思维触发项（补到 `guides/*.md`）

核心原则：code-spec 不只用于“问题复盘”，也用于“正确做法前置”。
