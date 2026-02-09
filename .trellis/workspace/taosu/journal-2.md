# Journal - taosu (Part 2)

> Continuation from `journal-1.md` (archived at ~2000 lines)
> Started: 2026-02-03

---



## Session 32: Review & merge cli_adapter.py fix PR

**Date**: 2026-02-03
**Task**: Review & merge cli_adapter.py fix PR

### Summary

Code review PR #27 (add missing cli_adapter.py to template files), merged to feat/opencode, created 0.3.0-beta.15 manifest

### Main Changes



### Git Commits

| Hash | Message |
|------|---------|
| `ca7d061` | (see git log) |
| `cdd3a7d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 33: Windows stdout encoding fix & spec/guide distinction

**Date**: 2026-02-04
**Task**: Windows stdout encoding fix & spec/guide distinction

### Summary

(Add summary)

### Main Changes


## Summary

修复 Windows stdout 编码问题，并更新 spec 系统文档以明确区分 spec 和 guide 的用途。

## Key Changes

| Category | Change |
|----------|--------|
| **Windows Encoding Fix** | 将 `io.TextIOWrapper` 改为 `sys.stdout.reconfigure()` + hasattr fallback |
| **Type Safety** | 添加 `# type: ignore[union-attr]` 消除 basedpyright 类型检查警告 |
| **common/__init__.py** | 添加 `_configure_stream()` 辅助函数，自动配置 Windows 编码 |
| **Spec Update** | 更新 `backend/script-conventions.md` 添加详细的 Windows stdout 编码规范 |
| **Guide Cleanup** | 从 `cross-platform-thinking-guide.md` 移除详细代码规范，保持 checklist 风格 |
| **update-spec.md** | 添加 "Spec vs Guide" 区分说明，修复误导性指引 |

## Problem Analysis

### Windows stdout 编码问题因果链

```
Windows code page = GBK (936)
    ↓
Python stdout defaults to GBK
    ↓
git output contains special chars → subprocess replaces with \ufffd
    ↓
json.dumps(ensure_ascii=False) → print()
    ↓
GBK cannot encode \ufffd → UnicodeEncodeError
```

### 为什么 io.TextIOWrapper 不可靠

- 创建新的 wrapper，原始 stdout 编码设置可能仍然干扰
- `reconfigure()` 直接修改现有流，更彻底

### Spec vs Guide 混淆问题

- 原来的 `update-spec.md` 把 `guides/` 和 `backend/`、`frontend/` 混在一起
- 导致 AI 按关键词匹配而不是按内容性质分类
- 修复：添加明确的判断标准

## Files Modified

### Hooks (3 files × 2 locations)
- `.claude/hooks/session-start.py`
- `.claude/hooks/inject-subagent-context.py`
- `.claude/hooks/ralph-loop.py`

### Scripts (4 files × 2 locations)
- `.trellis/scripts/common/__init__.py`
- `.trellis/scripts/common/git_context.py`
- `.trellis/scripts/task.py`
- `.trellis/scripts/add_session.py`

### Specs & Commands (3 platforms)
- `.trellis/spec/backend/script-conventions.md`
- `.trellis/spec/guides/cross-platform-thinking-guide.md`
- `.claude/commands/trellis/update-spec.md`
- `.cursor/commands/trellis-update-spec.md`
- `.opencode/commands/trellis/update-spec.md`

### Templates (all synced)
- `src/templates/claude/hooks/*`
- `src/templates/trellis/scripts/*`
- `src/templates/markdown/spec/*`
- `src/templates/*/commands/*`

## Lessons Learned

1. **Spec 是编码规范**：告诉 AI "代码必须这样写"
2. **Guide 是思考清单**：帮助 AI "想到该考虑的问题"
3. **Type ignore 注释**：对于运行时正确但类型检查报错的代码，使用 `# type: ignore[union-attr]`

## Testing

- [OK] basedpyright: 0 errors
- [OK] pnpm build: success
- [OK] All templates synced

## Status

[PENDING] 等待测试和提交



### Git Commits

| Hash | Message |
|------|---------|
| `pending` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 34: PR #22 iFlow CLI 同步与 lint 修复

**Date**: 2026-02-04
**Task**: PR #22 iFlow CLI 同步与 lint 修复

### Summary

(Add summary)

### Main Changes

## 本次会话完成的工作

