# Ubuntu 专用 runner 协议预检

本报告只提出待审查条件。尚未启动接受计时，也没有改动旧数据。当前 Mac 接受结果仍为失败。Ubuntu 结果只能证明登记 runner 上的行为，不能证明下游已采用。

## 必须冻结的字段

- 唯一 runner 为 `ubuntu-24.04`。记录实际 image release、image version、CPU、内存、kernel、容器边界和 job/run URL。不得试跑多个 runner 后选择结果。
- 固定完整 Fork before SHA、Guru SHA、after 源码 SHA256 清单、消费者 projection patch SHA256、所有新工具 SHA256、原 freeze-checksums 与 frozen-standards SHA256。
- 固定 Python `3.14.8`。记录 harness 与 managed Python 的真实 executable、base executable、版本、cache tag、文件 SHA256 和 active pointer。记录安装依赖的 lock/manifest 摘要。两侧使用同一 interpreter。
- 固定同一 Git executable 和版本。两侧使用同一 Git shim、provider stub、观察器和 locale。记录这些文件及环境的摘要。
- 固定六个 case、顺序、每个 case 的 before/after 顺序、每 phase 的三次调用，以及退出规则。每个 phase 保留 iteration 0 首次手工记录与 iterations 1/2 恢复调用；每次都执行 query2。不得只重跑失败 case。
- 固定原六组输入的完整 OID、candidate paths、模式、删除项、blob OID/size、14 个 pyc 的 path/OID。before 与 after 必须匹配冻结输入。
- 明确原 188 个检查与附加 24 个配对检查的来源。原四组绝对时间上限、首次记录上限、资源和计数上限保持原值。新 before 只用于附加配对收益，不能重算绝对上限。
- 固定 128 项的 5% 收益与 10001 项的 30% 收益，并分别用于 manual/query2。同机 before/after 的实际数据独立证明收益，不能用更快机器的绝对耗时代替收益。
- 固定完整失败保留策略。首次技术失败即保留已完成证据并失败；不得继续补样本凑全。无结果、缺字段、异常退出和不完整进程记录都不能计为通过。

## 允许的 setup 边界

在计时外安装固定 Python 与依赖、导出 pinned 源码、准备 shim、设置目录权限及固定 fixture 路径。正常旧工作流仍须建立 Task、Planning、Check、Review、Readiness 和 Publication。所有对象身份检查必须通过后，才允许进入计时。

14 个 pyc 是原输入的一部分。它们包含编译路径和 timestamp/size header。Python/Git 版本与路径相同不保证 pyc 字节相同。新工具必须验证每个 pyc OID 和完整 commit OID。不能通过删除 pyc、缩小 candidate、改写 Publication、替换 reviewed_head 或改动 gate 事实来修复 setup。若需要输入重建策略，应在计时前登记并单独审查；最终身份仍必须与冻结 OID 一致。

after runtime 只能在正常 Publication 建立后安装。安装后仍需验证实际加载的 GitCandidateContent 来源和 bytecode 命中，并验证计时恢复前后 Task bytes。不得在 Check 前换 runtime 后再重写 identity 使门禁通过。

## 指标移植审查项

|指标|必须保持的语义|Linux 审查重点|
|---|---|---|
|wrapper 时间|完整公开 wrapper 的 wall seconds；iteration 0 单独作首次记录上限，iterations 1/2 取 median。|计时范围包含 shell、runtime 校验、实际命令与 provider stub；不得只测候选 hash。|
|Python RSS|每个 Python 进程自身峰值，统一为 bytes；上限 134217728。|Linux ru_maxrss 为 KiB，须乘 1024；Darwin 原值为 bytes。不得累加 children 或漏掉 provider/runtime-validation 进程。|
|Git RSS|每个实际 Git 进程自身峰值，统一为 bytes；上限 33554432。|GNU time 的 `%M` 为 KiB，须乘 1024；不能照搬 BSD `time -l` 解析。缺失或不能解析必须失败。|
|body requests|单次命令成功请求的 candidate blob body 次数，不超过该 candidate 的 unique blob 数。|保留重复请求计数；metadata info 不计为 body。|
|body bytes|单次命令实际成功传输的所有 object body bytes，不超过 unique candidate blob sizes 之和。|commit advertised size 不是 body；若实际读取 commit body，则必须计入。不能只累计 blob。|
|SHA 次数|每个 exact candidate 调用 content SHA 不超过 unique blobs，aggregate SHA 不超过 1。|保留原观察位置和构造口径；不得把重复 hash 移出观察器后计为 0。|
|snapshot bytes|after 单次实际命令的 materialized snapshot read bytes 必须为 0。|保留旧路径观察和真实 read 口径。|
|正确性|原 candidate digest oracle、模式、删除、精确历史 fact、原 #48 能力。|结果必须来自正常公开调用；不能预先填入成功布尔值。|

旧 evaluator 会把空进程列表或缺失 Git RSS 变成 0。新工具应在调用原 evaluator 前添加完整性检查，拒绝这些输入。完整性检查不能删改原 188 个检查。应同时检查 rows 恰为 iterations 0/1/2、warmup 标记恰为 true/false/false、六个 operation 目录齐全、每个 operation 恰有一个实际 command.py 进程、记录的进程均正常退出、所有 Git args 与 RSS 记录可配对。

## 当前结论

上述字段与 setup 边界需结合新 ci_* 工具逐项核对后，才能得出协议审查结论。本报告不授权计时，不代表接受通过。

## Git 自动维护隔离

建议在该一次性 job 的 setup 阶段，对 before 与 after 同时关闭 Git 自动维护：`gc.auto=0`、`maintenance.auto=false`。10001 项 mixed fixture 包含约 10000 个独立 blob，可能越过默认 loose-object 自动维护启发式。fixture 建立过程的 commit/fetch 可能启动后台维护，并影响随后计时。Git 内部分派的维护子进程也可能绕过 PATH shim。本判断说明隔离的必要性，不证明旧 Mac 样本实际发生过后台维护。

首选设置 job 专属的 `GIT_CONFIG_GLOBAL` 文件，避免修改 runner 原有 global 文件。协议需固定该策略、配置文件路径与内容摘要、Git 版本，以及 `GIT_CONFIG_SYSTEM`、`GIT_CONFIG_NOSYSTEM` 的采用边界。可保留 system 配置并记录其窄范围结果；也可在协议中提前声明 `GIT_CONFIG_NOSYSTEM=1`。两侧必须相同。

在每个 fixture 进入计时前，针对其实际 root 记录 `gc.*` 与 `maintenance.*` 的 effective 值、scope 和 origin，并断言 `gc.auto=0`、`maintenance.auto=false`。检查应启用 includes，覆盖 system/global/local/worktree/command 以及 includeIf 条件来源。这样可以发现 local 或条件配置覆盖，而不是仅证明 setup 写过 global 文件。

首选断言 `GIT_CONFIG_COUNT` 未设或为 0，并断言 `GIT_CONFIG_PARAMETERS` 未设。不得无条件导出 `GIT_CONFIG_KEY_*` / `GIT_CONFIG_VALUE_*`，以免泄露凭据。若协议需要环境注入配置，只输出 `gc`、`maintenance` 对应键值；其他值不输出。

这是前瞻固定执行条件，不是对 after 结果的筛选。不得根据首次结果再改自动维护策略或补跑单例。
