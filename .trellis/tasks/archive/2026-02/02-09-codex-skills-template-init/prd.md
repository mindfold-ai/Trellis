# Trellis 适配 Codex（平台级接入，含 skills）

## Goal

将 Codex 作为 Trellis 一级平台接入（`--codex`），并在初始化阶段生成 Codex 兼容 skills 结构（`SKILL.md` + `.agents/skills`），同时不破坏现有 Claude/Cursor/iFlow/OpenCode 工作流。

## What I already know

- 现有初始化入口是 `src/commands/init.ts`，平台能力由 `AI_TOOLS`（`src/types/ai-tools.ts`）+ `PLATFORM_FUNCTIONS`（`src/configurators/index.ts`）驱动。
- 当前支持平台：`claude-code`、`cursor`、`iflow`、`opencode`；尚未有 `codex` 平台条目。
- `init` 会创建 `.trellis/` 结构、按平台复制模板目录、写入 `AGENTS.md`（`src/templates/markdown/agents.md`）。
- 当前模板体系里没有初始化 `.agents/skills/` 的逻辑；`src/utils/template-fetcher.ts` 对 `skill` 类型安装路径仍是 `.claude/skills`（有历史耦合）。
- 更新机制由 `src/commands/update.ts` 的 `collectTemplateFiles()` + 平台 `collectPlatformTemplates()` 负责；如果新增初始化模板，通常需要考虑 update 跟踪一致性。
- 仓库本身已有一套成熟技能目录 `.agents/skills/*/SKILL.md`（15 个 Trellis workflow skills），可作为可复用资产来源。
- README Roadmap 明确包含 “Codex integration”。

## Research Notes

### 外部规范（Codex 官方）

- Codex skills 使用 progressive disclosure：默认只加载技能元信息，命中后再加载完整 `SKILL.md`。
- 触发方式包含显式（`$skill-name` / `/skills`）与隐式（匹配 `description`）。
- 技能目录标准：`SKILL.md` 必需，`scripts/`、`references/`、`assets/`、`agents/openai.yaml` 可选。
- 官方建议使用仓库级 `.agents/skills/<skill-name>/SKILL.md` 存放团队共享技能。
- 官方文档提示自定义 prompts 已弃用，建议迁移到 skills。

### 仓库内约束

- 平台注册模式对“有独立配置目录”的平台最友好（如 `.claude/.cursor/.iflow/.opencode`）；Codex 技能主要落在 `.agents/skills`，与现有平台形态不完全一致。
- `.agents` 在项目里已被用于 runtime 临时目录（`src/templates/trellis/gitignore.txt` 中已有 `.agents/` 忽略），需要避免与 repo-level skills 管理冲突。
- 若把 Codex 当“完整新平台”接入，会连带影响：
  - TS 侧：`AI_TOOLS`、CLI flags、configurator、update template 收集；
  - Python 侧：`cli_adapter.py`、multi-agent `--platform` 选项；
  - 文档和测试矩阵都会扩大。

### Feasible approaches here

**Approach A: Init 增加 Codex Skills Bootstrap（推荐）**

- How it works:
  - 不新增“codex 平台”到 `AI_TOOLS`；
  - 在 `init` 模板阶段新增可选步骤：创建/复制 `.agents/skills/...`（基于现有 Trellis skills 模板）。
  - 可配一个显式开关（如 `--codex-skills`）或与 `--yes` 默认策略结合。
- Pros:
  - 改动面最小，风险低，交付快；
  - 完全贴合 Codex 官方 skills 机制；
  - 不强绑 Codex CLI 运行时细节。
- Cons:
  - 不提供“Codex 作为平台”的完整统一抽象（无 `--codex` 平台位）。

**Approach B: 把 Codex 作为完整平台接入 registry**

- How it works:
  - 新增 `codex` 到 `AI_TOOLS` + configurator + CLI `--codex` + update 收集。
  - 目录可能是 `.agents/skills`（或 `.codex/*`），需要定义清晰边界。
- Pros:
  - 平台抽象统一，命令与测试框架一致。
- Cons:
  - 侵入面大，设计不当容易把 “skills 目录” 与 “平台配置目录” 混淆；
  - Python multi-agent 层是否要支持 codex CLI 仍存在不确定性。

**Approach C: 与远程模板系统打通（skill/command 模板多目标安装）**

