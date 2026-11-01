<h1 align="center">mini-trellis</h1>

<p align="center"><strong>只要跨会话记忆，不要笨重的工作流枷锁。</strong></p>

<p align="center">
  为 AI 编程 Agent 留住架构约定、调研结论与排查经验，原地检索本地历史对话。<br/>
  同任务 Claude Code 实测耗时减少 <strong>38.4%（1.62×）</strong>、处理 Token 减少 <strong>40.1%</strong>；10 轮任务夹具下注入字符减少 <strong>86.9%</strong>。
</p>

<p align="center">纯本地 Markdown · 零向量库依赖 · 按需检索与记录 · 一行命令从 Trellis 迁移</p>

<p align="center">
  <a href="#实测性能与上下文开销">实测表现</a> ·
  <a href="#为什么选择-mini-trellis">方案对比</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#知识如何留下并再次使用">工作方式</a> ·
  <a href="./docs/using_CN.md">开发时怎么用</a> ·
  <a href="#支持的工具">支持工具</a> ·
  <a href="#从-trellis-迁移">迁移指南</a> ·
  <a href="./README.md">English</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/mini-trellis"><img src="https://img.shields.io/npm/v/mini-trellis?style=flat-square&amp;color=28785e" alt="npm 版本" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-64766f?style=flat-square" alt="AGPL-3.0 许可证" /></a>
</p>

![开发中的约定、研究结论与验证记录沉淀为项目知识，在后续工作中复用，并随新证据继续更新。](./docs/assets/knowledge-zh.svg)

用 Agent 写代码时，团队容易掉进两个极端：**要么每次新开会话都从零失忆开始**，上次定好的接口边界和踩过的坑又得重讲一遍；**要么套上沉重的阶段工作流**，启动塞进近万字手册、每轮对话注入状态、频繁拉起冷启动子代理，把简单改动拖成漫长的流程。

**mini-trellis 只保留项目记忆层，不接管你的开发流程：**

- **约定与经验跨会话延续**：接口规范（`spec`）、方案调研（`research`）与开发日志（`workspace`）保存为项目内可编辑的 Markdown，后续会话按需查阅、随新证据更新。
- **项目文档 + 本地历史对话统一检索**：需要查背景时，`mini-trellis mem recall` 同时检索项目 Markdown 与 Agent 本地历史对话，先返回短摘录；摘录不够用时再按 `ref` 展开原文。
- **开箱即用，零外部服务依赖**：不需要配置向量数据库、Embedding API 或后台服务；文件跟着 Git 走，规划、写代码和验收完全由你和 Agent 决定。

---

## 为什么选择 mini-trellis

| 对比维度 | 手写 `CLAUDE.md` / `AGENTS.md` | 向量数据库 / MCP 记忆服务 | 阶段门控工作流（如 Trellis） | **mini-trellis** |
| --- | --- | --- | --- | --- |
| **启动与每轮注入** | 越写越长，每次会话全量常驻 | 取决于插件，常伴随额外索引与网络延迟 | 启动注入 ~8.6k 字符 + 每轮状态 + 子代理重注入 | **仅启动注入 ~1.1k 字符短入口，每轮 0 注入** |
| **规范与结论加载方式** | 全量塞入，无关规则也占上下文 | 语义切块召回，易漏掉精确边界条件 | 子代理冷启动时重复读取规范 | **需要时 `mem recall` 看短摘录，不够再 `mem read`** |
| **本地历史对话查证** | 关掉窗口即不可查 | 需额外同步入库 | 依赖任务目录归档文件 | **原地直接检索 Claude / Codex / OpenCode / Pi 本地会话** |
| **知识演进与过期替换** | 靠人工删改，易留存过期冲突规则 | 新旧结论在向量空间混杂 | 散落在各历史 task 目录中 | **支持 `superseded` 演进标记，现行结论自动排在前面** |
| **外部依赖与心智负担** | 纯文件，无检索能力 | 需维护数据库、索引与 API Key | 需遵循固定阶段流程与子代理模板 | **纯本地 Markdown + 轻量 CLI，不强制任何工作流** |

