# Technical Design: Grok 适配补全与回归验证

## Scope Boundary

本阶段只修复前期审查中已有明确证据的三个缺口：JSONL seeding、update marker、Python 执行级测试。不改变 Grok CLI 参数策略、恢复语义或会话环境变量设计。

## Change Design

### 1. Task context seeding

`task_store.py` 通过 `_SUBAGENT_CONFIG_DIRS` 判断仓库是否配置了可使用 implement/check subagent 上下文的 AI 平台。将 `.grok` 添加到该平台目录集合后，既有任务创建流程会复用统一的 JSONL 初始化逻辑，无需新增 Grok 分支。

同步维护两份文件：

- `packages/cli/src/templates/trellis/scripts/common/task_store.py`：发布模板源；
- `.trellis/scripts/common/task_store.py`：当前仓库 dogfood 运行副本。

为了恢复模板与 dogfood 一致性，dogfood 列表同时补齐此前缺少的 `.trae`、`.zcode`。

### 2. Update regression expectation

更新 `packages/cli/test/commands/update.integration.test.ts` 中 pull-based 平台 marker 的精确字符串，使其与 workflow 模板当前生成内容一致。

### 3. Python execution tests

沿用仓库现有 Vitest + Python subprocess 模式，通过临时目录和 JSON stdout 执行真实 Python 模块，覆盖：

- `CLIAdapter("grok")` 的 config/commands 路径；
- run/resume argv；
- 仅 `.grok/` 存在时的平台检测；
- `GROK_SESSION_ID` 的 active-task session id 读取。

测试同时面向模板源和必要的 dogfood 同步契约，避免字符串存在但代码不可执行的假阳性。

## Validation Strategy

1. 新增/更新测试的最小针对性运行；
2. Grok 模板、configurator、regression 和 update 集成测试；
3. `pnpm lint`、`pnpm typecheck`、`pnpm lint:py`、`pnpm build`、`git diff --check`；
4. 能力允许时运行 CLI 全量测试，并单独记录 marketplace 缺失和网络超时等环境性失败；
5. GitNexus `detect_changes --scope compare --base-ref main` 核对最终影响。
