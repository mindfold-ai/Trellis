# 剩余性能门槛：独立诊断审核

## 结论

当前验收仍为 **FAIL**：183/188 个原绝对检查通过，21/24 个新增配对检查通过。不能把诊断、代码质量或大规模路径改善转换为整体通过。

本次没有找到当前 Trellis 仓库内具必要性、符合本 Issue 范围且有实证支持的下一项生产修复。本次也没有找到足以撤销或修正现有接受样本的确定性测量错误。继续改少量字符串检查或无关代码，不能成为再次接受测量的理由。

这不是“已证明所有上游优化均不可能”。当前证据只支持停止无目标的上游代码调整。若要继续推进，应由实际成本的 owner 提供新的实证方案；可能的边界是下游正常 caller 的进程编排，或具有确定性原因的执行条件纠正。任何方案均不保证现有门槛随后通过。

## 环境诊断

独立读取 `benchmark/protocol-environment-diagnostic.md/json`。JSON 中 before/after 的 active 指针摘要、实际 interpreter realpath 和 interpreter SHA256 相同。两侧实际输出均为 Python3.14.8。观察器、provider 和 wrapper fixture 一致；Git shim 使用同一个实际 Git。消费者 manual_recovery 两侧均命中有效3.14字节码；history 两侧均从源码编译。

残留3.15字节码不能由3.14加载。冻结进程记录没有 sys.executable，因此本次当前导出检查不能倒推补造每个历史进程的解释器事实。这个证据缺口需要保留；它不是已有样本混用解释器的证明。

未发现 after 独有的冷缓存、解释器变化或观察器变化。主机 load 和 wall 波动未定位到确定的外部因果。不得据此重跑相同接受测试、选择较快样本或宣称环境已纠正。

## 实际128路径 wrapper 剖析

独立读取诊断目录中的 JSON 和原始 pstats：
`/var/folders/rd/kbzpxp956nb3p_h04vnfg3l80000gn/T/trellis47-schema-owner-diag-y7nz4gj1`。

|操作|函数|调用次数|自身CPU毫秒|累计CPU毫秒|
|---|---|---:|---:|---:|
|manual|parse_task_v2|3|0.162|37.643|
|manual|candidate|18|0.904|29.321|
|manual|relative_path|2486|8.446|24.742|
|manual|nonempty|5049|2.933|10.280|
|manual|strings|33|0.732|5.379|
|manual|content_ref|1|0.361|21.403|
|query2|parse_task_v2|1|0.053|12.316|
|query2|candidate|6|0.297|9.016|
|query2|relative_path|914|2.931|8.429|
|query2|nonempty|1768|0.917|3.248|
|query2|strings|11|0.246|1.625|
|query2|content_ref|1|0.319|19.610|

这些值来自单次带 cProfile 的独立诊断。它们不是接受样本，也不是重复测量统计。累计CPU有嵌套关系，不能相加。不能把它们直接从完整 wrapper wall 中相减。

manual 的 parse_task_v2 为3次，candidate 为18次，relative_path 为2486次。query2 对应1次、6次、914次。原始 pstats 没有上游 apply_operation、record_delivery 或上游 write_json 调用；其中出现的 write_json 来自 Guru runtime/io.py。该 manual 样本走幂等恢复，不能用写入 kernel 优化解释它的成本。

即使把所有 nonempty 调用都错误地视为可删除，诊断累计量也仅为 manual10.280毫秒、query2 3.248毫秒。真实可保持等价校验的减少量还会更小。全部 parse_task_v2 累计量为37.643/12.316毫秒，并包含上述子调用。当前没有证据证明这些微优化能填补约50–90毫秒的剩余 wrapper 缺口。

每次 parse/candidate 校验来自实际边界或独立历史事实。不能以同值为由缓存“验证已通过”，也不能删去无效输入或历史结果比较。当前实现已经完成唯一 blob 内容复用，并保留每个输入的独立检查。

## 后续合同

1. 保留当前失败结果、所有历史样本、冻结门槛和源码指纹。
2. 保留当前 Task 与 Issue 的未完成状态。
3. 不因代码质量通过而合并、发布、关闭或归档。
4. 不为获得一次重测机会而修改无关实现。
5. 若下游 owner 接手，先核对 terminal_facts 四个角色的完整 OID、类型、缺对象 fetch 和错误合同，再评估有限 metadata batch 的4→1进程机会。
6. 若 runtime owner 接手，先评估“同一进程校验并分派”，保留 active pointer、interpreter、manifest/lock、依赖和 typed error 检查。不得改成跳过 probe 或持久缓存验证成功。
7. 若主张测量纠错，先提供可复现的确定性错误及修正规则。规则必须同时适用 before/after，并保留全部旧失败。当前尚无这类纠错证据。
8. 只有新生产改动的实证或有效测量纠错才能支持登记新的完整接受协议。不得逐例重试、取整接受或改门槛。

上述下游工作是建议和责任边界，不是本会话已授权修改下游正式仓库的事实。本次没有改动生产源码、下游正式仓库或接受样本，也没有运行新的接受测试。