---

## 实测性能与上下文开销

这里分两个维度展示数据：**一是 Claude Code 上的端到端任务实测耗时与处理 Token（减少 38.4% 耗时、40.1% 处理 Token）**；**二是 10 轮任务夹具上的静态注入字符数拆解（减少 86.9% 注入字符）**。两者口径不同，分开说明如下。

### 1. Claude Code 同任务端到端实测（耗时减少 38.4%，处理 Token 减少 40.1%）

在**同一套项目代码、同一份 `.trellis` 业务知识、同一个 Claude Code (`v2.1.306`) 与同一个模型（`deepseek-v4-flash`，思考程度 `max`）**下，对比 `mini-trellis v0.3.1` 与 `Trellis v0.7.0-beta.4`。6 组任务各独立运行 3 次（每侧 27 个会话）：

![同一宿主与模型下，各任务的中位耗时、处理 token 和累计结果](./docs/assets/v0.3.1-benchmark-zh.svg)

| 评测任务 | 考查场景 | 中位耗时 (mini / Trellis) | 耗时减少 | 中位处理 Token (mini / Trellis) | Token 减少 | 自动检查 |
| --- | --- | :---: | :---: | :---: | :---: | :---: |
| **空载启动开销** (`O00`) | 不读写文件仅回复 `pong`，测固定启动注入底噪 | **1.8s** / 2.9s | `-39.3%` | **11.6k** / 13.6k | `-14.8%` | 仅测启动 (3/3 完成) |
| **常规函数实现** (`N01`) | 按代码注释实现 `normalize_label` 并写单元测试 | **16.9s** / 18.6s | `-9.2%` | **84.9k** / 131.4k | `-35.4%` | 单元测试 3/3 通过 |
| **查规范：计算公式** (`R01`) | 从项目规范定位容量/流量计算公式与异常策略 | **14.5s** / 20.4s | `-28.8%` | **57.3k** / 79.3k | `-27.8%` | 公式与策略 3/3 通过 |
| **查规范：服务权限** (`R02`) | 从项目规范核对只读工具服务的 5 项权限边界 | **7.2s** / 16.3s | `-55.9%` | **38.8k** / 70.4k | `-44.9%` | 布尔与引文 3/3 通过 |
| **按规范实现业务代码** (`I01`) | 查阅业务规范并实现 `assess_notice` 核心逻辑与测试 | **49.8s** / 57.1s | `-12.7%` | **192.6k** / 248.7k | `-22.6%` | 27 项用例 3/3 通过 |
| **跨会话记规则与迭代** (`M01`) | 连续 4 个新会话：记规则 → 实现 → 改规则 → 更新实现 | **68.1s** / 132.9s | `-48.8%` | **426.0k** / 713.6k | `-40.3%` | 两阶段代码 3/3 通过 |
| **全部正式样本累计** | **6 组任务 × 3 次重复实际总和（非中位数相加）** | **472.2s** / 766.5s | **`-38.4%` (1.62×)** | **242.6万** / 405.3万 | **`-40.1%` (-162.7万)** | **自动检查全部通过** |

- **口径说明**：耗时为命令启动到结束的墙上时间（含工具执行）；**处理 Token** 为未缓存输入、输出与缓存命中读取之和（反映模型在多轮交互中处理的上下文总量，不等同于 API 账单费用）；自动检查涵盖代码题的外部单元测试与只读题的公式探针/布尔值/引文匹配校验。
- 实验环境、题目设计、全部 54 个会话的逐轮明细与跨会话四阶段拆解见 [《对比评测详细记录》](./docs/releases/benchmark-detail.md)（版本摘要见 [v0.3.1 版本说明](./docs/releases/v0.3.1.md)）。

### 2. 注入字符数拆解：为什么上下文更轻？（10 轮任务注入字符减少 86.9%）

