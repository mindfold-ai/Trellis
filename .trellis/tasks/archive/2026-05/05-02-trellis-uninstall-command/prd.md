# trellis uninstall command

## Goal

提供 `trellis uninstall` 命令，把 Trellis 在项目里写入的所有内容（各平台 configDir 下的 trellis 相关文件 + `.trellis/` 目录本身）一次性清理干净，方便用户卸载或换工具对比。

Issue: #221

## Requirements

* 新增 `trellis uninstall` CLI 命令
* 删除范围：
  * `.trellis/` 目录整体（含 tasks、runtime、developer、config 等所有内容）
  * 所有 platform 写入的 trellis 管理文件，依据 `.trellis/.template-hashes.json` manifest 精确删除
  * 删除后的空目录递归清理（复用 `cleanupEmptyDirs`）
* **删除依据**：`.trellis/.template-hashes.json` manifest 是唯一的删除依据。manifest 里没有的文件（用户自己创建的）永远不动 —— 例如用户自己加在 `.cursor/hooks/my-hook.py` 的脚本。
* **用户魔改的处理**：manifest 里的文件，即使用户改过（hash 不一致），仍然删除。理由：用户既然要卸载 trellis，同名脚本/agent/skill 不再有意义。
* **按文件内容类型分两类处理**：
  * **类型 A：纯内容文件 → 整删（不论 hash）**
    * 所有 `.py` / `.md` / `.ts` / `.sh` 等 opaque 文件
    * 包括所有 hooks 脚本、agent markdown、skill markdown、command markdown、`.pi/extensions/trellis/index.ts` 等
  * **类型 B：结构化配置文件 → scrubber 剥离 trellis 字段**
    * **B1 - Hooks JSON（统一 scrubber，支持嵌套/扁平两种 schema）—— 8 个文件**
      * 嵌套 schema (`hooks.{event}.[].hooks.[].command`)：`.claude/settings.json` / `.gemini/settings.json` / `.factory/settings.json` / `.codebuddy/settings.json` / `.qoder/settings.json` / `.codex/hooks.json`
      * 扁平 schema (`hooks.{event}.[].command`)：`.cursor/hooks.json` / `.github/copilot/hooks.json`
      * 规则：剥离 `command` 指向 manifest 待删文件路径的 hook entry，自下而上清空容器
    * **B2 - 字段类专用 scrubber —— 3 个文件**
      * `.opencode/package.json`：移除 `dependencies["@opencode-ai/plugin"]`；空 deps 删字段
      * `.pi/settings.json`：从 `extensions` / `skills` / `prompts` 数组移除 trellis 条目；移除 `enableSkillCommands` 字段
      * `.codex/config.toml`：移除 `project_doc_fallback_filenames` 字段 + trellis 引导注释段
  * 任何 scrubber 处理后文件变成空 / 仅剩空字段 → 删除文件；否则写回
* **默认 UX**：`trellis uninstall` 单命令完成
  1. 扫描 manifest，把待处理文件分两栏列出：
     * **Will be deleted**：所有纯内容文件 + scrubber 处理后会变空的结构化文件 + `.trellis/` 目录
     * **Will be modified**：结构化文件中保留用户字段、只剥离 trellis 部分的（列出每个文件 + 简短说明剥离了什么）
  2. 提示 `Continue? [Y/n]`（**默认 Y**，回车即确认）
  3. 用户输入 `n` / `no` → 退出 0，不删
  4. 用户回车 / `y` / `yes` → 执行
* 支持 `--yes` / `-y` 跳过提示直接执行（脚本场景）
* 支持 `--dry-run` 只打印清单后退出，不进入提示也不执行
* 不区分文件是否被用户改过（用户明确要求"全删"）
* 不保留任何 trellis 数据（含 tasks / .developer）
* **预检**：命令第一步检测当前目录下是否存在 `.trellis/` 目录
  * 不存在 → 输出 `Trellis is not installed in this project (no .trellis/ directory found).` 退出 0
  * 存在但 `.trellis/.template-hashes.json` 缺失 → 输出 `Trellis directory found but manifest is missing — cannot determine which platform files to remove. You can manually delete .trellis/ if needed.` 退出 1
  * 都存在 → 进入正常流程

## Acceptance Criteria

* [ ] `trellis uninstall` 默认输出两栏清单（Will be deleted / Will be modified）+ `Continue? [Y/n]`
* [ ] 用户回车 / 输入 `y` / `yes` → 执行删除和修改
* [ ] 用户输入 `n` / `no` → 退出 0，不修改任何文件
* [ ] `trellis uninstall --dry-run` 列出所有清单后退出，不进入提示
* [ ] `trellis uninstall --yes` / `-y` 直接执行，不交互
* [ ] 执行后：manifest 中所有路径不存在；`.trellis/` 目录不存在；产生的空 platform 目录（如空 `.claude/`）被清理
* [ ] platform 目录下的非 trellis 文件（用户自己的 hook/agent）不被误删
* [ ] `.claude/settings.json` 中用户自定义字段（如 `model`、`permissions`、非 trellis 的 hook entry）保留；trellis 的 hook entry 被剥离
* [ ] settings.json 剥离后若仅剩空 hooks 对象 → 文件被删除；否则保留
* [ ] 在没有 `.trellis/` 目录的项目运行 → 友好提示 + 退出 0
* [ ] 在有 `.trellis/` 但缺 manifest 的项目运行 → 提示无法确定删除范围 + 退出 1
* [ ] 输出末尾打印 summary（删除文件数 + 删除目录数）

## Definition of Done

