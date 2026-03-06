# Remote Spec Templates - 支持从自定义远程仓库下载 spec 模板

## Goal

允许用户配置自定义远程仓库作为 spec 模板源，而不仅限于 Mindfold 官方 marketplace。这样企业/团队可以维护自己的 spec 模板仓库，通过 `trellis init --registry` 下载使用。

## Requirements

* [ ] 新增 `--registry <source>` CLI flag，接受 giget 风格的源（如 `gh:myorg/myrepo/path`）
* [ ] 自动检测两种模式：
  * **Marketplace 模式**：源目录下有 `index.json` → fetch 索引，展示 picker 让用户选择
  * **直接下载模式**：源目录下无 `index.json` → 直接下载整个目录到 `.trellis/spec/`
* [ ] 解析 giget 源推导 raw URL（用于 fetch index.json 探测）
* [ ] raw URL 推导支持 `gh:` / `github:` / `gitlab:` / `bitbucket:` 前缀
* [ ] `--registry` 指定时完全替代官方源（不合并）
* [ ] `--registry` + `--template` 组合：跳过 picker，直接下载指定模板
* [ ] `-y` + `--registry` 无 `--template` 时：直接下载模式可用，marketplace 模式报错
* [ ] 错误处理：源不可达时给出清晰提示
* [ ] 自定义源的 marketplace 使用相同的 TemplateIndex（index.json）格式
* [ ] 下载流程复用现有 giget + strategy 机制

## Acceptance Criteria

* [ ] `trellis init --registry gh:myorg/myrepo/marketplace` → 展示自定义 marketplace picker
* [ ] `trellis init --registry gh:myorg/myrepo/my-spec` → 直接下载到 `.trellis/spec/`
* [ ] `trellis init --registry gitlab:myorg/myrepo/specs` → GitLab 源也能用
* [ ] `trellis init --registry gh:myorg/myrepo/marketplace --template my-spec` → 跳过 picker
* [ ] 不传 `--registry` 时行为完全不变（使用官方源）
* [ ] 无效/不支持的前缀给出用户友好错误
* [ ] 单元测试覆盖源解析、raw URL 推导（gh/gitlab/bitbucket）、模式检测

## Definition of Done

* Tests added/updated
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes

## Decision (ADR-lite)

**Context**: 需要决定 `--registry` 的 URL 格式以及是否需要 index.json

**Decision**:
1. 采用 giget 风格的单一源路径（`gh:user/repo/path`），自动检测 marketplace vs 直接下载模式（先试 index.json，404 则直接下载）
2. raw URL 推导支持 GitHub / GitLab / Bitbucket 三个平台
3. 下载侧直接透传给 giget，giget 原生支持所有前缀

**Consequences**:
* 用户体验简洁，一个参数搞定两种模式
* 需要各平台 raw URL mapping（约 15 行代码）
* 直接下载模式会有一次 404 请求的额外延迟（几百毫秒）
* 后续可扩展支持 `sourcehut:` / `http:` 等前缀

## Out of Scope (explicit)

* 持久化配置文件（后续版本考虑）
* 模板发布/上传工具
* 非 spec 类型模板（hook/skill/command 后续统一设计 manifest）
* `sourcehut:` / `http:` / `https:` 前缀
* 多源合并（官方 + 自定义）
* 私有仓库认证（文档说明 `GIGET_AUTH` 即可，无需代码改动）

## Technical Approach

### 核心变更

1. **`src/utils/template-fetcher.ts`**:
   * 新增 `parseRegistrySource(source: string)` → `{ provider, repo, subdir, ref, rawBaseUrl, gigetSource }`
   * raw URL mapping 支持 gh/github/gitlab/bitbucket
   * `fetchTemplateIndex()` 参数化：接受可选的 `indexUrl`
   * `downloadWithStrategy()` 参数化：接受可选的 `repoSource`

2. **`src/cli/index.ts`**:
   * 新增 `--registry <source>` option

3. **`src/commands/init.ts`**:
   * 检测 `options.registry` → 调用 `parseRegistrySource()` 推导 URL
   * 先 fetch `{rawBaseUrl}/index.json`
   * 200 → marketplace 模式（现有 picker 逻辑，换源）
   * 404 → 直接下载模式（giget 直接下载到 spec 目录）

### 检测流程

```
--registry gh:myorg/myrepo/some-path
  ↓
parseRegistrySource("gh:myorg/myrepo/some-path")
  → provider: "gh"
  → repo: "myorg/myrepo"
  → subdir: "some-path"
  → ref: "main"
  → rawBaseUrl: "https://raw.githubusercontent.com/myorg/myrepo/main/some-path"
  → gigetSource: "gh:myorg/myrepo/some-path"
  ↓
fetch rawBaseUrl + "/index.json"
  ├── 200 → marketplace 模式（picker + 下载选中模板）
  └── 404 → 直接下载 gigetSource → .trellis/spec/
```

### Raw URL Mapping

```typescript
const RAW_URL_PATTERNS: Record<string, string> = {
  gh:        "https://raw.githubusercontent.com/{repo}/{ref}/{subdir}",
  github:    "https://raw.githubusercontent.com/{repo}/{ref}/{subdir}",
  gitlab:    "https://gitlab.com/{repo}/-/raw/{ref}/{subdir}",
  bitbucket: "https://bitbucket.org/{repo}/raw/{ref}/{subdir}",
};
```

## Technical Notes

* 核心文件：`src/utils/template-fetcher.ts`, `src/commands/init.ts`, `src/cli/index.ts`
* giget 原生支持 `gh:`, `gitlab:`, `bitbucket:`, `sourcehut:`, `http:`, `https:` 前缀的下载
* giget 不提供 raw file fetch — 需要我们自己推导 raw URL 来探测 index.json
* giget 源解析参考：`parseGitURI` 正则 `/^(?<repo>[\w.-]+\/[\w.-]+)(?<subdir>[^#]+)?(?<ref>#[\w./@-]+)?/`
* `TEMPLATE_INDEX_URL` 和 `TEMPLATE_REPO` 是需要参数化的两个常量
* 测试文件：`test/utils/template-fetcher.test.ts`（已有 `getInstallPath` 测试）
* 关联文档任务：`03-05-hooks-docs`（文档站需要说明自定义模板用法）
