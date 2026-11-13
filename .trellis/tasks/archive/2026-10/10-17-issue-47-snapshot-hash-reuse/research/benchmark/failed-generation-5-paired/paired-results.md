# 公开 immutable candidate 摘要：配对验证结果

原绝对门槛：187/188 通过。额外配对检查：24/24 通过。总体结果：未通过。

冻结基线、第一/二/四组失败和第三组暂停样本均保留。本次仅运行已提交协议规定的一组完整配对 cohort，没有逐例重试或丢弃样本。新控制组没有改写原 188 项门槛。

|候选/操作|冻结 before 秒|新 before 秒|after 秒|相对新 before 改善|
|---|---:|---:|---:|---:|
|128-repeated/manual|0.678937|0.675751|0.632616|6.38%|
|128-repeated/query2|0.611938|0.599884|0.540925|9.83%|
|128-mixed/manual|0.672993|0.684881|0.639480|6.63%|
|128-mixed/query2|0.602989|0.608593|0.548766|9.83%|
|10001-repeated/manual|3.034973|2.992220|0.806559|73.04%|
|10001-repeated/query2|2.848368|2.854787|0.619335|78.31%|
|10001-mixed/manual|3.097505|3.117023|0.959050|69.23%|
|10001-mixed/query2|2.879570|2.951827|0.788969|73.27%|

每个 case 的完整 commit OID 与冻结 before 相同。完整 candidate、mode/blob tree、公开 content_ref 和实际安装源码校验和均保存。3/30 路径精确探针的 SHA-256 构造从 4/31 降为 2/2；聚合算法和各路径贡献保持不变。

Git 正文仍仅传输唯一候选 blob 字节。commit control 使用 metadata-only info，未传 commit 正文。所有正常操作仍独立校验当前输入的 commit、路径、mode、删除和对象可用性。未使用跨调用 cache、inode authority、下游私有 import 或复制的摘要算法。

## 环境与控制组

本组各 phase 前后 1 分钟 load average 范围为 3.66–5.28。主机逻辑 CPU 数为 14。完整 UTC、process count、CPU executable 排名和各 Python 进程自身 user/system 秒见 paired-validation-run.json 与每组结果。ps 百分比是工具报告值，不是每个 wrapper 的即时 CPU 使用率。

主会话暂停重负载检查。监测数据没有用于选择、等待或丢弃样本。此前不同完整 cohort 的 128 路径 wall 波动为测量疑点；本次同时保留旧绝对检查和新配对改善要求，不能只用新控制组解释旧失败。

正常公开恢复/历史 fixture 已通过 28/28；测试时的实际 runtime 源码校验和与本 cohort 相同。fixture 覆盖首次记录、幂等/输出丢失恢复、query2、缺对象的 scratch 恢复，以及不写 caller/peer Git。

这些是本地真实 Git、原公开 wrapper 与固定 provider/语义 fixture 的验证。网络请求为 0。它们不代表 live GitHub、AI 审查或下游正式采用。

## 未通过项

- {"check": "128-mixed/manual_median_seconds", "passed": false, "actual": 0.639479958510492, "limit": 0.6393437262566294}
