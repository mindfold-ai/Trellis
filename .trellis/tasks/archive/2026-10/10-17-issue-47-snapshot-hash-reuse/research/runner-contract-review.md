# 专用 CI runner 配对复验：合同解释

本报告只解释现有合同。报告不修改合同，不执行复验，不记录验收通过。

## 判断

**可以形成该 runner 条件下的有效验收证据。现有合同没有明确将验收锁定到原 macOS 硬件，也没有禁止受控迁移。** 若新完整 cohort 满足全部原冻结门槛和新增配对要求，可以报告“该明确 runner 条件下通过”。原 macOS cohort 仍为 FAIL。

这不是“换平台即通过”。新 cohort 尚未执行；它没有结果。原188项检查和24项配对检查目前仍为183/188、21/24。

## 实际合同依据

- 当前 Issue47 的“本次验证合同”要求先 before、再固定数值门槛、再修改生产。它禁止根据 after 放宽门槛。
- 同节要求前后固定依赖、文件内容、历史、预热条件、计时拆分、重复次数和汇总方法，并固定 Git fixture 提交元数据。该条约束比较的对称性；它没有指定唯一机器或 OS。
- Issue 完成条件要求“两档同条件 before/after 达到实施前固定的性能与资源门槛”，并保留失败和未验证边界。它没有写成“必须在原 Mac 上通过”或“所有历史样本都必须通过”。
- PRD requirement5 要求 identical deterministic fixtures 和 frozen numerical gates；Acceptance 要求 all frozen before/after gates pass，并保留 failed experiments。它没有声明某台硬件为语义合同。
- `benchmark/frozen-standards.json` 固定秒数、RSS、对象/字节/hash上限及样本方法。文件没有 runner、硬件或 OS 白名单。
- `benchmark/README.md` 和 `benchmark-method.md` 记载原 Python3.14、macOS `/usr/bin/time -l`、RSS字节单位及fixture复现方法。这些是原证据的环境与实施机制，不是“禁止其他环境”的显式条款。迁移时必须保持对应指标语义，不能无说明地替换机制。

Issue当前状态仍明确：性能门槛通过前PR保持草稿、Issue保持打开。本解释不撤销该条件。

## 有效新证据的前提

1. 先固定专用 runner、OS/image、CPU/资源配额、Python/Git及依赖版本、调度策略和测量实现，再开始任何接受样本。
2. 在同一个 runner 上顺序运行完整 before 与 after。两侧采用相同执行条件、依赖、观察器、预热、样本数、计时拆分、汇总规则和provider fixture。
3. 保留全部6个case、每例1个首次记录样本和2个定时样本。不得只迁移128失败例。
4. 保留原188项绝对上限。不得按新机器的before数值重算或放宽原上限。
5. 保留24项配对检查。5%/30%改善必须来自同runner的原实现与新实现比较；首次manual的额外配对不退化要求也保留。
6. 在计时前验证冻结fixture的完整commit OID、candidate、路径、mode、blob字节和原oracle。原fixture包含14个Python bytecode文件，其路径和字节是输入，不能以迁移方便为由删除或重建不同内容后仍声称同一输入。
7. 同时固定原始before来源、实际after提交、下游原版本和隔离迁移补丁。记录实际加载源码及解释器身份。before不可使用新实现。
8. 若迁移RSS测量机制，先验证等价观测范围和单位。继续区分每进程Python/Git峰值、全部正文、metadata控制及快照读取。不能以Linux KiB冒充Mac字节，也不能漏计子进程或新增协议。
9. 保留全部原Mac失败数据。保留新runner全部原始样本、错误和完整结果。不能试多个runner后只发布最快一组。
10. 新结果与旧结果分开记录。新runner通过不使旧Mac失败记录失效。

若跨OS无法满足原exactfixture或指标合同，应先报告不匹配；不能声称该次已经满足原冻结验收。保持同OS专用runner会减少迁移差异，但合同没有强制选择。

## 可以与不能主张的结论

|新证据情况|可以主张|不能主张|
|---|---|---|
|只通过绝对上限|该runner中观察到这些绝对值|原优化有5%/30%收益，或整体验收通过|
|原188项与24项配对检查全部通过，输入和观测一致|该明确runner条件下，原冻结门槛及配对改善要求通过|原Mac/default执行条件也通过、跨平台普遍性能已证明|
|换机器后绝对值更快，但配对增益失败|硬件/执行条件改变后的绝对耗时|把硬件收益归属于实现，或接受残缺门槛|
|新runner完整cohort失败|新增条件下仍失败|再择例、取整、换门槛或删失败后接受|

全Task是否具备后续合并/发布条件仍由原监督owner按实际结果判定。性能通过也不替代main合并、精确安装来源、release校验和、下游采用或下游Completion。

## 与此前诊断建议的关系

`remaining-performance-review.md` 反对在相同源码和未纠正条件下反复重测择样。那是基于当时证据的执行建议，不是冻结合同中额外创造的硬件锁定。前瞻登记、目标固定、两侧对称且完整保留的专用runner复验，是独立的受控replication；它不是对旧Mac样本的纠错或替换。

因此，不必先证明原Mac测量有错误，才能形成另一环境下的限定证据。但必须保持旧FAIL边界，并避免把寻找更快平台等同于证明优化收益。
