# Current Direct Source snapshot

Refreshed on 2026-10-13 after the human-directed scope revision. Historical source is retained in `source-issue.md`; current live Issue remains authority.

URL: https://github.com/castbox/Trellis/issues/31

Updated: 2026-10-12T23:14:58Z

# 建立原生 Delivery 概念并解耦 Task 生命周期，迁移 task.status 开发阶段合同

## 问题与共识

Trellis 当前用 task.status 表达 planning/in_progress/completed，并由 CLI、SDK、hook、平台入口据此推导开发阶段。一个 Task 多次 Delivery 后，Task 的整体责任与每次 Delivery 的规划、实施、验证及发布被耦合。首个 Delivery 的规划也必须归 Delivery，不能保留 Task Planning 与 Delivery Planning 两个竞争入口。

本 Issue 的目标是建立可独立使用和验收的原生 Delivery 生命周期：Task schema 2.0 / Delivery API 1.0 与版本化 SDK `/task/v2` 不再依赖 task.status 推导开发阶段，原生新安装采用该模型，并提供可审核的旧安装迁移。

## 当前范围与独立完成条件（2026-10-13 修订）

按人类 owner 的明确指示，#31 与下游 #531 不设任务前置或完成依赖关系；#31 不被其进度、候选、私有迁移或验收结果阻塞，不要求联合验收。#31 以本仓原生闭环、公共 API/平台注入、受控自定义 workflow 契约、版本诊断和可审核迁移的实际证据独立完成。

保留旧 SDK `/task`、plan-1.0 迁移和显式 legacy workflow 作为隔离兼容路径；schema-2 运行不得使用旧 Task status 或双写 authority。全局替换旧公共 SDK、删除 inferTaskPhase 及破坏性退役旧执行路径移出本 Issue，归后续独立 breaking-release 工作，其自身需要替代接口/版本公告与受影响 consumer 的迁移证据。这里明确保留兼容事实，不声称退役已实现。

下文 Guru 来源和映射用于通用接口设计与 owner 边界参考；真实 Guru 安装集成、私有历史迁移、业务会话恢复和正式软件发布均不属于 #31 完成门禁。 原生 local/manual/Git-free 使用真实 owner 闭环样例；PR-based 公共 owner/事实/恢复合同使用源码和客观 verifier fixtures 定向验证，明确不声称真实 schema-2 远端 publish/merge owner 执行，后者不属于本次必需 live 样例。既有审查缺口按此范围变化重新评估，旧证据不改写为通过；仍要求同一最终候选连续两轮完整无问题审查。

## Guru 已有能力：必须先读的承接基线

Delivery 并非从零设计：Guru 已有多切片交付、独立 readiness、发布事务、合入恢复、交付历史发现与整体 Completion，只是尚未形成与 Task 分离的完整通用阶段模型。上游 Planning 必须读取下列来源并明确 retain/generalize/keep-in-Guru/migrate 的处置；不能只读本 Issue 后另造平行实现。

以下固定来源均为 `castbox/guru-trellis@a653c90b064e2435bc147f1bda0e1b7ab632f797` 的启动证据，这些是本次设计已读取的历史接口基线，不要求跟踪下游 Issue 进度；固定快照不构成已安装集成证据。

