# 一次完整配对验证：实施前登记

第四组保留的 4 项 128 路径耗时失败仍然有效。父会话要求用一组完整配对复测验证测量条件。本组只运行一次，不逐例重试。它不是新的基线，不修改原门槛。

按 3 repeated、30 repeated、128 repeated、128 mixed、10001 repeated、10001 mixed 的固定顺序执行。每例先运行原 before 控制组，再立即运行 after。每个 phase 均按原方法执行 1 次首次 manual 记录预热，以及 2 次计时的幂等恢复和 query2。

每例重新使用冻结 before 记录的原 fixture 绝对目录；目录必须不存在。正常 fixture 重建同一个完整 commit OID。before 使用原公开 owner 和原 f70 caller。after 只在正常 Publication fixture 建立后采用新 runtime 和隔离 consumer projection。两阶段使用完全相同的扩展 observer。

新 after 必须同时通过原 188 项绝对检查，以及相对本组新 before 的同等门槛：128 路径的 manual/query2 各改善至少 5%；10001 路径各改善至少 30%；首次 manual 不超过对应新 before 的 1.05 倍。原 before 数值、原上限和原 evaluator 均不变。

每个 phase 前后记录 UTC、系统 load average、CPU 核数、进程数和 CPU 排名前 12 位的 executable 名。每个 Python 子进程另记自身 user/system CPU 秒。主会话暂停重负载检查。监测数据不用于选择样本、等待较快窗口或删除失败样本。

所有源码和测量脚本的校验和已登记在 paired-validation-protocol.json。正式执行前提交本协议。源码变化、技术失败或门槛失败均保留证据并明确报告。

协议不会把本地 provider fixture 解释为 live GitHub、AI 审查或下游采用。
