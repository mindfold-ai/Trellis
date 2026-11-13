# 显式进程执行策略下的完整配对验证：实施前登记

前一组源码和输入均正确，但原绝对门槛通过 185/188、额外配对门槛通过 23/24。完整失败组已保留。主机 1 分钟 load average 为 3.8–6.9；128 路径的整链耗时包含固定 provider 和 Python 启动成本。下一组不再修改源码。它验证明确且前后相同的执行条件。

仅运行一组完整 cohort。整个 runner 通过如下命令启动：

`BENCH_CONTROLLED_POLICY=application-default-throughput0-latency0 /usr/sbin/taskpolicy -a -d default -t 0 -l 0 /opt/homebrew/bin/python3.14 run_paired_controlled_policy.py`

这是用户自身进程范围的策略。`-a` 使用应用资源管理策略；`-d default` 使用默认进程磁盘 I/O 策略；`-t 0` 和 `-l 0` 指定 throughput 和 latency tier。taskpolicy 手册明确子进程继承策略。因此 before、after、Python wrapper、Git 和固定 provider 子进程使用同一策略。没有修改系统全局设置，也不需要提升权限。非计时能力探针及二进制校验和保存在 controlled-policy-provenance.json。

case 顺序、before→after 顺序、所有输入、observer、1 次首次记录预热和 2 次计时恢复/query2 均保持原样。原 188 项绝对门槛和额外 24 项配对检查均不变。前后源码 checksum 必须相同，且与上一已审核源码一致。

计时前先提交本协议。执行时记录策略 argv、uid/pid/nice 和原有 host/load/CPU 数据。不逐例重试，不丢弃样本，不用新 before 修改原上限，不增加容差。若仍有失败，原样报告。

该政策只限定这组本地实验的执行条件，不将结果推广为所有主机或 live provider 的性能保证。