下图展示的是 **Hook 与子代理注入文本的字符数对比**（v0.2.2 夹具数据，衡量固定与重复注入体积，而非端到端 Token 消耗）。阶段工作流在每次会话启动、每轮用户输入、每次派发子代理时都会注入状态或规范；`mini-trellis` 只保留启动短入口，规范与研究笔记按需读取一次后留在主会话上下文中：

![同一 10 轮开发任务下的上下文构成拆解与累计开销](./docs/assets/context-overhead-zh.svg)

在同一测试仓库中完成一次 10 轮后端修改任务，两边读取相同的 3 份后端规范（共 2,690 字符）和同一篇研究笔记（474 字符）：

| 环节 | 阶段门控工作流 | mini-trellis | 差异来源 |
| --- | ---: | ---: | --- |
| 会话启动 (`SessionStart`) | 7,883 字符 | **1,167 字符** | 去掉四阶段流程手册和全量目录树，只保留当前状态与查找入口 |
| 每轮对话 (`UserPromptSubmit` ×10) | 9,530 字符 | **0 字符** | 不注册每轮状态 Hook |
| 查找历史结论 (`recall` + `read`) | 1,621 字符 | **1,053 字符** | 先用 579 字符短摘录定位，再读 474 字符研究笔记全文 |
| 加载项目规范（3 份后端规范） | 18,585 字符 | **2,690 字符** | 主会话读取 3 份规范一次；不再向 `implement` + `check` 两个冷启动子代理重复注入 |
| **10 轮累计注入字符** | **37,619 字符** | **4,910 字符** | **规范与研究正文一字未减，注入字符数减少 86.9%（7.7×）** |

在包含 19 份领域规范（13.7 万字符）与 262 篇迁移笔记（237 万字符）的生产仓库中，`mini-trellis` 的会话启动注入仍保持在 **1,171 字符**，而阶段工作流单次任务的子代理注入达到 **12.7 万～51.2 万字符**。

---

## 快速开始

需要 **Node.js ≥ 18.17**、**Python ≥ 3.9** 与 Git。

### 1. 安装与初始化

在项目根目录执行：

```bash
npm install -g mini-trellis
mini-trellis init -u your-name --claude
```

按你实际使用的工具选择或组合参数（`--claude`、`--cursor`、`--codex`、`--opencode`、`--pi`、`--dsh`）。也可以直接把下面这段话发给正在使用的 Agent，让它完成安装或从 Trellis 迁移：

```text
请在当前项目安装或迁移 mini-trellis。若还没有命令，先执行 npm install -g mini-trellis。
如果项目里已有旧版工作流文件（例如 .trellis/workflow.md、.trellis/scripts/task.py，或 inject-*.py），先运行 mini-trellis migrate --dry-run，把计划给我看，确认后再执行 mini-trellis migrate -y。
如果是新项目，运行 mini-trellis init -u <name> -y，并只加上我实际使用的工具参数（--claude、--codex、--opencode、--pi、--dsh、--cursor）。
最后运行 mini-trellis doctor，并说明结果。不要删除 .trellis/spec、.trellis/research 或 .trellis/workspace。
```

### 2. 记录一条决定

开启新的 Agent 会话。日常写代码不需要额外操作；当你在开发中确认了一条后续会话还要用到的规则或排查结论时，让 Agent 保存并执行它的 `remember` 命令（例如在 Claude Code 中执行 `/mini-trellis:remember`）：

```text
这次确认：回调必须携带幂等键，transient 失败最多尝试 4 次（上游已确认幂等保障）。
请更新对应的规范或研究笔记，然后执行 remember 记录本次会话。
```

Agent 会把规则写入 `.trellis/spec/` 或 `.trellis/research/`，并在 `.trellis/workspace/<你>/` 的开发日志里留下简短记录与文件链接。

### 3. 在后续会话按需找回

下次新开会话改到相关模块、或者你想在终端查证当时的决定时，用 `recall` 同时检索项目 Markdown 和本地对话历史：

