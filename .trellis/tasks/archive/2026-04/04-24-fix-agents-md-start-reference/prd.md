# Fix AGENTS.md: remove /trellis:start reference (issue #192)

## Goal

AGENTS.md 模板里指引用户运行 `/trellis:start`，但该命令在 agent-capable 平台（Claude Code / Cursor / OpenCode / Codex / iFlow / Qoder）被 `filterCommands` 主动剔除，只在 agent-less 平台（kilo / antigravity / windsurf）存在。Windows + Claude Code 用户 @nigiwen 在 issue #192 报告了这一不一致。本任务改写 AGENTS.md 文案，使其不再引用可能不存在的命令，而是作为 `.trellis/` 的索引存在。

## What I already know

- 模板源：`packages/cli/src/templates/markdown/agents.md:6` 是 `/trellis:start` 引用的根。
- 过滤逻辑：`packages/cli/src/configurators/shared.ts:195-203` `filterCommands` — agent-capable 平台剔除 `start`。
- 分发路径：`packages/cli/src/commands/init.ts:1687-1694` `createRootFiles` 在 `trellis init` 时把模板写到 `<cwd>/AGENTS.md`。
- `trellis update` **不会**刷新 AGENTS.md（grep `update.ts` 0 匹配），第 20 行"managed block"注释是 aspirational，未兑现。
- 现有 migration schema 仅支持 `rename / rename-dir / delete / safe-file-delete`，无文本替换 action。
- 仓库自身两份 AGENTS.md 也陈旧：
  - `./AGENTS.md` — 文案比模板还老（引用已不存在的 `structure/` / `agent-traces/`）
  - `./docs-site/AGENTS.md` — 需核对同步

## Decision (ADR-lite)

**Context**: AGENTS.md 文案与 agent-capable 平台实际命令集不一致，误导用户。
**Decision**: 方案 A — 最小修复：只改模板 + 仓库内两份副本，不引入 migration，不扩展 update.ts。存量用户由下一次 release note 点明"需手动更新 AGENTS.md 或删后重跑 `trellis init`"。
**Consequences**:
- 优点：零新机制、零风险、最短 diff；与 bug-fix 范围一致。
- 代价：存量项目的 AGENTS.md 不会自动升级。可接受，因为 AGENTS.md 是人读文案，陈旧不影响运行。
- 后续改进（另立项）：若要兑现 managed-block 自动刷新承诺，单独做一个 feature（对应之前讨论的 C/D 方案）。

## Requirements

1. 重写 `packages/cli/src/templates/markdown/agents.md`：
   - 移除 `/trellis:start` 段落。
   - 定位为 `.trellis/` 的索引 / 指路牌，指向 `workflow.md` / `spec/` / `workspace/`。
   - 保留 `<!-- TRELLIS:START -->` / `<!-- TRELLIS:END -->` 标记（为未来 managed-block 刷新留路）。
   - 保留 Codex 相关提示（`.agents/skills/`、`.codex/agents/`）。
   - 末行不再说"Keep this managed block so 'trellis update' can refresh"——因为当前不实。改为"Managed by Trellis; edits outside this block are preserved"或类似中性描述。
2. 同步仓库 root `AGENTS.md` 与 `docs-site/AGENTS.md`，让 Trellis 仓库自身的 AGENTS.md 与模板一致。
3. 模板单元测试：若 `test/templates/` 下存在 AGENTS.md 相关断言，更新到新文案。
4. Release note：下一次 beta 发布的 manifest `notes` / `changelog` 里一句话告知存量用户。

## Acceptance Criteria

- [ ] `packages/cli/src/templates/markdown/agents.md` 中不再出现字符串 `/trellis:start`。
- [ ] 同一文件仍保留 `TRELLIS:START` / `TRELLIS:END` 标记。
- [ ] 仓库 root `./AGENTS.md` 与 `./docs-site/AGENTS.md` 内容与模板一致（除项目特定补充外）。
- [ ] `pnpm test` 全绿；`pnpm lint` 全绿。
- [ ] grep `/trellis:start` 在 `packages/cli/src/templates/markdown/` 下无残留。

## Definition of Done

- 模板文案改完，测试跑过。
- Release note 草稿（下一个 manifest 的 `notes` 里一行）已附到 PR 描述。
- Issue #192 在 PR 里被引用（`Closes #192`）。

## Out of Scope

- 不实装 `trellis update` 的 AGENTS.md managed-block 刷新（方案 C/D 留作后续单独 task）。
- 不新增 migration 条目（方案 B 也不做）。
- 不改 `filterCommands` 或 `start` 命令的分发策略。
- 不翻译 / 不新增 AGENTS.zh.md。

## Technical Notes

- 目标文件：
  - `packages/cli/src/templates/markdown/agents.md`（源）
  - `./AGENTS.md`（仓库自身）
  - `./docs-site/AGENTS.md`（docs-site 自身）
- 相关代码：
  - `packages/cli/src/configurators/shared.ts:195` — `filterCommands`
  - `packages/cli/src/commands/init.ts:1687` — `createRootFiles`
  - `packages/cli/src/templates/markdown/index.ts:27` — `agentsMdContent` 导出
- Issue: https://github.com/mindfold-xyz/trellis/issues/192（author: @nigiwen, 0.5.0-beta.13, Windows）
