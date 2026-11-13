# 最终交付独立核验

## 结论

**按用户修订后的验收合同，上游Task的技术与配对安装交付已完成。没有未解决的确认交付问题，可由原owner关闭Issue47并通过原生流程归档本Task。**

本报告是default quality、legacy workflow的独立核验意见。它不创建schema2正式结果，不代替尚未发生的Issue关闭、Task归档、closeout提交或其CI。本次live检查时Issue47仍为OPEN。临时benchmarkworkflow的删除仍是当前closeout工作树变更，不能说已经合入main。

## GitHub实际事实

本次通过gh只读查询实际PR、run、tag与releaseAPI，未依赖分支名称推断。

|项目|实际结果|
|---|---|
|PR50|MERGED；2026-10-17T07:27:37Z合入`9f40ec70914f98fce2619560274cc1d0619f2f7e`|
|PR CI39013359563|success；head为`53664b76714fd51d435c125bc6d5f5dd5799fa17`，与PR最终head相同|
|main CI39013710371|success；精确head为`9f40ec70914f98fce2619560274cc1d0619f2f7e`；构建、类型、lint、Python3.9语法、测试和输出检查均success|
|tag castbox-v0.7.0-castbox.4|远端ref对象类型commit，完整OID准确指向上述main提交|
|Release|非draft、prerelease；publishedAt为2026-10-17T07:32:09Z；提供两个tgz、SHA256SUMS、release-record.json四个uploaded资产|
|npm workflow39013995737|run及publish job均skipped，head同精确main；本次该路径未执行npm发布|
|Issue47|本次live核对仍OPEN；本报告只给出可关闭意见，不替代关闭事实|

发布地址：https://github.com/castbox/Trellis/releases/tag/castbox-v0.7.0-castbox.4

## 固定交付身份与immutability边界

GitHub release API明确返回 **`immutable:false`**。平台强制immutable-release锁没有启用，本报告不声称已启用。

原监督owner已明确：当前合同的不可变交付指固定tag、完整sourceSHA和资产校验和，以及不移动tag、不替换已发布字节的交付约定；没有额外要求GitHub平台强制锁。本次按该合同核验，不临时新增门槛。原.3与新.4均须按不改写约定保留。平台标志与固定身份约定不能混为一谈。

LiveGitHub资产digest与本地重新下载字节一致：

|资产|SHA256|
|---|---|
|mindfoldhq-trellis-0.7.0-castbox.4.tgz|9746bed8c3c225bf5f28a263bb74eeeaef053270ba3c7f137e8b164de18ee417|
|mindfoldhq-trellis-core-0.7.0-castbox.4.tgz|46de26c162141751c9ea59d750afe3fedcebfdc86b8a32603b385415bc37b7ec|
|release-record.json|dff157381de78617dc3f47c2f887b430acead04e4ff2c084aab77023d5d4f676|
|SHA256SUMS|ef411df2e6a89fe3349231491a898b9e833d18668158d2358ff8d1a7b422ef1a|

## 本地证据独立校验

本次只读取现有文件、tar及报告；未重新build、计时、安装或测试。

- 按verification.json逐项核对六份证据的存储SHA256、解压SHA256和原始长度，全部一致。
- 重新核对下载目录的四个资产长度及SHA256。与发布前字节逐项一致，SHA256SUMS三条校验全部通过。
- 独立遍历发布前tgz与现存隔离安装，CLI739文件、Core274文件，共1013文件的字节与mode全部一致。下载后tgz和新prefix再次逐项核对同样1013文件，全部一致。
- 两个pack报告均绑定精确main9f40ec70。两包version均0.7.0-castbox.4，CLI在tar内精确依赖同版Core，Core解析结果位于各自独立prefix。
- 两份安装行为报告各有七个true检查，全部原命令exit0。它们覆盖精确Core解析、公开Git摘要及重复调用、正常交付/重试、reapply保留Task、drift/sidecar、强制恢复权限和受管清单。
- 公开owner文件的canonical、dogfood、实际包内内容和安装报告SHA逐项对应。git_objects.py、delivery_store.py、task_store.py与已测69033a66相同，也与实际发布main9f40ec70相同。
- 本次closeout工作树没有生产源码变化。临时benchmarkworkflow删除及证据/Task文档更新属于待完成的收尾范围。

对应文件：verification.json、release-record.json、SHA256SUMS、pack-verification.json.gz、download-pack-verification.json.gz、install-verification.json、download-install-verification.json及实际原目录`/tmp/trellis-47-release4-01a14785`。

## Whole-Task合同核对

用户于2026-10-17明确修订了原估定绝对耗时和固定百分比的阻塞作用。按acceptance-revision.md及revised-acceptance-review.md，原摘要兼容、每输入独立验证、唯一blob操作内复用、零重复物化读取、资源边界、原能力回归、质量与安装均有已审核证据。实际发布main绑定同一生产实现。PR与精确main标准CI均通过。

原Mac183/188+21/24 FAIL及Ubuntu181/188+22/24 FAIL保持原值。此次交付意见不将它们改判PASS。大规模收益和Mac小规模+1.92%观察继续公开。没有增加恰好通过的时间门槛或重测择样。

因此，当前上游范围的技术与安装交付要求均满足。剩余Issue关闭、原生archive及closeoutCI是原owner下一步应实际完成并记录的收尾操作。本报告不能提前证明这些操作成功。

## 未解决发现与限制

没有未解决的确认代码或交付缺陷。GitHub`immutable:false`已如实披露，并按原合同身份/不改写约定解释，不伪造平台锁。

本次是代表性隔离安装与固定syntheticprovider证据，不是完整平台release矩阵、liveGitHub业务流或AI语义判断。下游#589仍负责匹配采用、正式集成和原TaskCompletion；本报告不声称下游完成或已解除其流程状态。没有修改全局安装或Guru正式源码。
