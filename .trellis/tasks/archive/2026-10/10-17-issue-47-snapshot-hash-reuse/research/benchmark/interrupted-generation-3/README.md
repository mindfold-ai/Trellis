# 第三组测量因源码正确性修复而暂停

已完成 3、30、128 repeated、128 mixed、10001 repeated。未启动 10001 mixed。父会话的独立检查发现旧 Git fallback 的错误文本受 locale 影响，需要固定公开 context 的 LC_ALL=C。当前 case 正常结束后停止 cohort；没有终止正在运行的 wrapper，没有丢弃已完成样本，也没有宣称全组通过。后续按实际源码修复启动完整新 cohort。

本组已采用 metadata-only commit info。commit 只传 metadata header，不传正文。全部实际正文仍是唯一候选 blob 字节；原严格正文门槛未变。

大于 100 KiB 的归档 JSON 已用 mtime=0 的确定性 gzip 保存。解压后的 SHA-256 已与原字节核对。original path、原 SHA、压缩 SHA 和大小见上级 archive-compression-manifest.json。README、evaluation、summary 和 protocol 均保留可读文本。
