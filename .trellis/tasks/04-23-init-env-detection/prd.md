# trellis init 环境检测

## Goal

梳理并改进 `trellis init` 的环境检测能力，明确哪些运行前提应该被检测、哪些应该只提示不阻塞，以及检测结果如何反馈给用户，避免当前只做零散 Python / Windows 分支判断，遗漏更关键的版本或平台前置条件。

## What I already know

- 当前 `trellis init` 已有 **Python 版本检测**，通过 `warnIfPythonVersionTooOld()` 对将要实际使用的 `python` / `python3` 做 warning，但不阻塞初始化。
- 当前 `trellis init` 已有极轻量的 **OS 分支**：
  - `getPythonCommandForPlatform()` 按 `process.platform` 决定模板里渲染 `python` 还是 `python3`
  - Windows 且选中了带 Python hooks 的平台时，会打印一条提示
- 当前 `trellis init` 会写 `.trellis/.version`，但这只是记录当前 CLI 版本，不是“环境版本比对”。
- 当前没有看到：
  - Node 版本检测
  - 更完整的 OS / arch 检测
  - `init` 阶段的 Trellis 版本迁移判断
  - 对不同 AI 平台能力差异的显式前置检查
- `packages/cli/package.json` 已声明 `engines.node = ">=18.17.0"`。这意味着用户如果能正常执行当前 CLI，Node 版本往往已经在 npm / pnpm 安装或启动链路上被筛过一轮；相比之下，Python 更像 `init` 期间“模板能写出来，但后续 hooks / scripts 可能跑不起来”的真实风险点。
- spec 也明确 Trellis workflow scripts 的目标前提是 **Python 3.9+**，并强调 Windows 与 macOS/Linux 的 `python` / `python3` 差异需要统一文案与实际行为。
- 用户明确要求：Windows / macOS / Linux 在本任务里不是“兼容风险”问题，而是 **需要根据 OS 做正确适配**。例如生成的各平台 hook / settings / 帮助文案在 Windows 应该用 `python`，在 macOS/Linux 应该用 `python3`；这不是“不支持 Windows”，而是必须输出对的平台配置。
- 相关代码位置：
  - `packages/cli/src/commands/init.ts`
  - `packages/cli/src/configurators/shared.ts`

## Assumptions (temporary)

- A1: 这个任务的目标不只是“回答现在有没有检测”，而是要补设计 / 补实现。
- A2: 检测应尽量贴近真实运行前提，避免“文案说支持，但初始化后实际跑不起来”。
- A3: 范围只覆盖 `trellis init`，不顺手统一 `update` / `task.py init-context` / hooks 的环境检测。
- A4: `init` 阶段的环境检测更适合做成分层策略：fatal / warning / note，而不是全部 hard fail。
- A5: 第一版 hard-fail 规则已经收敛：缺 Python hard fail；Python < 3.9 hard fail。
- A6: OS 相关工作以“正确适配生成结果”为主，而不是声明某个平台存在兼容风险或不支持。
- A7: OS 检测结果既要体现在生成内容里，也要在终端有显式提示，帮助用户确认 `init` 已按当前系统适配。

## Open Questions

- 当前无阻塞问题。需求已收敛，可进入实现。

## Requirements (evolving)

- [ ] 明确 `trellis init` 当前已有的检测项、缺失项、误导项
- [ ] 定义应该检测的环境维度（版本 / OS / 平台能力 / 依赖命令等）
- [ ] 定义每类检测的反馈级别（阻塞 / warning / note）
- [ ] 采用分层混合策略：对“当前就会失败”的前提 hard fail，其余只提示
- [ ] MVP 同时覆盖运行前提校验 + OS 正确适配，但保持最小闭环
- [ ] MVP 优先解决 Python 前提与 Windows/macOS/Linux 差异这两类真实高频问题；Node 若无额外价值可不在 `init` 内重复检测
- [ ] 第一版不在 `init` 内重复做 Node 检测
- [ ] 第一版 hard-fail：缺 Python；Python < 3.9
- [ ] 第一版 OS 适配至少覆盖模板生成结果中的 `python` / `python3`、hook/settings 配置、相关帮助文案
- [ ] 第一版 OS 检测结果除影响生成内容外，还需在终端输出一条显式适配提示
- [ ] 输出与现有 CLI 架构兼容的落地方案

## Acceptance Criteria (evolving)

- [ ] 能清楚回答 `trellis init` 在哪些条件下会检测、提示、阻塞
- [ ] 新增或调整后的检测逻辑覆盖实际关键前提，而不是只做表面文案
- [ ] 至少有对应测试覆盖核心分支
- [ ] 文档 / changelog 在行为变更时同步更新

## Definition of Done (team quality bar)

- Tests added/updated (unit/integration where appropriate)
- Lint / typecheck / CI green
- Docs/notes updated if behavior changes
- Rollout/rollback considered if risky

## Out of Scope (explicit)

- 不在本任务里重做整套 platform registry 架构
- 不在本任务里顺带重构非环境检测的 `init` 流程
- 不在没有明确收益的前提下引入重量级诊断框架

## Technical Notes

- `packages/cli/src/commands/init.ts:81` — `warnIfPythonVersionTooOld(command)`
- `packages/cli/src/commands/init.ts:902` — `init()` 调用 Python 版本 warning
- `packages/cli/src/commands/init.ts:1573` — Windows 分支提示
- `packages/cli/src/commands/init.ts:1560` — 写 `.trellis/.version`
- `packages/cli/src/configurators/shared.ts:14` — `getPythonCommandForPlatform()`
- `packages/cli/package.json` — `engines.node = >=18.17.0`
- `.trellis/spec/cli/backend/script-conventions.md` — Python 3.9+ 与跨平台 `python`/`python3` 约束
- `implement.jsonl` / `check.jsonl` 已初始化
- 额外 context 已加入：
  - `.trellis/spec/cli/backend/script-conventions.md`
  - `.trellis/spec/guides/cross-platform-thinking-guide.md`
  - `.trellis/spec/cli/unit-test/index.md`