### 1. Review 并合并 PR #22 (iFlow CLI support)
- 审查贡献者 @jsfaint 的代码，确认质量良好
- 发现贡献者顺手修复了我们之前 OpenCode 支持遗漏的一些地方（BACKUP_DIRS、TEMPLATE_DIRS 等）
- 在 GitHub 上合并 PR

### 2. 同步 iFlow 模板
- 修复 iFlow hooks 的 Windows 编码问题（改用 `reconfigure()` 方案）
  - `src/templates/iflow/hooks/session-start.py`
  - `src/templates/iflow/hooks/inject-subagent-context.py`
  - `src/templates/iflow/hooks/ralph-loop.py`
- 同步 `update-spec.md` 到 iFlow 模板

### 3. 修复历史 lint 错误
- `src/commands/update.ts:643-644` - 改用 `as string` 替代 `!` non-null assertion
- `src/migrations/index.ts:99-100` - 同上
- `src/templates/opencode/plugin/session-start.js:95` - 移除未使用的 `output` 参数

### 4. 新增 Spec 文档
- 创建 `.trellis/spec/backend/platform-integration.md` - 记录如何添加新 CLI 平台支持的完整清单

### 5. 创建待办任务
- `02-04-fix-update-platform-selection` - 修复 update 机制只更新 init 时选择的平台（pending）

**Updated Files**:
- `src/templates/iflow/hooks/*.py` (3 files)
- `src/templates/iflow/commands/trellis/update-spec.md`
- `src/commands/update.ts`
- `src/migrations/index.ts`
- `src/templates/opencode/plugin/session-start.js`
- `.trellis/spec/backend/platform-integration.md`


### Git Commits

| Hash | Message |
|------|---------|
| `a6e4fcb` | (see git log) |
| `26adbaf` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 35: 修复 update 只更新已配置平台

**Date**: 2026-02-04
**Task**: 修复 update 只更新已配置平台

### Summary

(Add summary)

### Main Changes

## 本次完成的工作

### 修复 `trellis update` 平台选择问题

**问题**：`trellis update` 会更新所有平台模板，不管 init 时选了哪些。用户 `init --claude` 后，update 会创建 `.cursor/`、`.iflow/` 等不需要的目录。

**方案**：检测已有目录，只更新存在的平台（奥卡姆剃刀原则）

**改动**：
1. 新增 `getConfiguredPlatforms(cwd)` 函数 - 检测 `.claude/`、`.cursor/`、`.iflow/`、`.opencode/` 目录
2. 修改 `collectTemplateFiles()` - 用 `platforms.has()` 条件判断只收集检测到的平台模板

### 更新 Spec 文档

更新 `.trellis/spec/backend/platform-integration.md`：
- 在 Checklist 中添加 `getConfiguredPlatforms()` 修改项
- 在 Common Mistakes 中添加对应条目

**Updated Files**:
- `src/commands/update.ts`
- `.trellis/spec/backend/platform-integration.md`


### Git Commits

| Hash | Message |
|------|---------|
| `8955e52` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 36: 实现远程模板初始化功能

**Date**: 2026-02-05
**Task**: 实现远程模板初始化功能

### Summary

(Add summary)

### Main Changes

## 完成内容

| 功能 | 说明 |
|------|------|
| `--template` 参数 | 支持指定远程模板 (如 `--template electron-fullstack`) |
| `--overwrite` / `--append` | 处理已有目录的策略选项 |
| 交互式模板选择 | 无 `-y` 时显示模板列表，blank 为默认 |
| 模板类型扩展性 | 支持 spec/skill/command/full 类型，根据 type 自动选择安装路径 |

## 改动文件

- `src/utils/template-fetcher.ts` - 新增：模板索引获取和下载逻辑
- `src/cli/index.ts` - 添加 CLI 参数
- `src/commands/init.ts` - 添加模板选择流程
- `src/configurators/workflow.ts` - 添加 skipSpecTemplates 选项
- `package.json` - 添加 giget 依赖

## 相关 Task PRD

- `02-05-remote-template-init` - 主功能 PRD (已完成)
- `02-05-cross-platform-python` - 待实现
- `02-05-improve-brainstorm-flow` - 待实现


### Git Commits

