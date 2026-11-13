# 当前结果：仍有冻结性能门槛未通过

精确路径 metadata 修复后，按预先提交的 `6c053879` 协议完成一组完整配对 cohort。原绝对检查通过 185/188；额外配对检查通过 23/24。所有结果保留。没有逐例重试、增加容差或修改原上限。

原绝对失败为 128 repeated manual、128 mixed manual 和 128 mixed query2。额外失败为 128 mixed manual 的 5% 改善：新 before 为 0.7136826664791442 秒，after 为 0.6785481459810399 秒；所需上限为 0.677998533155187 秒。

全部 10001 路径、摘要 oracle、exact head、SHA 次数、实际正文传输、snapshot 读取及单进程 RSS 检查通过。完整结果见 [paired-selected-tree-results.md](paired-selected-tree-results.md)。原始记录见 `paired-selected-tree-run.json`、`paired-selected-tree-evaluation.json` 和 `evaluation.json`。

原绝对 187/188、额外 24/24 的前组结果按原样保存在 failed-generation-5-paired。它不替代当前源码的结果。

当前证据不能支持“所有冻结性能门槛通过”或“本残余已经全部完成”的结论。
