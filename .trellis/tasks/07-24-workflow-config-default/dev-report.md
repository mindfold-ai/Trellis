# 开发报告:分层 workflow 默认(config + 个人层覆盖)

> 任务:`07-24-workflow-config-default` · 分支 `feat/workflow-config-default`(基于 467)· 提交 `1d18dd8c`
> 基线对比:`feat/per-task-workflow-selection`(即 467)
> 本报告每条结论后附**证据(命令/文件:行)**,未取证的判断一律不写。

---

## 0. 结论摘要

1. **有没有自己造钩子?——没有。** 本任务新增钩子数 = 0,新增钩子注册 = 0,改动既有钩子脚本 = 0。唯一沾"hook"边的是既有 OpenCode 插件 `inject-workflow-state.js` 里一个既有函数 `resolveWorkflowMd` 的扩展,不是新钩子。
2. **做了什么:** 给既有的 3 个 `common/` 模块加了纯读取/解析函数,把 467 的解析链从"任务→全局"扩成"任务→个人→团队→全局",并在既有 OpenCode 插件里镜像同一规则。既有钩子消费方**一行没改**,靠既有的 `resolve_workflow_md` 白继承。
3. **符合规范:** 逐条对照 `script-conventions.md`、`CONTRIBUTING.md` 的镜像规矩、`#212` 单一导出约束、`workflow-state-contract.md` 契约——全部符合(§3 有引用)。

---

## 1. 有没有自己造钩子(核心问题)

**结论:没有。** 证据:

| 检查项 | 命令 | 结果 |
|---|---|---|
| 改动文件里有无 hook 脚本 | `git diff --name-only $BASE HEAD \| grep -iE "hook\|session-start\|inject-\|settings.json\|hooks.json"` | 仅 `inject-workflow-state.js`(既有插件),**无新 hook** |
| 新增文件(A 状态) | `git diff --name-status $BASE HEAD \| grep "^A"` | 只有 6 个任务工件 + 1 个测试 `workflow-layered-default.integration.test.ts`。**无 hook 文件新增** |
| 钩子分发表 `SHARED_HOOKS_BY_PLATFORM` | `git diff $BASE HEAD -- shared-hooks/index.ts \| wc -l` | **0 行** |
| 各平台 hook 注册(settings.json / hooks.json / .kiro.hook) | `git diff --name-only \| grep -iE "settings.json\|hooks.json\|.kiro.hook"` | **无任何命中** |
| 既有 hook 消费方是否被改 | `git diff --name-only \| grep -E "session-start.py\|inject-workflow-state.py\|workflow_phase.py"` | **无命中**——三个消费方本任务未改动 |

**关键机制(为什么不用造钩子):** 全项目所有 workflow 消费方(SessionStart 各平台 hook、每轮 breadcrumb hook、`get_context --mode phase`、OpenCode 插件)都调用同一个解析入口 `common/workflow_selection.py::resolve_workflow_md`。本任务只扩这**一个函数**的内部链条,消费方**自动继承**,因此**不需要、也没有**新增任何钩子或注册。这正是"复用既有单一入口、不造轮子"。