```bash
mini-trellis mem recall "回调 重试"
```

`recall` 会返回几条短摘录、来源路径以及对应的 `<ref>` 标识：

```text
[doc] .trellis/spec/backend/callback-retries.md:1  § 回调重试规则  strong
  ref: <ref-from-recall>
  transient 失败总共最多尝试 4 次（含首次），上游已确认幂等保障；permanent 失败只尝试 1 次。

[session] claude:a8f2c104  strong
  ref: <ref-from-recall>
  确认把 transient 回调总尝试次数改为 4 次，保留变更原因：上游已经确认幂等保障。
```

**多数时候看短摘录就够直接改代码了**。只有当摘录不够、需要查看完整段落或当时对话的上下文时，才把上面输出里的真实 `<ref>` 复制给 `read`：

```bash
mini-trellis mem read "<ref>"
```

---

## 知识如何留下并再次使用

以一个支付服务为例：重复回调曾导致重复扣款。问题修好后，把结论留在项目里，下次涉及这块逻辑时就能随时查证：

| 留下什么 | 存储位置 | 内容示例 | 什么时候会用到 |
| --- | --- | --- | --- |
| **项目约定 (`spec`)** | `.trellis/spec/` | 每个回调必须携带幂等键（先读对应目录的 `index.md`） | 修改回调接口、需要确认既有边界约定时 |
| **研究与依据 (`research`)** | `.trellis/research/` | 重试条件、备选方案、支付平台文档链接（旧结论可归入 `archive/`） | 支付平台 API 变化，需要重审当初为什么这么选时 |
| **开发记录 (`workspace`)** | `.trellis/workspace/<你>/` | 重复扣款的根因、改了哪几个文件、哪条测试验证通过 | 收到类似故障报告，顺着日志链接找回上次排查过程时 |
| **本地对话历史 (`mem`)** | Agent 本地会话目录 | 当时的原始讨论，通过 `mini-trellis mem` 原地检索 | 需要分清某条方案是“提过但否决了”还是“最终决定”时 |

### 按需使用，不绑架日常流程

- **普通改动直接写代码**：不需要为了走流程先建任务，也不用每次改完都打卡记日志。
- **拿不准历史边界时再查**：遇到老模块或历史决定时跑一次 `mem recall`；短摘录够用就直接改，不够再 `mem read "<ref>"`。只查对话历史时也可以用 `mem search` 配合 `mem context <session-id>`。
- **有长期价值的结论才记**：只有定下了以后还要遵守的约定（用 `mini-trellis-update-spec` 写入 `spec`）或值得复用的调研/排障结论（已有同主题文件则直接更新原文件，再用 `remember` 留一条日志）时，才需要记录。新安装默认只写文件，不自动执行 Git commit。

> 一次完整需求修改的具体操作见 [《开发时怎么用》](./docs/using_CN.md)。

---

## 支持的工具

支持单个或组合安装（例如 `mini-trellis init -u your-name --claude --cursor`）：

| Agent 工具 | 初始化参数 | 记录当前会话 | 项目知识与历史检索支持 |
| --- | --- | --- | --- |
| **Claude Code** | `--claude` | `/mini-trellis:remember` | `SessionStart` 注入短入口；支持项目文档与 `~/.claude/projects` 本地历史检索 |
| **Cursor** | `--cursor` | `mini-trellis-remember` | 安装 `.cursor/skills/` 和本地 `sessionStart`。Hook 可以执行，而 `additional_context` 仍可能到不了 Agent 提示；可用的是 `AGENTS.md` 和 `mem recall`。云端不运行 `sessionStart`。不解析对话历史 |
| **Codex** | `--codex` | `$mini-trellis-remember` | 支持项目 Hook 注入与本地会话历史检索 |
| **OpenCode** | `--opencode` | `/mini-trellis:remember` | 支持启动入口与本地会话检索（含 `--include-children` 子代理会话合并） |
| **Pi** | `--pi` | `/mini-trellis-remember` | 支持启动入口与本地会话检索 |
| **DeepSeek Harness** | `--dsh` | `mini-trellis-remember` | 安装 `.dsh/skills/`，无项目级 `SessionStart`，由模型按需调用 `mem recall` / `mem read` |

