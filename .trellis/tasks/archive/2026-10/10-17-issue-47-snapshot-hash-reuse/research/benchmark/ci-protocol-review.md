# Ubuntu 协议与指标移植审查

结论：当前工具、manifest 与 workflow 的静态审查通过。没有发现阻止提交该协议的指标或输入合同问题。这不是接受通过；本次没有启动接受计时。

本次审查的 manifest SHA256 为 `2c3acea9c855001d26d5c6ab2a9f751b41c82f111b7801eda03c7c21e5c60ead`。measurement_tools、frozen_files 与 workflow 的实际摘要均匹配该 manifest。工具在接受运行时还会要求这些文件与 HEAD 的已提交字节一致；当前未提交状态不满足运行门禁。

## 已核对的合同

|合同|实现与结论|
|---|---|
|固定 runner|manifest 固定 ubuntu-24.04、image version、Git 版本与 Python 3.14.8。cohort 检查实际版本，记录硬件/系统，拒绝 run attempt 非 1。没有 alternate runner 选择逻辑。|
|完整样本|六个 case 顺序固定。每 phase 原冻结 harness 运行 iterations 0/1/2，包含首次 manual 与三个 query2。rows、warmup、成功结果与六个 operation 的完整性另行检查。|
|完整 Python 范围|与冻结 baseline 逐 operation 核对角色数。首次 manual 为 command 1、validation 3、provider 7；恢复 manual 为 1/3/6；query2 为 1/3/4。每条 RSS 必须为正整数。|
|RSS 单位|Python ru_maxrss 与 GNU time %M 均将 Linux KiB 乘 1024。没有用 RUSAGE_CHILDREN 累加所有进程；原 128MiB/32MiB 上限保留。Git args/rss/exit stem 集合必须一致，exit 必须为 0，RSS 必须为正数。|
|hash/body/snapshot 口径|保留原 observer，只转换 Linux RSS 并追加既有 metadata 协议扩展。内容请求与实际 ALL body bytes 仍按原 observer/扩展区分；info 的 advertised size 不伪装成传输正文。snapshot read 与 SHA 构造位置保持不变。|
|精确输入|所有 phase 的正常 Publication 建立后，完整 head、candidate 与 git_tree 均须等于冻结记录。pyc 预检逐 case 比较原 14 个 blob OID，共 84 项；它只在临时目录编译，不安装替代输入。|
|正常工作流|保留原 ManualRecoveryTests.setUp 建立 Task/Planning/Check/Review/Readiness/Publication。after common 只在 Publication 后 overlay；再校验实际 GitCandidateContent 来源、源码摘要与 bytecode header。没有改写 lifecycle 事实以绕过 Check。|
|managed runtime|每 phase 记录 pointer、实际 interpreter、manifest、lock 与 metadata。实际 interpreter 的版本及可执行文件摘要须匹配 harness；12 phase 的 managed identity 必须相同。metadata 路径指向 runtime-id/metadata.json，符合原 bootstrap 布局。|
|原绝对上限|输出目录的 before-*.json 直接复制冻结旧样本。原 evaluate_results.py 与 frozen-standards 不变；188 项检查数量必须完整。没有用新 before 重算上限。|
|新配对收益|24 项检查独立读取同 job 的 control-before 与 after。128 两类 wrapper 各需 5%，10001 各需 30%，首次 manual 另需不退化。|
|Git 自动维护|只在隔离 fixture init 后、首个 commit 前写 repo-local gc.auto=0 与 maintenance.auto=false。before/after 使用相同 setup。计时前检查 effective 值及 local 来源；拒绝 command 环境覆盖。该变化不进入 Git 树，完整原 OID 断言仍保留。|
|失败保留|输出用独占创建，raw metrics 目录不得复用；技术失败即结束，不补样本。workflow 在失败时仍上传 results 与两侧 raw metrics。Mac 旧失败文件保持原样。|
|声明边界|结果文件明确限定该 Ubuntu runner，并保留 Mac FAIL。没有把 synthetic provider 当作 live GitHub/AI，也没有声明下游采用或 Completion。|

## 审查方式与剩余执行门禁

本次逐段检查四个 ci_* 工具、原 harness、原 evaluator、两个 observer、原 bootstrap 布局、manifest 与 workflow。另只读计算 manifest 所列文件摘要，结果无不匹配。未执行 setup fixture、wrapper 或接受计时。

实施方另报告纯诊断检查通过：84 个 pyc identity、6 个完整 process scope、18 个缺失数据拒绝场景，以及真实临时 Git 的 local policy origin。本报告没有把这些诊断转换成接受性能证据。

提交后，仍须由实际 runner 验证 image、Python、Git、原 pyc、正常 fixture 的完整 OID、观察器及 managed runtime。任一 setup 检查失败即保留为 setup FAIL；不能换 OID或取后续快样本继续。只有完整新 cohort 的原 188 项与附加 24 项全部通过，才可报告该已登记 runner 条件下的接受通过。

## 最终追溯与单 cohort 触发闭合

最后一次复核只检查来源追溯与触发门禁，没有重测，也没有改动实现。最终 workflow SHA256 为 `3ddc48c8603eddbdd26c2550a6d6b5cd5c86ec51b3dcfe35e1b59ab40f2e809c`；ci_support.py SHA256 为 `678a8708baf2abd24b48467eb42b01cf3ab6ea280d67521ffda8f7a05d407750`。manifest 所列工具、冻结文件与 workflow 的实际摘要再次全部匹配。

workflow 只响应 synchronize，并先执行 registration job。只有 HEAD 的父提交等于已登记 `a2045aa8f2d960a4487d68af3628655e380713e0`，且最近一次改动 manifest 的提交等于 HEAD，才会启动 benchmark job。runtime protocol_guard 重复检查同一条件，并验证 workflow 摘要及其 HEAD 已提交字节。后续仅改文档的提交或 reopen 不会合法启动新接受 cohort；原 run attempt=1 门禁仍保留。

environment_record 另记实际 checkout_git_head，用于区分 PR head 与 GitHub 事件中的合并 ref。其余三个 ci 工具及原 188/24 计算算法未变。新增检查只收紧来源与单次触发边界；最终静态审查结论仍为通过。该结论仍不等于 runner 执行或接受通过。
