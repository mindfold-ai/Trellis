# fix: opencode trellis-research subagent must persist findings

## Goal

Make opencode 平台的 `trellis-research` subagent 与 claude/cursor/droid/gemini/codebuddy/qoder/pi/codex/kiro 行为一致：能写文件、并把每个调研话题落到 `{TASK_DIR}/research/<topic>.md`，避免 GitHub issue #211 报告的"调研结果只存活在主 agent 上下文里 / `trellis-implement` 拿不到调研结果"。

## What I already know

- opencode template `packages/cli/src/templates/opencode/agents/trellis-research.md`:
  - frontmatter `permission: { read: allow, write: deny, edit: deny, bash: allow, glob: allow, grep: allow, mcp__exa__*: allow, mcp__chrome-devtools__*: allow }`
  - 正文只有 "find and explain" + "Don't modify any files"，**没有** Persist/Workflow/File Format/Scope Limits 任何一段
- 对照 `claude/cursor/droid/gemini/codebuddy/agents/trellis-research.md`：5 个平台正文几乎逐字相同，含 Core Principle (PERSIST)、Workflow (Step 1–5 含 `mkdir -p {TASK_DIR}/research/`、Persist Each Topic、Report file paths)、File Format、Scope Limits (Write ALLOWED / FORBIDDEN)、DO/DON'T。opencode 是唯一离群点。
- `packages/cli/src/templates/opencode/plugins/inject-subagent-context.js` 已经会在 Task tool 调用时给 research subagent 注入 `## Project Spec Directory Structure` 等上下文（pull-based 兜底已被覆盖 → 模板里的 "Context Self-Loading" 段是冗余的）。
- 已有回归测试 `packages/cli/test/regression.test.ts:4005` "regression: research agent persists findings to task dir" 覆盖 6 个平台 (claude/cursor/qoder/gemini/codebuddy/droid)，**但 opencode、pi 都不在列表里**——这就是 bug 漏出的根因。
- opencode 跟 claude 的 frontmatter 形态不同：claude 用 `tools: Read, Write, ...` 单行；opencode 用 YAML `permission:` 块 + `mode: subagent`。回归测试里 `expect(fm).toMatch(/tools:\s*[^\n]*\bWrite\b/)` 不能直接套到 opencode，需要 opencode 专属断言。
- opencode permission 模型不支持路径范围 allow（不像 sandbox 路径白名单），`write: allow` 会全局放开，靠 prompt 文本约束 agent 只写 `{TASK_DIR}/research/`——这与 claude 一致（Claude `Write` tool 也不路径绑定）。

## Assumptions (temporary)

- opencode permission YAML 块支持 `write: allow` / `edit: allow` 两个 key（其他 5 个平台都靠 prompt 约束，不靠工具层路径白名单；opencode 同模型）。
- 用户日志里能看到 `[inject] Plugin loaded` —— inject-subagent-context.js 在用户机器上**正常工作**，所以 research subagent 拿得到 spec 目录结构上下文，"Context Self-Loading" 段可以删除（与其它平台对齐）。

## Open Questions

无（一个低优先级偏好题在下面 Decision 里给出推荐）。

## Requirements

1. `packages/cli/src/templates/opencode/agents/trellis-research.md` frontmatter:
   - 保留 `mode: subagent`
   - `permission` 块：`read/bash/glob/grep/mcp__exa__*/mcp__chrome-devtools__* = allow`
   - **`write: allow` 和 `edit: allow`**（修复点）
   - description 改为含 "PERSISTS every finding to the current task's research/ directory" 的语句（对齐 claude）
2. 正文用 claude/cursor 的版本完整替换：
   - Core Principle（PERSIST）
   - Workflow Step 1–5（含 `mkdir -p {TASK_DIR}/research/`）
   - File Format
   - Scope Limits（Write ALLOWED 仅 `{TASK_DIR}/research/*.md`；Write FORBIDDEN 列 src/、spec/、scripts/、其他 task dir、git）
   - Guidelines DO/DON'T