| Hash | Message |
|------|---------|
| `c59aba7` | (see git log) |
| `ebdd24f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 37: 改进 update-spec 指引 + 更新 spec 设计决策

**Date**: 2026-02-05
**Task**: 改进 update-spec 指引 + 更新 spec 设计决策

### Summary

(Add summary)

### Main Changes

## 完成内容

| 改动 | 说明 |
|------|------|
| update-spec.md 改进 | 添加 "Implemented a feature"、"Made a design decision" 触发条件 |
| 新增模板 | "Adding a Design Decision"、"Adding a Project Convention" 模板 |
| Interactive Mode 优化 | 改为更开放的判断标准，不只是"避免问题" |
| 全平台同步 | Claude、Cursor、iFlow、OpenCode 7个文件同步更新 |
| Spec 更新 | 在 directory-structure.md 添加 Design Decisions section |

## 设计决策记录

记录到 `.trellis/spec/backend/directory-structure.md`：
- **giget 选择** - 为什么选择 giget 而非 degit
- **目录冲突策略** - skip/overwrite/append 模式
- **扩展性设计** - type + 映射表实现模板类型扩展

## 改动文件

- `.claude/commands/trellis/update-spec.md` (源文件)
- `.cursor/commands/trellis-update-spec.md`
- `.opencode/commands/trellis/update-spec.md`
- `src/templates/*/commands/*/update-spec.md` (4个模板)
- `.trellis/spec/backend/directory-structure.md`
- `.trellis/spec/backend/index.md`


### Git Commits

| Hash | Message |
|------|---------|
| `c0c8893` | (see git log) |
| `0ab309b` | (see git log) |
| `f85df4e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 38: Cross-Platform Python Fix & Init Refactor

**Date**: 2026-02-05
**Task**: Cross-Platform Python Fix & Init Refactor

### Summary

(Add summary)

### Main Changes

## Summary

Fixed cross-platform Python command compatibility and refactored init tool selection logic.

## Changes

| Category | Description |
|----------|-------------|
| **Cross-Platform Fix** | Settings.json now uses `{{PYTHON_CMD}}` placeholder, replaced at init time based on platform |
| **Bug Fix** | Tool flags (--iflow, --opencode) now take precedence over -y default |
| **Refactor** | Data-driven tool selection with TOOLS array (single source of truth) |
| **Spec Update** | Added CLI Design Patterns to quality-guidelines.md |

## Platform Handling

| Platform | Claude/iFlow settings.json | OpenCode |
|----------|---------------------------|----------|
| macOS/Linux | `python3` | Runtime detection |
| Windows | `python` | `platform() === "win32"` |

## Test Results

All manual tests passed:
- `--claude -y` ✅
- `--iflow -y` ✅
- `--opencode -y` ✅
- `--claude --iflow --opencode -y` ✅
- `-y` (default cursor+claude) ✅
- `pnpm lint` ✅
- `pnpm typecheck` ✅

## Files Modified

- `src/commands/init.ts` - Data-driven tool selection
- `src/configurators/claude.ts` - Placeholder replacement
- `src/configurators/iflow.ts` - Placeholder replacement
- `src/templates/*/settings.json` - `{{PYTHON_CMD}}` placeholder
- `dist/templates/opencode/lib/trellis-context.js` - Runtime platform detection
- `.trellis/spec/backend/quality-guidelines.md` - CLI patterns


### Git Commits

| Hash | Message |
|------|---------|
| `754f40d` | (see git log) |
| `0f2d7e5` | (see git log) |
| `923afa6` | (see git log) |
| `fe80432` | (see git log) |
| `3042225` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 39: Brainstorm Command Enhancement

**Date**: 2026-02-05
**Task**: Brainstorm Command Enhancement

### Summary

(Add summary)

### Main Changes

## Summary

Enhanced `/trellis:brainstorm` command with major workflow improvements.

## Key Changes

| Feature | Description |
|---------|-------------|
| **Task-first (Step 0)** | Create task immediately with temp title, don't wait |
| **Auto-Context (Step 1)** | Gather context before asking questions |
| **Question Gate (Step 3)** | Gate A/B/C to filter low-value questions |
| **Research-first (Step 4)** | Mandatory research for technical choices |
| **Expansion Sweep (Step 5)** | Diverge → Converge pattern for better thinking |
| **Anti-Patterns** | Explicit list of things to avoid |

## Pain Points Addressed

