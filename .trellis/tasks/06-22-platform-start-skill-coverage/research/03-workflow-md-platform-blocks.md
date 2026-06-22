# 03 — workflow.md 平台枚举 block 完整盘点

- **Query**: 列出 workflow.md 所有 `[Platform A, Platform B, ...]` block，决定 zcode / reasonix 各归入哪一类
- **Scope**: internal
- **Date**: 2026-06-22

## Block 清单（`packages/cli/src/templates/trellis/workflow.md`）

通过 `grep -En '^\[(/?[A-Z][A-Za-z]+|/?codex)' workflow.md` 得到 13 对 open/close（26 行）。整理如下：

| # | 行号 (open) | 行号 (close) | Section 主题 | 内容主题 |
|---|---|---|---|---|
| B1 | 275 | 281 | Active Task Routing | sub-agent dispatch — `[Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]` |
| B2 | 283 | 289 | Active Task Routing | inline — `[codex-inline, Kilo, Antigravity, Devin]` |
| B3 | 356 | 364 | Phase 1.2 Research | sub-agent — same set as B1 |
| B4 | 366 | 370 | Phase 1.2 Research | inline — same set as B2 |
| B5 | 383 | 426 | Phase 1.3 Configure context (curate jsonl) | sub-agent — same set as B1 |
| B6 | 428 | 432 | Phase 1.3 Configure context | inline (skip) — same set as B2 |
| B7 | 459 | 463 | Phase 1.5 Completion criteria（jsonl 推荐项） | sub-agent — same set as B1 |
| B8 | 473 | 485 | Phase 2.1 Implement (regular sub-agent flow) | `[Claude Code, Cursor, OpenCode, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]`（**不含 codex-sub-agent / Kiro**——它们有单独段） |
| B9 | 487 | 499 | Phase 2.1 Implement | `[codex-sub-agent]`（明确 Active task: prefix 强制） |
| B10 | 501 | 513 | Phase 2.1 Implement | `[Kiro]`（kiro prelude 自带 jsonl 注入说明） |
| B11 | 515 | 523 | Phase 2.1 Implement | inline — same set as B2 |
| B12 | 527 | 541 | Phase 2.2 Quality check | sub-agent — same set as B1（注意：B1 中含 codex-sub-agent；B8 不含；B12 含——所以 codex-sub-agent 在 implement 用独立 block，在 check 用通用 block） |
| B13 | 543 | 552 | Phase 2.2 Quality check | inline — same set as B2 |

另外，Phase Index 摘要行（line 186）是一个**散文式枚举**而非 `[...]` bracket block：

```
- 1.3 Configure context `[required · once]` — Claude Code, Cursor, OpenCode, Codex, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi (sub-agent-dispatch platforms only; inline platforms skip)
```

由 `inject-workflow-state.py` / `inject-workflow-state.js` 来 strip？**否**——解析器只识别 `\[Platform A, ...]\n` 和 `\[/Platform A, ...]\n` 的 bracket block；line 186 的散文不被解析。但渲染到 `.trellis/workflow.md` 后用户读，平台名遗漏会让 zcode/reasonix 用户困惑。需要也补。

## zcode / reasonix 归类决策

### zcode

- `agentCapable: true`, `hasHooks: false`, `supportsAgentSkills: true`
- 有 sub-agent：`packages/cli/src/templates/zcode/agents/` (`getAllAgents()`) 输出到 `.zcode/cli/agents/`
- 走 pull-based prelude（class-2 platform；configureZcode 用 `applyPullBasedPreludeMarkdown(getAllAgents())`）
- 主 session 通过 `.zcode/commands/trellis/` 接 slash command；sub-agent 走 dispatch
- **归类**：sub-agent dispatch（B1, B3, B5, B7, B8, B12）

但 B8 (Phase 2.1 implement) 排除了 codex-sub-agent 和 Kiro 走单独 block，原因是它们各自有特殊说明：codex 强制 Active task prefix（class-2），Kiro 的 prelude 自动注入 jsonl。zcode 的 prelude（pullBasedPreludeMarkdown）也是 class-2 pull-based，**和 codex-sub-agent 等价**——所以严格说 zcode 应该写一个类似 codex-sub-agent 的独立 block，或者直接加进 codex-sub-agent 的 dispatch 描述里。

**简化方案**：zcode 直接加进 B1/B3/B5/B7/B12 即可（这些是"普通 sub-agent dispatch + 走 hook/prelude"）；B8 的 implement 体现的"hook 自动注入"对 zcode 不准确（zcode 走 pull-based prelude，不是 hook）。

**严谨方案**：zcode 应该加进 B9 (`[codex-sub-agent]`) 的等价物，或者把 B9 的题目改为 `[codex-sub-agent, zcode, reasonix-sub-agent]`（所有 class-2 pull-based 平台）。但 codex-sub-agent 还说了 `Active task:` prefix；zcode 也是 class-2 → 同样需要 prefix。

