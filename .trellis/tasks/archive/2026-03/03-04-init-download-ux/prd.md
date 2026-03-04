# 优化 trellis init 模板下载体验

## Goal
优化 `trellis init` 远程模板下载的网络体验：添加代理支持、进度提示、超时处理和友好错误提示，避免用户在网络不好或需要代理时卡住且无感知。

## Requirements

### 1. 代理支持（核心）
- 检测 `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY`（大小写都检测）环境变量
- 有代理时，使用 undici 的 `ProxyAgent` + `setGlobalDispatcher()` 全局设置
- 一次设置覆盖所有 `fetch()` 调用（包括 giget 内部的 fetch）
- undici 是 Node 内置模块，不需要新增依赖
- 同时覆盖 `update.ts` 中的 npm 版本检查 fetch

### 2. 超时处理
- `fetchTemplateIndex()` 加 `AbortSignal.timeout(15s)`
- giget 下载用 `Promise.race` 包 30s 超时（giget 不支持 abort）

### 3. 进度提示
- fetch 模板列表前显示 "Fetching available templates..."
- fetch 失败提示 "Could not fetch templates. Using blank templates."
- 下载时提示 "This may take a moment on slow connections."
- 检测到代理时显示 "Using proxy: xxx"

### 4. 友好错误提示
- 超时 → "Download timed out. Check your network connection."
- 网络不可达 → "Could not reach template server."
- 失败后给出重试命令 → `trellis init --template <name>`

### 5. 消除 double-fetch
- 交互模式下 `fetchTemplateIndex()` 被调两次（展示列表 + downloadTemplateById 内部）
- 改为将已取到的 `SpecTemplate` 对象直接传入 `downloadTemplateById()`

## Acceptance Criteria
- [ ] 代理环境变量存在时，fetch 和 giget 均通过代理请求
- [ ] 无网络/超时不会无限卡住，15s/30s 后自动 fallback
- [ ] 用户能看到下载进度和错误原因
- [ ] 交互模式下不再 double-fetch 模板列表
- [ ] update.ts 的 npm fetch 也走代理
- [ ] 零新 npm 依赖（undici 是 Node 内置）
- [ ] 现有测试不 break

## Technical Notes

### 代理设置方案
```typescript
// src/utils/proxy.ts (新文件)
import { ProxyAgent, setGlobalDispatcher } from "undici";

export function setupProxy(): void {
  const proxyUrl =
    process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy ||
    process.env.ALL_PROXY || process.env.all_proxy;

  if (proxyUrl) {
    const agent = new ProxyAgent(proxyUrl);
    setGlobalDispatcher(agent);
    console.log(chalk.gray(`   Using proxy: ${proxyUrl}`));
  }
}
```

在 `init()` 和 `update()` 入口处调用 `setupProxy()`。

### 改动文件
- `src/utils/proxy.ts` — 新建，代理检测与设置
- `src/utils/template-fetcher.ts` — 超时、错误分类、接受预取 template
- `src/commands/init.ts` — 进度提示、传预取 template、调用 setupProxy
- `src/commands/update.ts` — 调用 setupProxy（覆盖 npm fetch）
