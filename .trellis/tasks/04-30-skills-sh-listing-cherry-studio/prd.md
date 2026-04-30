# brainstorm: 上架 skills.sh + Cherry Studio 兼容性调研 (#205)

## Goal

调研并决策：如何让 Cherry Studio 用户能在其内置 Agent 技能市场里直接安装/管理 Trellis，进而回应 issue [#205](https://github.com/mindfold-ai/Trellis/issues/205)。

**本任务范围已锁定为路径 1（仅调研 + 决策）**。任何"实际提交 listing/产物适配"都另开新任务。

## Research References

- [`research/skills-sh-submission.md`](research/skills-sh-submission.md) — skills.sh 是 Vercel 跑的自动抓取 leaderboard，不需要"提交"，只要 GitHub 公仓里有合规 `SKILL.md` 就会被收录
- [`research/cherry-studio-skill-discovery.md`](research/cherry-studio-skill-discovery.md) — Cherry Studio 不扫 npm、不扫 skills.sh；其内置 `skills` MCP 实际查的是 **`claude-plugins.dev`** 而非 skills.sh

## 调研后的事实修正（重要）

issue #205 的两个隐含前提**都不成立**：

1. **"Cherry Studio 的技能市场只对接 skills.sh"** ❌
   代码证据（CherryHQ/cherry-studio PR #12426、#14184）：`MARKETPLACE_API_BASE_URL = 'https://api.claude-plugins.dev'`。Cherry Studio 内置 `skills` MCP 查的是 claude-plugins.dev，**不是** skills.sh。
   报错 `在技能市场中未找到名为 "Trellis" 的技能` 是 claude-plugins.dev 没收录 Trellis，不是 skills.sh。

2. **"npm 全局装完应该在技能列表里看到"** ❌（类目错配）
   Cherry Studio 的"技能"=`SKILL.md` 目录（Anthropic Claude Skill 形态），不是 CLI 不是 npm 包。Cherry Studio 完全不扫 `npm root -g` / `~/.claude/skills/` / `~/.codex/skills/`，只扫它自己 Electron `userData` 下的 `Skills/` 和当前 agent workspace。`npm i -g @mindfoldhq/trellis` 进入的位置 Cherry Studio **设计上看不到**。
   平行案例：issue [CherryHQ/cherry-studio#14660](https://github.com/CherryHQ/cherry-studio/issues/14660)（Tencent Skillhub CLI）有完全相同的失败模式。

> 好消息：skills.sh 和 claude-plugins.dev 都自动爬 GitHub 上的 `SKILL.md`，仓库改对了一次性收两边。

## What I already know

- Trellis 已有 `templates/claude/skills/*` 和 `templates/codex/skills/*`（含 `trellis-meta/SKILL.md`），形态本身就对，但路径在 `templates/` 下，**两个 registry 的爬虫都不扫这个目录**（爬虫只看 repo 根、`skills/`、`.claude/skills/`、`.codex/skills/` 等约定路径）。
- 我们的产物核心是"项目级 scaffolding CLI"——这个本质决定了它**不是**典型 Claude Skill（advisory content）形态。可类比的 skills.sh 收录案例（`davila7/claude-code-templates/app-builder` 等）都是"教 agent 怎么用某个工具"的指引型 skill，而**不是**"agent 装了就能直接跑"的 CLI。
- Cherry Studio 团队已承诺下一大版本扩展 marketplace（issue #13758），v2 "资源库" RFC（#14408）也提到统一 Skills/Agents/Assistants，但**显式排除**第三方 marketplace 浏览。

## Feasible Approaches

### Approach A：发布"Trellis 引导型 Skill"到 GitHub 公仓的标准位置（Recommended）

**怎么做**：
- 把 `trellis-meta/SKILL.md`（或新写一个 `trellis-init` skill）从 `templates/claude/skills/` 复制/软链到 repo 根的 `skills/trellis-init/SKILL.md`（或者写一个 `.claude-plugin/marketplace.json` 把 `templates/claude/skills/*` 暴露出去）。
- 内容定位为"教 agent 调用 Trellis CLI"——遵循 skills.sh 上同类工具（`app-builder`、`cli-developer`）的成熟范式。
- 触发一次 `npx skills add mindfold-ai/Trellis` 让 skills.sh 索引；claude-plugins.dev 的爬虫会在数小时内自动收录（无需提交）。
- 在 README + `/install` 引导文档加一段"Cherry Studio 用户：在 Agent 技能市场搜 'trellis-init'"。

**Pros**：
- 工作量最小，复用现有 skill 模板。
- 一次操作覆盖 skills.sh + claude-plugins.dev + 任何未来同样爬 GitHub 的 registry。
- 不动 CLI 主链路、不破坏现有 npm 分发。

**Cons**：
- 解决的是"Cherry Studio 能搜到并装上 SKILL.md"——装的是个**指引文档**，agent 看到后还得自己去跑 `npx @mindfoldhq/trellis init`。这跟用户预期的"装完即用"还是有差距。
- claude-plugins.dev 爬虫覆盖度不像 skills.sh 那么明确，回收时延未知。

### Approach B：A + 主动联系 Cherry Studio 把 Trellis 加入官方 marketplace 白名单

**怎么做**：A 的全部 + 在 CherryHQ/cherry-studio 提一个 issue/PR，请求把 Trellis 收入其 bundled marketplace catalog（具体提交流程未公开，需要先开 issue 询问）。

**Pros**：搜索结果排序更靠前；成为"官方推荐"提升可信度。
**Cons**：上游审核流程不透明；可能被拒（Cherry Studio marketplace 当前似乎以 SKILL.md 内容型为主，不一定欢迎 CLI wrapper）；时间不可控。

### Approach C：在 issue #205 里只回复"类目错配"解释 + 提供 workaround，不投入新工程

**怎么做**：直接关闭 issue 或回复说明 Cherry Studio 不扫 npm 是 by design，建议用户用 Cherry Studio 内置 `skills` MCP 的 `init`+`register` 让 agent 在对话里现场 author 一个引导 Trellis 的 skill。

**Pros**：零工程成本；技术上诚实。
**Cons**：用户体验最差，丢失 Cherry Studio 渠道用户；对其他将来从同样路径来的用户没有沉淀。

## Decision (ADR-lite) — _待你拍板_

**Context**: issue #205 暴露两件事：(1) 我们没在主流 Skill registry（skills.sh / claude-plugins.dev）有效曝光；(2) 用户对"CLI 安装 = Cherry Studio 技能可见"的预期与现实存在类目错配。

**Decision**: _等待 user input_ — 推荐 **Approach A**。

**Consequences**（A 路径）：
- 多一份 `skills/trellis-init/SKILL.md`（或通过 `.claude-plugin/marketplace.json` 把现有模板暴露），增加少量维护负担。
- skills.sh + claude-plugins.dev 双收录，间接惠及所有依赖这两个 registry 的客户端（Cherry Studio、未来其他客户端）。
- issue #205 可有可执行回复。

## Acceptance Criteria

- [x] `research/skills-sh-submission.md` 落地
- [x] `research/cherry-studio-skill-discovery.md` 落地
- [x] PRD 给出 ≥3 条可行路径并附 trade-off
- [ ] 在本任务里选定路径并落 ADR-lite
- [ ] 在 issue #205 下回复一个清楚说明（前提修正 + 我们的下一步）
- [ ] 如选 A/B：拆出后续实施任务（不在本任务范围内）

## Definition of Done

- 决策有据可循（research 文件 + ADR-lite 完成）
- issue #205 有正式回复，指明走哪条路径与时间预期

## Out of Scope

- 实际产出 `skills/trellis-init/SKILL.md`（A 路径的实施）→ 后续任务
- 联系 Cherry Studio 上游（B 路径的实施）→ 后续任务
- 为其他客户端（OpenCode/Continue/Goose 等）做适配 → 后续任务
- 修改 Cherry Studio 本身

## Technical Notes

- 入口：`bin/trellis.js` → `dist/cli/index.js`，主流程是把模板写到用户 repo
- 已有 skill 模板路径：`templates/claude/skills/`、`templates/codex/skills/`、`templates/iflow/skills/` 等
- skills.sh 爬虫扫描的 GitHub 路径列表（共 40+）见 [`research/skills-sh-submission.md`](research/skills-sh-submission.md) §2，其中**未包含** `templates/`
- claude-plugins.dev API：`GET https://api.claude-plugins.dev/api/skills/search?q=...`
