# 公共 content_ref 的嵌套 wall 诊断

本次观察不支持“即使 content_ref 耗时为 0，其余 wrapper wall 仍超过原上限”的断言。manual 与 query2 的 content_ref 区间补集均低于对应上限。本次也不能证明实现可达标或接受通过。

## 方法与来源

现有 Mac/CI 原始记录没有 content_ref 的嵌套时间。它们只有完整 wrapper wall、独立 component probe 和进程 CPU。因此，不能用独立 probe 与 wrapper wall 相减。

本次新建隔离导出，使用 Guru `f70b64b026725b27d59fed17ed710cc2f831439f`、Fork before `0e3b23a3045357b76e69ca91e84b97b294dfb147`、生产来源 `69033a662d68701610f09caa97f1d292bccd1076` 及已登记消费者 projection。原正常 fixture 建立 Publication 后，才安装 after common。原 128-mixed 的完整 commit OID、candidate 与树均保持一致。

正常首次 manual 只用于建立 merged Delivery，不计诊断时间。之后只观察一次幂等 manual 和一次 query2。两次均保留原 wrapper、runtime 检查、provider fixture 与实际公共 content_ref。manual 返回 delivered，query2 返回原精确 merge；两次均未改变 Task bytes。

临时 sitecustomize 只在 `sys.orig_argv` 精确含 `-m runtime.command` 的实际命令进程中安装导入 hook。它在 namespaced delivery_store 加载后，包装公共 `GitCandidateContent.content_ref`，保留原返回和异常。它没有替换 digest 算法，没有跳过 validation，也没有使用 sys.setprofile。provider 与 runtime-validation 进程不安装该包装。

父进程的 wrapper 起止及命令进程的方法起止都用同一 macOS `perf_counter_ns` 时钟。每个操作恰有一次 content_ref 调用。两个方法区间都严格位于对应 wrapper 区间内；无重叠。JSON 还保留方法前后补集的绝对区间；整数纳秒相加与整个 wrapper 区间完全一致。

## 单次观测

|操作|wrapper wall 秒|content_ref 区间秒|方法区间补集秒|原 median 上限秒|补集是否超上限|
|---|---:|---:|---:|---:|---|
|manual|0.600910250|0.050467417|0.550442833|0.6393437262566294|否|
|query2|0.534339000|0.044456500|0.489882500|0.5728397875354858|否|

这是同一次 wrapper 内的非重叠拆分。补集不是“纯非 owner 开销”：它仍包含 content_ref 外的 owner 工作、构造/关闭 context、其他校验，以及诊断仪器开销。

将整个 content_ref 区间设为 0，只是一个较强的假设边界。该区间包含校验、Git I/O 与 hash；不能把删除这些必要行为当作可接受优化。即便采用该假设，本次补集仍低于上限，所以本次没有提供“其他 wall 已经构成不可突破下界”的证据。它不反向证明可完成优化，也不对其他主机作数学结论。

## 仪器失败与修复

第一次诊断把 startup 的 sys.argv[0] 当作最终 command.py 路径。实际 launcher 使用 `-m runtime.command`；sitecustomize 执行时 sys.argv[0] 为 `-m`。包装未启动，manual 正常执行后没有 interval 文件，脚本随即停止。该次没有执行 query2，没有可用 nested 时间，也没有持久化 wrapper 时间。不能把该次当作性能样本。

收到明确授权后，先执行两个无业务调用的启动/import 探针。正探针通过同名启动入口导入真实公共 API，确认方法已包装但没有调用；负探针使用 provider 风格的 `-c`，确认不创建日志。之后才在全新目录执行上述一次 manual 与一次 query2。旧失败脚本、完整 stderr、文件摘要和新旧脚本正文均保存在 JSON 中。没有按耗时选值或再重复观察。

## 局限与证据位置

本次只启用 nested observer，没有启用原接受用的 hash/body/RSS 观察器；Git shim 因 metrics 环境未设而直接 exec Git。它与原 CI 的环境及观察开销不同。此处的单次 wall 不能替换原三样本 median，也不能用来宣告接受通过。原 CI 181/188、22/24 FAIL 与 Mac FAIL 均保持不变。

导入 hook、方法包装、时钟读取、区间记账及退出时 JSON 写入带来未量化开销。因此，拆分准确描述本次被观察执行的区间，并不剔除所有仪器成本。

完整区间、返回、精确输入、来源 SHA256、首次仪器失败、无业务探针及全部诊断脚本正文见 `nested-owner-diagnostic.json`。原始目录为 `/tmp/trellis47-nested-owner-998qizil` 与 `/tmp/trellis47-nested-owner-corrected-o2L4L0qG`。本次没有改动生产、Guru 正式目录、冻结协议或原测量数据。