- How it works:
  - 扩展 `template-fetcher`，让 `skill` 类型可按目标平台写入 `.agents/skills` / `.claude/skills`。
- Pros:
  - 远程模板生态更统一。
- Cons:
  - 与“先在 init 模板阶段落地”相比，优先级可后置；增加网络模板复杂度。

## Decision (ADR-lite)

**Context**: 用户明确要求 Codex 适配应具备平台级能力，而非仅初始化时“附带生成一份 skills 模板”，否则会出现入口、更新策略、目录管理不统一的问题。  
**Decision**: 采用 **Approach B（Codex 作为完整平台接入 registry）**。  
**Consequences**:
- (+) 用户可以通过统一入口使用（`trellis init --codex`），不需要“无差别安装”或额外手动步骤。
- (+) `init/update/tests/docs` 体系一致，后续演进可维护性更好。
- (-) 需要同步处理 TS registry、CLI、update 跟踪，以及可能的 Python multi-agent 适配边界。

## Assumptions (temporary)

- 会复用现有 `.agents/skills` 资产，避免重新维护两套技能内容。
- 平台级接入下，Codex 默认不应影响未选择 `--codex` 的用户路径。

## Open Questions

- （已确认）本期不做 `multi_agent/*.py` 侧 Codex 运行时支持；
- （已确认）本期必须覆盖“普通脚本”侧平台适配，至少包含 `task.py` 及其依赖的 `common/cli_adapter.py` 在 Codex 下可用。

## Requirements (evolving)

- `trellis init` 提供平台级入口：`--codex`，并纳入与现有平台一致的选择机制。
- 仅在选择 Codex 时生成 Codex 兼容技能目录（repo-level `.agents/skills/...`），避免对所有用户无差别安装。
- 生成内容应能被后续 `trellis update` 正确处理（至少不反复误报、不破坏用户修改）。
- Codex 平台元数据与行为接入 registry（`AI_TOOLS` + `PLATFORM_FUNCTIONS`）。
- 普通脚本路径必须可用：`task.py init-context` 生成的默认上下文路径在 Codex 项目下应指向有效技能文件（而不是 `.claude/commands/...`）。
- 现有 Claude/Cursor/iFlow/OpenCode 初始化逻辑与测试必须保持通过。
- 文档需补充 Codex 支持说明（README / README_CN / 相关 spec）。

## Acceptance Criteria (evolving)

- [ ] 执行 `trellis init --codex` 后，项目出现 `.agents/skills/<skill>/SKILL.md` 结构（可被 Codex 识别）。
- [ ] 未选择 `--codex` 时，不会新增 Codex 专属目录（避免无差别安装）。
- [ ] `trellis update` 对新增初始化模板行为一致，不出现“每次都新增/覆盖”的异常。
- [ ] 在 Codex 项目目录运行 `python3 ./.trellis/scripts/task.py init-context <task> backend` 时，`check/debug` 的默认 JSONL 条目引用 `.agents/skills/.../SKILL.md`（或等效 Codex 路径）。
- [ ] 对应测试覆盖新增路径（init + update 相关最小闭环）。
- [ ] 文档更新明确说明 Codex skills 的使用方式与边界。

## Definition of Done

- Tests added/updated (unit/integration where appropriate)
- Lint / typecheck / CI green
- Docs/notes updated if behavior changes
- Rollout/rollback considered if risky

## Out of Scope (explicit)

- `multi_agent/*.py` 的 Codex 运行时编排适配（`start.py`/`plan.py`/`status.py`）
- 远程模板市场（marketplace）的完整 skill/command 多目标下载体系重构
- 非 Trellis 维护范围的 Codex 行为（例如官方 skill loader 规则变更）处理

## Technical Notes

- 重点入口文件：
  - `src/commands/init.ts`
  - `src/configurators/index.ts`
  - `src/types/ai-tools.ts`
  - `src/commands/update.ts`
  - `src/utils/template-fetcher.ts`
  - `src/templates/markdown/agents.md`
  - `.agents/skills/*/SKILL.md`
- 已查阅规范：
  - `.trellis/spec/backend/platform-integration.md`
  - `.trellis/spec/backend/directory-structure.md`
- 外部参考：
  - https://developers.openai.com/codex/skills/
  - https://developers.openai.com/codex/skills/create-skill/
  - https://developers.openai.com/codex/custom-prompts/
  - https://github.com/openai/skills
