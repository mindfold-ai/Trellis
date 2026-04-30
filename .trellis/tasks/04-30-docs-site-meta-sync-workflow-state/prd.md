# 同步 docs-site + trellis-meta 到新的 workflow-state SoT 模型

## 目标

上一次 task `04-30-workflow-state-commit-gap` 落地了 workflow-state breadcrumb 子系统的 SoT 收敛（`feat(workflow-state)` `ad49153` + `docs(spec)` `c52ece2`）。改动之后 docs.trytrellis.app 的几篇文档页和 `trellis-meta` skill 的指引仍引用旧架构（已删除的 fallback dict、已移除的 `## Workflow State Breadcrumbs` heading 等）。本任务把面向用户的文档/skill 同步到新架构，避免用户读到不一致的指引。

## 已知事实

- **trellis-meta SKILL.md** 本身是 skill 入口（73 行），实际内容在 `references/local-architecture/*` 和 `references/customize-local/*` 等子文件里。SKILL.md 自己只列大纲，没具体描述旧架构。
- **trellis-meta references 实际审查结果（grep 全部 .md 文件）**：意外比预想干净。全部 references **没有一处**提到 fallback dict / `## Workflow State Breadcrumbs` heading / 三 source 漂移。架构描述已经正确（hook 解析 workflow.md tag block）。受影响只有 6 处 wording：3 处把 hook 跟 workflow.md 并列描述（"edit X AND Y"），R5 后应改成"edit workflow.md; hook 只解析，不嵌内容"。
  - `customize-local/change-context-loading.md:32`
  - `platform-files/hooks-and-settings.md:10, 38, 49`
  - `local-architecture/context-injection.md:63`
  - `customize-local/change-workflow.md:27`
- **trellis-meta references** 路径：`packages/cli/src/templates/common/bundled-skills/trellis-meta/references/`，需要逐个读 `local-architecture/workflow.md` / `local-architecture/context-injection.md` / `customize-local/change-workflow.md` / `customize-local/change-hooks.md` 等
- **docs-site 受影响页面**（grep `workflow-state|breadcrumb|inject-workflow-state|FALLBACK_BREADCRUMBS`）：
  - 英文 `advanced/`：`architecture.mdx`、`custom-workflow.mdx`、`custom-hooks.mdx`、`multi-platform.mdx`、`appendix-f.mdx`、`appendix-a.mdx` = **6 页**
  - 中文 `zh/advanced/`：上面 6 页的镜像 = **6 页**
  - `release/advanced/`：跟 `advanced/` 不同步（diff 显示有差异）。但 `docs.json` navigation **不引用** `release/` —— 不是 live site 内容，疑似 beta 预发或冻结快照
- **changelog 页**：`changelog/v0.5.0-beta.13.mdx` ~ `v0.5.0-beta.18.mdx` 也 grep 到 workflow-state，但都是历史 release notes —— 应保留（不能改写历史）
- 主要漂移点：
  - `advanced/custom-workflow.mdx:18` 引用 `## Workflow State Breadcrumbs` heading（已被新架构合并到 `## Phase Index`）
  - `advanced/custom-workflow.mdx:119` 描述 tag 格式（仍正确，但需补充 R7 的 task.py create 自动 active pointer）
  - 各页可能还有"py/js fallback dict"叙述需要删

## 假设（待验证）

- live site 不服务 `release/advanced/` —— 已 docs.json 验证
- docs-site 是 git submodule，改动需要在 submodule 内 commit + 主仓 bump pointer + 走 release flow（参考 `82d3690 chore(release): 0.5.0-beta.19 manifest + docs-site changelog` 的模式）
- 中英文版本应一致

## Open Questions

- ~~**范围**~~：选 A —— live 英文 `advanced/` + 中文 `zh/advanced/` + trellis-meta references。`release/advanced/` 是 0.4 版本归档，不动。
- ~~**changelog 处理**~~：留给下次 release 时 `/trellis:create-manifest` 自动生成；本任务不碰 changelog
- ~~**trellis-meta references 深度**~~：MAX —— 6 处 wording 微调 + 在 `change-task-lifecycle.md` 加 R7（task.py create auto-active）说明 + 在 `change-workflow.md` 或 `customize-local/overview.md` 加 R8（continue.md 路由表）说明。语气按技术文档标准：直接陈述行为、API 路径、状态转移；不写"标志着 X 重要时刻"这类宣传腔。