> 关于 `inject-workflow-state.js`:它是 467/更早就存在的 OpenCode 插件,本任务只改其中 `resolveWorkflowMd()` 一个函数体,并**保持单一 `export default`**(见 §3 的 #212 检查)。它不是本任务新造的钩子。

---

## 2. 具体做了什么(逐文件,附改动量证据)

`git diff --stat $BASE HEAD`(排除任务工件),模板与 live 镜像成对出现:

| 文件 | 改动 | 做了什么 |
|---|---|---|
| `common/config.py`(模板+live) | `18+0-` ×2 | 新增 `get_default_workflow()` 读 config.yaml 顶层 `default_workflow`(团队默认层) |
| `common/paths.py`(模板+live) | `28+0-` ×2 | 新增 `get_developer_workflow()` 读 `.developer` 的 `workflow=` 行(个人层) |
| `common/workflow_selection.py`(模板+live) | `93+24-` ×2 | 拆出 `_task_pin_variant`、新增 `_library_variant`/`_developer_workflow_id`/`_config_default_id`/`_default_workflow_md`,把回退从"直接全局"改为**个人→团队→全局**链 |
| `config.yaml`(模板+live) | `15+0-` ×2 | 在 `default_package` 旁加注释掉的 `default_workflow:` 说明块 |
| `opencode/plugins/inject-workflow-state.js`(模板+live) | `103` ×2 | 在既有 `resolveWorkflowMd` 里移植同一条链(纯 JS 行扫描读 `.developer`/`config.yaml`,无新依赖) |
| `spec/cli/backend/workflow-state-contract.md` | `46` | 把解析顺序更新为 4 层链 + 出处标注 |
| `test/scripts/workflow-layered-default.integration.test.ts` | 新增 181 行 | 11 个 Python 优先级/回退/向后兼容/路径穿越用例 |
| `test/templates/opencode.test.ts` | +74 | 6 个 OpenCode 端到端 parity 用例 |

**解析优先级(最终实现):** 任务 pin(467)> 个人 `.developer` > 团队 `config.yaml` > 全局 `workflow.md`;每层无效/文件缺失即向下掉;两个新 key 都不设时与 467 逐字节一致。

---

## 3. 规范符合性检查(逐条引用)

| 规范 | 出处 | 本任务是否符合 | 证据 |
|---|---|---|---|
| **config 读取归 `config.py`** | `script-conventions.md:32`("config.py # Config reader") | ✅ | `get_default_workflow` 放在 `config.py`,复用 `_load_config` |
| **开发者身份读取模式** | `script-conventions.md:44`("get_developer.py") | ✅ | `get_developer_workflow` 照 `get_developer`(paths.py:88)的行扫描写 |
| **警告走 stderr,不污染 stdout** | `script-conventions.md:296`("Use print(..., file=sys.stderr)") | ✅ | 任务 pin 的两处警告均 `file=sys.stderr` |
| **读取端 never-raise / fail-open** | `script-conventions.md:306`("never raises") | ✅ | `_developer_workflow_id`/`_config_default_id` 均 `except Exception: return None`(workflow_selection.py:71,81) |
| **改 .trellis/.claude 要同步 templates** | `CONTRIBUTING.md:101` | ✅ | 4 组文件模板↔live 改动量逐一相等(config.py 18=18、paths.py 28=28、workflow_selection 93+24-=93+24-、config.yaml 15=15) |
| **OpenCode 插件仅单一 default export** | 回归测试 `#212` | ✅ | `grep -c "^export"` = 1,仅 `export default`(第 278 行) |
| **workflow 解析契约单一来源** | `workflow-state-contract.md` | ✅ | 只改 `resolve_workflow_md` 一处;文档已更新为 4 层链并标注转写出处 |
| **id 不可路径穿越** | 既有 `WORKFLOW_ID_RE`(workflow_selection.py:38) | ✅ | 所有层经 `_library_variant` 用同一正则校验;测试含 `../../etc/passwd` 用例 |

> 一处**故意为测试可绕开 #212 而调整**的记录:曾尝试给 `resolveWorkflowMd` 加 named export 以便单测,被 `#212` 回归测试拦下 → 已回退,改为通过插件 default export 端到端驱动测试(`opencode.test.ts` 的 6 个 parity 用例)。这是"遵守既有约束、不硬改"的实例。

---

## 4. 验证证据

| 验证 | 结果 |
|---|---|
| `pnpm lint` / `pnpm typecheck` | 通过(0 错) |
| `pnpm lint:py`(basedpyright) | `0 errors, 64 warnings`(64 个是既有、非本任务引入) |
| `LC_ALL=C LANG=C pnpm test` 全量 | cli **1570 passed** / core **333 passed**,0 失败(含本任务 11+6=17 个新测试) |
| Python 优先级矩阵(手验) | 9/9 通过 |
| JS↔Python parity(手验) | 8/8 一致(含"注释行被忽略"边界) |
| `trellis-check` 独立质检 | **PASS,0 缺陷,0 改动**,~50 用例覆盖优先级/字节一致/双实现对齐/镜像对齐 |
| pre-commit 全量套件 | 提交 `1d18dd8c` 时通过 |

---

## 5. 诚实的遗留与状态

- **两个假设仍为"待同事确认",未关闭**(与已提交的 `prd.md`、`workflow-state-contract.md` 出处标注保持一致):
  - (a) **个人层存 `.developer`**:转写 16:44:23–39 只明确了 `.developer` 是"个人层"这个**文件角色**,**并没有**说"把 workflow id 存进 `.developer`"。存哪(复用 `.developer` vs 新开 `.trellis/.workflow-local`)仍是**待定选择**。现实现选 `.developer`(最小复用、向后兼容),待确认。
  - (b) **任务 pin > 个人层**:转写只规定了"个人 > 团队",**没有**排过"任务 pin vs 个人"的序。现实现让 pin 压过个人(显式任务意图 > 开发者级默认),属**产品选择**,待确认。
- **per-session 层:确认不做**(用户 2026-07-24 拍板"session 之间不用区分")。研究已证明既有会话文件 `.runtime/sessions/` 在 `task.py finish` 时自删、且依赖脆弱的 session-id 识别,不适合承载"不能丢失"的选择——故不走该路。
- **Pi / OMP 降级(已知)**:`.pi`/`.omp` 扩展硬编码读全局 `.trellis/workflow.md`,**三个新层(任务/个人/团队)在这两个平台均不生效**。这是 467 就有的 per-task 降级、本任务把它扩到了新层。`workflow-state-contract.md` 的降级注记目前只写了 per-task,**偏窄**(待决定是否拓宽措辞)。
- **不属于本任务、但记录在案的存疑**:467 的 `trellis workflow --save` 命令可能冗余("用之前先 save"的别扭)——那是 467 的范围,不在本任务 diff 内。

---

*本报告全部结论均由上文命令输出与 file:line 引用支撑;未取证处不做断言。*