- [global workflow](https://github.com/castbox/guru-trellis/blob/a653c90b064e2435bc147f1bda0e1b7ab632f797/trellis/workflows/guru-team/workflow.md)：多 Delivery 路由、pair guard、Reconcile、Completion 回程。
- [Delivery Review](https://github.com/castbox/guru-trellis/blob/a653c90b064e2435bc147f1bda0e1b7ab632f797/trellis/skills/guru-team/packages/guru-review-task-delivery/SKILL.md)：独立 slice/readiness 判断、剩余工作与 Refs-only payload。
- [Publish contract](https://github.com/castbox/guru-trellis/blob/a653c90b064e2435bc147f1bda0e1b7ab632f797/trellis/skills/guru-team/packages/guru-publish-task-delivery/references/contract.md)：delivery_cycle_ref；push/bind_pr/converge_metadata/mark_ready/ready 私有事务与同计划恢复。
- [Merge/history](https://github.com/castbox/guru-trellis/blob/a653c90b064e2435bc147f1bda0e1b7ab632f797/trellis/skills/guru-team/packages/guru-merge-task-delivery/SKILL.md)：expected-head merge、Guru trailers、delivered/completion_seed、first-parent 历史与 GitHub 身份发现。
- [Completion](https://github.com/castbox/guru-trellis/blob/a653c90b064e2435bc147f1bda0e1b7ab632f797/trellis/skills/guru-team/packages/guru-review-task-completion/SKILL.md)：整项 scope、Delivery history、remaining_work/evidence_pending/additional_delivery_required，以及无需新交付的验证恢复。

## 两仓职责与明确交接

本节记录接口设计的职责边界，不建立跨仓任务依赖。Guru 门禁仍由其 canonical Skill 定义；本表不构成另一仓的步骤合同或 #31 的下游验收要求。

| 能力 | Trellis owner | Guru owner / 对接结果 |
|---|---|---|
| Task/Delivery 公共身份、关系、阶段、合法转换及查询 | 通用 schema/SDK/runtime 与原生 workflow | 消费同一接口；语义 owner 执行 Guru gate 后才提交转换，不另建 Delivery 状态存储 |
| 当前 Delivery 与会话恢复 | 通用 session/context/入口解析和可验证的 identity projection | 明确已有 binding/checkout/typed DTO 到公共 input 的薄 projection；无当前 Delivery 时区分待规划、仅 Completion/收尾及具体异常，不猜测、不自动新建 |
| Planning/Check/完整 Review | 原生 workflow 的实际 owner 与正式阶段调用 | 保留 Guru Author/Wording/Architecture/Approval/Check/Branch Review；原生入口按当前 workflow 路由，不先运行原生门禁后再重复 Guru 门禁 |
| Delivery 发布与合入 | 接受合法 owner 的最小结果，验证通用转换；提供原生适用交付路径 | Guru Review/Publish/Merge 保留 readiness、Refs-only、expected-head/trailers 和事务恢复；把实际结果投影到公共 Delivery 接口 |
| 旧数据迁移 | 自有 Task schema、内置 workflow/session/API 迁移接口与工具 | Guru 私有 cycle/DTO/checkpoint/发布事务/历史归属迁移由 Guru owner 执行；上游不得直接解析其私有文件 |
| 整体 Completion/Closure/归档清理 | 公共最小结果承接及内置 workflow 的独立语义 owner；归档执行与完成分离 | Guru 保留 causal Completion、Issue disposition、Finish/Cleanup/Reactivate 判断，投影公共结果；不重复独立完成记录 |

原生 Trellis 的 Delivery 不一律要求 GitHub PR、merge commit 或 Guru trailers。设计必须明确其现有受支持 local/manual/no-PR 交付如何完成；Guru 使用其既有 GitHub profile。profile 的完成条件由对应 Markdown owner 明确，上游不能把 Guru 发布政策硬编码为全局终态条件，也不能弱化 Guru 必需门禁。

需区分两个粒度：Delivery 公共阶段与 owner 私有执行事务。Publish 的 push_content/bind_pr 等是私有事务子步骤，不上提为所有 workflow 公共状态；公共阶段不能取代重试所需私有事务，也不记录用户授权。具体 coarse phase 名称由设计确定。

历史发现依旧从 Git/GitHub 重建可重建事实；迁移必须明确旧 cycle_ref/PR/merge 到新 Delivery identity 的归属与新 generation 的适用性，保留历史，不以旧 merge 推定当下 Planning/Check/Review 已通过。是否需要持久化映射由直接恢复 consumer 决定，不默认建立 ledger。

## 跨仓接口先行与切换验收

上游拥有可查询和校验的版本化公共接口合同，明确：Task/Delivery identity 与 generation 关系、current Delivery 查询、阶段转换输入输出及 writer、公共结果与私有 gate/transaction 边界、freshness/失效和恢复、整体完成/收尾、旧数据迁移、错误出口及不支持组合。

上游合同附已观察 Guru producer→公共 input→公共 output→consumer 的映射示例，并由本仓测试验证公共接口与自定义 owner 路由。真实下游采用由其 owner 自行决定和验收。既有安装内容与兼容合同须保留，不支持的版本组合在升级/应用前明确诊断；schema-2 与旧合同不得双写 authority。旧路径最终退出由后续 breaking-release 范围决定，不作为 #31 完成条件。

上游验收负责原生单/多 Delivery 闭环、公共 API/平台注入、受控自定义 workflow 契约、迁移/rollback/reapply，以及返工、clean 复核、输出丢失恢复和整体 Task 收尾。每条证据绑定本仓实际 source/package/API/schema 和观察层级；不要求 Guru candidate 或联合证据。真实 Guru 安装集成、私有迁移与团队门禁属于其 owner 的独立工作，未经验证不声称通过；既有 Release matrix 责任保持。

## 首次建立 Delivery：明确前置交付

当前上游尚无与本次共识对应的独立 Delivery 运行模型。本 Issue 必须先在 Trellis 建立并实际采用该概念，不能假设 Guru 的 Delivery 已是上游能力，也不能只移除 task.status 后要求 consumer 自行推断阶段。

Delivery 是一个 Task 下有明确交付范围、可独立审查和交付的工作单元。一个 Task 可以有多次 Delivery；创建 Task 后首个 Delivery 从自己的 Planning 开始，D1 与后继 Delivery 具有相同职责和合法回程。单次交付任务是仅有一个 Delivery 的正常情况，不保留旧 Task 阶段作为另一套默认流程。

上游拥有通用 Delivery 数据/身份与 Task 关系、当前 Delivery 解析、确定性读写/校验接口、会话上下文和跨平台注入支持，以及内置 workflow 对 Delivery 的实际采用。确切模型须在设计中明确：身份与范围的归属、规划产物定位、阶段事实及其 writer/consumer、已交付结果、返工与恢复、与 Task 整体完成的关系。不得把这些关键语义留成 generic meta、任意 status string 或未来 Guru 才补齐的隐含约定。

生命周期行为由内置/marketplace Markdown workflow 定义；runtime 提供执行和校验，不自动判定业务范围、批准或完成。Guru 拥有其团队特定 Planning/Review/Publication/Completion 门禁与政策；通用 Delivery 概念及基础接口不能只存在于 Guru overlay 中。

公共 Delivery 生命周期及合法转换由上游唯一合同定义，原生和 Guru 使用同一语义；workflow 可以在公共阶段内组织不同内部步骤和门禁，但不得另定义相互冲突的公共阶段。原生 local/no-PR 与 Guru PR-based 交付以明确受支持路径表达；具体枚举和路径由设计确定，不建立通用任意状态机引擎。

实施顺序：先审查并建立概念与公共合同，再交付通用运行能力和内置 workflow 采用，随后通过可审核迁移替换旧 Task 阶段消费者；不能先删字段再补模型。下游接口选择和集成计划由其 owner 独立负责，不参与 #31 的结束门禁。

## 三个独立职责

1. Task 拥有稳定身份、来源、整体需求与 accepted scope、总体验收、所属 Delivery 关系，以及绑定当前需求版本的整体完成结论。
2. Delivery 拥有本次交付边界及规划、实施、检查、完整审查、适用发布与交付完成的阶段及返工；PR-based 路径的交付完成须有真实合入，原生其它受支持路径使用其明确完成条件。D1 与后继 Delivery 使用同一生命周期；首次实施不依赖 Task planning→in_progress 激活。
3. 候选内容与证据有效性独立于阶段：已提交不等于已检查，检查通过不等于完整审查通过；内容、基线或 authority 变化仅失效实际受影响的结果。

Task 完成不能从“所有已知 Delivery 合入”自动推出；仍须由 workflow 的 AI Completion owner 审查整个 accepted scope、遗漏工作及适用验收。上游记录和校验最小完成结果，不代替判断。Closure、归档、清理分别保留结果和恢复责任；归档不制造完成，清理失败不撤销完成。展示的进行中/已完成可由权威事实投影，不维护第二写入 authority。

## 上游职责与工程范围

- 交付 TS/Python schema-2 canonical Task schema、writer、reader、factory、reviewed migration 和版本化公共 SDK `/task/v2`；该合同不包含 Task 开发 status 必填/default/字段顺序依赖。保留旧 SDK 的兼容声明，全局替换/退役不在本 Issue 范围。
- schema-2 消费者从 Delivery 查询阶段，不能调用旧 inferTaskPhase 推导 Task 开发阶段；明确版本、隔离兼容、迁移替代接口和后续退出边界。
- 为 workflow 提供直接 consumer 必需的 Delivery 身份、Task 关系及恢复所需最小事实。确切存储、字段和 API 由 Planning 决定，不预设 ledger、事件溯源或全量审计状态。
- 分离 task.py start 的会话绑定与 Delivery 开始实施；迁移 create、current、list/queue、子任务进度、archive、bootstrap/joiner 和相关 hooks。
- 审查 Task 单个 commit/pr_url 等一任务一交付假设，区分整体与 Delivery 事实，不能只删 status 后留下隐性旧模型。
- 迁移 shared Python hooks、Codex/Claude/Cursor/OpenCode/Pi/OMP 等实际声明平台入口和上下文输出。*-inline 是执行模式提示键，不是持久化状态；执行方式不得混入生命周期。
- 继续由 Markdown workflow/skill 定义语义、阶段、合法路由和门禁；脚本/SDK 仅执行确定性动作及校验，不把 scope、充分性、批准、完成或 route intent 写成程序判断。
- 通用上游必须承接随包内置 workflow 和自定义 marketplace workflow；不得硬编码 Guru 业务或私有运行状态。

## Delivery 状态机与原生 Skill 集成

上游必须交付具备明确阶段、合法转换、writer ownership 和恢复合同的 Delivery 生命周期，并让内置 workflow 和原生 start/continue/planning/check/review/finish 入口实际使用；仅增加 Delivery schema 或 SDK 而入口仍按 Task status 执行，不满足验收。

Markdown workflow/step-local Skill 拥有转换的语义条件和 route 判断；runtime/SDK 拥有确定性记录接口，校验 Delivery/Task identity、当前候选、预期阶段与客观前置条件，执行已作出的合法转换。不能由脚本推断 approval、Check pass 或整体完成。

- trellis-continue 解析当前 Task/Delivery、读取阶段及候选/证据适用性，依照当前 workflow 恢复唯一 owner；它不为了“继续”直接推进阶段，不自己记录其它 owner 的成功，也不只凭状态跳过 freshness 检查。
- Planning、实施、Check、完整 Review、Publication/Merge 的独立 owner 在真实行为和适用 semantic gate 完成后，通过统一确定性接口记录自身最小结果及其合法转换。Check passed 只表示检查通过，不能等同 Review passed、已发布或 Task 完成。
- 若 Skill 同时承担普通实现质量检查和正式 Delivery Check，必须明确独立 profile/consumer；不得让任意 trellis-check 调用都修改正式阶段。
- finding、需求/方案变化、基线变化和输出丢失按已有职责回到最早受影响 owner；保留未受影响的内容和结果。已提交事实与需要重新验证的阶段并存，状态退回不要求重复提交或其它副作用。
- 每个阶段的写入有唯一 owner；continue、展示与上下文注入是读取/路由 consumer，不能与阶段 owner 竞争写入。具体 transition API、阶段名称和恢复输入由设计审查确定，不能提供任意 set-status 来替代合法转换。
- 整体 Task Completion、Closure、归档、Cleanup 与 Delivery 状态机分别处理；原生 finish 必须明确当前 Delivery 收尾与整体 Task 收尾的职责，不能直接把两者等同。

公共接口允许自定义 workflow 使用同一 Delivery 模型和确定性操作；Guru 的实际采用及语义门禁由其 owner 独立负责。平台自动发现原生 Skill 时必须路由到当前 workflow 的正确 owner，不能启动竞争状态机、重复规划或绕过 Guru gate；同时保证不安装 Guru 的原生 workflow 独立可用。

## 正常转换与恢复要求

- D1 及后续 Delivery 各自从 Planning 开始；实施中方案变化返回该 Delivery Planning。
- 整体需求/验收变化先由正确语义 owner 更新唯一 authority，再重入受影响 Delivery；不创建 Task Planning 状态，不自动重置 Task 身份。
- 已交付 Delivery 保留历史交付事实；新需求由后继 Delivery 承接，并重新判断整体完成。
- 正常需求修订撤回或替代一个尚未交付 Delivery 的全部范围时，语义 owner 明确其退出处置，公共合同须支持停止该 Delivery 并解除当前执行绑定；不得强迫空实现/发布、伪记为已交付或删除其身份。具体终止表示由设计确定。部分范围变化仍按同一 Delivery 返工处理；已有提交、PR 或已发生的交付事实保留，PR 关闭与资源清理仍由各自 owner 在适用授权下执行。Completion 按修订后的 accepted scope 判断，既不能让已撤回义务永久阻塞，也不能把退出本身当作验收满足。
- 内容 findings、措辞修改、基线演进、输出丢失、跨回合/压缩恢复均只重做最早受影响阶段；保留仍有效结果，不复用过期 pass。
- 已提交 clean 候选经基线整合和 fresh Check 后可正式接续完整 Review；无真实增量时不制造空提交、重复提交或证明文件。
- 局部依赖缺失只阻塞对应 Delivery/场景；Task 身份与其它可推进部分保留。
- 整体完成后正式重开应保留历史完成/交付事实，明确新 generation 与 current authority；旧批准、整体完成及收尾结果不能直接充当新 generation 的通过结果。历史交付成果仍可由当前 Completion owner 审查其对当前 scope 的适用性，不要求重复交付；历史事实恢复与当前门禁通过必须区分。

## 必须闭合的身份、产物与跨 owner 正常恢复

- Delivery identity 在首次 Planning 前由明确 owner 建立，并在其返工、多个 commit、PR 更新、基线整合和输出丢失时保持。下一 Delivery 有不同 identity；旧 delivery_cycle_ref 是待映射的旧事实，不默认等同新 identity。Task generation、Delivery identity、计划/内容版本必须区分，不靠重开 Task 表达一次 Delivery 返工。
- 必须明确 Task 整体需求/验收与各 Delivery planning artifacts 的归属。D2 规划不能覆盖 D1 唯一可恢复规划；历史规划可由固定 Git 版本定位，无需逐轮复制。后继 Delivery 在首次 Planning 前与整体 scope 的关系由 AI 判断，runtime 不自行拆 scope。
- 当前会话无 Delivery 时，由 workflow 区分“创建首个/下一 Delivery”“Task Completion 补证据/验证”“Closure/归档/清理”或身份异常；不得统一创建 Delivery。Task 创建、整体需求修订与仅收尾都是合法无当前执行 Delivery 场景。
- Guru Publish/Merge 的远端动作成功后，公共 Delivery 结果/阶段投影可能尚未成功或输出丢失。原 transaction owner 用真实 PR/commit 事实恢复同一成功结果，公共接口按同一 Delivery/candidate/result 确定性接续；不再次 push/建 PR/merge。仅公共阶段滞后不使仍适用的已完成门禁失效；若同期内容、需求 authority、基线或门禁义务实质变化，仍由正确 owner 判断影响并重做受影响门禁，已发生的远端交付事实保持。反方向也不允许公共阶段超前声称未发生的远端成功。这是正常双接口接续，不引入分布式锁、跨仓原子事务或额外 crash 模型。
- 可恢复的最小 semantic 结果与公共阶段绑定必须有直接 consumer；阶段本身不能重建 approval。失效仍按内容、authority 和基线影响处理，不用“阶段已到达”代替证据。
- task-free 工作与用户独立手动 Git/GitHub 操作保留既有边界：没有 formal Task 的请求不为适配新模型强制创建 Task/Delivery，手动动作不自动产生正式 workflow pass。上游设计须 fresh 核验其实际支持路径；Guru 的 task-free 路由由 Guru 保留。

## 迁移与切换

上游迁移盘点自有旧 active/archived Task、session binding、branch/worktree、已有 PR 和恢复事实；仅迁移公共数据，Guru 私有状态不在本 Issue 范围。旧 planning/in_progress/completed 不能单独证明 Delivery 阶段或语义通过；缺失信息必须由 live facts 和原 owner 恢复或给出明确诊断，禁止补造成功。

保留文件、资源和业务交付，明确 schema/API/version 与兼容窗口；每个切换点不得产生 reader/writer 不一致或不可达入口。新项目、旧安装升级/reapply 和内置/自定义 workflow 必须实际可用。此为公共破坏性迁移，不能静默改变已有 API。

## 验收

1. Trellis 原生存在可使用的 Delivery 概念及公共运行合同；不用 Guru overlay 的新项目也能按内置 workflow 执行单次和多次 Delivery。新运行合同不靠 task.status 驱动或推导开发阶段，TS/Python/CLI/SDK/平台注入一致。
2. 单 Task 至少两次真实 Delivery 走完适用生命周期；D1 和 D2 无首次/后继分叉激活。
3. 正常实施返工、整体需求变化（含未交付范围撤回/替代后的合法退出）、clean 已提交候选复核及输出丢失均可正确承接，不制造提交或重复副作用；退出不冒充交付，不阻塞已修订 scope 的整体完成。
4. 整体完成、Issue 处置、归档与清理相互独立；合入和归档不能代替整体完成判断。
5. 旧 active/archived Task 与资源得到可审核迁移；不覆盖并行修改、不丢交付事实、不复用过期批准。
6. 声明平台、内置 workflow、受控自定义/marketplace 接口契约、更新/reapply 及公共 API 定向验证有实际上游证据；记录 exact source/package/API/schema。真实下游集成与联合验收不作为完成条件；完整发布矩阵与软件发布由明确 owner 承担，未验证边界披露。

## 原始断点与实际业务恢复的证据界限

代表性上游受控自定义 workflow 迁移验证采用旧 Task/交付/恢复公共事实的实际形态，不能只覆盖全新 Delivery。#149 活动重规划、#444 clean 已提交候选及 #155 局部依赖作为去敏场景参考；真实 Guru 私有/业务 installed 验收由其原 owner 独立负责，其结果不是 #31 必需证据。

上游原生和自定义接口验证可以在受控旧安装副本执行。原业务工作树安装与恢复仍归原 owner 并遵守该仓副作用边界；没有原工作树的实际接续证据，不声称原会话已恢复。#155 提供方业务合同和自身业务实现不属于这两个重构 Issue 的自动交付结果。

## 跨仓与边界

[castbox/guru-trellis#531](https://github.com/castbox/guru-trellis/issues/531) 是相关下游工作参考，语义 workflow、Skill、团队门禁与私有安装迁移由其 owner 自行处理。本 Issue 不设与它的前置/阻塞关系，不读取或等待其结果作为完成条件，不要求联合验收。上游单仓验收、真实下游集成和正式软件发布分别报告；任何采用新公共合同的 workflow 都不能双写第二 Task/Delivery authority。

正常案例来自 Backend #149 活动重规划、#444 clean 候选接续及 #155 局部依赖；这里只作为去敏复现类别，不硬编码业务仓。本 Issue 不授权修改业务 Task、部署、资源清理或关闭相关 Issue，不扩张为攻击模型、锁/竞态压力或 crash consistency 加固。