## Requirements

### R1 — docs-site live 页同步

更新英文 `advanced/` 和中文 `zh/advanced/` 共 12 个页面里跟新行为不一致的描述。逐页处理：

- `advanced/custom-workflow.mdx:18` —— 引用已移除的 `## Workflow State Breadcrumbs` heading；改成"`[workflow-state:STATUS]` blocks colocated under `## Phase Index`"
- `advanced/custom-workflow.mdx:119` —— tag 格式描述准确，加一行说明 `task.py create` 现在自动 set active pointer
- `advanced/custom-hooks.mdx` —— `inject-workflow-state.py` 段如有 fallback dict 叙述则删；写成"hook 只解析 workflow.md tag block，不嵌入内容；找不到 tag 时 fall back to 'Refer to workflow.md for current step.'"
- `advanced/architecture.mdx` —— hook trigger 描述仍准确，删除任何"three sources"或"py/js fallback"残留
- `advanced/multi-platform.mdx` / `appendix-f.mdx` / `appendix-a.mdx` —— grep 命中但具体文本看实施时审；多数可能是 status 名引用，不需要改
- 中文 `zh/advanced/` 6 页同步同样改动

### R2 — trellis-meta references wording 微调

6 处共用同一个改法：把"edit `[workflow-state:STATUS]` block AND `inject-workflow-state` hook"这类并列描述，改成"edit `[workflow-state:STATUS]` block in `.trellis/workflow.md`；hook 只解析，不再嵌入 fallback content"。

涉及文件：

- `customize-local/change-context-loading.md:32`
- `platform-files/hooks-and-settings.md:10, 38, 49`
- `local-architecture/context-injection.md:63`
- `customize-local/change-workflow.md:27`

### R3 — trellis-meta 加 R7（auto-active）说明

`references/customize-local/change-task-lifecycle.md` 加一节，描述 `task.py create` 现在的行为：

- create 同时调 `set_active_task`（best-effort）；当前 session 立刻拥有 active task pointer
- 没有 session identity（CLI 直接调用、无 `TRELLIS_CONTEXT_ID`）时优雅降级，仅建任务目录
- 后果：`[workflow-state:planning]` breadcrumb 在 brainstorm + jsonl curation 阶段就生效，不再是 dead text
- 引用 `cli/backend/workflow-state-contract.md` 的 status writer 表

### R4 — trellis-meta 加 R8（continue 路由）说明

`references/customize-local/change-workflow.md` 或 `customize-local/overview.md` 加一节描述 `/trellis:continue` 的新路由：

- 路由依据 = `task.json.status` + artifact 存在性
- 路由表（status=planning 无 prd → 1.1 / planning 有 prd 无 jsonl → 1.3 / planning prd+jsonl → 1.4 / in_progress 等）
- 自定义 status 时除了加 `[workflow-state:my-status]` block，路由表也要相应扩

## Definition of Done

- R1-R4 全部 landed
- docs-site submodule commit + 主仓 bump submodule pointer
- 中英文页面一致
- 没有 inline 翻译，中文写中文（不是英文直译）

## Out of Scope

- `changelog/v0.5.0-beta.0` ~ `v0.5.0-beta.19` 历史 release notes —— 不改写历史
- `changelog/v0.5.0-beta.20.mdx` —— 由下次 release 时 `/trellis:create-manifest` 生成
- `release/advanced/` —— 0.4 版本归档
- 跟 workflow-state 无关的其他 docs-site 页面
- 其他 follow-up（stale `trellis-update-spec/SKILL.md:345`、vestigial `"done"` cleanup 等）—— 各自独立 task

## Technical Notes

- live site 服务的路径（来自 docs.json）：`advanced/*` + `zh/advanced/*`
- 受影响 live 页面 grep 结果（6 + 6）：见上方"已知事实"
- trellis-meta references 路径：`packages/cli/src/templates/common/bundled-skills/trellis-meta/references/`
- 上一任务 commit ref：`ad49153 feat(workflow-state)` + `c52ece2 docs(spec)`
