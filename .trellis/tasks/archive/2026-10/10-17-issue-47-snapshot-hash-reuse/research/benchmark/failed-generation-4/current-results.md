# 当前结果：性能门槛尚未全部通过

公开正常恢复与历史 fixture 已通过 28 项测试。当前第四组性能检查通过 184/188 项。4 项 128 路径的耗时检查未通过。因此，本结果不支持关闭 Task 或宣称残余已完成。

|候选路径/内容|manual before 秒|manual after 秒|query2 before 秒|query2 after 秒|
|---|---:|---:|---:|---:|
|128-repeated|0.678937|0.648697|0.611938|0.564985|
|128-mixed|0.672993|0.683960|0.602989|0.611453|
|10001-repeated|3.034973|0.851209|2.848368|0.668092|
|10001-mixed|3.097505|1.025998|2.879570|0.840395|

每个 case 的 before/after head OID 完全相同。完整 candidate、mode/blob tree 和公开摘要已保存。所有摘要 oracle、mode/删除路径、内容 SHA 次数、实际正文传输、snapshot 读取和单进程 RSS 检查均通过。

3/30 路径的精确探针仍为 1 个唯一 blob：SHA-256 构造从 4/31 次降至 2/2 次。每个路径的 mode 和聚合贡献保持不变。

所有冻结耗时门槛均保持原值。第一、二组失败和第三组因 locale 修复暂停的样本均保留。第四组仍有失败，没有重跑未改动源码以挑选较快样本。

正式运行使用本地真实 Git、正常公开 wrapper 和固定 provider/语义 fixture。网络请求为 0；这些结果不代表 live GitHub、AI 审查或下游已经采用。

## 未通过项

- `128-mixed/manual_median_seconds`：实际 0.683960 秒，上限 0.639344 秒。
- `128-mixed/query2_median_seconds`：实际 0.611453 秒，上限 0.572840 秒。
- `128-mixed/first_record_seconds`：实际 0.901226 秒，上限 0.816877 秒。
- `128-repeated/manual_median_seconds`：实际 0.648697 秒，上限 0.644990 秒。
