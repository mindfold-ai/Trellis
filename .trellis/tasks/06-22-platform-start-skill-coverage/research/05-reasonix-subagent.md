# 05 — Reasonix runAs:subagent 机制

- **Query**: reasonix 的 subagent skill frontmatter；R1 后 trellis-start 会以普通 skill 形式进来，是否与 subagent skill 冲突
- **Scope**: internal
- **Date**: 2026-06-22

## reasonix template / configurator 摘要

`packages/cli/src/templates/reasonix/index.ts`:
```ts
export function getAllAgents(): AgentTemplate[] {
  return listMdAgents();
}
```

→ 读 `packages/cli/src/templates/reasonix/agents/*.md`。当前两个文件：
- `trellis-check.md`
- `trellis-implement.md`

### subagent frontmatter 长什么样

`packages/cli/src/templates/reasonix/agents/trellis-check.md` 头：
```yaml
---
name: trellis-check
description: Code quality check expert. Reviews changes against Trellis specs, fixes issues directly, and verifies quality gates.
runAs: subagent
allowed-tools: read_file,write_file,edit_file,search_content,search_files,glob,run_command,list_directory,directory_tree
---
```

四个关键字段：
- `name`: 必须等于文件 basename（test 在 `packages/cli/test/templates/reasonix.test.ts:42` 强制）
- `description`: 单行非空（test 在 line 46 强制）
- `runAs: subagent`: **核心**——让 reasonix 以隔离 subagent loop 方式启动（非普通 slash-skill）
- `allowed-tools`: subagent 隔离工具集合

## R1 后 trellis-start 在 reasonix 怎么进来

`configureReasonix` 现行（packages/cli/src/configurators/reasonix.ts:61-78）：

```ts
const skillsRoot = path.join(cwd, config.configDir, "skills");
const agentNames = new Set(getAllAgents().map((a) => a.name));
// = {"trellis-check", "trellis-implement"}

const skills = resolveAllAsSkills(ctx).filter((s) => !agentNames.has(s.name));
await writeSkills(skillsRoot, skills, resolveBundledSkills(ctx));

for (const agent of getAllAgents()) {
  const agentDir = path.join(skillsRoot, agent.name);
  ensureDir(agentDir);
  await writeFile(path.join(agentDir, "SKILL.md"), agent.content);
}
```

R1 前：`resolveAllAsSkills(ctx)` 的内部 `filterCommands` 会移除 start → 返回的列表不含 trellis-start。

R1 后：`resolveAllAsSkills(ctx)` 不再 filter start → 返回的列表含 `{name: "trellis-start", content: wrapWithSkillFrontmatter("trellis-start", resolvePlaceholders(start.content, ctx))}`。

然后 `.filter((s) => !agentNames.has(s.name))` 对 trellis-start：`agentNames` = `{"trellis-check", "trellis-implement"}` 不含 "trellis-start"，所以 **保留**。

`writeSkills` 会写到 `.reasonix/skills/trellis-start/SKILL.md`。frontmatter 由 `wrapWithSkillFrontmatter("trellis-start", ...)` 生成：
```yaml
---
name: trellis-start
description: "Initializes an AI development session ..."
---
```

**没有 `runAs: subagent`**——这是普通 skill 形式，对应 reasonix 的 `/skill trellis-start` slash invocation。

## 是否会冲突？

- 命名空间：`.reasonix/skills/trellis-start/` 与 `trellis-check/` / `trellis-implement/` 平级，互不覆盖
- frontmatter 行为：trellis-start 没有 `runAs: subagent` → 走 reasonix 普通 slash-skill 调用，**符合预期**（用户主动调，不应该 spawn isolated subagent loop）
- agentNames filter 设计意图：防止"common skill 输出的 trellis-check / trellis-implement"覆盖掉 `.reasonix/skills/` 里那两个带 subagent frontmatter 的 SKILL.md。trellis-start 不在这套保护范围内，**不需要保护**——因为 common 模板源里 start 本身就是 command 类型，wrap 出来是无 `runAs` 的普通 skill。

## 验证：trellis-start 与 subagent skill 是否真的冲突

不冲突。但有一个潜在歧义：reasonix 用户看到 `.reasonix/skills/` 里同时有：
- `trellis-start/SKILL.md` (无 runAs)
- `trellis-check/SKILL.md` (runAs: subagent)
- `trellis-implement/SKILL.md` (runAs: subagent)
- 其他 trellis-* / bundled skills（普通 skill 形式）

这种"普通 skill + subagent skill 混合"是 reasonix 设计本意（subagent skill 是 strict subset）。R1 后多一个普通 trellis-start 不破坏现状。

## Implications for PRD

- PRD R1 / R2 在 reasonix 上下文中是安全的，不需特殊补丁。
- PRD Background 说 reasonix "configurator 注释明说`/skill trellis-start` 可调用但 `resolveAllAsSkills(ctx)` 同样被 filter 干掉，注释与行为不一致，是 bug"——本节确认这正是 R1 要修的根因之一。建议 PRD 在 R4 acceptance 增加一条："`trellis init --reasonix` 后 `.reasonix/skills/trellis-start/SKILL.md` 存在且不含 `runAs: subagent`"，以测试断言形式 lock-in 普通 skill 形式。
- 没有发现新的风险点；reasonix 路径全部畅通。