* 单测覆盖 dry-run / 实际执行 / 无 manifest / `--yes` / 空目录清理 / 不误删
* 集成测试：init → uninstall → 项目状态 clean（无 `.trellis/`、无 trellis 管理文件）
* lint / typecheck / vitest 全绿
* README / docs-site 增加 uninstall 命令说明
* CHANGELOG 记录

## Technical Approach

**入口**：`packages/cli/src/commands/uninstall.ts`（新文件），按 init/update 现有风格。

**步骤**：
1. 读取 `.trellis/.template-hashes.json` → 得到 `hashes: { "<posix-path>": "<sha256>" }`
   * 文件不存在 → 友好退出
2. 把 hash keys 分两类：
   * **设置文件类**（`*/settings.json` 等已知 mixed-content 配置）→ 走 scrubber
   * **其余文件**（hooks/agents/skills/commands 等）→ 直接删
3. 加上 `.trellis/` 目录本身（递归删除整目录，含 tasks）
4. dry-run 模式：打印清单（区分"删除" vs "剥离字段"）后退出
5. 交互模式：打印清单 + `prompt('Continue? [y/N]')` → 是则继续
6. 实际执行：
   * 对设置文件：调 scrubber 剥离 trellis 字段；剩空对象 → 删；否则写回
   * 对其余文件：逐个 `unlink`
   * `rm -rf .trellis/`
   * 调 `cleanupEmptyDirs` 清理 platform 目录残余空目录
7. 打印 summary（删除文件数 + 剥离文件数 + 删除目录数）

**Scrubber 设计**：
* `scrubHooksJson(content, deletedPaths, mode: "nested" | "flat") -> { content, fullyEmpty }`
  * nested: 遍历 `hooks.{Event}.[].hooks.[]`，按 `command` 路径过滤
  * flat: 遍历 `hooks.{Event}.[]`，按 `command` 路径过滤
  * 自下而上清理空容器（matcher 块 / event 数组 / `hooks` 对象 / 顶层 JSON）
  * 应用于：claude / gemini / factory / codebuddy / qoder / codex (hooks.json) (nested) + cursor / copilot (flat)
* `scrubOpencodePackageJson(content) -> { content, fullyEmpty }`
  * 删除 `dependencies["@opencode-ai/plugin"]`；空 `dependencies` 删字段
* `scrubPiSettings(content) -> { content, fullyEmpty }`
  * 从 `extensions` / `skills` / `prompts` 数组移除 trellis 条目；空数组删字段
  * 移除 `enableSkillCommands` 字段
* `scrubCodexConfigToml(content) -> { content, fullyEmpty }`
  * 实现选择：
    * 优先：line-based 移除 `project_doc_fallback_filenames = ...` 行 + 已知的 trellis 注释段（当前模板内容稳定，可控）
    * 如未来 codex 模板复杂化 → 引入 `smol-toml` 依赖（~10KB）
* **派发**：在 commands/uninstall.ts 里维护 `STRUCTURED_FILES` 映射表，把 manifest 路径映射到对应 scrubber + 模式参数

**复用**：
* `getHashesFilePath(cwd)` 拿 manifest 路径
* `loadHashes(cwd)` 解析 manifest
* `cleanupEmptyDirs(roots)` 清理空目录（roots 取 manifest 中各文件的 top-level 目录去重）

**CLI 注册**：`packages/cli/src/cli/index.ts` 加 `.command("uninstall")`。

## Decision (ADR-lite)

**Context**: Issue #221 用户希望干净卸载 Trellis。
**Decision**: 用 manifest 驱动的精确删除（不是按目录整删），但不做"用户改过则保留"的判断 —— 用户明确要求全删。
**Consequences**:
- 优点：精确、不误删 platform 目录里用户自己的文件；manifest 已经存在零开发成本。
- 取舍：用户改过的 trellis 文件也会被删（按需求即如此）；`.trellis/tasks/` 里用户的工作产物会丢失（issue 场景就是要换工具，丢失可接受）。
- 风险缓解：默认有二次确认 + dry-run；用户必须显式 `--yes` 才能跳过提示。

## Out of Scope

* 不实现"按目录扫描判定" fallback（manifest 缺失就直接退出，不猜）
* 不做"备份后删除"（用户要的是卸载，不是迁移）
* 不区分 hooks/agents/skills/commands 类文件用户改过 vs 未改过 —— 这些是 trellis 资产，统一删
* settings.json 类文件：保留用户自定义字段（见上），但**不做 hooks 字段语义合并/复杂 diff** —— 只按"command 路径匹配 manifest"这一规则剥离
* 不保留任何 trellis 数据（tasks / config / developer）
* 不卸载 trellis CLI 本身（`npm uninstall -g` 是用户操作系统层面的事）
* 不删除 git 历史中的 trellis commit

## Technical Notes

* Manifest 工具：`packages/cli/src/utils/template-hash.ts`
  * `HASHES_FILE = ".template-hashes.json"`
  * 路径：`path.join(cwd, DIR_NAMES.WORKFLOW, HASHES_FILE)` → `.trellis/.template-hashes.json`
  * Schema v2: `{ __version: 2, hashes: { "<posix-path>": "<sha256>" } }`
* 平台目录定义：`packages/cli/src/types/ai-tools.ts`（`configDir` + `additionalManagedPaths`）
* 已有空目录清理：`cleanupEmptyDirs` in `packages/cli/src/commands/update.ts`
* CLI 注册参考：`packages/cli/src/cli/index.ts`
* 测试模式：参考 `test/commands/init.integration.test.ts` / `test/commands/update.integration.test.ts`
