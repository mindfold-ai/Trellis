# 精确路径 metadata 修复后的完整配对验证：实施前登记

上一组原绝对检查通过 187/188，额外配对检查通过 24/24。唯一失败仍保留：128 mixed manual 超出原上限 136.232 微秒。没有按精度或容差改判。

随后发现实际 metadata 范围回归：新入口读取完整 tree，而原 pinned CandidateObjects 仅按 64 KiB argv 批次读取请求路径。真实 Trellis HEAD 的只读探针中，全树为 3498 行、417555 字节；两个实际文件和一个缺失路径的原精确读取为 2 行、216 字节。修复后的 helper 保留 `-t`，以识别同时请求的 parent directory，读取 13 行、1061 字节，并将结果 dictionary 过滤为 2 个精确请求文件。仍显著缩小全树 metadata 范围。本次只修复该范围，不删除独立 commit、blob 可用性或路径/mode/删除检查。

修复源码稳定后，在计时前登记新 source 和工具校验和并提交此协议。随后只运行一组完整配对 cohort。case 顺序、before→after 顺序、每 phase 的 1 次首次记录预热和 2 次计时恢复/query2，均与前一已登记协议一致。原 before、原 188 项绝对门槛和原 evaluator 保持不变。额外 24 项检查仍要求相同 head/path 数，以及相对新 before 的 5%/30% 改善和首次记录不超过 1.05 倍。

精确输入 replay、正常 Publication 后 runtime 采用、两阶段相同 observer、metadata/正文分别计量、host load/CPU 观察、无逐例重试或样本丢弃等规则全部保持不变。旧完整 cohort 和失败结果按原样保存，不拼接不同源码的样本。

新 cohort 使用独立 protocol/run/evaluation 文件。正式执行须等待本协议提交信号。
