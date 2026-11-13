# Issue 47：公开摘要入口的补充基线

## 来源和边界

- Guru：`f70b64b026725b27d59fed17ed710cc2f831439f`。
- Fork：`0e3b23a3045357b76e69ca91e84b97b294dfb147`。本残余入口与 `c7bd746b42d75f73534c85e263cd6b51fe0e5287` 相同。
- 所有源码导出位于 `/tmp/trellis-47-residual-benchmark`。没有修改 Guru 正式目录、下游 Task 或原归档证据。
- 使用原 `ManualRecoveryTests` 和 `DeliveryFlow`。fixture 按正常公开接口建立 Task、Planning、Check、Branch Review、Readiness、Publication 和 Delivery。fixture 只扩展输入文件集合。没有直接改写生命周期记录来制造通过。
- GitHub 返回值和语义审查结论使用固定 fixture。网络请求为 0。这些结果不证明 live GitHub、AI 审查或下游已经采用。

## 调用和样本

计时包括原 `invoke.sh --input --review-input` 和 `discover-task-deliveries.sh` 的完整公开 wrapper。

第 0 次调用先记录实际本地 merge 对应的 Delivery。它是预热样本。第 1、2 次调用恢复同一 Publication 的既有结果。每次 query2 都读取并校验已记录的实际 merge。计时门槛使用第 1、2 次的中位数。第 0 次另有不退化门槛。全部样本均保留。

128 和 10001 是完整候选的路径数，包含原 fixture 自动产生的 14 个 Python bytecode 文件、原 app.txt 和 1 个删除路径。剩余路径是新增内容文件。前三个内容文件各为 4 MiB，内容互不相同。`repeated` 的其余内容文件使用相同字节。`mixed` 的其余内容文件各有独立内容。每 17 个内容文件中有 1 个可执行文件。

3 和 30 的精确探针另行只选择 payload 文件。它调用原 `commit_candidate`。两个探针均只有 1 个 blob，包含普通和可执行 mode，分别产生 4、31 次 SHA-256 构造。完整 wrapper 的其他候选文件仍正常存在，不把完整 wrapper 的 SHA 数混称为探针数字。

## 测量

`sitecustomize_metrics.py` 仅在隔离导出中加载。它记录每个 Python 进程自己的 `ru_maxrss`、实际 snapshot 读取字节，以及公开摘要 owner 的内容和聚合 SHA 构造数。它观察原 `GitObjectBatch.ensure` 的实际 `subprocess.run` 请求和响应。它不替换哈希结果。

隔离 Git shim 使用 `/usr/bin/time -l` 记录每个 Git 进程的峰值 RSS 和 argv。macOS 返回 RSS 字节。结果不是进程组内存之和。fixture 主 Python 的 RSS 与 wrapper 子进程的 RSS 分别记录。

每份 `before-*.json` 保存计时和每个操作的原始进程记录。`frozen-standards.json` 保存实施前冻结的数值门槛。`freeze-checksums.json` 保存测量脚本校验和。

`discarded-calibration.json` 仅解释夹具路径数修正、资源记录完善及批量 size 观察修正前的校准过程。这些样本不参与门槛，也不参与最终改善率。一次校准进程在执行逐路径 size 观察时被终止。冻结前已改为一次 batch-check。正式基线没有丢弃或重跑失败样本。

## 复现

先用 `prepare_exports.py --guru <Guru仓库> --fork <Fork仓库>` 导出固定来源。默认目标必须不存在。导出目录不应加入 Git。

使用 Python 3.14 执行 Guru 原 `runtime/bootstrap.py`，参数为 `--repo <导出Guru根目录> --runtime-assets <导出Guru>/trellis/skills/guru-team/runtime --python <Python3.14绝对路径> --json`。本次使用正常复用的 managed runtime `f0b89dabd24ef812b1244b8b`。Python 3.15 的锁定 wheel 安装曾返回 `dependency_install_failed`；这不是通过样本。

用 Python 3.14 执行 `residual_benchmark.py`。环境变量 `BENCH_COUNT` 取 3、30、128 或 10001；`BENCH_VARIANT` 取 `repeated` 或 `mixed`。两个源码目录可用 `PINNED_GURU`、`PINNED_FORK` 指定。每个 case 单独启动进程。顺序执行，避免同时修改隔离 fixture。Git 作者和提交者固定为 `Local Test <test@example.invalid>`；两个日期均为 `2026-10-17T00:00:00Z`。

原 Issue 47 和 PR 48 的交付证据保持原状。这组证据仅覆盖公开 immutable candidate 摘要残余。

## OID 复现修正

实施后首次核对发现，原 fixture 主 Python 会在 feature commit 前生成 14 个 `__pycache__` 文件。这些文件的字节包含临时目录绝对路径。原文将这些路径误写为 Planning 文件；现已更正。它们确实属于原正常候选。没有移除这些输入，也没有改写冻结基线或门槛。

为复现同一不可变输入，after runner 从 before 进程 argv 读取原 fixture 目录，仅在该目录不存在时重新创建它。正常 fixture 使用原源码和固定作者/日期重建完全相同的 commit。runner 在计时前强制比较完整 head OID。相同 commit OID 约束整个 tree；runner 另存完整 candidate、mode/blob tree 和公开 content_ref。

先前尝试在 Check 前覆盖新 runtime 时，原 Check 以 `stale_identity.reviewed_paths` 拒绝脏源码。这次尝试没有产生 after 性能样本。最终方法先按原入口完成合法 Publication fixture，再覆盖实际 after runtime，然后执行全部被测公开 manual/query2 操作。这模拟发布后的 runtime 采用。没有改写 Task、Gate、Publication 或历史 commit。

覆盖后清除主进程旧 API 命名空间，再从目标安装目录重新加载。runner 检查新公开类存在，且其方法的执行文件是目标 `delivery_store.py`。新源码大小/mtime 也使原 bytecode 失效。运行前后核对所有安装源码 SHA-256。

新增协议、后续实现修复和完整测量说明以 [benchmark-method.md](../benchmark-method.md) 为准。
