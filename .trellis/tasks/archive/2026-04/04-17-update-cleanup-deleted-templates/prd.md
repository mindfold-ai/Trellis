# trellis update 清理已删除模板

## 背景

`trellis update` 命令的当前逻辑：**比对模板源和项目文件，把新增/修改的同步到项目**。但不处理"**模板源已删除但项目里还在**"的情况。

### 实际影响

Trellis 老版本升级到 v0.5.0-beta 的用户，项目里会残留一堆废弃文件：

| 残留文件 | 来自哪个已删特性 |
|---------|----------------|
| `.claude/agents/dispatch.md` | dispatch agent 删除 |
| `.claude/agents/debug.md` | debug agent 删除 |
| `.claude/agents/plan.md` | plan agent 删除 |
| `.claude/hooks/ralph-loop.py` | Ralph Loop 删除 |
| `.claude/commands/trellis/check-cross-layer.md` | 合并进 check |
| `.claude/commands/trellis/record-session.md` | 合并进 finish-work |
| `.claude/commands/trellis/onboard.md` | 已删 |
| `.claude/commands/trellis/create-command.md` | 已删 |
| `.claude/commands/trellis/integrate-skill.md` | 已删 |
| `.claude/commands/trellis/parallel.md` | 已删 |
| `.codex/skills/parallel/SKILL.md` | 已删 |
| `.agents/skills/parallel/SKILL.md` | 已删 |
| `.trellis/worktree.yaml` | multi-agent 删除 |
| `.trellis/scripts/multi_agent/*` | 8 个文件，multi-agent pipeline 删除 |
| `.trellis/scripts/common/{phase,registry,worktree}.py` | multi-agent 依赖，已删 |
| `.iflow/` 整个目录 | iFlow 平台已删 |

### 残留的后果

1. **AI 被误导** — 读到 `.claude/commands/trellis/parallel.md` 里的旧指令，尝试调用不存在的命令
2. **占位冗余** — SessionStart 注入时列出这些文件，污染 context
3. **更新不彻底** — 用户以为升级完成，实际还在混合运行

---

## 挑战

**不能无脑 delete**，要区分三种文件：

| 文件类型 | 识别方式 | 处理 |
|---------|---------|------|
| 1. Trellis 管理的、未改动 | 历史 hash 匹配 | 安全删 ✅ |
| 2. Trellis 管理的、用户改过 | 存在于历史 manifest 但 hash 不匹配 | 不删，警告 ⚠️ |
| 3. 用户自己加的文件 | 从未出现在任何 Trellis manifest | 保留 ✅ |

当前 Trellis 已有 **template-hash** 机制：`.trellis/.template-hashes.json` 追踪哪些文件由 Trellis 写入。

---

## 基础设施已就绪（2026-04-17 验证）

**无需新开发 migration 机制** —— `packages/cli/src/types/migration.ts:11-22` 的 `MigrationItem` schema 已支持：

```typescript
interface MigrationItem {
  type: "rename" | "rename-dir" | "delete" | "safe-file-delete";
  from: string;
  to?: string;
  description?: string;
  allowed_hashes?: string[];  // ← hash 保护，只有 hash 匹配才删
}
```

- `"safe-file-delete"` 类型 = 带 hash 校验的删除（用户改过就跳过）
- `"delete"` 类型 = 无条件删除（仅用于 Trellis 自己维护的内部文件）
- `allowed_hashes` = 历史版本的合法 hash 列表，支持多个（跨版本兼容）

唯一要做的是：**写 `0.5.0.json` manifest 填 deletion 条目**。

---

## 任务

### Phase 1: 生成 0.5.0 migration manifest [必做]

文件：`packages/cli/src/migrations/manifests/0.5.0.json`

格式参考 `0.4.0-beta.1.json`，每条 deletion 为：

```json
{
  "type": "safe-file-delete",
  "from": ".claude/agents/dispatch.md",
  "description": "dispatch agent removed (built-in worktree in CLIs)",
  "allowed_hashes": ["<sha256 from past version>"]
}
```

