# 128 路径：保留样本的只读瓶颈分析

当前仍不能关闭 Issue。最后一组在显式进程策略下通过原绝对检查 183/188、额外配对检查 21/24。本分析不重跑、不改代码、不改门槛。

## 可以直接验证的事实

|128 场景|新 before manual 中位秒|after manual 中位秒|独立摘要探针 before/after 秒|
|---|---:|---:|---:|
|repeated|0.703124|0.716654|0.102066 / 0.049699|
|mixed|0.737178|0.731360|0.102764 / 0.059253|

独立摘要探针只有一个观察值，不是嵌套在整链计时内的 profiler。不能把两列直接相减，宣称差额全部来自某个模块。它足以表明当前摘要量级约 50–59 ms；整链约 717–731 ms。继续只优化摘要循环，不能保证固定启动与 provider 成本同时下降。

每次计时的 manual 恢复均有 3 个 managed-runtime 校验 Python 子进程、1 个实际命令 Python、6 个固定 provider fixture Python，以及 10 个 Git 进程。query2 均有 3 个校验 Python、1 个实际命令 Python、4 个 provider fixture Python，以及 8 个 Git 进程。before 的 Git 数分别为 11、10；本次新摘要入口已经减少了进程。

以 128 mixed 的第 1 次计时 manual 为例，after 的 3 个 runtime 校验进程合计消耗自身 user+system CPU 约 0.160109 秒；6 个 provider fixture 进程约 0.165088 秒；实际命令进程约 0.142662 秒。CPU 来自各进程自己的 ru_utime/ru_stime，没有包含子进程或重复相加进程组。CPU 总和不是 wall 分段归因。两次计时的原始数值见 `128-bottleneck-analysis.json`。

固定 provider 是 Python stub，因此其 CPU 时间不能直接解释为真实 gh 或 GitHub 网络耗时。可以迁移到生产的证据是调用次数和请求字段：normal manual 在一次调用中执行 auth、repository、PR、merge commit、target base、checks 共 6 次 provider 命令。真实网络耗时本次未测。

## 最小建议：先看 normal caller 的 metadata 批量化

最小的真实生产切入点位于 Guru 的原 `manual_recovery.terminal_facts()`，不是上游 SHA 算法。该函数对 `(merge, head, base_head, publication.reviewed_head)` 逐个执行 `git cat-file -e sha^{commit}`。当前 fixture 中四个角色对应两个 OID，但确实执行了四次独立 Git 进程。

建议由原 Guru owner 评估一次有限 `cat-file --batch-check`，请求中保留四个角色和四条独立响应，不按重复 OID 删除检查。每条都校验实际类型和完整 OID；缺失对象仍按原 exact-commit fetch 路径恢复，再重新检查。它不需要新的上游摘要 API、不传 commit/blob 正文、不复制 hash 算法、不使用跨调用 cache，也不改 Task/gate。

这是静态可验证的 4→1 metadata 进程机会，不是已实现的耗时承诺。下一步先核对上述角色各自的原失败合同，再由 Guru owner 小范围实现并按原 normal recovery/query2 测试验证。当前会话没有修改 Guru 正式目录或该函数。

证据来源：Guru `f70b64b026725b27d59fed17ed710cc2f831439f` 的 `trellis/skills/guru-team/packages/guru-merge-task-delivery/runtime/manual_recovery.py:108`；最后 retained samples 的 `resources/1-manual/git_processes`。

## 更大的固定成本：managed runtime 的重复 Python 启动

`runtime/resolve-python.sh:67–79` 先启动 `bootstrap.py --validate-active`，校验后再 exec 实际命令。`validate_active → resolve_runtime → runtime_identity` 又启动一次 Python `-c` 读取 interpreter identity；`existing_state → run_probe` 再启动一次 `probe.py`。这解释了每次公开 wrapper 都有三个校验 Python 进程。

可由原 Guru runtime owner 评估一个进程内的“校验后分派”入口：同一次调用仍验证 active pointer、runtime identity、manifest/lock、metadata 和 jsonschema capability，再进入原命令。不能把本建议简化为跳过 probe 或持久缓存校验结果。需要先验证对 interpreter replacement、pointer stale、manifest drift、dependency failure 和 checkout/common-dir 指针的原 typed exit 均保持一致。

此路径的潜在收益大于继续修改 50–59 ms 的摘要细节，但改动面也比 commit metadata batch 大。它属于 Guru runtime 的责任边界，不能静默塞入当前 Trellis 公开摘要 owner。

证据来源：同一固定 Guru source 的 `runtime/resolve-python.sh:67`、`runtime/bootstrap.py:69`、`:200`、`:218`、`:253`、`:278`；当前每组的 `python_categories.managed_runtime_validation`。

## 当前不建议的动作

- 不继续改 SHA、增加 private observation、增加跨调用缓存或改 inode authority。当前内容计算次数和所有资源门槛已经通过。
- 不为 128 的固定 wrapper 成本继续引入流式管道、watchdog 或新摘要接口。当前没有证据证明它们能解决主要成本。
- 不在没有生产 provider 证据时承诺 GraphQL/REST 合并请求的收益。若后续验证 provider 是实际瓶颈，再由原 normal caller owner 评估等价请求合并，保留 repository/PR/head/merge/base/checks 的每项事实校验。
- 不再用不同策略或未改动源码重跑同一例，挑选较快样本。当前完整失败证据、旧门槛和 source checksum 继续保留。

主机 load 与 wall 波动提示执行环境有影响，但现有快照不足以把每个失败归因给某个外部进程。不得把环境疑点当作通过证据。
