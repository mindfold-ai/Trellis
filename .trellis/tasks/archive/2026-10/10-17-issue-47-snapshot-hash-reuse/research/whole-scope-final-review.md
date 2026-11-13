# 完整范围独立最终审核

## 结论

**验收失败。当前候选不得合并、发布、关闭Issue或归档Task。**

审核范围为 `0e3b23a3045357b76e69ca91e84b97b294dfb147..520b8d8c863845b15c7eec488ccfcbacda21253c`，以及本次CI保全证据和新增打包验证工具。该范围包含完整残余实现、版本变更、规格、计划、测量协议、workflow与历史证据。Task的PRD、design、implement及现有质量/安装报告已重新读取。本报告是default quality，不记录正式生命周期结果。

唯一Ubuntu运行39011401555完整执行六个case和十二个phase。它不是setup技术失败。独立逐项复算得到原绝对门槛 **181/188**，新增配对门槛 **22/24**。所有测量完整性和保全检查通过，不会将完整失败转换为通过。原Mac的183/188及21/24仍独立保留。

## 未解决发现

性能验收仍未满足。七个原绝对门槛失败：

|检查|实际秒数|原上限秒数|
|---|---:|---:|
|10001-mixed/manual_median_seconds|2.273483432500001|2.168253252195427|
|128-mixed/manual_median_seconds|0.8153372430000019|0.6393437262566294|
|128-mixed/query2_median_seconds|0.7402350960000064|0.5728397875354858|
|128-mixed/first_record_seconds|0.8763055350000002|0.8168767245893833|
|128-repeated/manual_median_seconds|0.8002187140000103|0.6449902493041009|
|128-repeated/query2_median_seconds|0.7086789385000003|0.5813409617723664|
|128-repeated/first_record_seconds|0.8772779980000109|0.8252809686586261|

两个配对失败是128-mixed/manual和128-mixed/query2。它们的改善分别约3.52%和4.40%，低于5%。10001-mixed/manual虽有约56.45%的同机改善，仍超出其原绝对上限。大规模改善不能抵消小规模或绝对门槛失败。

本次没有发现需修改生产实现的新确认代码缺陷。没有可作为再次接受测量依据的确定性指标错误。不得按单例重测、删样本、四舍五入放行、降低门槛或更换runner择优。后续必须保留真实失败并返回原责任owner处理，不能通过合并或发布制造完成事实。

## 已关闭的代码发现

- selected-tree省略目录条目问题已由实施owner修复。实现使用-t且不使用-r，并只保留精确请求行。目录和子文件混合输入的实际公开类复验现已拒绝。
- 新context固定LC_ALL=C。旧Git窄回退不依赖继承的本地化错误文本。旧调用方环境行为不变。
- CI默认pull_request reopened可能重复启动同一登记提交的问题已修复。workflow现在只响应synchronize，另有registration_parent、manifest最新变更、run_attempt=1及独占输出约束。

## 生产实现与兼容性

公开GitCandidateContent位于原delivery_store摘要owner。原文件系统公开签名、原紧凑UTF-8摘要算法和API1.0外形保持兼容。每份输入仍检查路径、完整提交OID、类型、mode及对象可用性。缓存只保存同一实际仓库/操作内的不可变内容事实。调用方仍比较期望结果。close清理事实并拒绝复用。

新selected-path读取使用字面路径和包含固定参数的64KiB预算。新context的4096请求预算包含commit控制请求。commit只走metadata info，不传正文。旧Task/local_commit调用保持原128默认与原协议。旧Git仅在明确拒绝batch-command时回退。正文仍通过临时普通文件分批读取，不保留整批正文，不引入双向管道。

canonical/dogfood相同。生产实现和新增语义测试自69033a66到520b8d8c未变。原归档Task和原.3安装来源未被改写。新包版本均为0.7.0-castbox.4。消费者迁移只发生在隔离原版本导出，未修改Guru正式仓库。

## CI结果的独立验证

本次没有启动计时或重跑evaluator。检查器只读数据并独立实现相同数值比较；原188项与24项的每个字典结果均与artifact相等。

- checkout为520b8d8c，protocol为2c3acea9c855001d26d5c6ab2a9f751b41c82f111b7801eda03c7c21e5c60ead。runtime指纹与69033a66的生产源码一致；协议和执行工具在运行前已提交并受实际guard约束。
- 六组完整head、candidate、paths、mode/blob tree和原冻结记录相同。84项pyc OID相同。
- 十二个phase返回0。每个phase恰含首次manual、两次幂等manual及三次query2。七十二个正常operation的command/validation/provider数量完整。
- 十二个managed runtime身份一致。repo-local gc.auto=0与maintenance.auto=false在两侧生效。
- raw Git args/rss/exit一一对应。每个exit为0。GNUtime原始KiB乘1024后逐项等于结果中的Git bytes。
- raw Python pid记录及RSS与processed记录相符。固定工具已将Linux ru_maxrss乘1024。没有用并发进程组总量冒充单进程峰值。
- digest、snapshot读取、对象正文、hash次数和全部单进程RSS检查通过。
- 92份正式结果与3份GitHubmetadata/log共95个保全entry的原始/压缩摘要通过。3348份raw文件逐条长度及SHA256通过。
- 原ZIP SHA256为a0e627235ff9dd921d549864f00e96648089e65cfe9f4f68f8d0fa91f2e21608，与GitHubartifact digest一致。原188caps及before字节未改。

独立数值和失败项见`whole-scope-final-review.json`。原始运行见`benchmark/ci-cohort1/`。这些是限定Ubuntu条件、真实Git与固定syntheticprovider证据，不证明liveGitHub、AI判断或下游采用。

## 质量与候选安装

此前检查器执行的lint、TS类型、Python类型、103文件Python3.9内存编译和构建均通过。正常生产commit hook的完整日志已独立核对：2828通过、1跳过。源码指纹已与实际提交比对。原能力44/44和公开恢复/历史28/28按其原报告保留，不能替代新性能验收。

本轮独立核对两份候选tgz摘要，并将tar内容与现存隔离node_modules逐文件比较：CLI739、Core274，共1013份字节和mode全部相同。archive模式与投影后脚本0755是不同层级，不混作同一检查。已有writer报告覆盖投影、重应用、drift、sidecar和mode。

新增verify_packed_files.py静态审查未发现确认缺陷。它只比较既有tar与既有安装，不build、install或publish。它拒绝重复/越界/不支持tar项、文件差异、mode差异、额外包文件、配对版本或Core解析不符。已对当前候选实际运行，1013项通过；输出位于`/tmp/issue47-independent-packed-520b8d8c.json`。该工具的source_head是checkout上下文，不能单独证明tar来源；本轮另用原runtime指纹完成520b8d8c源码绑定。

候选尚未发布。以上安装验证不是不可变Release、下载重装或下游Completion证据。

## 当前交付边界

保持草稿PR与打开Issue。不得合并或发布.4，不得关闭Issue、归档Task或宣称下游解除阻塞。可以提交当前失败证据和明确责任边界。代码质量、候选安装和大规模改善均为有效局部结果，但完整接受失败仍是阻塞项。
