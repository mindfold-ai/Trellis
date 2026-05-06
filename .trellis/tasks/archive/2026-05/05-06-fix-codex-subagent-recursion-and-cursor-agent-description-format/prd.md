# Fix: Codex subagent recursion + Cursor agent description format

## Goal

修复两个独立但都影响"sub-agent 模板/编排"的 bug，让 Codex 和 Cursor 平台上的 Trellis sub-agent 能正常被分发和识别：

1. **Codex** — `trellis-implement` 子代理被 spawn 后，自身又递归 spawn 一个同名子代理，导致外层包装代理一直 `running`，主会话 `wait_agent` 死等（issue #234）。
2. **Cursor** — `.cursor/agents/*.md` 三个 Trellis agent 模板的 frontmatter 用了 YAML 多行块标量 `description: |`，Cursor agent 解析器只认单行字面量，导致 UI Description 字段读不出来、agent 不能用。

## What I already know

### Codex 递归问题（根因已定位）

- 报告者：mio + Codex 自身诊断 + GitHub issue #234（Sean-Melchizedek）。
- 现象：list_agents 看到嵌套结构
  ```
  /root/implement_w5300_mac                         running    ← 外层
  /root/implement_w5300_mac/implement_w5300_mac     completed  ← 内层
  ```
  内层完成、外层卡住，主会话 `wait_agent` 超时。
- 根因（已验证在仓库代码里）：
  - `packages/cli/src/templates/codex/hooks/session-start.py:241` 在 task READY 时注入：
    `"Next required action: dispatch \`trellis-implement\` per Phase 2.1. ..."`
  - `packages/cli/src/templates/codex/hooks/session-start.py:358-360` 也写入 `<guidelines>`：
    `"For agent-capable platforms, the default is to dispatch trellis-implement and trellis-check"`
  - Codex `multi_agent_v2` 下，**SessionStart 对每个 agent 会话（包括被 spawn 的 sub-agent）都触发**。
  - 子代理收到同样的"派发 trellis-implement"指令 → 把自己当主会话再 spawn → 同名递归。
- `trellis-implement.toml` / `trellis-check.toml` 本身**没有** spawn 指令，所以根因在 SessionStart hook 注入的 scope，不在 agent 定义。
- `inject-subagent-context.py` 是 push-based 平台（claude code 类）的 SubagentStop hook，Codex 不走这条路，Codex 子代理也走 SessionStart。

### Cursor 描述字段问题（根因已定位）

- 报告者：用户群截图（L.P）。
- 现象：Cursor UI 里 trellis-research / trellis-implement / trellis-check 三个 agent 的 Description 字段为空，对照能用的 codebase-search 是单行 `description: ...`。
- 根因（已验证在仓库代码里）：
  - `packages/cli/src/templates/cursor/agents/trellis-research.md` / `trellis-implement.md` / `trellis-check.md` 三个文件的 frontmatter 都是：
    ```yaml
    description: |
      <内容>
    ```
  - Cursor agent 解析器只认单行字面量，多行块标量识别不出来。

## Assumptions (temporary)

- **Codex SessionStart hook 拿到的 `hook_input` 里有办法判断"当前是不是 sub-agent 会话"**（例如 agent 名称、agent 路径层级、或某个明确字段）。需要研究确认；如果 Codex 平台不暴露这个信号，治本方案要降级。
- **改 Cursor frontmatter 把 `description: |` 改成单行不会破坏其他下游消费者**（Trellis 自己的 dispatcher 不依赖这三个文件的 frontmatter；其他平台用各自的 agent 定义文件）。
- 共享 hook 文件 `packages/cli/src/templates/shared-hooks/session-start.py:364` 也有同样的"dispatch trellis-implement"措辞，但它是不是被 Codex 平台用到，需要看 `index.ts` 的 hook 分发表确认。

## Open Questions

### Q1（Preference / Blocking）— Codex 递归的修复策略 ✅ 调研已收窄

**调研结论**（详见 `research/codex-sessionstart-subagent-signals.md`）：

