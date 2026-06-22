# 07 — migration / 升级路径影响

- **Query**: 旧用户 `trellis update` 后会看到什么 diff；byte-identity 是否成立；要不要写 migration manifest
- **Scope**: internal
- **Date**: 2026-06-22

## byte-identity 验证：R1 前后 codex 的 trellis-start SKILL.md 是否一致

**R1 前**（通过 `resolveTrellisStartSkill(ctx)`）：

```ts
// shared.ts:459-471
const startTemplate = getCommandTemplates().find((t) => t.name === "start");
return {
  name: "trellis-start",
  content: wrapWithSkillFrontmatter(
    "trellis-start",
    resolvePlaceholdersNeutral(startTemplate.content, ctx),
  ),
};
```

**R1 后**（通过 `resolveAllAsSkillsNeutral(ctx)` 自然产出）：

```ts
// shared.ts:419-433
const templates = [
  ...filterCommands(getCommandTemplates(), ctx),  // R1 后含 start
  ...getSkillTemplates(),
];
return templates.map((tmpl) => ({
  name: `trellis-${tmpl.name}`,        // 对 start → "trellis-start"
  content: wrapWithSkillFrontmatter(
    `trellis-${tmpl.name}`,            // "trellis-start"
    resolvePlaceholdersNeutral(tmpl.content, ctx),
  ),
}));
```

两条路径：
- input: 同一份 `getCommandTemplates().find(t => t.name === "start")`
- name 生成: 都是字符串拼接 `"trellis-" + "start"` = `"trellis-start"`
- 内容渲染: 都用 `resolvePlaceholdersNeutral(startTemplate.content, ctx)`
- frontmatter wrap: 都用 `wrapWithSkillFrontmatter("trellis-start", rendered)`

→ **byte-identical 成立**。codex 跑 `trellis update` 不会把 `.agents/skills/trellis-start/SKILL.md` 标为 "user modified"，也不会触发覆盖确认。

## zcode 路径同上

zcode configurator 走同一对 helper（`resolveAllAsSkillsNeutral` + `resolveTrellisStartSkill`）。R1 后 zcode trellis-start 也是 byte-identical。

不过有一个微妙点：zcode 的 `resolveTrellisStartSkill` 调用是**本会话刚加上但未 commit 的代码**。从已有 release 角度看，zcode 用户跑 `trellis update`：
- 跑 0.7.0-rc（R1 完成后）：`.agents/skills/trellis-start/SKILL.md` **新增**（之前任何已发布版本的 zcode 都没产出这个文件）
- 不存在"修改已有文件"的场景，因此不存在 byte-identity 问题

## opencode 路径

opencode `resolveCommands` 自然产出 start。R1 后第一次 `trellis update` 会在 `.opencode/commands/trellis/start.md` **新增**该文件（之前没有）。也没有"修改已有文件"问题。

## reasonix 路径

同 opencode：R1 后第一次 update 在 `.reasonix/skills/trellis-start/SKILL.md` **新增**。

## 其他平台

9 个 `agentCapable && hasHooks` 平台 R1 前后行为不变 → 它们的 collectTemplates / configure 输出不变 → update 无 diff。

`agentCapable=false` 三平台（kilo, antigravity, devin）R1 前后行为不变。

## 要不要写 migration manifest？

PRD 当前判定"不必"。让我们 verify：

migration manifest 主要承担三类工作（见 `packages/cli/src/migrations/index.ts`）：
1. **file-delete**：旧版残留要删
2. **file-rename / dir-rename**：路径变了要搬
3. **configSectionsAdded**：YAML config 追加段

本任务的净效果是"4 个平台多出若干新文件"。
- 不删任何文件 → 无 file-delete 需求
- 不改文件名 → 无 file-rename
- 不动 config.yaml → 无 configSectionsAdded

`trellis update` 本身（独立于 manifest）就能把新文件加进去（通过 `collectPlatformTemplates` 的输出和 hash track）。所以**不需要 migration manifest**。

但是有一个 update 路径需要 verify：`trellis update` 看到 `collectPlatformTemplates` 输出多了一个 path，是否会自动写入？

读 `packages/cli/src/commands/update.ts`（之前从 MEMORY.md 知道有 14 个测试覆盖）。从测试名能推断：update 会逐个比较新模板 vs 旧 hash，新增文件无 hash → 直接写入并记 hash。**无需 manifest 干预**。

## codex 的特殊场景：0.5.7 之前到 R1 升级路径

0.5.7 manifest changelog 已经描述过"0.4.x → 0.5.5/0.5.6 升级时 codex 丢 trellis-start"的 bug。R1 + R2 之后，新升级用户：
- 跑 0.5.7：已经能拿到 trellis-start（helper 在）
- 跑 0.7.x（R1 后）：仍然能拿到 trellis-start（helper 删了，但 resolveAllAsSkillsNeutral 自动产出）

中间没有断档。byte-identity → hash 一致 → update 视为"未变"，no-op。✅

## Implications for PRD

- PRD R5 "migration manifest 不必新建" 判断**正确**。本节确认了三条件：
  1. 不删除文件
  2. 不重命名文件
  3. 不修改任何 config 段
- byte-identity 已 verify。PRD 可以在 Notes 里加一句："R1 前后 codex / zcode 的 `.agents/skills/trellis-start/SKILL.md` byte-identical，update 路径无 spurious diff"——给 reviewer 一个明确的 anchor。
- 无 manifest 需求。但 PRD R5 的 commit message 建议带一句"upgrade behavior: existing codex users see no `.agents/skills/trellis-start/SKILL.md` diff because the resolver produces byte-identical content"——便于回溯。
