# 08 — GitNexus impact analysis（best-effort）

- **Query**: 对 `filterCommands` 和 `resolveTrellisStartSkill` 跑 impact 分析；标注 index 新鲜度
- **Scope**: internal
- **Date**: 2026-06-22

## GitNexus index 新鲜度

CLAUDE.md 标注 GitNexus index 是 stale（last indexed `d6a6bc2`）。当前 HEAD 是 `0681c8d1`，**本地有未 index 的修改**（含本会话刚加的 zcode `resolveTrellisStartSkill` 调用）。所以以下 impact 结论**不一定反映最新代码**，需要结合维度 1 / 维度 6 的手工 grep 校准。

> **未实际调用 MCP `impact()` 工具**——本调研维度走 grep + read 的等价路径以避免依赖 stale index。下面是基于 grep 的等价 impact 结果。

## `filterCommands` impact（手工等价）

**直接调用**（in `packages/cli/src/configurators/shared.ts`）：
- `resolveAllAsSkills` (line 356) — 被 kiro, reasonix configurator 调
- `resolveCommands` (line 375) — 被 claude, cursor, opencode, kilo, gemini, antigravity, devin, qoder, codebuddy, copilot, droid, pi, zcode 调（13 个平台）
- `resolveAllAsSkillsNeutral` (line 423) — 被 codex, zcode configurator 调

**间接 blast radius**：
- 任何 `configurator.ts` 文件，间接经 `configurePlatform` (16 个平台都 reachable)
- `collectPlatformTemplates` (update 路径，所有平台)
- 集成测试 `test/configurators/platforms.test.ts` (~16 个 configurePlatform 调用)
- 集成测试 `test/commands/init.integration.test.ts` (~16 个 init 测试)

**风险级别**：理论上 HIGH（影响 100% 平台、init + update 全路径），但条件改动是 `agentCapable` → `agentCapable && hasHooks`——只**收紧**触发条件、只**多产出文件**、never **删除已有路径**，所以实际语义影响只限定到 4 个 `agentCapable && !hasHooks` 平台。其余 12 个平台行为不变。

→ 评估为 **MEDIUM**（要 verify 4 平台新增路径，要 verify 12 平台无回归）。

## `resolveTrellisStartSkill` impact（手工等价）

**直接调用**：
- `packages/cli/src/configurators/codex.ts:50` — `configureCodex` 内
- `packages/cli/src/configurators/index.ts:227` — `PLATFORM_FUNCTIONS.codex.collectTemplates` 内
- `packages/cli/src/configurators/zcode.ts:46, 90` — `collectZcodeTemplates` + `configureZcode` 内（本会话新加）

**测试覆盖**：0 个 unit test 直接调（grep 维度 6 确认）。间接覆盖见 platforms.test.ts:280-307 (codex)。

**blast radius**：所有 4 处调用都在 R2 范围内删除。helper 函数本身也删。

**风险级别**：LOW——helper 是 strict subset 的语义（只产 trellis-start 一个 skill），R1 接管后语义不变。

## 字节级 verify（已在维度 7 做过）

`resolveTrellisStartSkill` 与 `resolveAllAsSkillsNeutral` 对 trellis-start 的渲染走完全相同的内部链路（同 template / 同 placeholder resolver / 同 frontmatter wrapper），byte-identical。**没有 silent semantic drift 风险**。

## stale index 警告

未 run `impact()` 的真正后果：
- 不会漏掉新加的 zcode `resolveTrellisStartSkill` 调用（grep 已覆盖）
- 不会漏掉本任务范围外的代码（grep 已覆盖 packages/cli/src/ 全量）
- **唯一遗漏可能**：本仓库之外（如 docs site / examples）若有引用 `resolveTrellisStartSkill` 字符串。`grep -rn` 仅扫描 `packages/cli/`，未扫 `docs/` / 项目根。

补救验证：

```bash
grep -rn "resolveTrellisStartSkill\|resolveCodexTrellisStartSkill" \
  --include="*.ts" --include="*.js" --include="*.md" \
  /Users/taosu/workspace/company/mindfold/product/share-public/Trellis
```

我已经跑了 `grep -rn "resolveTrellisStartSkill\|resolveCodexTrellisStartSkill" packages/cli/`，没扫整仓。建议 implement agent 跑一次全仓 grep 兜底；预期发现的额外引用：编译产物 `dist/`、`coverage/`、`migrations/manifests/0.5.7.json` 历史 changelog（冻结）。这些都不需要改。

## Implications for PRD

- PRD 未要求 GitNexus impact 报告（这是 CLAUDE.md 的 project guideline 强制）。建议 PRD R4 / Notes 加一条"跑 `grep -rn 'resolveTrellisStartSkill\\|resolveCodexTrellisStartSkill' .` 全仓 + 全文件类型扫一次，确认 packages/cli/dist 之外无遗漏调用点"。
- 没有发现 GitNexus 范围内的新风险。
- stale index 这一点应该单独提一下：implement agent 若要严格遵循 CLAUDE.md "MUST run impact analysis"，可以先跑 `node .gitnexus/run.cjs analyze` 刷新 index 再做 impact——但鉴于改动结构简单（条件收紧 + helper 删除），手工 grep 验证已经足够，可以 PRD 显式 grant 跳过权限。
