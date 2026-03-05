# Task Lifecycle Hooks

## Goal

支持在 task 生命周期事件（create, start, finish, archive）后执行用户自定义脚本，方便集成 Linear、Jira 等外部任务管理工具。

## What I already know

* `config.yaml` 已存在于 `.trellis/`，由 `parse_simple_yaml` 解析（零依赖手写 parser）
* 现有 parser 只支持 `key: value` 和 `key:` + `- item`，不支持嵌套 dict
* `parse_simple_yaml` 定义在 `worktree.py:28`，被 `config.py` 和 `worktree.py` 调用
* 现有调用者格式都是一级结构，增强 parser 向后兼容
* task.py 中 4 个生命周期函数：`cmd_create`, `cmd_start`, `cmd_finish`, `cmd_archive`
* task 信息可通过 task.json 获取（id, name, title, status, assignee, meta 等）

## Decisions

* **YAML parser 增强**：重写 `parse_simple_yaml` 支持嵌套 dict（通过缩进检测），零依赖不变
* **嵌套配置格式**：使用 `hooks: → after_create: → [list]` 二级嵌套，更自然

## Requirements

- 增强 `parse_simple_yaml` 支持嵌套 dict（缩进检测）
- 在 `config.yaml` 中支持 hooks 配置（嵌套格式）
- 支持 4 个事件：`after_create`, `after_start`, `after_finish`, `after_archive`
- Hook 通过 `TASK_JSON_PATH` 环境变量获取 task.json 路径
- Hook 失败不阻塞主流程（warning 提示）
- config.py 新增 `get_hooks(event_name)` 函数
- task.py 中 4 个 cmd_ 函数末尾调用 hooks

## Decisions

* **环境变量**：只传 `TASK_JSON_PATH`（task.json 的路径），用户脚本自行读取需要的字段
* 理由：简单、通用，避免预设哪些字段有用

## Example Config

```yaml
hooks:
  after_create:
    - "echo 'Task created'"
  after_archive:
    - "python3 scripts/my-hook.py"
```

Note: hooks 只提供通用扩展点，不内置任何外部集成。用户自行编写脚本对接 Linear/Jira 等工具。

## Acceptance Criteria

- [ ] `parse_simple_yaml` 正确解析嵌套 dict
- [ ] 现有 worktree.yaml / config.yaml 格式不受影响（向后兼容）
- [ ] `after_create` hook 在 task 创建后执行
- [ ] `after_start` hook 在 task start 后执行
- [ ] `after_finish` hook 在 task finish 后执行
- [ ] `after_archive` hook 在 task archive 后执行
- [ ] Hook 失败只打印 warning，不影响主流程
- [ ] `TASK_JSON_PATH` 环境变量正确传递
- [ ] config.yaml 模板中有 hooks 示例（注释状态）

## Definition of Done

* Lint / typecheck pass
* 现有测试不 break
* template + live copy 同步更新
* config.yaml 模板更新

## Out of Scope

- Before hooks（拦截/阻止操作）
- Hook 的并行执行
- 内置任何外部集成（hooks 只提供通用扩展点，用户自行编写脚本）
- Hook 超时控制

## Technical Notes

### Subprocess 规范

Hook 用 `subprocess.run(cmd, shell=True, ...)` 执行，必须：
- 指定 `encoding="utf-8"` 和 `errors="replace"`（跨平台 guide 要求）
- capture stdout/stderr 用于 warning 输出
- 设 `env` 参数传入 `TASK_JSON_PATH`（继承当前进程 env + 追加）
- 设 `cwd` 为 repo root

### Files to modify

* `src/templates/trellis/scripts/common/worktree.py` — 增强 `parse_simple_yaml`
* `src/templates/trellis/scripts/common/config.py` — 新增 `get_hooks()`
* `src/templates/trellis/scripts/task.py` — 4 个 cmd_ 函数调用 hooks
* `src/templates/trellis/config.yaml` — 添加 hooks 示例
* `.trellis/` live copies — 同步更新