3. 删除 opencode 模板独有的 "Context Self-Loading" 段——inject-subagent-context.js 已经覆盖该兜底。
4. 扩展 `packages/cli/test/regression.test.ts` 第 4005 行的 "research agent persists findings to task dir" 测试组：新增 opencode 专属用例，断言：
   - 模板含 `permission:` 块，且 `write: allow`、`edit: allow`
   - 正文含 `{TASK_DIR}/research/`、`PERSIST` 或 `persist`
   - 正文不含 `^- Modify any files\s*$`

## Acceptance Criteria

- [ ] `.opencode/agents/trellis-research.md`（新 init 一个项目后）frontmatter 有 `write: allow`、`edit: allow`
- [ ] 同文件正文出现 "PERSIST"、`{TASK_DIR}/research/`、`mkdir -p` 三个字串
- [ ] `pnpm --filter @mindfold/trellis test` 全过，含新增的 opencode 用例
- [ ] `pnpm --filter @mindfold/trellis lint` 干净
- [ ] `pnpm --filter @mindfold/trellis typecheck`（如有）干净
- [ ] 手动 cross-check：用 `trellis init --platform opencode` 产出的 `.opencode/agents/trellis-research.md` 与 claude 等价（diff 仅 frontmatter 形态差异）

## Definition of Done

- 测试新增 + 全部通过
- Lint / typecheck 干净
- 模板修改与 claude/cursor 对齐
- 不动 inject-subagent-context.js 等运行时代码
- 不改 #211 issue 之外的范围（例如 pi 漏在回归列表里，留另一个小任务跟进）

## Technical Approach

- **复制源**：`packages/cli/src/templates/cursor/agents/trellis-research.md` 的正文（与 claude 一致，少一些 claude 特定描述），但 frontmatter 用 opencode 形态。
- **frontmatter 模板**（最终）：
  ```yaml
  ---
  description: |
    Code and tech search expert. Finds files, patterns, and tech solutions, and PERSISTS every finding to the current task's research/ directory. No code modifications outside that directory.
  mode: subagent
  permission:
    read: allow
    write: allow
    edit: allow
    bash: allow
    glob: allow
    grep: allow
    mcp__exa__*: allow
    mcp__chrome-devtools__*: allow
  ---
  ```
- **正文**：从 cursor 模板第 7 行（`# Research Agent`）开始整段拷贝，不做修改。
- **回归测试增量**：在现有 describe 里加一个 `it("opencode trellis-research has write permission and persist instruction", ...)`，单独处理 YAML 块解析。

## Decision (ADR-lite)

**Context**: opencode 的 YAML permission 块没有路径范围 allow；和 claude/cursor 一样，写入边界靠 prompt 文本约束。

**Decision**: 直接对齐 claude/cursor，正文写 "Write FORBIDDEN" 段把禁区列清楚。删除 opencode 独有的 "Context Self-Loading" 段（inject 插件已覆盖该兜底；保留会和其他平台分叉）。

**Consequences**: 跟 claude 行为一致；如果 inject-subagent-context.js 在某次 opencode 升级后失效，research subagent 会失去 spec 结构上下文（但仍能 persist）——这是另一类问题，由 #212 那条线追踪。

## Out of Scope

- pi 模板缺在回归测试列表里 —— 另起小任务
- opencode session-start 插件不加载 (#212) —— 另起任务（已在上一轮对话里说明需要单独调研 opencode 1.2.x plugin loader）
- 重构其他 5 个平台的研究 agent 文案
- 调整 inject-subagent-context.js 给 research 注入更多内容

## Technical Notes

- 参考文件：
  - `packages/cli/src/templates/claude/agents/trellis-research.md`（蓝本）
  - `packages/cli/src/templates/cursor/agents/trellis-research.md`（与 claude 几乎相同正文）
  - `packages/cli/src/templates/opencode/plugins/inject-subagent-context.js`（确认 research 已被自动注入 spec dir 结构）
  - `packages/cli/test/regression.test.ts:4005-4070`（既有回归测试，扩展点）
- opencode YAML frontmatter 解析：测试里手写正则提取 `permission:` 块即可，无需引入 yaml 包。
