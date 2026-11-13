# CI测量移植：独立代码审查

本报告是默认质量审查。它不记录正式生命周期结果，不执行接受样本，不表示性能通过。

## 代码结论

当前实现没有未解决的确认代码问题。最后的协议摘要闭环已独立核对通过。正式运行仍须在登记提交产生后通过已提交字节和父提交检查。当前Mac结果保持183/188和21/24 FAIL。

## 已修复发现

- workflow原先只声明pull_request，默认含reopened。同一registration HEAD在重新打开PR时可获得新run_id和run_attempt=1，freshVM中的独占marker无法阻止再次计时。实施owner已改为`types: [synchronize]`。独立复核该修复存在。

## 实际代码核对

|检查|证据与判断|
|---|---|
|完整配对范围|ci_support固定6cases，ci_cohort对每个case顺序control-before/after；原harness仍运行0/1/2样本。validate_result拒绝缺失rows、错误warmup、缺失operation和失败结果。|
|原绝对门槛|before-*.json复制原冻结字节；原evaluate_results.py与frozen-standards由摘要固定；评估必须产生188项。不存在从CI新before重算原caps的路径。|
|配对门槛|另算24项，包含128的5%、10001的30%、firstmanual的1.05，以及exacthead/count；所有比较必须通过。|
|Linux RSS|observer和主fixture的ru_maxrss各乘1024；GNUtime %M也乘1024。每个Python/Git记录必须有正整数RSS，未累加RUSAGE_CHILDREN冒充进程峰值。|
|进程完整性|按冻结operation逐项核对command/validation/provider数量；Gitargs/rss/exit的stem集合必须相同且exit均为0。缺字段或不完整记录在原evaluator前失败。|
|正文及hash|原observer只改单位；追加既有batch-command观察器。metadata的advertisedsize与实际正文分列；未将commitbody排除后伪造通过。snapshotread和SHA构造观察点保持原位置。|
|精确输入|ci_fixture按6cases×14pyc做84项原blob预检，不安装替代pyc。正常fixture建立Publication后再次核对完整head/candidate/tree。任一不匹配在接受计时前失败。|
|正常生命周期|原fixture照常产生Planning/Check/Review/Readiness/Publication。afteroverlay发生在Publication后，核对实际加载文件和sourcehash；没有改写Task/gate来制造接受结果。|
|实际runtime|固定Python3.14.8与cachetag；managed解释器版本及文件摘要必须匹配harness，12phase的pointer/manifest/lock/metadata身份一致。|
|Git维护策略|只改隔离fixture的repo-local gc.auto=0、maintenance.auto=false；在init后及commit前应用。before/after相同，并校验effective值与localorigin。没有改HOME/globalGit或Guru正式源码。|
|源码与workflow|protocol_guard覆盖所有ci_*工具、冻结文件、afterruntime和workflow摘要；正式模式要求文件与HEAD已提交字节一致，HEAD^必须是registration_parent，manifest最后变更必须是HEAD。环境记录含真实checkoutHEAD，phase前后保持一致。|
|单cohort限制|registration前置job只允许登记提交运行benchmark；后续docscommit跳过。workflow限同repoPR50的synchronize事件，无dispatch/push/reopened触发。run_attempt须1；输出目录、startedmarker和结果独占创建；无逐例重试。|
|技术失败保留|每phase stdout保留在独立文件，returncode/stderr写status；失败停止，不补样本。workflowalways上传results及两侧rawmetrics。预检失败不计性能通过。|
|权限及外部作用|workflow仅contents:read，checkout不保留凭据；没有push、merge、release或npm发布步骤。原Mac失败不被改写。|

## 本次验证方式

逐段读取ci_fixture.py、ci_phase.py、ci_support.py、ci_cohort.py、workflow、协议、原harness/evaluator、两个observer及原冻结输入。对四个CI工具做内存AST语法解析；未运行fixture或acceptance。独立比较所有frozen_files与当前已提交HEAD，原文件未变。

最终静态闭环通过：全部measurement_tools、frozen_files与workflow实际摘要匹配manifest。协议SHA256为`2c3acea9c855001d26d5c6ab2a9f751b41c82f111b7801eda03c7c21e5c60ead`；workflowSHA256为`3ddc48c8603eddbdd26c2550a6d6b5cd5c86ec51b3dcfe35e1b59ab40f2e809c`；ci_supportSHA256为`678a8708baf2abd24b48467eb42b01cf3ab6ea280d67521ffda8f7a05d407750`。当前HEAD等于登记的registration_parent `a2045aa8f2d960a4487d68af3628655e380713e0`，原冻结文件与HEAD字节一致。当前工具尚未提交，因此正式protocol_guard的HEAD登记提交检查尚不能成立；该检查应在正常提交后由实际runner执行。本报告没有跳过或伪造此检查。

## 声明限制

该workflow不构成跨run_id的永久protocol登记服务。当前触发类型、直接父提交和最新manifest限制可阻止普通重新打开、docscommit与jobrerun。人为重写分支或更换登记协议仍需原监督owner保留审计，不能借此寻找更快runner或择样。

Ubuntuimage、Git/Python版本、pyc可重现性、实际完整OID和资源记录仍须在真正runner上验证。任一失败都是保留的setup/technicalFAIL，不能替换输入后继续。只有新runner完整188+24全部通过，才可限定报告该runner通过；原Mac/default条件及下游Completion不随之通过。
