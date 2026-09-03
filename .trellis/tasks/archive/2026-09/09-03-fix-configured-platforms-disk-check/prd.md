# 修复 getConfiguredPlatforms 误判：hash 有记录但磁盘文件缺失时 init --opencode 误报 skipping

## Goal

`getConfiguredPlatforms()` 增加磁盘存在校验：当 `.trellis/.template-hashes.json` 有某平台的跟踪记录、但该平台配置目录在磁盘上已缺失时，不再将其判定为"已配置"。`init --<platform>`、`platforms`、`update` 等消费方行为保持一致。

## Background

线上复现（WanLingBot 仓库）：`.template-hashes.json` 跟踪 560 个文件（含 `.opencode` 57 条），但磁盘上 `.opencode/` 等 7 个平台目录全部缺失（仅 `.agent` 存在）。此时 `trellis init --opencode` 走 re-init 快捷路径，命中 `configuredPlatforms.has("opencode")`，直接输出 `○ OpenCode already configured, skipping`，什么文件都没写。`trellis platforms` 同样虚报 8 个已配置。

根因：`packages/cli/src/configurators/index.ts:getConfiguredPlatforms` 只检查 hash manifest，不检查磁盘。

## Requirements

- [x] R1: `getConfiguredPlatforms(cwd)` 对每个平台，在 hash 命中之外，额外要求该平台 `configDir` 在磁盘上以目录形态存在（`isDirectoryOnDisk`：带异常保护的 `statSync().isDirectory()`；缺失、普通文件、不可读一律视为未配置），两者同时满足才算已配置。
- [x] R2: hash 有记录 + 目录缺失 → 判定为未配置，`init --opencode` 正常走配置流程重写文件；`platforms` 不再虚报。
- [x] R3: 现有语义不变：原生（非 Trellis 写入）的平台目录仍不算已配置（#501 的修复保持）；hash 无记录仍不算已配置；legacy Windsurf→devin 分支同样要求 hash 分支带磁盘根目录存在校验，磁盘模板分支行为不变。
- [x] R4: 回归测试覆盖：hash 有记录但目录被删除 → 未配置；configDir 为普通文件 → 未配置；legacy hash 残留但目录缺失 → devin 未配置；正常配置 → 仍检测到。

## Acceptance Criteria

- [x] A1: 复现场景验证通过：在 tmp 目录为某平台生成 hash 后删除其配置目录，`getConfiguredPlatforms` 不再包含该平台。
- [x] A2: `pnpm test test/configurators/platforms.test.ts` 全绿；`pnpm lint`、`pnpm typecheck` 通过。
- [x] A3: 手动验证：`trellis init --opencode` 在目录缺失+hash 残留的项目里会真实写文件（而非 skipping）。
- [x] A4: 独立分支 + PR 至远程（https://github.com/mindfold-ai/Trellis/pull/601）。

## Non-Goals

- 不做缺失文件的"修复/补写"模式（`update` 的 drift 修复另议）；本次只修"是否已配置"的判定。
- 不清理残留的 stale hash 条目；重写配置时的 hash 合并逻辑保持现状。
- 不改 `uninstall`/`ablate` 的删除逻辑（它们消费同一函数，语义自动跟随）。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- 设计见 `design.md`。
