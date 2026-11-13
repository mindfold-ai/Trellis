# 当前验收状态

## 当前合同

用户于 2026-10-17 修订性能验收口径。原估定绝对耗时和固定百分比不再阻塞交付。
修订说明见 `acceptance-revision.md`。旧冻结文件和失败样本保持原样。
本轮独立审核已通过修订后的技术验收，见 `revised-acceptance-review.md`。
实现与正式安装交付均已通过独立审核。Issue #47 已关闭；本 Task 已通过原生流程归档为 `completed`。

## 已有功能与质量证据

- 公开 `GitCandidateContent` 在同次操作内复用实际仓库的不可变 blob SHA256。
- 每次调用独立检查完整 commit、路径、类型、mode 和对象可用性。原文件系统入口保持兼容。
- 原 #48 能力复验通过 44/44。正常恢复与历史流程通过 28/28。
- 正常提交钩子通过：2828 项通过，1 项跳过。lint、类型、Python 3.9 编译和构建通过。
- [标准 CI 39012434651](https://github.com/castbox/Trellis/actions/runs/39012434651) 通过，提交为 `ef101a642f2f570a7268062005a52450e6666aef`。
- 未发布候选安装通过 7 项检查。两包的 1013 个文件字节和权限一致。此结果不是 Release 下载复验证据。

## 性能与资源证据

|环境|旧绝对检查|旧配对检查|旧标准结论|
|---|---:|---:|---|
|Mac，显式进程策略|183/188|21/24|FAIL，保留|
|Ubuntu cohort 1|181/188|22/24|FAIL，保留|

Ubuntu 128 路径混合内容的完整恢复改善 3.52%，历史查询改善 4.40%。
10001 路径的完整恢复改善约 56–62%，历史查询改善约 60–66%。
小规模 Mac 耗时存在波动；本次不宣称全部环境或每个场景均提速。
全部精确输入、摘要 oracle、正文读取、SHA 次数、快照读取和原资源检查通过。
独立复算与原 artifact 一致。全部正式结果和原始进程记录均已保全。

原始证据见 `benchmark/ci-cohort1/`、`benchmark/paired-controlled-policy-results.md` 和各历史 cohort。
嵌套诊断仅补充区间归属，不能替代验收样本，也不证明数值不可能性。
没有新设时间上限，没有重测择样，没有把历史 FAIL 改判为 PASS。

## 正式交付

[PR #50](https://github.com/castbox/Trellis/pull/50) 已合并至 main，源码为 `9f40ec70914f98fce2619560274cc1d0619f2f7e`。
精确 main CI 通过。`.4` 成对安装包已发布，标签绑定上述提交。
发布后重新下载的校验和、1013 个文件字节与权限，以及全部 7 项安装行为检查通过。
npm 发布 workflow 和 job 均为 skipped。
完整不可变来源与复验证据见 `release4/README.md` 和 `release4/verification.json`。

上游技术与安装交付已完成，最终独立交付审核通过。Issue #47 已关闭，实际结果见 `release4/issue-closure.json`。
本 Task 已通过原生流程归档，会话当前 Task 绑定已清空。归档提交的 CI、合并与 main 同步以 GitHub 实际结果为准。
下游 #589 的匹配采用、正式集成和原 Task Completion 仍由下游负责。
