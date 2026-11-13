# 128 路径跨 cohort 证据结论

本文件只读取已保留数据，没有新增计时。组件探针是单次独立观察，不是 nested wall profiler；不同源码组不得拼接通过。

|cohort|case|冻结组件秒|after组件秒|after manual中位秒|after query2中位秒|
|---|---|---:|---:|---:|---:|
|generation1|128-repeated|0.090459|0.086936|0.667453|0.588039|
|generation1|128-mixed|0.091822|0.077170|0.672241|0.580269|
|generation2|128-repeated|0.090459|0.060887|0.650935|0.565737|
|generation2|128-mixed|0.091822|0.065256|0.657452|0.575432|
|generation3partial|128-repeated|0.090459|0.049697|0.604160|0.543515|
|generation3partial|128-mixed|0.091822|0.054029|0.611125|0.528586|
|generation4|128-repeated|0.090459|0.046623|0.648697|0.564985|
|generation4|128-mixed|0.091822|0.054278|0.683960|0.611453|
|generation5paired|128-repeated|0.090459|0.067418|0.632616|0.540925|
|generation5paired|128-mixed|0.091822|0.047574|0.639480|0.548766|
|generation6selected|128-repeated|0.090459|0.045149|0.651933|0.565083|
|generation6selected|128-mixed|0.091822|0.051374|0.678548|0.597219|
|generation7policy|128-repeated|0.090459|0.049699|0.716654|0.630829|
|generation7policy|128-mixed|0.091822|0.059253|0.731360|0.634786|

保留组中，各组摘要组件观察值均低于冻结单次观察（下降约 3.89%–50.09%，不代表单调改善或性能保证），但整体 wrapper 没有稳定满足原门槛。这只能证明组件已改善、整链仍未达标，不能证明环境造成失败，更不能把组件结果代替整链验收。

当前上游公开 owner 在首次候选上只剩精确树读取和 metadata/blob batch 两个 Git 进程；已保留完整 commit 校验、每输入校验、内容唯一 SHA 和聚合。没有已经被测且足以覆盖 128 整链缺口的同 owner 优化路径。regex/JSON/循环微调只能是未测假设；不建议为通过门槛继续改动。

可验证的剩余固定成本位于 Guru normal caller：manual 每次 3 个 runtime 校验 Python、6 个 provider 进程、8 个摘要外 Git；query2 每次 3 个校验 Python、4 个 provider、6 个摘要外 Git。最小生产建议是由 Guru 原 owner 评估四个独立 commit metadata 检查的一次有限 batch，保留四条逐输入响应和缺失对象恢复。它不需要扩展上游摘要 API，但属于 Guru caller 的责任边界，不能据此伪称当前上游门槛已通过。

较大的 runtime 校验后同进程分派属于单独的 Guru runtime 架构改动，应先确认原 pointer/manifest/identity/capability 全合同，不能作为当前上游的小修。详见 128-bottleneck-analysis.md。

因此：若范围严格保持为 Trellis 公开摘要 owner，当前没有证据支持继续扩大实现；保留未通过状态。若要解决整链固定成本，应先由原 Guru owner 承接明确的最小 caller 优化，并重新验证完整链，不能关闭本 Issue 来替代这一证据。
