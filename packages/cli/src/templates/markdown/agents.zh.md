<!-- TRELLIS:START -->
# Trellis 说明

这些说明面向在本项目中工作的 AI 助手。

本项目由 Trellis 管理。需要长期维护的项目知识位于 `.trellis/`：

- `.trellis/workflow.yaml` — 开发阶段、任务创建时机和 skill 路由
- `.trellis/spec/` — 按 package / layer 划分的编码规范，写代码前必须阅读
- `.trellis/workspace/` — 各开发者的 journal 和会话记录
- `.trellis/tasks/` — 活跃和归档任务，包括 PRD、research 和 jsonl 上下文

如果当前平台提供 Trellis 命令（例如 `/trellis:finish-work`、`/trellis:continue`），优先使用命令而不是手工步骤。不同平台不一定暴露全部命令。

如果你使用的是 Codex 或其他支持 agent 的工具，项目级辅助文件还可能位于：
- `.agents/skills/` — 可复用 Trellis skills
- `.codex/agents/` — 可选自定义子代理

由 Trellis 管理。此区块外的内容会被保留；此区块内的内容可能在未来 `trellis update` 时被覆盖。

<!-- TRELLIS:END -->