- **A-hard（基于 stdin 字段硬过滤）走不通**：Codex SessionStart payload 当前只有 `session_id / transcript_path / cwd / hook_event_name / model / permission_mode / source`，**没有** agent_id / agent_type / parent_session_id / agent_path 任何 sub-agent 识别字段。OpenAI 官方已确认缺口（[openai/codex#16226](https://github.com/openai/codex/issues/16226) OPEN，无发版时间表）。
- **Q4 备选（自注入 env var）走不通**：`shell_environment_policy` 只管 codex 启动的子进程 env，不管 sub-agent；codex agent toml schema 不支持设 env。
- **SessionStart 确实在 sub-agent 跑两次**——根因实锤。

剩下可行的两条路：

- **B. 治标**：在 `codex/agents/trellis-implement.toml` / `trellis-check.toml` 的 `developer_instructions` 顶部加硬约束（"你是 trellis-implement 子代理，禁止再 spawn trellis-implement / trellis-check"）。
- **A-soft. 措辞软化**：在 `codex/hooks/session-start.py` 的 dispatch 话术上加一个条件——"如果你已经是 trellis 子代理（trellis-implement / trellis-check）就忽略本指令"，让模型基于自己 role 名判断。`shared-hooks/session-start.py:364` 同步改。

**推荐组合（待用户确认）：B + A-soft 双管齐下**：
- B 在 sub-agent 自己的 prompt 里硬挡（最显眼），
- A-soft 在 SessionStart 注入端软化措辞（消除"误导主会话指令进了子代理"这个递归源头），
- 两层冗余防御，立刻可上线，不依赖上游修 #16226。
- 未来等 #16226 落地后再补 A-hard（基于 stdin agent_id 的硬过滤）—— 这个**不在本任务**，作为 follow-up issue 记录。

### Q2 ✅ 已结案

研究 agent 已查清 Codex SessionStart payload 字段、env var、源码触发路径、agent toml schema。无需进一步调研。

### Q3（Out of Scope 确认）

- 是否在本任务里同时修 `shared-hooks/session-start.py:364` 的措辞？还是只动 codex 平台的版本？
  - 倾向：**两个都改**（A-soft 范围内，措辞一致性问题；其他平台同类风险只是没人报告而已）。
- Cursor 修复要不要顺便统一三个 agent md 的 tools 列表 / 其他细节？
  - 倾向：**不要**。本任务只动 frontmatter description 行，避免 scope creep。

### Q-followup（不在本任务）

- 上 GitHub 跟踪 [openai/codex#16226](https://github.com/openai/codex/issues/16226)，等 stdin agent 字段落地后补 A-hard 实现。建议在 Trellis 仓库开一个 follow-up issue 链上去。
- 研究 agent 建议：在有 Codex 实测环境时加一次性 debug hook，把 sub-agent 会话完整 stdin + os.environ 落盘——把现在"基于源码推断"的结论变成实证。

## Requirements (evolving)

### Codex 侧

- [ ] Codex `multi_agent_v2` 模式下，spawn `trellis-implement` 子代理后，子代理不再递归 spawn 同名子代理。
- [ ] Codex 子代理完成后能正常进入终态（外层不再卡 running）。
- [ ] 主会话从 spawn 到拿到子代理完成结果不超时。

### Cursor 侧

- [ ] `.cursor/agents/trellis-{research,implement,check}.md` 三个文件 frontmatter 的 `description` 改为单行字面量。
- [ ] Cursor UI agent 编辑器能在 Description 输入框正确显示这三个 agent 的描述。
- [ ] dist/ 产物也跟着更新（构建产出）。

## Acceptance Criteria (evolving)

- [ ] **Codex 复现路径**：在装有 Trellis 的 Codex `multi_agent_v2` 项目里，主会话 spawn `trellis-implement`，list_agents 不再出现同名嵌套；外层在子代理完成后进入 completed。
- [ ] **Cursor 验证**：在 Cursor UI 里打开 `.cursor/agents/trellis-research.md`（以及 implement/check），Description 输入框非空、内容与 frontmatter 一致。
- [ ] **回归不破坏**：现有测试套（`pnpm test` 534 tests）全通过；`pnpm lint` 通过。
- [ ] **模板对称性**：如果改了 codex hook 的措辞，shared-hooks 同款文件也要同步（避免漂移）。

## Definition of Done

- [ ] 两侧 fix 都已实现并验证。
- [ ] Vitest 测试覆盖：至少新增/更新对 codex session-start.py 的 sub-agent 分支测试（如果走方案 A/C）；cursor agent 模板的 frontmatter 单行格式检查（可放进 regression.test.ts 或 templates/cursor.test.ts）。
- [ ] Lint / typecheck / CI 绿。
- [ ] CHANGELOG / release notes 更新（标 bug fix）。
- [ ] GitHub issue #234 在 PR 描述里关联，修复后关闭。
- [ ] 如果方案 A/C 涉及 hook 行为变化，在 `.trellis/spec/hooks/` 或对应 spec 目录留一行说明。

## Out of Scope (explicit)

- 修复 Codex `multi_agent_v2` 平台层"外壳代理终态传播"的 bug——那是 Codex 平台问题，不在本仓库范围；本任务只消除"我们这边产生的递归源头"。
- 修复 issue #234 里"主会话 wait_agent 一直死等"的体验——只要递归源头消除，自然就不会再触发；不单独做 wait/timeout 策略调整。
- 改其他平台（claude code / opencode / iflow / kiro / qoder ...）agent 定义；只动 codex 和 cursor。
- 重构 SessionStart hook 注入结构；只做最小修改。
- 统一 Cursor 三个 agent md 的 tools / body 格式；只改 frontmatter description 行。

## Technical Notes

### 涉及文件（已识别）

**Codex 侧：**
- `packages/cli/src/templates/codex/hooks/session-start.py:241` — task READY 注入"dispatch trellis-implement"
- `packages/cli/src/templates/codex/hooks/session-start.py:358-360` — `<guidelines>` 块注入"default is to dispatch trellis-implement and trellis-check"
- `packages/cli/src/templates/shared-hooks/session-start.py:364` — 共享版本的同款措辞（确认是否被 codex 引用）
- `packages/cli/src/templates/codex/agents/trellis-implement.toml` — 可能加防御性硬约束
- `packages/cli/src/templates/codex/agents/trellis-check.toml` — 同上
- `packages/cli/src/templates/shared-hooks/index.ts` — hook 分发表（决定哪些平台引用哪个 hook）

**Cursor 侧：**
- `packages/cli/src/templates/cursor/agents/trellis-research.md` — frontmatter 多行 description
- `packages/cli/src/templates/cursor/agents/trellis-implement.md` — 同上
- `packages/cli/src/templates/cursor/agents/trellis-check.md` — 同上

### 已确认的事实

- `trellis-implement.toml` / `trellis-check.toml` 本身没有任何 spawn 指令，递归来源不在 agent 定义里。
- Codex 没有 SubagentStop 类的独立 hook 事件，子代理会话也走 SessionStart。
- `inject-subagent-context.py` 是 class-1 push-based 平台用的，不是 Codex。
- `should_skip_injection()` 当前只判断 `TRELLIS_HOOKS=0` / `TRELLIS_DISABLE_HOOKS=1` / `CODEX_NON_INTERACTIVE=1`，没有 sub-agent 判断分支。

### 待研究的问题（Q2）

- Codex SessionStart 给 hook 传的 stdin JSON 里有没有 agent 标识字段（agent name / agent path / parent_agent / is_subagent 之类）。
- Codex spawn sub-agent 时的环境变量传递行为（能不能在主会话注入一个 env var 让子代理识别）。
- Codex 文档或 multi_agent_v2 spec 链接。

## Research References

- [`research/codex-sessionstart-subagent-signals.md`](research/codex-sessionstart-subagent-signals.md) — Codex SessionStart payload / env var / 触发时机 / agent toml schema 全部查清；A-hard 不可行（卡在 OpenAI #16226），推荐 B + A-soft。
