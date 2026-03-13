# Journal - taosu (Part 3)

> Continuation from `journal-2.md` (archived at ~2000 lines)
> Started: 2026-03-05

---



## Session 69: docs: improve record-session archive guidance

**Date**: 2026-03-05
**Task**: docs: improve record-session archive guidance

### Summary

(Add summary)

### Main Changes

## Summary

Updated record-session prompt across all platforms to clarify task archive judgment criteria.

## Changes

| Change | Description |
|--------|-------------|
| Archive guidance | Judge by actual work status (code committed, PR created), not task.json status field |
| Coverage | 9 platform templates + 3 dogfooding copies (12 files total) |

## Context

From `/trellis:break-loop` analysis — root cause was implicit assumption that task.json `status` field would be up-to-date. Fix: prompt now explicitly tells AI to archive based on work completion, not status field value.


### Git Commits

| Hash | Message |
|------|---------|
| `b9a475f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 70: Task lifecycle hooks + Linear sync

**Date**: 2026-03-05
**Task**: Task lifecycle hooks + Linear sync

### Summary

(Add summary)

### Main Changes

## What was done

| Feature | Description |
|---------|-------------|
| YAML parser enhancement | Rewrote `parse_simple_yaml` with recursive `_parse_yaml_block` for nested dict support |
| `get_hooks()` | New config.py function to read lifecycle hook commands from config.yaml |
| `_run_hooks()` | Non-blocking hook execution in task.py with `TASK_JSON_PATH` env var |
| 4 cmd integrations | after_create/start/finish/archive hooks in cmd_create/start/finish/archive |
| Linear sync hook | `linear_sync.py` with create/start/archive/sync actions via linearis CLI |
| Gitignored config | `hooks.local.json` for sensitive config (team, project, assignee map) |
| Spec updates | script-conventions.md + directory-structure.md updated with hooks code-spec |

## Key decisions

- Only pass `TASK_JSON_PATH` env var (not individual fields) — simple, universal
- Hook failures never block main operation (warn only)
- Sensitive config in gitignored `hooks.local.json`, hook script itself is public
- `sync` action for manually pushing prd.md to Linear description (not auto)

## Linear integration

- All active tasks linked to Linear issues (MIN-337~341)
- Parent task auto-linking via `_resolve_parent_linear_issue()`
- Auto-assign via ASSIGNEE_MAP in hooks.local.json

**Updated files**:
- `src/templates/trellis/scripts/common/worktree.py` — nested dict YAML parser
- `src/templates/trellis/scripts/common/config.py` — get_hooks()
- `src/templates/trellis/scripts/task.py` — _run_hooks() + 4 integrations
- `src/templates/trellis/config.yaml` — hooks example (commented)
- `.trellis/scripts/hooks/linear_sync.py` — Linear sync hook
- `.trellis/spec/backend/script-conventions.md` — hooks code-spec
- `.trellis/spec/backend/directory-structure.md` — hooks/ directory


### Git Commits

| Hash | Message |
|------|---------|
| `695a26d` | (see git log) |
| `086483a` | (see git log) |
| `9595d85` | (see git log) |
| `aab2113` | (see git log) |
| `8a5ed63` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 71: Record-session prompt fix: archive before PR

**Date**: 2026-03-05
**Task**: Record-session prompt fix: archive before PR

### Summary

Fixed record-session archive guidance across 12 platform templates — archive when code committed, don't wait for PR

### Main Changes



### Git Commits

| Hash | Message |
|------|---------|
| `44f14af` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 72: feat: --registry flag for custom spec template sources

**Date**: 2026-03-06
**Task**: feat: --registry flag for custom spec template sources

### Summary

(Add summary)

### Main Changes

## Summary

Implemented `--registry` CLI flag allowing users to download spec templates from custom remote repositories (GitHub, GitLab, Bitbucket).

## Changes

| Area | Description |
|------|-------------|
| `--registry` flag | New CLI option accepting giget-style source (e.g., `gh:myorg/myrepo/specs`) |
| `parseRegistrySource()` | Parses provider, repo, subdir, ref; builds raw URL for index.json probe |
| `probeRegistryIndex()` | Distinguishes 404 (no index.json → direct download) from transient errors (abort) |
| Marketplace mode | Custom registry with `index.json` → show picker with templates |
| Direct download mode | Custom registry without `index.json` → download directory to `.trellis/spec/` |
| Custom picker | "custom" option in template picker with back/return support |
| `-y` mode | Probes index.json; aborts if marketplace (requires `--template`); direct download if 404 |
| `--template` path | Uses `probeRegistryIndex` in `downloadTemplateById` to report real errors |
| Spec updates | 5 new patterns/mistakes in error-handling.md, quality-guidelines.md, cross-layer guide |
| Tests | 11 new tests for `parseRegistrySource` (gh/gitlab/bitbucket/refs/errors) |

## Bug Fixes (8 bugs found across 3 code review rounds)

| # | Severity | Bug | Fix |
|---|----------|-----|-----|
| 1 | P1 | `-y --registry` skipped index.json probe | Added probe in -y path |
| 2 | P1 | `#ref` dropped in giget source | Include `#ref` in constructed URI |
| 3 | P2 | 404 vs transient error indistinguishable | Added `probeRegistryIndex()` |
| 4 | P2 | Custom picker skipped overwrite prompt | Added prompt after marketplace selection |
| 5 | P1 | giget URI `#ref` in wrong position | Build full `provider:repo/path#ref`, pass null to downloadWithStrategy |
| 6 | P2 | Transient errors fell through to direct download | Abort instead of warn+continue |
| 7 | P2 | `fetchedTemplates` not reset on source switch | Reset to `[]` when entering custom path |
| 8 | P2 | `--registry --template` swallowed network errors | `downloadTemplateById` uses `probeRegistryIndex` for registry path |

**Updated Files**:
- `src/utils/template-fetcher.ts` — parseRegistrySource, probeRegistryIndex, downloadTemplateById, downloadRegistryDirect
- `src/commands/init.ts` — registry integration, custom picker, -y mode probe
- `src/cli/index.ts` — --registry option
- `test/utils/template-fetcher.test.ts` — 11 new tests
- `.trellis/spec/backend/error-handling.md` — Pattern 5, Mistakes 3-4
- `.trellis/spec/backend/quality-guidelines.md` — 4 new patterns/conventions
- `.trellis/spec/guides/cross-layer-thinking-guide.md` — Mode-Detection Probe Checklist


### Git Commits

| Hash | Message |
|------|---------|
| `3208d64` | (see git log) |
| `d174493` | (see git log) |
| `ba66fe1` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 73: v0.3.6 docs & release prep

**Date**: 2026-03-06
**Task**: v0.3.6 docs & release prep

### Summary

(Add summary)

### Main Changes

## Summary

Prepared v0.3.6 release: migration manifest, README updates, and full docs site documentation for two new features (task lifecycle hooks and custom template registries).

## Changes

| Area | Description |
|------|-------------|
| **Migration manifest** | Created `src/migrations/manifests/0.3.6.json` covering 4 changes: --registry flag, lifecycle hooks, subtask support, record-session improvements |
| **README** | Updated What's New in both `README.md` and `README_CN.md` with v0.3.5 entry; updated changelog links |
| **Docs: v0.3.5 changelog** | Created `changelog/v0.3.5.mdx` (en + zh) — hotfix-only content; updated `docs.json` nav |
| **Docs: lifecycle hooks** | Added section 6.6 to `ch06-task-management.mdx` (en + zh) — config.yaml format, 4 events, env vars, Linear sync example |
| **Docs: remote spec templates** | Added section 2.5 to `ch02-quick-start.mdx` (en + zh) — marketplace, --registry flag, provider table, strategy flags, custom marketplace |
| **Lint fix** | Added `<!-- markdownlint-disable MD024 MD001 -->` to ch02 files (pre-existing issue from Tabs bash comments) |

## Key Decisions

- v0.3.5 is hotfix-only; hooks/registry/subtasks are v0.3.6 features
- Docs task tracked in docs repo (not Trellis repo)
- Archived tmux-support task and cancelled Linear issue MIN-340