1. Task creation timing - now immediate
2. Low-value questions - filtered by gates
3. Missing research - now mandatory for tech choices
4. Narrow thinking - expansion sweep forces divergent thinking

## Files Modified

- `.claude/commands/trellis/brainstorm.md` - Complete rewrite


### Git Commits

| Hash | Message |
|------|---------|
| `6d07441` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 40: feat: opencode platform + registry refactor

**Date**: 2026-02-06
**Task**: feat: opencode platform + registry refactor

### Summary

(Add summary)

### Main Changes

## What was done

将平台配置从 init.ts / update.ts 中的硬编码分散逻辑，重构为 `src/configurators/index.ts` 中的集中式注册表模式。新增 opencode 平台支持。

| Change | Description |
|--------|-------------|
| Registry pattern | `PLATFORM_REGISTRY` map 统一管理所有平台的 templates、commands、settings |
| `resolvePlaceholders()` | 修复 collectTemplates settings 中占位符未替换的 roundtrip bug |
| Remove stale guide | 删除 update.ts 中已不存在的 cross-platform-thinking-guide.md 引用 |
| `src/constants/version.ts` | 抽取 VERSION 常量，消除 cli/index.ts 的循环引用风险 |
| opencode platform | 新增 opencode 的 commands + settings 模板 |

**Key files**:
- `src/configurators/index.ts` (new — centralized registry)
- `src/constants/version.ts` (new — extracted VERSION)
- `src/commands/init.ts` (simplified via registry)
- `src/commands/update.ts` (simplified + bug fix)
- `src/types/ai-tools.ts` (opencode tool definitions)


### Git Commits

| Hash | Message |
|------|---------|
| `c1e1f6b` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 41: test: 339 unit + integration tests with coverage

**Date**: 2026-02-06
**Task**: test: 339 unit + integration tests with coverage

### Summary

(Add summary)

### Main Changes

## What was done

为平台注册表重构建立了全面的测试覆盖，包括单元测试、集成测试、回归测试。配置了 `@vitest/coverage-v8` 代码覆盖率工具。

| Category | Files | Tests | Coverage |
|----------|-------|-------|----------|
| Configurators | 3 files | 51 | registry, platforms, templates |
| Templates | 5 files | 57 | claude, cursor, iflow, trellis, extract |
| Commands | 3 files | 13 + 10 integration | update-internals, init integration, update integration |
| Utils | 4 files | 69 | template-hash, project-detector, file-writer, template-fetcher |
| Other | 5 files | 139 | paths, migrations, ai-tools, registry-invariants, regression |
| **Total** | **20 files** | **339** | **75.87% lines, 57.03% branch** |

**Integration test highlights**:
- init: 正确创建所有平台文件，幂等性验证
- update: same-version no-op 使用完整目录快照断言（零新增/删除/变更文件）
- update: 降级场景正确跳过

**Coverage setup**: `pnpm test:coverage` → text + html + json-summary reports

**Key files**:
- `test/` (20 test files)
- `vitest.config.ts` (coverage config)
- `package.json` (+test:coverage script, +@vitest/coverage-v8)


### Git Commits

| Hash | Message |
|------|---------|
| `f825d5c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 42: docs(spec): unit-test conventions + platform-integration

**Date**: 2026-02-06
**Task**: docs(spec): unit-test conventions + platform-integration

### Summary

(Add summary)

### Main Changes

## What was done

基于测试实践经验，创建了 `.trellis/spec/unit-test/` 规范目录（4 个文件），并更新了 platform-integration 指南。

| Spec File | Content |
|-----------|---------|
| `index.md` | 测试总览、CI/Pipeline 策略（pre-commit=lint, CI=full suite） |
| `conventions.md` | 文件命名、结构、断言模式、When to Write Tests 决策流 |
| `mock-strategies.md` | 最小 mock 原则、标准 mock 集、inquirer mock 差异 |
| `integration-patterns.md` | 函数级集成测试、setup 模式、快照对比、发现的 bug |

**platform-integration.md 更新**:
- 新增 Common Mistakes: 占位符未替换 + 模板 init/update 不一致

**Key files**:
- `.trellis/spec/unit-test/` (4 new files)
- `.trellis/spec/backend/platform-integration.md`


### Git Commits

| Hash | Message |
|------|---------|
| `949757d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 43: docs: workflow commands + task PRDs

**Date**: 2026-02-06
**Task**: docs: workflow commands + task PRDs

