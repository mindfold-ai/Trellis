# 第五组：预登记配对验证未全部通过

协议在计时前提交为 7d48f2a4。完整配对 cohort 原绝对检查通过 187/188；额外配对检查通过 24/24。128 mixed manual 超出原上限 136.232 微秒。未加容差、未四舍五入为通过、未逐例重试。所有结果保留。

后续发现独立且实际的 metadata scope 回归：新公开入口扫描完整 repository tree；原 CandidateObjects 只读取请求的精确路径。只修复该 metadata 范围，不修改原门槛。修复后需要更新实施前登记的 source checksum，再进行完整同协议 cohort。

大于 100 KiB 的归档 JSON 已用 mtime=0 的确定性 gzip 保存。解压后的 SHA-256 已与原字节核对。original path、原 SHA、压缩 SHA 和大小见上级 archive-compression-manifest.json。README、evaluation、summary 和 protocol 均保留可读文本。
