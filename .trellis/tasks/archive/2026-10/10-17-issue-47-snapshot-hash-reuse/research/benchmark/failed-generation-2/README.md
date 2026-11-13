# 第二次 after 未通过

188 项检查中有 185 项通过。3 项 128 路径的整链耗时门槛未通过。保留全部样本。没有放宽门槛。

128 repeated 的 manual 中位数为 0.650935 秒，上限为 0.644990 秒。128 mixed 的 manual 中位数为 0.657452 秒，上限为 0.639344 秒；query2 中位数为 0.575432 秒，上限为 0.572840 秒。两组 10001 路径的全部门槛通过。所有 exact head、摘要 oracle、资源和计算次数检查通过。

另行执行的不计时门禁诊断确认，覆盖后安装的 delivery_store 和 git_objects bytecode 均匹配新源码的 mtime 和 size。子进程不需要重复编译这两份源码。owner-diagnostic-before/after 为独立诊断，不替换固定样本；它显示新增公开入口还保留独立 commit 校验进程。下一轮将该校验并入原有限对象 batch，保留实际 commit 类型和 OID 校验。

大于 100 KiB 的归档 JSON 已用 mtime=0 的确定性 gzip 保存。解压后的 SHA-256 已与原字节核对。original path、原 SHA、压缩 SHA 和大小见上级 archive-compression-manifest.json。README、evaluation、summary 和 protocol 均保留可读文本。