**结论建议**：
- B1, B3, B5, B7, B12 加 `ZCode`（routing/research/configure/criteria/check 这几个通用 sub-agent block）
- B8 **不**加 zcode（B8 内容说"platform hook/plugin auto-handles"——对 zcode 不成立）
- B9 (`[codex-sub-agent]`) 把 zcode 加进去并改名，例：`[codex-sub-agent, zcode-sub-agent]` 或扩展到 `[codex-sub-agent, ZCode]`（描述里 Active task prefix 对 zcode 同样需要——`buildPullBasedPrelude` 的 Step 1 明文说"Look at the dispatch prompt ... `Active task: <path>`"，即 prelude 已要求 main agent 加 prefix）

### reasonix

- `agentCapable: true`, `hasHooks: false`
- 有 sub-agent skill：`runAs: subagent` frontmatter（trellis-implement, trellis-check）
- 不走 `.commands/`；只用 skills（cmdRefPrefix `/skill trellis-`）
- 主 session 调 sub-agent 的方式 = 调用 `/skill trellis-implement`（reasonix 把 runAs:subagent 解释为 spawn 隔离 loop）
- **归类**：sub-agent dispatch（同 zcode），但 reasonix 没有"hook auto-handles"，而是"subagent skill self-loads context"

reasonix 的 sub-agent skill 内容里有没有 pull-based prelude？看 `configureReasonix` 第 73-78 行：**没有**，reasonix 直接写 `getAllAgents()` 内容，不经 `applyPullBasedPreludeMarkdown`。需要查 reasonix agent .md 是否自带 context load 指令。

读 `packages/cli/src/templates/reasonix/agents/trellis-check.md` 头几行（前面查到）：frontmatter + recursion guard，没有显式 pull-based context load step。如果 reasonix 真的需要 main agent 把 Active task: 写进 dispatch prompt（class-2 行为），workflow.md 也应纳入 B9 类。

**结论建议**：
- B1, B3, B5, B7, B12 加 `Reasonix`
- B8 **不**加 reasonix
- B9 也加 reasonix（标识为 class-2 pull-based）；或者新建 `[reasonix]` 独立 block

## 推荐 patch 清单（最小改动版）

| Block | 当前 | R3 后 |
|---|---|---|
| line 186 散文 | `..., Pi (sub-agent-dispatch ...)` | `..., Pi, ZCode, Reasonix (sub-agent-dispatch ...)` |
| B1 (275/281) | `[..., Copilot, Droid, Pi]` | `[..., Copilot, Droid, Pi, ZCode, Reasonix]` |
| B2 (283/289) | `[codex-inline, Kilo, Antigravity, Devin]` | 不变 |
| B3 (356/364) | same as B1 | same as B1 后 |
| B4 (366/370) | same as B2 | 不变 |
| B5 (383/426) | same as B1 | same as B1 后 |
| B6 (428/432) | same as B2 | 不变 |
| B7 (459/463) | same as B1 | same as B1 后 |
| B8 (473/485) | `[Claude Code, Cursor, OpenCode, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi]` | **不变**（B8 描述 hook/plugin auto-handles，对 zcode/reasonix 不成立） |
| B9 (487/499) | `[codex-sub-agent]` | 建议 `[codex-sub-agent, ZCode, Reasonix]`——内容已经讲 class-2 Active task prefix + 自加载 jsonl，正符合 zcode 的 pullBasedPrelude 和 reasonix 的 subagent skill |
| B10 (501/513) | `[Kiro]` | 不变 |
| B11 (515/523) | same as B2 | 不变 |
| B12 (527/541) | same as B1 | same as B1 后 |
| B13 (543/552) | same as B2 | 不变 |

合计需要改动：line 186 散文一句 + B1/B3/B5/B7/B12 各一对（10 行）+ B9 一对（2 行）= **共 13 处编辑**。

## Implications for PRD

- PRD R3 说"影响范围预估 8+ 处枚举块"——实际是 **13 处（5 sub-agent block × 2 端 + B9 special × 2 端 + line 186 散文 = 13 编辑点）**，建议更新 PRD 数字。
- PRD R3 现行表述"归入 `[Claude Code, ... , Pi]` 一类"——本节细化指出 B8 是 hook-based sub-agent，**不应加 zcode/reasonix**（它们不是 hook-based）。建议 PRD 显式说明 B8 排除。
- PRD R3 未提 B9 (`[codex-sub-agent]`) 这个独立段；本节建议把 zcode/reasonix 加进 B9 以承袭"class-2 Active task prefix + 自加载 jsonl"的承诺。如果 PRD 不想动 B9，至少要新增一段 `[ZCode]` / `[Reasonix]` 复述同样契约，否则用户看到的 implement 步骤会缺这两个平台的说明。
- PRD R3 未提 line 186 那条散文式枚举——建议同步补。
