# regression test: opencode plugin files must have only `export default`

## Goal

防止 #212 类 bug 静默回归。dc2bea3 修了 session-start.js 的多 named export 问题，但**没加测试**——将来谁再往 `templates/opencode/plugins/*.js` 任何文件加 `export function foo(...)` 或 `export const X = ...`，opencode 1.2.x loader 会把它当 plugin factory 调用，整个文件加载失败、loader 静默吞错。

## What I already know

- opencode 1.2.x plugin loader iterates `Object.entries(mod)` 遍历所有 export，把每个当 plugin factory 调用（research/`opencode-plugin-loader.md` 已确认；丢了但结论在 dc2bea3 commit message + 上一轮对话里）
- dc2bea3 抽 `buildSessionContext` / `hasInjectedTrellisContext` 到 `lib/session-utils.js`，session-start.js 现在只有 `export default`
- 三个 plugin 文件当前都已经只有 `export default`：
  - `plugins/session-start.js:17` `export default async ({ directory, client }) =>`
  - `plugins/inject-subagent-context.js:318` `export default async (...) =>`
  - `plugins/inject-workflow-state.js:105` `export default async ({ directory }) =>`
- 已有回归测试模式参考：`packages/cli/test/regression.test.ts:4072` "templates/markdown/spec contains only .md.txt files" — 用 `walk()` 遍历目录 + 断言每个文件满足 invariant，是同类骨架

## Requirements

1. 在 `packages/cli/test/regression.test.ts` 增加一个 `describe("regression: opencode plugin files have only export default", ...)`
2. 测试逻辑：
   - 列出 `packages/cli/src/templates/opencode/plugins/` 下所有 `.js` 文件
   - 对每个文件读 source，正则 `^export\s+(default|function|const|let|var|class|async|{)` 匹配所有 export 行
   - 断言**每个文件只有 1 行 export**，且**那行匹配 `export default`**

## Acceptance Criteria

- [ ] 新增的 describe 在 `regression.test.ts` 里，3 个用例（每个 plugin 文件一条）通过
- [ ] 临时往 `plugins/inject-workflow-state.js` 加一行 `export const X = 1` 时，对应用例失败（手动验证一次）
- [ ] `pnpm test` / `lint` / `typecheck` 全绿
- [ ] 不动 `lib/session-utils.js` 等其他文件——它们可以有 named exports

## Definition of Done

- 测试新增并通过
- Lint / typecheck 干净
- Commit message 引用 #212 作为 prevention rationale

## Technical Approach

```ts
describe("regression: opencode plugin files have only export default (#212)", () => {
  // OpenCode 1.2.x plugin loader iterates Object.entries(mod) and invokes
  // every export as a plugin factory. Named exports alongside default get
  // called with wrong args, the loader aborts, and the default factory
  // silently never runs. dc2bea3 fixed session-start.js by extracting named
  // exports to lib/session-utils.js. This test prevents regression.
  const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname2, "../../..");
  const pluginsDir = path.join(
    repoRoot,
    "packages/cli/src/templates/opencode/plugins",
  );
  const files = fs
    .readdirSync(pluginsDir)
    .filter((f) => f.endsWith(".js"));

  for (const file of files) {
    it(`${file} has exactly one export, and it is 'export default'`, () => {
      const content = fs.readFileSync(path.join(pluginsDir, file), "utf-8");
      const exportLines = content
        .split("\n")
        .filter((l) => /^export\s/.test(l));
      expect(exportLines).toHaveLength(1);
      expect(exportLines[0]).toMatch(/^export\s+default\s/);
    });
  }
});
```

## Out of Scope

- 不动 `lib/*.js` —— named exports 在 lib/ 下没问题
- 不验证 opencode 实际 loader 行为（那要起 opencode 进程，太重）
- 不扩展到其他平台（如 cursor、claude）—— 它们的 plugin/hook 文件机制不同

## Technical Notes

- 文件骨架参考：`packages/cli/test/regression.test.ts:4072`（markdown spec walk pattern）
- 现有 import：`import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";`（regression.test.ts 顶部已有）
- 关联 commit：`dc2bea3 fix(opencode): extract named exports to session-utils.js to fix plugin loading (#212)`