## Repos Touched

- **Trellis**: 2 commits (manifest + README)
- **docs**: 3 commits (changelog + ch06 hooks + ch02 registry)


### Git Commits

| Hash | Message |
|------|---------|
| `6d89ee9` | (see git log) |
| `bf9d210` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 74: Hotfix: PreToolUse hook Task→Agent rename

**Date**: 2026-03-06
**Task**: Hotfix: PreToolUse hook Task→Agent rename

### Summary

(Add summary)

### Main Changes

## Summary

发现并修复 CC v2.1.63 将 Task 工具改名为 Agent 导致 Trellis PreToolUse context injection hook 全面失效的问题。

## Root Cause

CC v2.1.63 将内部 Agent 工具从 `Task` 改名为 `Agent`（[anthropics/claude-code#29677](https://github.com/anthropics/claude-code/issues/29677)）。settings.json matcher 做了向后兼容（`"Task"` 仍能匹配），但 hook 脚本收到的 `tool_name` 变成了 `"Agent"`，导致 `if tool_name != "Task": sys.exit(0)` 直接退出。

**影响**：所有 CC v2.1.63+ 的 Trellis 用户，implement/check/debug/research agent 的 code-spec context 注入全部失效。

## Investigation

- 通过 debug log 确认 hook 实际收到 `tool_name=Agent`
- Exa 调研找到 CC issue #29677 精确描述了这个 undocumented breaking change
- 确认 iFlow 未证实有相同改名，settings.json 不改但 hook 脚本做防御性兼容

## Fix

| File | Change |
|------|--------|
| `src/templates/claude/hooks/inject-subagent-context.py` | `"Task"` → `("Task", "Agent")` |
| `src/templates/claude/settings.json` | 新增 `"Agent"` matcher |
| `src/templates/iflow/hooks/inject-subagent-context.py` | `("Task", "Agent")` 防御性兼容 |
| `.claude/` 本地文件 | 同步修复 |

## Verification

- Explore agent: 无 hook error，正常跳过
- research agent: 成功收到注入 context（"Research Agent Task"、"Project Spec Directory Structure" 等）
- 410 tests 全过

## Other Work

- 创建了 v0.3.7 parent task 和 hook-start-equiv 子任务
- 调研了 SessionStart hook vs `/trellis:start` 等效性问题


### Git Commits

| Hash | Message |
|------|---------|
| `8cd1314` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 75: Monorepo Restructuring — CLI to packages/cli + docs submodule

**Date**: 2026-03-09
**Task**: Monorepo Restructuring — CLI to packages/cli + docs submodule

### Summary

(Add summary)

### Main Changes

## Summary

Restructured Trellis repo as a monorepo: moved CLI code to `packages/cli/`, added `mindfold-ai/docs` as git submodule at `docs-site/`.

## Changes

| Area | Change |
|------|--------|
| **Repo structure** | `src/`, `test/`, `bin/`, `scripts/`, configs → `packages/cli/` via `git mv` |
| **Root package.json** | New private workspace root with husky + lint-staged |
| **pnpm-workspace** | `packages: ["packages/*"]` |
| **CI/CD** | `ci.yml` + `publish.yml` adapted for `packages/cli/` paths + path filters |
| **Submodule** | `docs-site/` → `mindfold-ai/docs` |
| **Cleanup** | `docs/` removed (6 md files), `doc/` + `third/` local-only deleted |
| **GitHub** | Issue templates (bug, feature, question) + labels (`pkg:cli`, `pkg:docs`, `infra`) |
| **lint-staged** | Fixed `eslint`/`prettier` spawn issue with `pnpm --filter` |
| **linear_sync.py** | `cmd_start` now auto-calls `cmd_sync` to push PRD to Linear |

## Key Decisions

- `assets/` stays at root (README references)
- `pyrightconfig.json` + `.lintstagedrc` stay at root (cross-package scope)
- `docs-site/` at root, NOT under `packages/` (avoid pnpm workspace conflict)
- git history: `git mv` for rename detection (simple + safe)
- npm publish: `prepublishOnly` copies `README.md` + `LICENSE` from root

## Subtask Created

- `03-09-monorepo-spec-adapt` — Reorganize `.trellis/spec/` by package name (`cli/backend/` instead of flat `backend/`)

## Verification

- 410 tests passed (25 files)
- Build + lint-staged + eslint + prettier all pass
- `pnpm test` from root correctly filters to CLI package


### Git Commits

| Hash | Message |
|------|---------|
| `320c303` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 76: Monorepo Spec 目录重组 + Workflow 适配 PRD

**Date**: 2026-03-09
**Task**: Monorepo Spec 目录重组 + Workflow 适配 PRD

### Summary

(Add summary)

### Main Changes

## 完成内容

### Phase 1: Spec 目录重组 + 路径替换（已完成）

| 改动 | 详情 |
|------|------|
| Spec 目录移动 | `spec/backend/` → `spec/cli/backend/`, `spec/frontend/` → `spec/cli/frontend/`, `spec/unit-test/` → `spec/cli/unit-test/`, `guides/` 不动 |
| 路径替换（~55 文件） | `.claude/` 18 文件, `.cursor/` 10 文件, `.agents/` 12 文件, `.opencode/` 14 文件, `.trellis/` 3 文件 |
| init-context 适配 | `task.py` 中 `get_implement_backend/frontend()` 更新为 `spec/cli/` 路径 |
| 测试验证 | 410 测试全部通过 |

### Phase 2: PRD 设计（已记录，待实施）

完整 PRD 在 `.trellis/tasks/03-09-monorepo-spec-adapt/prd.md`，包含 7 个 Part:

| Part | 内容 | 泛用性 |
|------|------|--------|
| P1 | 合并 type-specific 命令 → 泛型 `before-dev`/`check` | 可泛用 → 模板 |
| P2 | task.json `package` 字段 + `--package` 参数 | 可泛用 → 模板 |
| P3 | `get_context.py` monorepo 检测 | 可泛用 → 模板 |
| P4 | `start.md`/`workflow.md` 动态 spec 发现 | 可泛用 → 模板 |
| P5 | docs-site submodule 迁移 | 项目特化 |
| P6 | `add_session.py --package` 标记 | 可泛用 → 模板 |
| P7 | 向前兼容（单仓库 fallback） | 可泛用 → 模板 |

### 关键设计决策

1. **Spec 自动发现**：泛型命令通过 `ls spec/*/index.md` 发现可用 spec，不硬编码路径
2. **Spec 自管引导**：每个 `index.md` 自带 Pre-Dev Checklist 和 Quality Check section，命令只做分发
3. **泛用性分析**：PRD 中明确标注了项目特化 vs 可泛用改动，后续产品化时可直接复用

### docs-site 分析结论

- hooks: 旧版本，根目录更新 → 删
- 独有内容: 3 命令 + 1 skill + 7 spec 文件 → 迁移到根目录
- 冗余配置: `.claude/`, `.cursor/` → 删

**Updated Files** (主要):
- `.trellis/spec/cli/backend/` (9 files, moved)
- `.trellis/spec/cli/frontend/` (7 files, moved)
- `.trellis/spec/cli/unit-test/` (4 files, moved)
- `.claude/commands/trellis/*.md` (12 files)
- `.cursor/commands/*.md` (10 files)
- `.agents/skills/*/SKILL.md` (12 files)
- `.opencode/commands/trellis/*.md` + agents + plugin (14 files)
- `.trellis/workflow.md`, `scripts/task.py`, `scripts/create_bootstrap.py`
- `.trellis/tasks/03-09-monorepo-spec-adapt/prd.md` (expanded)


### Git Commits

| Hash | Message |
|------|---------|
| `dbf076c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 77: Monorepo Workflow 全面适配 P8-P10 + 测试

**Date**: 2026-03-09
**Task**: Monorepo Workflow 全面适配 P8-P10 + 测试

### Summary

(Add summary)

### Main Changes

## 完成内容

| Part | 描述 | 文件数 |
|------|------|--------|
| 旧命令清理 | 删除 before-backend-dev/before-frontend-dev/check-backend/check-frontend + migrate-specs | 17 deleted |
| 新泛型命令 | 添加 before-dev, check, commit, contribute skill | 10 new |
| config + scripts | config.py/git_context.py/task.py/add_session.py 动态发现 | 6 modified |
| commands/agents/hooks 泛化 | 所有平台 md + hook 文件 spec 路径泛化 | 33 modified |
| docs-site spec 迁移 | spec/docs-site/docs/ 7 文件 + submodule ref | 8 files |
| P9 worktree submodule init | start.py 按 task.package 选择性 init submodule | 1 modified |
| P10 create_pr.py submodule PR | 检测 submodule 变更，内部 commit/push/PR | 1 modified |
| 集成测试 | pytest + tmp_path 真实 git repo，22 tests 全通过 | 4 new |
| session-start.py fix | 修复旧 spec/frontend 路径为动态遍历 | 1 modified |
| PRD 更新 | P8-P10 脚本改动明细 + 泛用性分析 | 1 modified |

## 关键设计决策

- **按需 submodule init**：不全量 init（用户可能有上百个 submodule），只 init task 目标 package
- **config → scripts → md 数据流**：config.yaml 是 source of truth，md 引导 AI 调脚本
- **测试方案**：pytest + tmp_path + 真实 git repo（不 mock git），测 worktree/submodule 真实行为

## 修改的关键文件

- `.trellis/scripts/common/config.py` — get_submodule_packages()
- `.trellis/scripts/multi_agent/start.py` — 选择性 submodule init
- `.trellis/scripts/multi_agent/create_pr.py` — submodule 感知 PR
- `.claude/hooks/session-start.py` — 动态 spec 遍历
- `test/scripts/` — 22 个集成测试


### Git Commits

| Hash | Message |
|------|---------|
| `404f703` | (see git log) |
| `b4b43a6` | (see git log) |
| `c6266be` | (see git log) |
| `57dee2d` | (see git log) |
| `92c66d9` | (see git log) |
| `0f69759` | (see git log) |
| `949d506` | (see git log) |
| `d4b3def` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 78: Monorepo cleanup: stale specs, gitignore, add_session defaults

**Date**: 2026-03-09
**Task**: Monorepo cleanup: stale specs, gitignore, add_session defaults
**Package**: cli

### Summary

(Add summary)

### Main Changes

| Change | Description |
|--------|-------------|
| Delete `spec/cli/frontend/` | 7 empty template files, CLI project has no frontend |
| Delete `database-guidelines.md` | Empty template, N/A for CLI project |
| Update `directory-structure.md` | Fix spec/ tree: `frontend/` → `cli/` + `docs-site/` |
| Update `index.md` | Remove "How to Fill" boilerplate, remove database ref |
| `.gitignore` | Add `.pytest_cache/` |
| `add_session.py` | Default `--package` to `config.yaml` `default_package` |

**Context**: Post-monorepo-migration cleanup. Reviewed all 9 files in `spec/cli/backend/`, identified 3 with issues. Also confirmed `docs/` deletion was intentional (content migrated to docs-site submodule). Verified all acceptance criteria for monorepo migration are met (410 tests pass, lint/typecheck clean). Archived `03-09-monorepo-submodule` task.

**Updated Files**:
- `.trellis/spec/cli/backend/index.md`
- `.trellis/spec/cli/backend/directory-structure.md`
- `.trellis/scripts/add_session.py`
- `.gitignore`


### Git Commits

| Hash | Message |
|------|---------|
| `1c38962` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 79: 提取 trellis-meta skill 到 marketplace/ + skills CLI 调研

**Date**: 2026-03-09
**Task**: 提取 trellis-meta skill 到 marketplace/ + skills CLI 调研
**Package**: cli

### Summary

将 trellis-meta skill 从 docs-site 提取到主仓库 marketplace/skills/，调研 skills CLI 发现机制，设计统一 marketplace 架构

### Main Changes

| 工作项 | 说明 |
|--------|------|
| trellis-meta 提取 | 从 `docs-site/plugins/trellis-meta/skills/trellis-meta/` 提取到 `marketplace/skills/trellis-meta/`，扁平化结构，去掉 `plugin.json` 和 `.claude-plugin/` |
| skills CLI 源码调研 | 阅读 `skills@1.4.4` 源码，确认 `findSkillDirs()` 递归扫描机制：maxDepth=5，SKIP_DIRS 不含 dotfiles |
| 扫描污染问题发现 | 主仓库有 ~17 个 SKILL.md（.agents/ 14个、.claude/ 2个），直接扫会污染 |
| 解决方案确认 | `npx skills add owner/repo/subpath` 子目录语法限制扫描范围，用 `mindfold-ai/Trellis/marketplace` |
| PRD 更新 | 03-09-extract-repo-level-content PRD 加入调研结果、架构设计、扫描污染解决方案 |
| 新 task 创建 | 03-09-update-template-source — 更新 template-fetcher 默认源（依赖 03-08） |

**新增文件**:
- `marketplace/skills/trellis-meta/SKILL.md` + `references/`（25 个文件）
- `.trellis/tasks/03-09-extract-repo-level-content/prd.md`
- `.trellis/tasks/03-09-update-template-source/prd.md`


### Git Commits

| Hash | Message |
|------|---------|
| `9195f89` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 80: Marketplace 迁移至主仓库 + 模板源更新

**Date**: 2026-03-09
**Task**: Marketplace 迁移至主仓库 + 模板源更新
**Package**: cli

### Summary

(Add summary)

### Main Changes

## 完成内容

| 任务 | 描述 |
|------|------|
| 03-09-extract-repo-level-content | 将 trellis-meta skill 和 marketplace specs 从 docs-site 迁移到主仓库 |
| 03-08-template-marketplace | 在主仓库建立 marketplace/ 目录，包含 index.json、specs、skills |
| 03-09-update-template-source | 更新 template-fetcher.ts 中 TEMPLATE_INDEX_URL 和 TEMPLATE_REPO 常量 |

## 关键变更

- **trellis-meta skill 迁移**: 从 `docs-site/plugins/trellis-meta/` 移到 `marketplace/skills/trellis-meta/`
- **marketplace specs 复制**: 50 个 electron-fullstack spec 文件从 docs-site 复制到 `marketplace/specs/`
- **模板源常量更新**: `mindfold-ai/docs` → `mindfold-ai/Trellis`（template-fetcher.ts + spec 文档中的 giget 示例）
- **全仓库 URL 清理**: 搜索并修复所有遗留的 `mindfold-ai/docs` 引用（marketplace README、docs-site 模板页、quick-start 页面）
- **docs-site 清理**: 删除 `plugins/trellis-meta/`（28 文件）和 `.claude-plugin/`（2 文件），更新贡献指南
- **安装命令统一**: 所有 `npx skills add` 命令使用 `mindfold-ai/Trellis/marketplace` 子路径（避免扫描 .agents 等内部 SKILL.md）

## 技术决策

- 使用 subpath 语法 `mindfold-ai/Trellis/marketplace` 解决扫描污染问题（主仓库有 ~17 个内部 SKILL.md）
- 纯数据/文本变更不需要新增单测（符合 conventions.md 决策流程）
- docs-site 子模块只 commit 不 push，主仓库已推送到 `feat/monorepo-submodule`

**Updated Files**:
- `packages/cli/src/utils/template-fetcher.ts` — 2 常量 + 注释头
- `packages/cli/src/templates/markdown/spec/backend/directory-structure.md` — giget URL
- `.trellis/spec/cli/backend/directory-structure.md` — giget URL
- `marketplace/index.json` — 新增 trellis-meta 条目
- `marketplace/README.md` — 安装命令
- `marketplace/specs/electron-fullstack/` — 50 文件
- `marketplace/skills/trellis-meta/SKILL.md` — 从 docs-site 迁移
- `docs-site/` — 6+ 文件 URL 更新，plugins/ 和 .claude-plugin/ 删除


### Git Commits

| Hash | Message |
|------|---------|
| `9195f89` | (see git log) |
| `21deaf4` | (see git log) |
| `c0bdd0c` | (see git log) |
| `5465d3d` | (see git log) |
| `053a09b` | (see git log) |
| `ccedf8c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 81: 合并 monorepo 分支 + cross-layer check 修复

**Date**: 2026-03-10
**Task**: 合并 monorepo 分支 + cross-layer check 修复
**Package**: cli

### Summary

(Add summary)

### Main Changes

## 完成内容

| 操作 | 描述 |
|------|------|
| 分支合并 | `feat/monorepo-submodule` fast-forward 合并到 `main` 并推送 |
| docs-site 推送 | `feat/marketplace-migration` 推送后合并到 `main`，Mintlify 部署生效 |
| 分支清理 | 删除本地+远程 `feat/monorepo-submodule` 和 `feat/marketplace-migration` |
| Cross-layer check | 发现 `.claude/skills/contribute/SKILL.md` 引用已删除的 `plugins/` 结构 |
| SKILL.md 修复 | 重写为双仓库贡献指南（docs vs Trellis marketplace） |
| dist 重建 | `pnpm build` 清除编译产物中的旧 URL |
| Task 创建 | `03-10-monorepo-compat`（CLI 双模式兼容 PRD，6 Phase） |
| Task 创建 | `03-10-merge-monorepo-branch`（合并操作 checklist，已归档） |

## 技术决策

- 合并顺序：主仓库先于 docs-site（确保 marketplace URL 生效后再部署文档）
- contribute SKILL.md 区分两个仓库的贡献路径（文档 → docs，skills/specs → Trellis/marketplace）
- monorepo-compat PRD 设计为 forward-compatible：通过 config.yaml 有无 `packages:` 字段判定模式

**Updated Files**:
- `.claude/skills/contribute/SKILL.md` — 重写，删除 plugins 引用


### Git Commits

| Hash | Message |
|------|---------|
| `00a6614` | (see git log) |
| `a7d786f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 82: Hook Start Equiv: ready tag fix + path resolution + dogfood sync

**Date**: 2026-03-10
**Task**: Hook Start Equiv: ready tag fix + path resolution + dogfood sync
**Package**: cli

### Summary

(Add summary)

### Main Changes

| Change | Description |
|--------|-------------|
| `<ready>` tag reword | Changed from "Report current state summary" to "Wait for user's first message, then follow instructions". Explicitly tells AI Steps 1-3 are already injected. |
| Task path resolution fix | Fixed bug where `.current-task` storing project-relative paths (`.trellis/tasks/xxx`) caused double-path resolution in `_get_task_status()` |
| Dogfood sync | Synced all hook-start-equiv changes to project's own `.claude/hooks/session-start.py`: task-status injection, dynamic spec discovery, ready tag, path fix |

**Updated Files**:
- `packages/cli/src/templates/claude/hooks/session-start.py`
- `packages/cli/src/templates/iflow/hooks/session-start.py`
- `packages/cli/src/templates/opencode/plugin/session-start.js`
- `.claude/hooks/session-start.py`

**Task archived**: `03-06-hook-start-equiv`


### Git Commits

| Hash | Message |
|------|---------|
| `be06afd` | (see git log) |
| `700f4b7` | (see git log) |
| `5a925e6` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 83: Start Flow: Brainstorm Enforcement + Index Navigation + Guidelines Note

**Date**: 2026-03-10
**Task**: Start Flow: Brainstorm Enforcement + Index Navigation + Guidelines Note
**Package**: cli

### Summary

(Add summary)

### Main Changes

## Changes

| Area | Description |
|------|-------------|
| Brainstorm enforcement | All 9 platforms: complex tasks must automatically trigger brainstorm — no skipping to implementation |
| 4-way classification | Upgraded Gemini, Qoder, Kilo from 3-way to 4-way task classification (Question/Trivial/Simple/Complex) |
| Index-is-navigation | All 9 platform start files: clarified that index files are navigation pointers, not the actual guidelines |
| Session-start hooks | 3 hooks (claude, iflow, opencode): added Note in `<guidelines>` tag clarifying injected content is indexes |
| Dogfooding sync | `.claude/hooks/session-start.py` synced with template changes |
| PRD update | Recorded generic command description fix in monorepo-compat PRD |

## Key Decisions
- Cursor start file has different Step 3 structure — index-navigation note adapted to fit after its subsections
- Antigravity has no own start file — inherits from Codex via `adaptSkillContentToWorkflow()`, verified changes propagate

**Updated Files** (14 files):
- 9× platform start files (`packages/cli/src/templates/*/`)
- 3× session-start hooks (claude, iflow, opencode templates)
- `.claude/hooks/session-start.py` (dogfooding)
- `.trellis/tasks/03-10-monorepo-compat/prd.md`


### Git Commits

| Hash | Message |
|------|---------|
| `0d29b70` | (see git log) |
| `7de2916` | (see git log) |
| `7c42d80` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 84: Implement update.skip + user-deletion detection

**Date**: 2026-03-10
**Task**: Implement update.skip + user-deletion detection
**Package**: cli

### Summary

(Add summary)

### Main Changes

## Changes

| Area | Description |
|------|-------------|
| R1: User deletion detection | `analyzeChanges()` checks stored hash — if file was previously installed but deleted by user, it's preserved instead of re-added |
| R2: config.yaml skip | `loadUpdateSkipPaths()` parses `update.skip` list from config.yaml (no YAML dependency), filters templates in `collectTemplateFiles()` |
| UX: Summary display | New "Deleted by you (preserved)" section in update output |
| Tests | 3 new integration tests (#15-#17): truly new file added, user-deleted preserved, skip config works |
| Dogfooding | Configured `.trellis/config.yaml` with `update.skip` for 12 type-specific commands across 3 platforms |

## Smoke Test
- Fresh `trellis init` → delete `get_context.py` → `trellis update --dry-run` → shows "Deleted by you (preserved)" ✓
- Add `update.skip` to config.yaml → files excluded from update output entirely ✓

**Updated Files**:
- `packages/cli/src/commands/update.ts` (R1 + R2 implementation)
- `packages/cli/test/commands/update.integration.test.ts` (+3 tests, updated existing)
- `.trellis/config.yaml` (skip config for monorepo)


### Git Commits

| Hash | Message |
|------|---------|
| `3ed892c` | (see git log) |
| `7f1769e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 85: fix: add_session.py stdin 阻塞修复

**Date**: 2026-03-10
**Task**: fix: add_session.py stdin 阻塞修复
**Package**: cli

### Summary

修复 add_session.py 在非交互环境（如 Cursor Agent）下因隐式 stdin 读取导致阻塞的问题。将 sys.stdin.isatty() 自动检测改为显式 --stdin flag opt-in。同步更新了本项目实例和 CLI 模板。

### Main Changes

(Add details)

### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 86: S1 Monorepo Infrastructure + Python Sync + stdin Fix

**Date**: 2026-03-10
**Task**: S1 Monorepo Infrastructure + Python Sync + stdin Fix
**Package**: cli

### Summary

Complete S1 monorepo detection, sync Python scripts template↔dogfooded, fix --stdin regression in record-session templates

### Main Changes

## S1 Monorepo Detection + Per-Package Spec (`f36d220`)
| Feature | Description |
|---------|-------------|
| `detectMonorepo()` | Supports pnpm-workspace.yaml, package.json workspaces, Cargo.toml, go.work, pyproject.toml, .gitmodules |
| Per-package spec | Each detected package gets spec dirs based on its ProjectType |
| config.yaml patching | Non-destructive append of `packages:` section |
| CLI flags | `--monorepo` / `--no-monorepo` |
| templateStrategy fix | Hoisted declaration before monorepo block (was hard-coded "overwrite") |
| Orphan guard | `&& !monorepoPackages` prevents root-level spec in monorepo mode |
| Integration tests | 6 new monorepo init tests (#13-#18) |

## Python Script Sync (`7ee15a7`)
| File | Changes |
|------|---------|
| `config.py` | Merged type hints + value filtering + `is_monorepo()` + `get_spec_base()` |
| `git_context.py` | Merged `_scan_spec_layers()` + `_get_packages_info()` + `_get_packages_section()` |
| `paths.py` | Added `get_spec_dir()` + `get_package_path()` with lazy import |
| `cli_adapter.py` | Synced docstring `'check'` → `'check-backend'` |
All files now byte-identical between template and dogfooded (verified via MD5).

## --stdin Fix (`ba633be`)
- Root cause: `sys.stdin.isatty()` returns False in Cursor/CI subprocess → `stdin.read()` blocks
- Fix: explicit `--stdin` flag — only reads stdin when caller opts in
- Updated 15 record-session templates across all platforms (Claude, Cursor, Codex, iFlow, Kilo, Kiro, OpenCode, Gemini, Qoder)
- Restored pipe usage docs in `add_session.py` docstring

## Key Design Decisions
- **`--stdin` is correct**: pipe needed for large session content (ARG_MAX limits), `isatty()` unreliable in non-interactive environments
- **Template ↔ dogfooded merge**: took best from both sides, not one-way overwrite
- **Remaining divergences** (add_session.py --package, hooks/, task.py) deferred to S2-S4


### Git Commits

| Hash | Message |
|------|---------|
| `f36d220` | (see git log) |
| `7ee15a7` | (see git log) |
| `ba633be` | (see git log) |
| `346c12c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 87: S2: 命令合并 + Hook/Start 动态化

**Date**: 2026-03-10
**Task**: S2: 命令合并 + Hook/Start 动态化
**Package**: cli

### Summary

(Add summary)

### Main Changes

## S2 Implementation Complete

将 type-specific 命令合并为 generic 命令，所有模板和 Hook 改为动态 spec 发现。

| 变更类别 | 说明 |
|---------|------|
| 命令合并 | before-backend-dev + before-frontend-dev → before-dev, check-backend + check-frontend → check (9 平台, 54 files) |
| 动态 spec | start/parallel/workflow/agents 模板使用 `get_context.py --mode packages` 替代硬编码路径 (21 files) |
| Hook/Script 同步 | inject-subagent-context.py 改用 pathlib + 动态 spec tree, task.py/cli_adapter.py 描述统一 (7 files) |
| 文档/测试 | onboard/create-command 更新 generic 命令名, 9 个平台测试更新, PRD 更新 (28 files) |

**Check Agent 修复**: 3 处重复行 (implement.md, research.md) + 1 处 markdown 格式 (cursor start.md)

**Codex Cross-Review (gpt-5.4)**: 2 findings — P1 缺 migration manifest (release 阶段处理), P2 check.md untracked 场景 (beta 可接受)

**模板 ↔ Dogfooded 同步**: session-start.py / inject-subagent-context.py / cli_adapter.py 全部 MD5 一致; task.py 仅 S3 scope (--package) 差异

**测试**: 436/436 通过


### Git Commits

| Hash | Message |
|------|---------|
| `9aa3aa5` | (see git log) |
| `c0c9c4d` | (see git log) |
| `151d6e1` | (see git log) |
| `ac311f3` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 88: S3 PRD: 6 rounds Codex review + cross-layer check

**Date**: 2026-03-11
**Task**: S3 PRD: 6 rounds Codex review + cross-layer check
**Package**: cli

### Summary

(Add summary)

### Main Changes

## S3 PRD 完善

6 轮 Codex cross-review（27 findings，26 incorporated，1 false positive）+ cross-layer check，PRD 从初始版本扩展到 30 条 acceptance criteria。

### Codex Review 关键发现

| Round | Findings | 关键问题 |
|-------|----------|---------|
| R3 | 7 | safe-file-delete hash 匹配、spec_scope 校验、guides 始终注入、部分迁移检测 |
| R4 | 3 | 无版本项目策略、CLI/推断来源分拆校验 |
| R5 | 3 | safe-file-delete 执行顺序、monorepo 禁 fallback 单仓路径、空 scope fallback |
| R6 | 2 | allowed_hashes 字段、update.skip 交互 |

### Cross-Layer Check 发现

- `migration.ts` MigrationItem 类型需扩展 `safe-file-delete` + `allowed_hashes`
- `config.py` 需新增 `validate_package()` + `get_spec_scope()` + `resolve_package()`
- OpenCode `session-start.js` 需独立实现 config 读取（无法复用 Python）
- `create_bootstrap.py` 硬编码 spec 路径遗漏
- 41 个模板文件硬编码 `spec/backend/` → 单独 task

### 新建 Tasks

- `03-11-spec-path-dynamic` (P3) — 41 个模板硬编码 spec 路径动态化

### OpenCode 遗漏修正

- 3.4a 迁移提示 + 3.5 spec_scope 补充 OpenCode `session-start.js`（之前只覆盖 Claude + iFlow）


### Git Commits

| Hash | Message |
|------|---------|
| `aff6b29` | (see git log) |
| `eeea19f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 89: S3 Batch 3A+3B: Hooks, Package Support, Safe-File-Delete

**Date**: 2026-03-11
**Task**: S3 Batch 3A+3B: Hooks, Package Support, Safe-File-Delete
**Package**: cli

### Summary

(Add summary)

### Main Changes

## Summary

Completed S3 Batch 3A (hooks + package support) and Batch 3B (safe-file-delete migration system) for the v0.4.0-beta.1 release.

## Changes

| Feature | Description |
|---------|-------------|
| spec_scope filtering | session-start hooks (Claude/iFlow) now filter spec injection by package's `spec_scope` field |
| Legacy spec detection | Hooks detect old flat `.trellis/spec/backend/` layout and warn users to re-init |
| task.py --package | `create`, `init-context`, `list` support `--package` flag for monorepo awareness |
| add_session.py --package | Session recording supports package context |
| create_bootstrap.py --package | Bootstrap script supports package filtering |
| safe-file-delete type | New migration type that auto-deletes files only when content hash matches known templates |
| 0.4.0-beta.1 manifest | 32 safe-file-delete entries across 8 platforms for deprecated S2 commands |
| update.ts integration | collectSafeFileDeletes + executeSafeFileDeletes + PROTECTED_PATHS enforcement |
| Shell injection fix | OpenCode session-start.js: execSync → execFileSync to prevent injection |
| OpenCode manifest fix | Removed 4 OpenCode entries (no collectTemplates = can't write replacements) |

## Key Decisions

- **Version-independent execution**: safe-file-delete uses `getAllMigrations()` instead of version-filtered queries — hash match is the safety net
- **Separated from --migrate flow**: safe-file-delete items filtered out of `classifyMigrations()` and processed in dedicated pipeline
- **OpenCode excluded from manifest**: Codex cross-review caught that deleting old files without replacement capability would break users

## Updated Files
- `packages/cli/src/types/migration.ts` — added safe-file-delete type + allowed_hashes
- `packages/cli/src/migrations/manifests/0.4.0-beta.1.json` — new manifest (32 entries)
- `packages/cli/src/migrations/index.ts` — getMigrationSummary with safeFileDeletes
- `packages/cli/src/commands/update.ts` — safe-file-delete collect/execute/summary
- `packages/cli/src/templates/opencode/plugin/session-start.js` — shell injection fix
- `packages/cli/src/templates/claude/hooks/session-start.py` — spec_scope + legacy detection
- `packages/cli/src/templates/iflow/hooks/session-start.py` — spec_scope + legacy detection (synced)
- `packages/cli/test/regression.test.ts` — safe-file-delete hash validation test
- `packages/cli/test/migrations/index.test.ts` — updated for new type + summary field
- `.trellis/scripts/task.py` — --package support
- `.trellis/scripts/add_session.py` — --package support
- `.trellis/scripts/common/cli_adapter.py` — package argument parsing


### Git Commits

| Hash | Message |
|------|---------|
| `7947de3` | (see git log) |
| `0b78b86` | (see git log) |
| `7a44d0f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 90: S4: Worktree submodule + PR awareness — review & tests

**Date**: 2026-03-11
**Task**: S4: Worktree submodule + PR awareness — review & tests
**Package**: cli

### Summary

(Add summary)

### Main Changes

## Summary

Completed S4 implementation: multi-agent pipeline now handles git submodules in worktree workflows.

## Changes

| Area | Description |
|------|-------------|
| `start.py` | Check submodule status prefix before init (prevents detached HEAD); auto-init uninitialized submodules |
| `create_pr.py` | Detect submodule changes, create separate PRs, squash-merge warning marker, isinstance guard on `submodule_prs` |
| `cleanup.py` | Warn about open submodule PRs before worktree cleanup |
| `regression.test.ts` | 6 S4 regression tests (status prefix, imports, symbolic-ref, isinstance, squash-warning, cleanup calls) |
| `update.integration.test.ts` | 3 S3-gap tests: safe-file-delete preserves modified files, handles missing files, respects update.skip |

## Review Rounds (5 total)

1. Check agent: 4 fixes (dead params, blockquote, `-C` flag, hook ordering)
2. Codex cross-review: 3 findings (1 known limitation, 1 already fixed, 1 PRD design)
3. Manual error handling: 1 fix (`isinstance` guard on `submodule_prs: null`)
4. Manual edge cases: no new bugs
5. Manual security: no vulnerabilities

## Verification

- Cross-layer check: all 5 dimensions passed
- Code quality check: all spec guidelines verified
- **446 tests** pass, lint clean, typecheck clean

**Updated Files**:
- `packages/cli/src/templates/trellis/scripts/multi_agent/start.py`
- `packages/cli/src/templates/trellis/scripts/multi_agent/create_pr.py`
- `packages/cli/src/templates/trellis/scripts/multi_agent/cleanup.py`
- `.trellis/scripts/multi_agent/start.py` (dogfood sync)
- `.trellis/scripts/multi_agent/create_pr.py` (dogfood sync)
- `.trellis/scripts/multi_agent/cleanup.py` (dogfood sync)
- `packages/cli/test/regression.test.ts`
- `packages/cli/test/commands/update.integration.test.ts`


### Git Commits

| Hash | Message |
|------|---------|
| `8bda664` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 91: Bug analysis: parse_simple_yaml greedy quote strip

**Date**: 2026-03-12
**Task**: Bug analysis: parse_simple_yaml greedy quote strip
**Package**: cli

### Summary

Discovered parse_simple_yaml uses .strip('"').strip("'") which greedily eats nested quotes. Full audit found 4 hand-rolled YAML parsers (1 critical, 2 minor, 1 correct). Created task 03-12-yaml-quote-strip-bug with PRD. Updated quality-guidelines.md with String Sanitization Patterns section.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `8bda664` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 92: Hotfix: YAML quote strip bug (0.3.8)

**Date**: 2026-03-12
**Task**: Hotfix: YAML quote strip bug (0.3.8)
**Package**: cli

### Summary

(Add summary)

### Main Changes

## Summary

Fixed critical bug where Python's greedy `str.strip('"').strip("'")` destroyed nested quotes in YAML values (e.g., `"echo 'hello'"` → `echo 'hello`). Released as hotfix 0.3.8 and merged back into feat branch.

## What Was Done

| Area | Description |
|------|-------------|
| **Root Cause** | `parse_simple_yaml()` in worktree.py used `.strip('"').strip("'")` which removes ALL matching chars from both ends |
| **Fix** | Added `_unquote()` helper that removes exactly one layer of matching surrounding quotes |
| **Audit** | Checked all 4 YAML parser locations: worktree.py (critical), update.ts (minor fix), ralph-loop.py (deferred), project-detector.ts (correct) |
| **Tests** | 13 new tests: 6 Python execution tests (subprocess), 3 content regression, 4 loadUpdateSkipPaths |
| **S3 Tests** | 3 safe-file-delete integration tests added to update.integration.test.ts |
| **Spec Update** | Added "String Sanitization Patterns" to quality-guidelines.md |
| **Release** | Hotfix branch fix/yaml-quote-strip → PR #84 → merged to main → 0.3.8 release |
| **Merge** | main merged back into feat/v0.4.0-beta, all 459 tests pass |

## Key Files Changed
- `packages/cli/src/templates/trellis/scripts/common/worktree.py` — `_unquote()` + parser fix
- `.trellis/scripts/common/worktree.py` — synced dogfooded copy
- `packages/cli/src/commands/update.ts` — `loadUpdateSkipPaths` quote stripping
- `packages/cli/test/regression.test.ts` — 9 new regression tests (content + Python execution)
- `packages/cli/test/commands/update-internals.test.ts` — 4 new loadUpdateSkipPaths tests
- `packages/cli/test/commands/update.integration.test.ts` — 3 safe-file-delete tests
- `packages/cli/src/migrations/manifests/0.3.8.json` — release manifest
- `.trellis/spec/cli/backend/quality-guidelines.md` — string sanitization patterns

## Break-Loop Analysis
- **Root Cause Category**: E (Implicit Assumption) — Python `.strip()` semantics assumed single-pair removal
- **Prevention**: Added forbidden pattern to spec, `_unquote()` as canonical safe alternative
- **Remaining**: `ralph-loop.py:126` minor quote issue (deferred, low risk)


### Git Commits

| Hash | Message |
|------|---------|
| `c354c66` | (see git log) |
| `aa739ee` | (see git log) |
| `74c64b6` | (see git log) |
| `c032fdd` | (see git log) |
| `692aac8` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 93: Release 0.3.9 + create-manifest stdin mode + docs changelog

**Date**: 2026-03-12
**Task**: Release 0.3.9 + create-manifest stdin mode + docs changelog
**Package**: cli

### Summary

(Add summary)

### Main Changes

## Summary

Released 0.3.9 (iFlow hook matcher fix), added docs-site changelogs for both 0.3.8 and 0.3.9, and improved create-manifest script with stdin JSON mode.

## What Was Done

| Area | Description |
|------|-------------|
| **Release 0.3.9** | iFlow SessionStart hook matcher `compact` → `compress` to match Claude Code event name |
| **Test fix** | Updated iflow.test.ts + regression.test.ts on both main and feat branches |
| **Docs changelog** | Added v0.3.8 and v0.3.9 changelogs (en + zh) to docs-site, updated docs.json navigation |
| **create-manifest.js** | Added stdin JSON mode — auto-detects piped input via `!process.stdin.isTTY`, no flag needed |
| **create-manifest.md** | Updated command: use heredoc pipe instead of interactive mode, added docs-site changelog step, added "don't manually bump package.json" note |
| **Merge** | Merged main (0.3.9) back into feat/v0.4.0-beta, all 459 tests pass |

## Key Files Changed
- `packages/cli/scripts/create-manifest.js` — stdin JSON mode + isTTY auto-detect
- `.claude/commands/trellis/create-manifest.md` — updated workflow with docs-site step
- `docs-site/changelog/v0.3.8.mdx` + `v0.3.9.mdx` — English changelogs
- `docs-site/zh/changelog/v0.3.8.mdx` + `v0.3.9.mdx` — Chinese changelogs
- `docs-site/docs.json` — navigation updated to v0.3.9


### Git Commits

| Hash | Message |
|------|---------|
| `c5bc9fa` | (see git log) |
| `d73e945` | (see git log) |
| `2861b03` | (see git log) |
| `9b91d30` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 94: Codex Review Fixes (P0-P2) + Break-Loop Analysis

**Date**: 2026-03-12
**Task**: Codex Review Fixes (P0-P2) + Break-Loop Analysis
**Package**: cli

### Summary

(Add summary)

### Main Changes

## Codex Cross-Review Bug Fixes

对 v0.4.0-beta 全量 diff 的 Codex cross-review 发现的 17 个问题进行人工验证和修复。

### 验证结果

| 判定 | 数量 | 编号 |
|------|------|------|
| 真问题已修复 | 5 | CR#2, CR#5, CR#8, CR#11, CR#15 |
| 真问题延后 | 6 | CR#3, CR#9, CR#10, CR#12, CR#16, CR#17 |
| 假问题/设计意图 | 6 | CR#1, CR#4, CR#6, CR#7, CR#13, CR#14 |

### 修复内容

| CR# | 优先级 | 修复 |
|-----|--------|------|
| CR#5 | P0 | 测试 #20 改用 hash 匹配的原始模板内容，真正测试 update.skip |
| CR#15 | P0 | 新增测试 #21 验证 happy path（hash 匹配时文件被删除） |
| CR#11 | P1 | start.py `.strip()` → `.rstrip("\n\r")` 保留 submodule status 前缀 |
| CR#2 | P2 | rename/rename-dir 允许 target 为 protected path |
| CR#8 | P2 | config 解析失败时 console.warn 提醒 |

### Break-Loop 分析

- **Tautological Input** 反模式：测试输入使被测代码路径不可达 → 更新 unit-test conventions
- **Semantic Whitespace** 陷阱：`.strip()` 移除 git 输出的语义前缀 → 更新 script-conventions
- **AI Review 假阳性模式**：信任边界混淆、设计注释忽略、变量误读 → 更新 guides/index

### Spec 更新

- `.trellis/spec/cli/unit-test/conventions.md` — 新增 Tautological Input 反模式
- `.trellis/spec/cli/backend/script-conventions.md` — 新增 Parsing Structured Command Output
- `.trellis/spec/guides/index.md` — 新增 AI cross-review 验证 checklist

### 新建 Task

- `03-12-spec-sync-after-s1s4` — S1-S4 全量 spec 更新
- `03-12-improve-thinking-workflow` — Brainstorm/Break-Loop 流程改善

### Codex 二次 Review

修复后再次调用 Codex review，仅发现 1 个 WARNING（loadUpdateSkipPaths 手写 parser 对畸形 YAML 不 throw），归入 P3 延后。

**Updated Files**:
- `packages/cli/test/commands/update.integration.test.ts`
- `packages/cli/src/commands/update.ts`
- `.trellis/scripts/multi_agent/start.py`
- `packages/cli/src/templates/trellis/scripts/multi_agent/start.py`
- `.trellis/spec/cli/unit-test/conventions.md`
- `.trellis/spec/cli/backend/script-conventions.md`
- `.trellis/spec/guides/index.md`


### Git Commits

| Hash | Message |
|------|---------|
| `596b958` | (see git log) |
| `f8dae62` | (see git log) |
| `0bb1df8` | (see git log) |
| `2314968` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 95: Python Design Skill + Phase 1 Refactor

**Date**: 2026-03-12
**Task**: Python Design Skill + Phase 1 Refactor
**Package**: cli

### Summary

(Add summary)

### Main Changes

## Research: Python Design Skills

Searched web for Python design pattern skills for Claude Code. Evaluated 4 candidates:

| Skill | Source | Focus | Relevance |
|-------|--------|-------|-----------|
| python-best-practices | 0xbigboss | Type-first, dataclass, Protocol | High |
| python-design-patterns | wshobson | KISS, SRP, Rule of Three | High |
| software-design-philosophy | luoling8192 | Ousterhout's design philosophy | High |
| modern-python | trailofbits | uv/ruff/ty tooling | Low |

## Created: python-design Skill

`.claude/skills/python-design/SKILL.md` — Fused best of 3 skills + tailored to CLI scripting:
- Deep Modules, Information Hiding, Define Errors Out of Existence (Ousterhout)
- Type-First Development: frozen dataclass, TypedDict, NewType, Protocol
- KISS, SRP, Rule of Three
- 14 Red Flags quick reference table
- All examples use CLI/scripting domain (not web frameworks)

## Codebase Analysis

Research agent analyzed all 25 Python scripts. Key findings:
- `_read_json_file` duplicated in **8 files**
- `Colors` class duplicated in **6 files**
- Task iteration logic duplicated **9 times**
- 135 `.get()` calls with zero type safety
- God modules: `task.py` (1452 lines), `git_context.py` (861 lines)

## Task: 03-12-refactor-python-scripts

Created 4-phase PRD with Codex cross-review (8 findings, 7 incorporated):
- 2 CRITICAL: sys.path removal strategy, module split backward compat
- 5 WARNING: golden tests, lossless round-trip, compatibility aliases

## Phase 1 Implementation (P0 — Shared Infrastructure)

**New modules created:**
- `common/io.py` — `read_json` + `write_json`
- `common/log.py` — `Colors` + `colored` + `log_*`
- `common/git.py` — `run_git` (from `_run_git_command`)
- `multi_agent/_bootstrap.py` — centralized sys.path setup

**10 files migrated** to use shared imports. Net: **-263 lines** of duplicated code.

All golden tests pass (stdout/stderr/exit code identical before/after).

**Remaining**: Phase 2 (types), Phase 3 (module split), Phase 4 (cleanup).


### Git Commits

| Hash | Message |
|------|---------|
| `7fed74e` | (see git log) |
| `efaae94` | (see git log) |
| `c1c5e4a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 96: Phase 2: TaskInfo dataclass + shared task iteration

**Date**: 2026-03-12
**Task**: Phase 2: TaskInfo dataclass + shared task iteration
**Package**: cli

### Summary

(Add summary)

### Main Changes

## Phase 2: Type Safety — TaskInfo & iter_active_tasks

Continuing refactoring task `03-12-refactor-python-scripts` Phase 2 (Type Safety).

### New Modules

| File | Purpose |
|------|---------|
| `common/types.py` | `TaskData(TypedDict)` for task.json shape, `TaskInfo(frozen dataclass)` for loaded tasks, `AgentRecord(TypedDict)` for registry entries |
| `common/tasks.py` | `load_task()`, `iter_active_tasks()`, `get_all_statuses()`, `children_progress()` — single source of truth for task iteration |

### Migrated Files (6 files, -484 lines net)

| File | What Changed |
|------|-------------|
| `common/git_context.py` | 8 iteration loops + ~30 `.get()` calls → `iter_active_tasks()` + `load_task()` + `children_progress()` |
| `common/task_queue.py` | 3 iteration loops → `iter_active_tasks()` + `_task_to_dict()` |
| `task.py` | `cmd_list` iteration + `_get_children_progress` → `iter_active_tasks()` + `children_progress()` |
| `multi_agent/status.py` | 1 iteration loop → `iter_active_tasks()` |
| `add_session.py` | Manual JSON parsing for package → `load_task()` |

### Design Decisions
- **TaskInfo is frozen dataclass**: immutable, safe to pass around, typed attribute access
- **`raw` field preserves original dict**: writes go through `raw` to avoid losing unknown fields (lossless round-trip)
- **`children` is `tuple[str, ...]`**: immutable, consistent with frozen dataclass
- **Minor behavioral changes accepted**: task_queue sorting (unsorted → sorted), empty assignee default ("" → "-")

### Verification
- All 4 context modes pass golden test (text, record, json, packages)
- `task.py list` output consistent
- 460 unit tests pass
- Templates synced (verified HEAD consistency before rsync)


### Git Commits

| Hash | Message |
|------|---------|
| `cb948b4` | (see git log) |
| `f051de4` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 97: Refactor Python Scripts: Phase 3-4 + Spec Update

**Date**: 2026-03-12
**Task**: Refactor Python Scripts: Phase 3-4 + Spec Update
**Package**: cli

### Summary

(Add summary)

### Main Changes

## Task: refactor-python-scripts (Phase 3-4, 已归档)

完成 Python 脚本重构的 Phase 3（模块拆分）和 Phase 4（清理），并更新 spec 文档。

### Phase 3: 模块拆分

| 原文件 | 拆分结果 | 行数变化 |
|--------|----------|----------|
| `task.py` (970 行) | entry shim + `common/task_store.py` | 970 → ~80 shim + 534 store |
| `git_context.py` (672 行) | entry shim + `session_context.py` + `packages_context.py` + `task_context.py` | 672 → ~30 shim + 3 模块 |
| `status.py` (728 行) | entry shim + `status_display.py` + `status_monitor.py` | 728 → ~80 shim + 2 模块 |

所有原入口路径保持不变（entry shim pattern）。

### Phase 4: 清理

| 改动 | 描述 |
|------|------|
| `phase.py` | 提取 `_total_phases`/`_phase_action`/`_phase_for_action` 内部 helper，消除重复文件读取（3→1 per call） |
| `registry.py` | 新增 `_load_registry()` 合并文件解析+读取 |
| `task.py` | 移除 Windows encoding 重复（`common/__init__.py` 已覆盖） |
| `cli_adapter.py` | 提取 `_ALL_PLATFORM_CONFIG_DIRS` 常量 + `_has_other_platform_dir()` helper |

### Spec 更新

- `script-conventions.md`: 重写目录结构（20+ 模块注释）、新增 Shared Module API Reference、TaskInfo 设计决策、模块拆分模式
- `code-reuse-thinking-guide.md`: 新增模板同步约定 + rsync gotcha

### 错误教训

- **误 rsync spec 到 markdown 模板目录**：`.trellis/spec/`（项目自身规范）和 `packages/cli/src/templates/markdown/spec/`（新项目空白模板）完全不相关，不能互相同步


### Git Commits

| Hash | Message |
|------|---------|
| `5649093` | (see git log) |
| `6fc2fcb` | (see git log) |
| `78449bc` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 98: v0.4.0-beta.2: Fix scoped package names + release

**Date**: 2026-03-12
**Task**: v0.4.0-beta.2: Fix scoped package names + release
**Package**: cli

### Summary

(Add summary)

### Main Changes

## Summary

Fix scoped npm package names (e.g. `@zhubao/desktop`) creating nested `@scope/` directories in `.trellis/spec/` and `config.yaml`. Released as `v0.4.0-beta.2` hotfix.

## Changes

| Area | Description |
|------|-------------|
| **sanitizePkgName()** | New exported function in `project-detector.ts` — strips `@scope/` prefix from package names |
| **init.ts** | 7 sites updated: filesystem paths, text path references, `remoteSpecPackages` identifiers, config.yaml YAML keys all use sanitized names; display-only usages keep original |
| **workflow.ts** | `createSpecTemplates()` uses sanitized name for spec directory paths |
| **Tests** | Updated init integration tests for sanitized keys; added 3 unit tests for `sanitizePkgName` |
| **Release** | Created manifest `0.4.0-beta.2.json`, EN+ZH changelogs, published to npm |

## Key Files
- `packages/cli/src/utils/project-detector.ts` — `sanitizePkgName()`
- `packages/cli/src/commands/init.ts` — path/identifier sanitization
- `packages/cli/src/configurators/workflow.ts` — spec template path fix
- `packages/cli/src/migrations/manifests/0.4.0-beta.2.json`
- `docs-site/changelog/v0.4.0-beta.2.mdx` + `zh/` variant


### Git Commits

| Hash | Message |
|------|---------|
| `747a95e` | (see git log) |
| `40c3845` | (see git log) |
| `e6a72db` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 99: Fix #87 #88 + release v0.3.10 + merge to beta

**Date**: 2026-03-12
**Task**: Fix #87 #88 + release v0.3.10 + merge to beta
**Package**: cli

### Summary

(Add summary)

### Main Changes

## Summary

Fixed two community-reported issues, released v0.3.10, and merged fixes into beta branch.

## Changes

| Area | Description |
|------|-------------|
| **#87 HTTPS registry URLs** | New `normalizeRegistrySource()` auto-converts `https://github.com/user/repo` → `gh:user/repo`. Supports GitHub/GitLab/Bitbucket, `/tree/branch/path`, `.git` suffix |
| **#88 record-session wording** | Updated 9 platform templates: "AI must NOT execute git commit" → clarified that scripts handling `.trellis/` metadata commits are safe to run |
| **v0.3.10 release** | Created manifest, EN+ZH changelogs, published to npm as `latest` |
| **Beta merge** | Merged main into `feat/v0.4.0-beta`, resolved package.json version + docs-site submodule conflicts |

## Tests
- 14 new tests for `normalizeRegistrySource` + HTTPS URL integration
- All 477 tests pass on beta branch (440 on main)

## Key Files
- `packages/cli/src/utils/template-fetcher.ts` — `normalizeRegistrySource()`
- `packages/cli/src/templates/*/record-session.*` — 9 files updated
- `packages/cli/src/migrations/manifests/0.3.10.json`


### Git Commits

| Hash | Message |
|------|---------|
| `73d7feb` | (see git log) |
| `c515ced` | (see git log) |
| `4800e14` | (see git log) |
| `a8d7e37` | (see git log) |
| `12dc664` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 100: fix: trellis update skips unregistered Python scripts

**Date**: 2026-03-13
**Task**: fix: trellis update skips unregistered Python scripts
**Package**: cli

### Summary

(Add summary)

### Main Changes

## Bug Fix: `trellis update` 漏同步 11 个 Python 脚本

用户报告 `trellis update` 跳过了新增的 Python 模块文件（common/ 下 9 个 + multi_agent/ 下 2 个）。

### Root Cause
`commands/update.ts` 的 `collectTemplateFiles()` 手动维护了一份脚本文件列表，与 `templates/trellis/index.ts` 的 `getAllScripts()` 不同步。init 用整目录拷贝没问题，但 update 依赖这份手动列表。

### Fix (Architecture-level)
| Change | Description |
|--------|-------------|
| **重构 update.ts** | 移除 30+ 行手动 import + files.set()，替换为 `for..of getAllScripts()` 单行循环 |
| **回归测试** | 遍历 filesystem .py 文件，验证每个都在 `getAllScripts()` 中注册 |
| **Spec 更新** | code-reuse-thinking-guide 更新为反映单一注册点架构 |

### Break-Loop Analysis
- **Category**: C — Change Propagation Failure（同一数据两个不同步的注册点）
- **Prevention**: 消除重复列表（架构层面），+ 回归测试（安全网）

**Updated Files**:
- `packages/cli/src/commands/update.ts`
- `packages/cli/test/regression.test.ts`
- `.trellis/spec/guides/code-reuse-thinking-guide.md`


### Git Commits

| Hash | Message |
|------|---------|
| `8e3e465` | (see git log) |
| `ca06ab5` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 101: fix update script sync + release beta.3 + marketplace skill

**Date**: 2026-03-13
**Task**: fix update script sync + release beta.3 + marketplace skill
**Package**: cli

### Summary

(Add summary)

### Main Changes

## 本次 Session 工作

### 1. Bug Fix: `trellis update` 漏同步 Python 脚本
- 用户报告 `trellis update` 跳过新增 Python 模块
- Root cause: `collectTemplateFiles()` 手动维护文件列表，与 `getAllScripts()` 不同步（11 个文件）
- **架构级修复**：重构 `collectTemplateFiles()` 使用 `getAllScripts()` 作为单一数据源
- 添加回归测试：遍历 filesystem .py 文件验证注册完整性
- 更新 code-reuse-thinking-guide spec

### 2. Release v0.4.0-beta.3
- 创建 migration manifest `0.4.0-beta.3.json`
- 创建 docs-site changelog（EN/ZH）
- `pnpm release:beta` → npm 发布成功，CI 通过

### 3. Marketplace: cc-codex-spec-bootstrap skill
- 新增 CC + Codex 并行流水线 skill（GitNexus + ABCoder MCP）
- 创建 docs-site skill 详情页（EN/ZH）
- 更新 skills marketplace index + docs.json 导航

**Updated Files**:
- `packages/cli/src/commands/update.ts`
- `packages/cli/test/regression.test.ts`
- `.trellis/spec/guides/code-reuse-thinking-guide.md`
- `packages/cli/src/migrations/manifests/0.4.0-beta.3.json`
- `marketplace/skills/cc-codex-spec-bootstrap/`
- `docs-site/` (changelogs + skill pages + docs.json)


### Git Commits

| Hash | Message |
|------|---------|
| `8e3e465` | (see git log) |
| `ca06ab5` | (see git log) |
| `8670adb` | (see git log) |
| `618176d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
