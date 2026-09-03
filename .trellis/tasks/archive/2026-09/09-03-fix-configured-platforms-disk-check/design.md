# Design: getConfiguredPlatforms 增加磁盘存在校验

## Problem

`getConfiguredPlatforms(cwd)`（`packages/cli/src/configurators/index.ts:138`）的判定条件：

```ts
const hasTrackedTemplate = [...(templates?.keys() ?? [])].some(
  (relativePath) =>
    (relativePath === configDir ||
      relativePath.startsWith(`${configDir}/`)) &&
    hashes[relativePath] !== undefined,   // ← 只看 hash，不看磁盘
);
```

hash manifest 是"曾经写过"的记录，不是"现在存在"的事实。平台目录被删除（换机 clone 未提交、`.gitignore` 忽略如 `.cursor/`、手动清理）后，`init --<platform>` re-init 路径（`commands/init.ts:880`）误判 skipping，`platforms`（`commands/platforms` 经同一函数）虚报，`update`（`commands/update.ts:693,870`）对不存在的目录做收集。

## Decision

在 `hasTrackedTemplate` 为真之外，叠加一个条件：**`configDir` 在磁盘上以目录形态存在**（`isDirectoryOnDisk`：带异常保护的 `statSync().isDirectory()`，缺失、普通文件、不可读路径一律返回 false）。

```ts
if (hasTrackedTemplate && isDirectoryOnDisk(cwd, configDir)) {
  platforms.add(id);
}
```

### Why configDir existence (而不是逐文件校验)

1. **便宜**：每平台一次 `stat`，O(platforms)；逐文件是 O(files)，hash 有 560 条。
2. **与检测键对齐**：现有检测只统计 `configDir` 前缀下的跟踪路径，`configDir` 就是判定锚点；目录缺失是最常见、最完整的"未配置"形态（本次复现即 7 个目录整体缺失）。
3. **有先例且语义一致**：同一函数内的 legacy Windsurf→devin 分支采用相同结构 —— `(hash 命中 && .windsurf/workflows 根目录存在) || 磁盘上存在 trellis-* 模板文件` 才算已配置；hash 残留但目录被删同样判未配置。
4. **部分缺失归 `update` 管**：单个文件被删属于内容漂移，应由 `update` 的 diff/修复逻辑处理，不在本函数职责内（Non-Goals）。

### Considered alternative: 要求 ≥1 个被跟踪文件存在于磁盘

更精确，能覆盖"目录在但文件被掏空"的部分缺失；但引入 O(files) 的 I/O，且"部分缺失算不算已配置"本身是产品语义问题（`init` 跳过 vs `update` 修复），不宜在这次顺手定。保持最小修复。

## Blast radius

`getConfiguredPlatforms` 的消费方（同函数语义自动跟随，无需逐个改）：

| Caller | 修复后的行为变化 |
|---|---|
| `commands/init.ts:783` re-init / `:840,:870` 未配置列表 | 目录缺失的平台重新出现在可添加列表，`--<platform>` 不再误 skipping ✅ 目标修复 |
| `commands/platforms`（经 `configurators/index`）/ `cli/index.ts:364` | 不再虚报已删除的平台 |
| `commands/update.ts:693,870` | 不再对磁盘缺失的平台做模板收集（之前是对着不存在的目录算 diff，实际无输出） |
| `commands/uninstall.ts:207` | 已删除的平台不再出现在可卸载列表（删本来就不存在的东西无意义） |
| `commands/ablate.ts:381` | 同上跟随 |

无反向风险：`configDir` 存在 + hash 命中的平台行为与之前完全一致；原生目录（无 hash）仍不算已配置，#501 语义保留。

## Edge cases

- 嵌套 `configDir`（kiro `.kiro/skills`、snow `.snow/skills`）：`isDirectoryOnDisk` 对嵌套路径同样有效；父目录在但 `skills/` 被删 → 判未配置 → 重装，符合预期。
- `extraManagedPaths` / 共享 `.agents/skills`：检测键本来就不含它们（#501 已排除），本次不碰。
- manifest 缺失/损坏：`loadHashes` 返回空 → 本来就是空集，`isDirectoryOnDisk` 短路在 `hasTrackedTemplate` 之后，无新增抛异常面（helper 内部 try/catch 返回 false）。

## Tests

在 `packages/cli/test/configurators/platforms.test.ts` 的 `getConfiguredPlatforms` describe 内新增：

1. `does not report a platform whose tracked directory was deleted` —— 为某平台生成 hash（复用现有 `configurePlatform` + `initializeHashes` 写法），然后 `rmSync(configDir)`，断言不再包含该平台（且其它平台不受影响可选）。
2. 后续加固新增：`does not report a platform whose configDir path is a regular file`（目录删掉后写入同名普通文件 → 未配置）、`does not report devin from stale legacy Windsurf hashes alone`（legacy hash 残留但 `.windsurf/` 被删 → devin 未配置）。
3. 现有用例即回归网：`detects every platform from the files Trellis tracked`（存在+hash → 检测到）、`does not treat native platform directories`（存在+无 hash → 不检测）、`detects Trellis-namespaced legacy Windsurf workflows as devin`（磁盘模板分支行为不变）保持全绿。

验证命令：`pnpm test test/configurators/platforms.test.ts`，另跑 `pnpm lint` + `pnpm typecheck`。
