# 唯一 Ubuntu cohort：完整接受失败

[运行 39011401555](https://github.com/castbox/Trellis/actions/runs/39011401555) 完整执行了 6 个 case、12 个 phase。原绝对检查通过 **181/188**，同机配对检查通过 **22/24**。这是性能门槛失败，没有 setup 技术失败。不得重启、补样本、改上限或从其他 cohort 取较快值。

## 环境与输入

- 实际 checkout：`520b8d8c863845b15c7eec488ccfcbacda21253c`。
- 协议 SHA256：`2c3acea9c855001d26d5c6ab2a9f751b41c82f111b7801eda03c7c21e5c60ead`。
- Ubuntu image：`20261012.334.1`；Git：`2.55.0`；Python：`3.14.8`；CPU 报告：AMD EPYC 7763。
- 原冻结 6 组 head、candidate、路径、模式、删除项和树全部匹配。84 个 pyc OID 检查通过。
- 每 phase 恰有 iteration 0 首次手工记录、iterations 1/2 恢复调用，以及三个 query2。全部原始进程范围齐全；12 个 phase 使用相同 managed runtime 身份。
- after 观测的每进程峰值最大为 Python 56,233,984 bytes、Git 10,141,696 bytes。原资源、正文、SHA、snapshot 和 oracle 检查均通过。

## 七个绝对门槛失败

以下秒数仅为展示而保留 9 位小数。判断使用原始完整数值，不取整放行。

|检查|实际秒数|原上限秒数|
|---|---:|---:|
|10001-mixed/manual median|2.273483433|2.168253252|
|128-mixed/manual median|0.815337243|0.639343726|
|128-mixed/query2 median|0.740235096|0.572839788|
|128-mixed/first manual|0.876305535|0.816876725|
|128-repeated/manual median|0.800218714|0.644990249|
|128-repeated/query2 median|0.708678939|0.581340962|
|128-repeated/first manual|0.877277998|0.825280969|

## 同机配对结果

|case|操作|before 秒|after 秒|改善|要求|
|---|---|---:|---:|---:|---:|
|128-repeated|manual|0.853465461|0.800218714|6.24%|5%|
|128-repeated|query2|0.774637925|0.708678939|8.51%|5%|
|128-mixed|manual|0.845081375|0.815337243|**3.52%**|5%|
|128-mixed|query2|0.774319104|0.740235096|**4.40%**|5%|
|10001-repeated|manual|4.919971660|1.854791400|62.30%|30%|
|10001-repeated|query2|4.572528250|1.553990953|66.01%|30%|
|10001-mixed|manual|5.220020355|2.273483433|56.45%|30%|
|10001-mixed|query2|4.902767495|1.976741985|59.68%|30%|

128-mixed 的 manual 与 query2 未达到 5%。所有精确 head、candidate count 和首次 manual 配对不退化检查通过。10001 的配对改善通过，不能抵消 10001-mixed/manual 的绝对上限失败。

## 独立复核与保全

独立逐项重算的 188 个绝对检查与 24 个配对检查，均与 artifact 中的结果完全一致。另核对了全部 12 phase 的正常 setup 状态、原输入、managed 身份、维护策略、raw Python 日志、Git args/RSS/exit 配对，以及冻结 before 文件的原始摘要。没有修改或重跑测量。

- `results/` 保留 artifact 的全部 92 个正式结果文件。超过 100KiB 的 JSON 用确定性 gzip 保存；原文件和解压 SHA256 在 `preservation-manifest.json` 中。
- `raw-metrics.tar.gz` 保留全部 3,348 个原始进程记录。tar 的路径排序、mtime、mode、uid/gid 固定；gzip mtime 为 0。
- `raw-metrics-manifest.json.gz` 记录每个原始记录的路径、字节数与 SHA256。已逐项解压复核。
- `github/` 保留 run metadata、artifact metadata 与完整 run log。artifact id 为 `12093370531`，原 ZIP SHA256 为 `a0e627235ff9dd921d549864f00e96648089e65cfe9f4f68f8d0fa91f2e21608`，已与 GitHub digest 核对。
- `independent-review.json` 保存独立复算、全部失败项、完整环境与 scope 摘要。
- 原 ZIP 和完整下载目录仍在 `/tmp/trellis47-ci-39011401555-1RjyLDs4`。

本组失败与旧 Mac 失败分别保留。Synthetic provider 只证明固定协议 fixture；本组不证明 live GitHub、AI 语义或下游采用。当前不能宣告 Issue 性能验收通过、下游 Completion、合并或发布。