### Summary

(Add summary)

### Main Changes

## What was done

将测试相关指引集成到开发工作流命令中，更新了今天完成的 3 个任务 PRD。

| Command Updated | Change |
|----------------|--------|
| `/trellis:start` | Step 3 加入 `cat .trellis/spec/unit-test/index.md` |
| `/trellis:before-backend-dev` | 加入读取 unit-test/conventions.md "When to Write Tests" |
| `/trellis:check-backend` | 加入检查是否需要新增/更新测试 |
| `/trellis:finish-work` | 新增 "1.5 Test Coverage" checklist |

| Task PRD Updated | Status |
|-----------------|--------|
| `02-06-platform-registry-refactor` | 全部 9 项验收标准 ✓ |
| `02-06-unit-test-platform-registry` | 测试数更新 304→339, 17→20 files |
| `02-06-e2e-integration-tests` | 两个 bug 标记"已修复" |

**Key files**:
- `.claude/commands/trellis/` (4 commands)
- `.trellis/tasks/02-06-*/prd.md` (3 PRDs)


### Git Commits

| Hash | Message |
|------|---------|
| `55f129e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 44: refactor: shared.ts + remove templates.ts dispatcher

**Date**: 2026-02-06
**Task**: refactor: shared.ts + remove templates.ts dispatcher

### Summary

(Add summary)

### Main Changes

## What was done

提取 `resolvePlaceholders()` 到 `configurators/shared.ts`，消除三处重复（claude.ts, iflow.ts, index.ts）。删除 `configurators/templates.ts`（硬编码 if/else 分发器），改为在 index.ts 直接导入各平台 `getAllCommands`。

| Change | Details |
|--------|---------|
| Created `src/configurators/shared.ts` | `resolvePlaceholders()` 单一来源 |
| Updated `claude.ts`, `iflow.ts` | 改为从 shared.ts 导入 |
| Updated `index.ts` | 直接导入各平台 getAllCommands，不再走 templates.ts |
| Deleted `src/configurators/templates.ts` | 不再需要的分发器 |
| Deleted `test/configurators/templates.test.ts` | 对应测试文件 |

**Tests**: 333 pass (down from 339 due to removed template tests)


### Git Commits

| Hash | Message |
|------|---------|
| `eaae43a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 45: feat: release tooling (beta/rc/release) + release:rc script

**Date**: 2026-02-06
**Task**: feat: release tooling (beta/rc/release) + release:rc script

### Summary

(Add summary)

### Main Changes

## What was done

更新 `scripts/create-manifest.js` 支持完整发布生命周期（beta → rc → release），新增 `release:rc` package.json 脚本。

| Change | Details |
|--------|---------|
| `scripts/create-manifest.js` | `getNextBetaVersion` → `getNextVersion`，支持 beta/rc/stable 版本推进 |
| `package.json` | 新增 `release:rc` 脚本 |
| Next steps output | 引用 `pnpm release:beta` / `pnpm release:rc` / `pnpm release` |

**npm dist-tags**: beta, rc, latest 都是任意字符串，只有 latest 是默认安装标签。


### Git Commits

| Hash | Message |
|------|---------|
| `f933c70` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 46: docs: platform-integration spec deep fix + journal

**Date**: 2026-02-06
**Task**: docs: platform-integration spec deep fix + journal

### Summary

(Add summary)

### Main Changes

## What was done

对 `platform-integration.md` 进行深度审查（deep research），修复 5 处不准确 + 补充 8 处遗漏。同时记录了 session #40-#43。

| Spec Fix | Details |
|----------|---------|
| Step 1 | 补充 `CliFlag` union type |
| Step 2 | 补充 `_AssertCliFlagsInOptions` 编译时断言说明 |
| Step 4 | 区分 Python hooks 模式 vs JS plugin 模式（OpenCode） |
| Step 6 | 修正 `config_dir` → `config_dir_name` |
| Common Mistakes | 新增 iFlow getAllCommands 已知问题 |
| Architecture | 新增 `shared.ts` 引用，删除已修复的命名不一致 gap |


### Git Commits

| Hash | Message |
|------|---------|
| `07a57d3` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 47: RC manifest + fragile test audit & cleanup (339→312)

**Date**: 2026-02-06
**Task**: RC manifest + fragile test audit & cleanup (339→312)

