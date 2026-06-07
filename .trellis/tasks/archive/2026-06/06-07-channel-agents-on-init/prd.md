# init 时落盘 channel runtime agent 定义文件

关联 issue：[#323](https://github.com/mindfold-ai/Trellis/issues/323)
报告者：@SuperCC25513（trellis@0.6.0-beta.21）

## 背景

`trellis channel spawn --agent <name>` 通过 `packages/cli/src/commands/channel/agent-loader.ts` 加载 `.trellis/agents/<name>.md`，文件必须带 YAML frontmatter（`name` / `description` / `provider` / `model` / `labels`）+ markdown body（作为 system prompt 注入 worker）。

marketplace 的 `channel-driven-subagent-dispatch/workflow.md` 在 173/174/263/302 行明确派发 `--agent implement` 和 `--agent check`，但该 workflow 模板只包含 `workflow.md` 自身，**不带任何 agent 定义文件**。

调研结论（关键事实）：

- 仓库内不存在任何 `.trellis/agents/*.md` 模板（包括 `packages/cli/src/templates/trellis/` 和 `marketplace/`）。
- 各平台层（claude / cursor / codex / qoder / gemini / pi / codebuddy / opencode / kiro / copilot）都已经内置 `trellis-implement.md` / `trellis-check.md` / `trellis-research.md`，唯独 channel runtime 使用的 `.trellis/agents/` 这一层缺失。
- 用户切到 channel-driven workflow 后会立刻撞墙：`trellis channel spawn --agent check` 报 `Agent 'check' not found`。

## 目标

把 channel runtime 使用的 `.trellis/agents/*.md` 视为 Trellis 自身 runtime 产物（与 `.trellis/workflow.md` / `.trellis/scripts/` 平级），在 `trellis init` 时无条件落盘，`trellis update` 时补齐缺失项。不再依赖用户手搓，也不依赖某个 workflow 模板自带。

## 需求

### R1 — 模板落盘位置

在 `packages/cli/src/templates/trellis/agents/` 下新增 bundled agent 定义模板，**最少包含**：

- `implement.md`：实现型 agent，对齐既有平台层 `trellis-implement.md` 的职责（实现 PRD/design/implement.md 中的需求，遵守 spec）。
- `check.md`：质量检查 agent，对齐既有平台层 `trellis-check.md`（lint / 类型 / 测试 / spec 合规 / 代码复用）。
- `research.md`：可选。如果选择不附带 `research.md`，PRD 必须明确写出原因并保持与平台层一致的能力梯度。

每个文件均为标准 frontmatter：

```yaml
---
name: <agent>
description: <one-line role description>
provider: claude            # 选择 claude 作为默认 provider；Codex 用户后续可在 .trellis/agents/ 改
model: <可选>
labels: [<可选>]
---
```

body 是系统提示词，定位与平台层同名 agent 对齐，但需明确"我跑在 channel runtime 里，被 `trellis channel spawn` 拉起"的上下文。

> ⚠️ 不直接复用本仓库当前 `.trellis/agents/architect.md / check.md / implement.md / plan.md / research.md` —— 它们是为 mindfold 主仓库自定义的，包含项目专属约束，不适合做 Trellis 默认模板。新模板必须是通用、跨项目可用的。

### R2 — `trellis init` 行为

`trellis init` 不论选择什么 workflow（`--workflow native|tdd|channel-driven-subagent-dispatch|...`），都必须把 `.trellis/agents/{implement,check,research?}.md` 落到磁盘：

- 与现有 `.trellis/workflow.md` 模板写盘同源（走同一个 `templates/trellis/index.ts` 导出 + 模板 hash 跟踪机制）。
- 进入 `.template-hashes.json` 受 hash 追踪管理，便于 `trellis update` 判断是否被用户编辑过。
- 不依赖任何平台 flag（`--claude` / `--codex` / ...）—— 这套文件是平台无关的 Trellis runtime。

### R3 — `trellis update` 行为

`trellis update`：

- 缺失项：直接补齐。
- 已存在且 hash 与新模板一致：刷新 hash。
- 已存在但用户改过（hash 不匹配）：沿用现有 update 的冲突策略（提示用户 / `--force` 覆盖 / 默认保留本地），与 `workflow.md` 行为对齐。

### R4 — `trellis workflow --template` 行为

`trellis workflow --template <id>` **只切 `.trellis/workflow.md`，不再负责生成 agent 文件**。

但需要新增一个轻量的"缺文件守卫"：当切换到的 workflow.md 文本中检测到 `.trellis/agents/<name>.md` 引用，但本地缺少对应文件时，stderr 打印 warning，提示用户运行 `trellis update`，**不阻断** workflow 切换（保持现有交互不破坏）。

> 替代方案（不采用）：让 workflow 模板自己带 agent 文件。否决理由：违反 Trellis 自身 runtime 产物应在 init/update 控制的边界，且会让 marketplace workflow 作者每个都要拷一份 agent 文件。

### R5 — 文档与 migration

- 新增 migration manifest 条目（`0.6.0-beta.23.json` 或后续 beta），changelog 写明 init/update 现在会落盘 `.trellis/agents/*.md`、关联 #323。
- 更新 `templates/markdown/agents.md`、`templates/common/bundled-skills/trellis-meta/references/customize-local/change-agents.md` 等说明 `.trellis/agents/` 现在是 init 内置文件，列出修改入口。

## 验收

- [ ] `packages/cli/src/templates/trellis/agents/{implement,check[,research]}.md` 存在，frontmatter 合法（可被 `agent-loader.ts` 解析），body 通用。
- [ ] 全新空目录运行 `trellis init -u cc` 后：`.trellis/agents/implement.md` 和 `.trellis/agents/check.md` 存在；`.template-hashes.json` 包含这两个条目。
- [ ] 全新空目录运行 `trellis init -u cc --workflow channel-driven-subagent-dispatch` 后：上述文件齐备，直接 `trellis channel spawn --agent check ...` 不再报 "Agent 'check' not found"。
- [ ] 旧版本项目运行 `trellis update`：缺失的 `.trellis/agents/*.md` 被补齐；已有的（即使未跟踪 hash）不被覆盖；hash 更新到最新模板的镜像。
- [ ] `trellis update --dry-run` 正确列出会新增的 agent 文件。
- [ ] `trellis workflow --template channel-driven-subagent-dispatch`：
  - 本地 agent 齐全：行为不变，无 warning。
  - 本地缺 agent：stderr 给出 warning + 修复指引；命令成功退出。
- [ ] 单元测试：
  - `test/templates/trellis.test.ts` 增加对新 agent 模板的存在 / 解析 / frontmatter 字段校验。
  - `test/commands/init.integration.test.ts` 覆盖"init 后 `.trellis/agents/` 应有正确内容 + hash"。
  - `test/commands/update.integration.test.ts` 覆盖缺失补齐 / 已存在保留两种路径。
  - 必要时补 `workflow.ts` 的 missing-agent warning 行为测试。
- [ ] migration manifest 增量条目通过 `pnpm release:beta`（或对应脚本）的 manifest 连续性检查。
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` 全绿。

## 非目标

- 不重新设计 channel runtime / agent-loader 协议。
- 不向 marketplace workflow 模板里塞 agent 定义。
- 不为每个 marketplace workflow 自定义专属 agent 集合 —— 本任务只解决 bundled native + channel-driven 的最小可用集。
- 不调整既有平台层（`.claude/agents/trellis-*.md` 等）。

## 备注

- 本任务定位为 **lightweight**：增量在 templates + init/update + workflow warning + 测试，无新的工作流概念。PRD-only 即可，不需要 `design.md` / `implement.md`。
- 实现前请通读：`packages/cli/src/commands/channel/agent-loader.ts`（确认 frontmatter 字段名 / 限制）、`packages/cli/src/templates/trellis/index.ts`（看现有 trellis runtime 文件如何导出）、`packages/cli/src/commands/init.ts` 中 `.trellis/workflow.md` 的落盘路径。