**`allowed_hashes` 的来源**：从项目 git 历史里查已删除文件的 SHA256。可写个小脚本：
```bash
git log --all --oneline --diff-filter=D -- <path> | head -5
git show <commit>:<path> | sha256sum
```

（或者接受"曾经是 Trellis 模板"这个信任 = 用 `"delete"` 而不是 `"safe-file-delete"`，hash 保护不严但文件归属明确——见下方讨论）

### Phase 2: 补完整清单 [必做]

基于 2026-04-17 深度扫描，完整清单：

**各平台 obsolete agent**：
- `.claude/agents/{dispatch,debug,plan}.md`
- `.codex/agents/{dispatch,debug,plan}.toml`（如存在）
- `.opencode/agents/{dispatch,debug,plan,trellis-plan}.md`
- 其它平台同名文件（Cursor/Qoder/CodeBuddy/Droid/Kiro/Gemini/Copilot 都扫一遍）

**Hooks**：
- `ralph-loop.py`（所有平台）

**Commands**（Claude 路径示例，其它平台对应位置）：
- `.claude/commands/trellis/check-cross-layer.md`
- `.claude/commands/trellis/record-session.md`（实际文件名可能是 `record-agent-flow.md`，扫 hash 比对）
- `.claude/commands/trellis/onboard-developer.md`（注意实际名）
- `.claude/commands/trellis/create-command.md`
- `.claude/commands/trellis/integrate-skill.md`
- `.claude/commands/trellis/parallel.md`

**Skills**：
- `.codex/skills/parallel/SKILL.md`
- `.agents/skills/parallel/SKILL.md`（若存在）

**Trellis 内部**（走 `"delete"` 不需 hash）：
- `.trellis/worktree.yaml`
- `.trellis/scripts/multi_agent/`（目录删除用 `rename-dir` 到 trash 或枚举每个 .py 逐个删）
- `.trellis/scripts/common/{phase,registry,worktree}.sh`（shell 版已用 Python 替代）
- `.trellis/scripts/common/phase.py`（workflow-enforcement-v2 会重写这个，不在本 task 清理范围 —— 留给 v0.5.0 后续）

**iFlow 平台**（整个目录）：
- `.iflow/`

### Phase 3: 测试 [必做]

- [ ] 单元测试：`safe-file-delete` + `allowed_hashes` 的 hash 保护（改过的文件不删 + warning）
- [ ] 集成测试：用一个 0.4.x 的 fixture 项目跑 `trellis update`，验证清理效果
  - 干净升级：所有 stale 文件被清理
  - 用户修改过的文件：保留 + 警告
  - 用户自加的文件：保留

### Phase 4: 文档 [必做]

- [ ] 0.5.0 changelog 列出清理项
- [ ] 迁移指南：如何处理被警告的文件

---

## 优先级

🔴 **P1 最小集** — v0.5.0-beta 发布门禁。

原因：不清理的话 0.4.x → 0.5.0 升级的用户项目里会残留死代码（dispatch agent / parallel command / Ralph Loop hook 等），AI 读到会混乱。

## 风险

- 误删用户文件（hash 保护不严）→ 需要完整的测试 + dry-run 默认模式
- 清单漏项 → stale 文件继续留着 → 用户再次升级时仍有问题
- 用户警告过多 → 升级体验差 → 需要好的 warning message + 文档

## 相关代码

```
packages/cli/src/
├── commands/update.ts           ← 主逻辑
├── migrations/
│   ├── index.ts                 ← manifest 加载
│   └── manifests/
│       ├── 0.4.0-beta.1.json    ← 参考已有格式
│       └── 0.5.0.json           ← 本次要新建
├── utils/template-hash.ts       ← hash 机制
└── utils/file-writer.ts
```

## 父 Task
`.trellis/tasks/04-16-skill-first-refactor`
