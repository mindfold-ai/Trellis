# 精确路径源码组：完整配对验证未全部通过

协议在计时前提交为 6c053879。完整 cohort 原绝对检查通过 185/188；额外检查通过 23/24。128 mixed manual 的新 before 为 0.713683 秒，after 为 0.678548 秒，仍超过 5% 改善对应上限约 549.6 微秒。全部原始结果保留，没有重试或丢弃。

本组源码没有新增缺陷。父会话要求下一组使用明确、进程范围、前后相同的 application/default-I/O/throughput0/latency0 执行政策。它属于真实执行环境变更，不修改源码、输入、样本数量、原绝对门槛或额外配对门槛。下一组必须在计时前登记并提交协议。

大于 100 KiB 的归档 JSON 已用 mtime=0 的确定性 gzip 保存。解压后的 SHA-256 已与原字节核对。original path、原 SHA、压缩 SHA 和大小见上级 archive-compression-manifest.json。README、evaluation、summary 和 protocol 均保留可读文本。
