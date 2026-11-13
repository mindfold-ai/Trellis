# 解释器与测量协议核查

本次只检查现有隔离导出。没有重跑接受样本，没有改动历史结果，也没有改动生产代码。原 183/188 个绝对检查和 21/24 个配对检查的结果仍为失败。

## 核查结果

|项目|证据|结论|
|---|---|---|
|managed Python|两个 active.json 的 SHA256 相同。两个指针均为 `f0b89dabd24ef812b1244b8b`。实际启动该 interpreter 后，两侧均报告 Python 3.14.8；executable realpath 和文件 SHA256 相同。|当前 before 与 after 使用同一个 interpreter。|
|harness Python|冻结 README 指定 Python 3.14；配对 runner 固定 `/opt/homebrew/bin/python3.14`。当前该入口与 managed Python 的 base executable 相同。|没有发现有效样本使用 Python 3.15 的证据。|
|3.15 缓存|before 导出存在 cpython-315.pyc。冻结 README 记录过 Python 3.15 wheel 安装失败；该次尝试不是通过样本。3.14 不加载 3.15 cache tag。|不能用残留缓存证明混跑。|
|消费者 bytecode|使用真实 managed Python，以 `-v` 和 `PYTHONDONTWRITEBYTECODE=1` 分别导入 manual_recovery 与 history。两侧 manual_recovery 均命中有效 cpython-314.pyc。两侧 history.py 均从源码编译。两侧 sitecustomize.py 也均从源码编译。|没有 after 独有的消费者冷缓存。|
|导入图|after 只减少 candidate_objects 模块，没有新增模块。当前导入图中的既有缓存均有效。|差异符合消费者迁移。|
|观察器|两侧 sitecustomize.py 的 SHA256 相同。|两侧使用同一观察器及同一 metadata 扩展。|
|provider fixture|两个 test_manual_recovery.py 的 SHA256 相同。stub 用 harness 的 sys.executable 作 shebang。fixture root 按协议复用原路径。|stub 实现和 interpreter 选择规则相同。|
|wrapper fixture|两个 test_delivery_flow.py 的 SHA256 相同。|wrapper 调用规则相同。|
|Git shim|脚本文本相同，均包装 `/usr/bin/git`，版本为 `2.54.0 (Apple Git-157)`。|没有发现两侧 Git 分派差异。|

完整路径、文件摘要、bytecode header、实际 interpreter 输出和 loader 输出见 `protocol-environment-diagnostic.json`。本次导入检查没有写入 bytecode。

## 证据边界

冻结的每个 Python 进程记录没有 sys.executable 字段。本次不能为历史记录补造该字段。历史 interpreter 选择由冻结 README 和 runner 源码证明；本次实际进程输出只证明当前导出的一致性。

全目录检查在两侧各发现一个无效缓存，但它不属于本次导入的 runtime 图。fixture 测试源码在测量时临时改写并恢复，不能把测试源码缓存与运行时缓存混为一谈。

## 后续有效路径

本次没有发现需要修正的确定性测量偏差。不能仅凭主机 load average、3.15 残留缓存或失败样本的波动再启动相同接受测试。

下一步应先验证生产代码中的实际 CPU 成本。可在独立 fixture 上做一次 cProfile 诊断，定位 Task schema、candidate 与 relative_path 的重复工作。若发现可保持完整校验的等价优化，先实现并验证该优化，再登记一次新源码的完整接受协议。诊断不能计入接受结果。

若未发现可落在本 Issue 范围内的等价优化，应保留失败门禁。既有分析中提到的 Guru runtime 进程合并、终端 commit 检查批处理属于下游 owner 的范围；本次不能把它们当作已交付能力。
