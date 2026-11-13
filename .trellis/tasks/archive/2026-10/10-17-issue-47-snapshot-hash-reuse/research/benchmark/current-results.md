# 当前结果：Ubuntu 完整复验仍未通过

唯一一次预先登记的 [Ubuntu cohort 1](https://github.com/castbox/Trellis/actions/runs/39011401555) 已完整执行。
原绝对检查通过 **181/188**。同机配对检查通过 **22/24**。
全部精确输入、原始进程范围和资源检查通过。独立复算与原 artifact 完全一致。
这是性能门槛失败，不是 setup 错误。没有重跑或更换 runner。

完整结果、失败项及校验清单见 [ci-cohort1/README.md](ci-cohort1/README.md)。
原 Mac 失败和下列历史结论保持有效。原 `evaluation.json` 未被覆盖。
当前不能合并、发布、关闭 Issue 或归档 Task。

---

# 当前结果：显式进程策略验证仍未通过全部门槛

按计时前提交的 `7c767409` 协议，以 `/usr/sbin/taskpolicy -a -d default -t 0 -l 0` 启动整个 before/after cohort。它只改变本次用户进程及其子进程的执行策略，不改系统全局状态。原绝对检查通过 183/188；额外配对检查通过 21/24。

5 项原绝对失败和 3 项额外失败均涉及 128 路径耗时。原始精确浮点结果保留于 `evaluation.json`、`paired-controlled-policy-evaluation.json` 和 `paired-controlled-policy-run.json`。没有逐例重试、增加容差或修改门槛。显式策略未解决本机 wall 波动，不应宣称该策略下全部通过，更不能宣称原隐式条件通过。

全部 10001 路径、摘要 oracle、exact head、mode/删除、SHA 次数、实际正文传输、snapshot 读取及单进程 RSS 检查通过。最终源码与已通过的 28/28 正常公开恢复/历史 fixture 的源码校验和相同。

完整数值与环境分析见 [paired-controlled-policy-results.md](paired-controlled-policy-results.md)。主机 1 分钟 load average 为 6.288–9.317。监测数据没有用来挑选、等待或丢弃任何样本。

之前各组失败和暂停结果均按原值保留。大于 100 KiB 的已归档 JSON 使用确定性 gzip 保存；原字节和解压 SHA 已核对。当前组、冻结基线、协议、evaluation 和 summary 保持可读或原样。

当前证据不能支持“所有冻结性能门槛通过”或“本残余已经全部完成”的结论。
