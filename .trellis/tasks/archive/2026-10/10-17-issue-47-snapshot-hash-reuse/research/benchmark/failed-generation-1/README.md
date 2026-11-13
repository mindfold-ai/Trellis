# 首次 after 未通过

188 项检查中有 182 项通过。6 项整链耗时门槛未通过。保留全部样本。没有放宽门槛。后续只能因实现变更重新测量，不能从旧样本挑选通过结果。

128 两组的 manual/query2 均未达到 5% 改善。10001 mixed 的 manual/query2 未达到 30% 改善。10001 repeated 的耗时通过。所有 exact head、摘要 oracle、资源和计算次数检查通过。

观测到两个实现开销：新入口比原对象读取器多执行一次 commit type 查询；新入口将 10000 个 unique blob 分成 79 个 cat-file 进程，而原有限请求使用一次 spooled batch。下一轮保留原门槛，先修复这些实现开销。

大于 100 KiB 的归档 JSON 已用 mtime=0 的确定性 gzip 保存。解压后的 SHA-256 已与原字节核对。original path、原 SHA、压缩 SHA 和大小见上级 archive-compression-manifest.json。README、evaluation、summary 和 protocol 均保留可读文本。
