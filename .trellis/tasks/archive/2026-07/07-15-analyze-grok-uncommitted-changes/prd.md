# 完善 Grok 适配未提交改动

## Goal

在已完成 Grok 未提交改动审查的基础上，修复审查确认的集成缺口，并补充执行级回归测试，使 Grok 平台从 CLI 初始化、模板生成、任务上下文 seeding 到 Python 运行时适配形成可验证的完整链路。

## Background

- 实施基线为当前 `main` 分支的 `HEAD`（`e7c5ead4`）与工作区差异。
- 前一阶段已完成对 Grok 适配的只读分析，确认 CLI 注册、configurator、模板、Python runtime 和文档映射已基本接通。
- 审查发现三个可执行缺口：Grok 未进入 JSONL 自动 seeding 平台列表、update 集成测试 marker 未同步、Python Grok 行为缺少执行级单测。
- 本任务自身的 `.trellis/tasks/07-15-analyze-grok-uncommitted-changes/` 文件不计入 Grok 产品改动范围。

## Requirements

1. 将 `.grok` 纳入任务存储的 subagent 平台检测，使仅配置 Grok 的仓库创建任务时也会生成 `implement.jsonl` 和 `check.jsonl`。
2. 同步修改模板源与当前仓库的 dogfood Python 副本，避免新生成项目和 Trellis 自身行为不一致。
3. 修复 update 集成测试中的 pull-based 平台 marker，使预期包含 Grok。
4. 增加 Python 执行级测试，验证 Grok 的配置目录、命令路径、运行/恢复命令、平台检测和 `GROK_SESSION_ID` 会话读取行为。
5. 新增测试优先走真实 Python 模块与脚本路径，避免仅做源码字符串断言。
6. 保留现有 Grok 适配设计；没有新证据时不修改 `--yolo`、`grok -c` 或 `GROK_SESSION_ID` 的既有映射。
7. 运行针对性测试、静态检查和 GitNexus `detect_changes`，区分本次回归与既有环境失败。

## Constraints

- 不回滚、不格式化用户已有 Grok 未提交代码。
- 修改函数、类、方法或其关键配置前，遵守 GitNexus impact 分析要求；完成后运行 `detect_changes`。
- Python 模板源和 `.trellis/` dogfood 副本必须同步。
- 不在用户未明确要求时自动提交代码。

## Acceptance Criteria

- [x] 仅存在 `.grok/` 的临时仓库创建任务后，会生成 `implement.jsonl` 与 `check.jsonl`。
- [x] 模板源与 dogfood `task_store.py` 的 subagent 平台目录保持同步。
- [x] update 集成测试的 pull-based marker 包含 Grok。
- [x] Python 执行级测试覆盖 Grok CLIAdapter、平台检测及 active-task 会话读取。
- [x] 针对性测试通过；静态检查无新增错误。
- [x] 最终 `detect_changes` 的影响范围符合预期，已记录剩余风险与环境性失败。