<details>
<summary><strong>查看 Codex 信任配置与各宿主边界说明</strong></summary>

- **Codex 首次启用步骤**：
  1. 在项目目录运行 `codex`，确认项目信任提示（若项目配置被禁用，按提示在 `~/.codex/config.toml` 中信任解析后的项目路径）。
  2. 打开 `/hooks` 审核并批准项目 Hook（项目信任与 Hook 信任分别检查，`untrusted` 状态不会生效）。
  3. 如当前版本要求显式开启，在用户配置的 `[features]` 下设置 `hooks = true`。
  4. 运行 `mini-trellis doctor`，随后开启新会话。
- **宿主边界说明**：
  - DeepSeek Harness 无项目级 `SessionStart` 注入点，不解析 `~/.dsh/sessions` 压缩转录本；
  - Cursor 本地可以运行 `sessionStart`，Hooks 日志也可能写成已经合并，但 `additional_context` 不一定进入 Agent 提示。在 Cursor 3.27.22 的 Agent 对话里核对过：hook 退出码为 0，模型没有收到短入口。使用 `AGENTS.md` 里的说明、技能 `mini-trellis-remember` 和 `mini-trellis mem recall`。云端不运行 `sessionStart`，也不解析 Cursor 对话历史；
  - OpenCode 与 Pi 支持列出会话与检索，暂无精确 compact 边界恢复。详见 [v0.3.1 版本说明](./docs/releases/v0.3.1.md)。

</details>

---

## 从 Trellis 迁移与日常升级

已有 `Trellis` 的项目可以通过 `migrate` 转换（两者共用 `.trellis/`，请通过迁移替换已有集成，避免两套指令同时生效）：

```bash
mini-trellis migrate --dry-run   # 先预览迁移计划
mini-trellis migrate             # 确认后执行迁移
```

- **保留全部沉淀知识**：原 `.trellis/spec/`、`.trellis/research/` 和 `.trellis/workspace/` 完整保留；
- **收敛旧任务目录**：将 `.trellis/tasks/` 中的研究内容提取为 research 主题，其余任务文件默认归档到 `legacy/`，并替换 Trellis 专用流程文件与脚本。

<details>
<summary><strong>查看日常升级（upgrade / refresh）与卸载说明</strong></summary>

迁移或更新前请先备份 `.trellis/`、`AGENTS.md` 及已配置的 Agent 目录（包含被 Git 忽略的文件）。

```bash
mini-trellis upgrade             # 更新全局 CLI
mini-trellis refresh --dry-run   # 预览受管文件更新
mini-trellis refresh             # 仅更新未被本地修改的受管文件，保留知识与自定义配置
mini-trellis doctor              # 检查当前项目集成状态
```

- 查看已配置工具：`mini-trellis platforms`
- 卸载提醒：执行 `mini-trellis uninstall` 会移除 `.trellis/` 目录（含其中的知识文件），请先备份。路径映射与冲突处理见 [《迁移指南》](./docs/migration_CN.md)。

</details>

---

## 参与项目与致谢

问题反馈与实际使用案例欢迎提交到 [Issues](https://github.com/Tiger-zzZ/mini-trellis/issues)。本地开发说明见 [CONTRIBUTING_CN](./CONTRIBUTING_CN.md)。社区：[Linux.do](https://linux.do/)。

mini-trellis 演进自开源项目 [Trellis](https://github.com/mindfold-ai/Trellis)，感谢早期贡献者奠定的基础。采用 [AGPL-3.0](./LICENSE) 许可证发布；原版权归 Mindfold LLC 所有，修改声明和贡献者署名保留在 [COPYRIGHT](./COPYRIGHT) 中。