### Summary

(Add summary)

### Main Changes

## What was done

创建 0.3.0-rc.0 发布 manifest，并对全部测试进行深度审计，清理 21 个脆弱/无意义测试。

| Change | Details |
|--------|---------|
| `src/migrations/manifests/0.3.0-rc.0.json` | RC changelog（remote spec templates, registry refactor, placeholder fixes, test coverage, release tooling） |
| `test/regression.test.ts` | 硬编码 manifest 数量改为动态文件系统计数 |
| `test/templates/trellis.test.ts` | 删除硬编码 scripts.size=23, typeof 检查 |
| `test/registry-invariants.test.ts` | 删除 9 个重复 roundtrip 测试（已在 index.test.ts 覆盖） |
| `test/types/ai-tools.test.ts` | 重写删除同义反复测试（4→2 tests） |
| `test/templates/claude.test.ts` | 删除 Array.isArray/typeof/同义反复（13→8 tests） |
| `test/templates/iflow.test.ts` | 同上（11→6 tests） |

**Anti-patterns found**: hardcoded counts, tautological assertions, redundant type checks, duplicate coverage across files.

**Tests**: 312 pass, 17 files (was 339/19)


### Git Commits

| Hash | Message |
|------|---------|
| `7ee4c69` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 48: fix: compareVersions prerelease bug + rc.0/rc.1 release

**Date**: 2026-02-06
**Task**: fix: compareVersions prerelease bug + rc.0/rc.1 release

### Summary

(Add summary)

### Main Changes

## What was done

发现并修复 `cli/index.ts` 中 `compareVersions` 不处理 prerelease 的 bug（rc 版本被误判为低于 beta），提取为公共模块消除三处重复。发布 rc.0 和 rc.1。

| Change | Details |
|--------|---------|
| Created `src/utils/compare-versions.ts` | 完整版 compareVersions，处理 prerelease（alpha < beta < rc < release） |
| Fixed `src/cli/index.ts` | 删除残缺版（不处理 prerelease），改为 import 公共模块 |
| Fixed `src/commands/update.ts` | 删除内联副本，改为 import |
| Fixed `src/migrations/index.ts` | 删除内联副本，改为 import |
| Updated `src/migrations/manifests/0.3.0-rc.0.json` | 测试数量 333→312 |
| Created `src/migrations/manifests/0.3.0-rc.1.json` | hotfix changelog |
| Spec updates | conventions.md anti-patterns, mock-strategies.md shared.ts path, index.md test count |
| Journal | Sessions #44-#47 recorded |

**Root Cause**: `parseInt("0-rc", 10)` = 0, `parseInt("16", 10)` = 16, 所以简化版认为 rc.0 < beta.16

**Released**: v0.3.0-rc.0 + v0.3.0-rc.1 (hotfix)


### Git Commits

| Hash | Message |
|------|---------|
| `f98a085` | (see git log) |
| `7affd33` | (see git log) |
| `72ef5fc` | (see git log) |
| `00c4793` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 49: Codex platform integration + UT workflow alignment

**Date**: 2026-02-09
**Task**: Codex platform integration + UT workflow alignment

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Platform Integration | Added Codex as a first-class platform in registry, CLI flags, init options, configurator wiring, and template tracking paths. |
| Codex Templates | Added `src/templates/codex/skills/*/SKILL.md` with Codex-compatible skill structure and removed parallel-related skill usage. |
| Runtime Adapter | Updated Python `cli_adapter.py` and `registry.py` to recognize Codex (`.agents/skills`) and support Codex CLI command path mapping/detection. |
| Tests | Added/updated Codex-focused tests for init integration, platform configurators, managed path detection, regression checks, and template fetcher path mapping. |
| Workflow Docs | Added `$improve-ut` skill + `/trellis:improve-ut` command as spec-first UT guidance and aligned backend check command references. |
| Task Tracking | Archived task `02-09-codex-skills-template-init` after completion. |

**Validation**:
- `pnpm lint` passed
- `pnpm typecheck` passed
- `pnpm test` passed (321 tests)
- `pnpm test:coverage` generated report (`coverage/index.html`)


### Git Commits

| Hash | Message |
|------|---------|
| `bb9fcea` | (see git log) |
| `3f2cb2f` | (see git log) |
| `c3a3306` | (see git log) |
| `8b13a15` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
