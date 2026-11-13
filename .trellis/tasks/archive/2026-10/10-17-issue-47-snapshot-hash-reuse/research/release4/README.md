# .4 正式交付与下载复验

PR #50 已合并。交付源码为 `9f40ec70914f98fce2619560274cc1d0619f2f7e`。
PR CI 和该精确 main 提交的 CI 均通过。
[固定来源版本预发布](https://github.com/castbox/Trellis/releases/tag/castbox-v0.7.0-castbox.4)提供成对 CLI/Core tarball、SHA256SUMS 和 release-record.json。远端标签绑定上述完整 SHA。

重新下载的全部四个资产与发布前字节一致。两个 tarball 和 release-record 的 SHA256SUMS 检查通过。
发布前和下载后分别使用全新隔离 prefix 安装两个包。每次均核对全部 1013 个包文件的字节和权限，并通过 7 项安装行为检查：精确 Core 解析、公开不可变摘要/重复调用、正常交付/重试、重应用保留 Task、差异预览与旁路文件、强制应用恢复权限、受管清单。
分发模板、仓库自用副本及实际包内的三个 owner 文件与已测生产提交逐字节一致。

[发布事件 workflow](https://github.com/castbox/Trellis/actions/runs/39013995737) 和 publish job 均为 skipped。本次没有 npm publish，没有修改全局安装或 Guru 正式目录。

当前验收遵循用户修订的 `../acceptance-revision.md`。原冻结数值和旧 FAIL 不变。独立完整范围审核见 `../revised-acceptance-review.md`。
下游 #589 仍负责匹配采用、正式集成和原 Task Completion。本次交付不制造下游完成事实。

`verification.json` 汇总实际结果、下载校验和及证据文件摘要。大 JSON 使用 mtime=0 的 gzip 保存；解压字节摘要在汇总中，已逐项复核。下载的 release-record/SHA256SUMS 保持原字节。

交付约定固定标签、完整源码 SHA 和资产校验和，不移动标签或替换已发布字节。GitHub API 的 `immutable` 为 `false`，本次不声称平台已强制锁定 Release。
