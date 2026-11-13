# 用户修订后的独立验收与合并审核

## 结论

**按用户明确修订后的合同，当前实现满足合并前技术验收，可进入提交修订文档、标准CI及合并流程。** 没有剩余确认的实现缺陷。该结论不表示旧时间门槛通过，也不表示Task已经交付完成。

本报告按check.jsonl→PRD→design→implement读取当前Task，再读取acceptance-revision/status及既有完整证据。范围覆盖`0e3b23a3..HEAD`的全部残余实现、测试、规格、版本、测量及安装变更，包含当前未提交的验收修订文档。审查时HEAD为`3c8889b7f8f8b1191023083658302977a3b8d965`。本报告是default quality意见，不写正式生命周期结果。

用户原话为：“你没有必要将性能验收卡得那么紧，毕竟一开始定的指标也是拍脑瓜定出来的”。当前修订明确取消原估定绝对时间与固定百分比的阻塞作用；正确性、逐输入独立校验、内容复用、资源、质量、安装和正式交付要求继续有效。本审核接受该权限变更，不另设恰好能通过的数值。

旧Mac仍为183/188、21/24 FAIL；Ubuntu仍为181/188、22/24 FAIL。冻结文件、原失败、此前审核和原数值没有变化。这次结论变化来自用户修订需求，而非重新计算、重测或改判旧数据。

## 强制技术条件

|条件|审核结果|
|---|---|
|原摘要兼容|PASS。原oracle、路径排序、UTF-8、mode、删除项及字节一致；公开文件系统签名和API1.0外形不变。|
|逐输入校验|PASS。每次独立检查完整commit OID、字面路径、类型/mode和对象可用性；缓存不能跳过验证。原可变文件、HEAD/index/worktree与历史预期比较保持独立。|
|操作内复用|PASS。同一实际仓库/操作内唯一blob计算一次内容SHA；3/30精确探针4/31→2/2；隔离迁移直接消费公开Git能力，无重复物化快照读取、私有import、inode authority或跨调用cache。|
|资源边界|PASS。4096请求含commit metadata；参数64KiB含固定参数；正文分块/临时文件，不常驻整批；成功/异常清理。原正文、hash、snapshot及单进程RSS检查均通过。|
|原能力保留|PASS。原44项复验、28项公开恢复/历史fixture通过；旧Task/local_commit保留128默认和原协议。|
|代码质量|PASS。既有lint、TS/Python types、Python3.9编译、build及正常hook2828pass/1skip已独立核验。新CI工具/workflow也通过静态审核与正常hook/标准CI。|
|候选安装|PASS。两份tgz摘要及1013文件tar→node_modules字节/mode已独立核对。公开writer投影、0755、重应用、drift、sidecar通过。未发布候选不替代正式Release。|
|性能公开评价|满足修订合同。全部历史结果保留；当前两侧配对结果与所有历史组详列。没有隐去负向小规模变动，也未把平台速度当实现收益。|

生产源码、测试和包版本与69033a66逐字节一致；canonical/dogfood一致。本轮没有改生产、重跑测试或计时。已有测试不会因需求文档修订而失效；合并仍应等待目标文档提交的正常标准CI。

## 当前实现的同环境完整操作

表中变动为after/before−1；负数表示更快，正数表示更慢。每行before与after来自同一完整cohort的同环境控制组。Mac与Ubuntu不互相比较绝对快慢。

|环境|case/操作|before中位秒|after中位秒|耗时变动|
|---|---|---:|---:|---:|
|Mac-final-controlled-policy|128-repeated/manual|0.703124500|0.716653646|+1.92%|
|Mac-final-controlled-policy|128-repeated/query2|0.650888271|0.630829021|-3.08%|
|Mac-final-controlled-policy|128-mixed/manual|0.737177917|0.731360125|-0.79%|
|Mac-final-controlled-policy|128-mixed/query2|0.668364417|0.634785583|-5.02%|
|Mac-final-controlled-policy|10001-repeated/manual|3.269203417|1.265589105|-61.29%|
|Mac-final-controlled-policy|10001-repeated/query2|2.982140354|1.066750271|-64.23%|
|Mac-final-controlled-policy|10001-mixed/manual|3.377804229|1.429469188|-57.68%|
|Mac-final-controlled-policy|10001-mixed/query2|3.157555125|1.246299291|-60.53%|
|Ubuntu-cohort1|128-repeated/manual|0.853465461|0.800218714|-6.24%|
|Ubuntu-cohort1|128-repeated/query2|0.774637925|0.708678939|-8.51%|
|Ubuntu-cohort1|128-mixed/manual|0.845081375|0.815337243|-3.52%|
|Ubuntu-cohort1|128-mixed/query2|0.774319104|0.740235096|-4.40%|
|Ubuntu-cohort1|10001-repeated/manual|4.919971660|1.854791400|-62.30%|
|Ubuntu-cohort1|10001-repeated/query2|4.572528250|1.553990953|-66.01%|
|Ubuntu-cohort1|10001-mixed/manual|5.220020355|2.273483433|-56.45%|
|Ubuntu-cohort1|10001-mixed/query2|4.902767495|1.976741985|-59.68%|

Mac128重复内容manual增加约13.529ms（1.92%）；其余三个Mac128场景降低约0.79%–5.02%。Ubuntu四个128场景均降低约3.52%–8.51%。不能宣称小规模各环境都加速，也不能仅从两次样本的中位数断言统计显著性或环境因果。

当前完整10001配对结果在两种环境下均有实际收益：manual约56.45%–62.30%，query2约59.68%–66.01%。这些收益包括原wrapper、客观校验和固定provider调用；不只是摘要微基准。它们不能代表真实GitHub网络或AI语义判断。

## 全部历史组的可见性

下表保留每个实现代际的128结果，未取最快组。generation1/2/3partial/4没有新配对控制，比较对象为原Mac冻结baseline；测量时点不同，不能与freshpaired等价，也不能把不同源码的数值拼接。generation3partial因源码正确性修复停止，不是完整接受组。

|组|case|manual after秒（变动）|query2 after秒（变动）|before来源|
|---|---|---:|---:|---|
|Mac-generation1|128-repeated|0.667453 (-1.69%)|0.588039 (-3.91%)|原Mac冻结baseline|
|Mac-generation1|128-mixed|0.672241 (-0.11%)|0.580269 (-3.77%)|原Mac冻结baseline|
|Mac-generation2|128-repeated|0.650935 (-4.12%)|0.565737 (-7.55%)|原Mac冻结baseline|
|Mac-generation2|128-mixed|0.657452 (-2.31%)|0.575432 (-4.57%)|原Mac冻结baseline|
|Mac-generation3-partial|128-repeated|0.604160 (-11.01%)|0.543515 (-11.18%)|原Mac冻结baseline|
|Mac-generation3-partial|128-mixed|0.611125 (-9.19%)|0.528586 (-12.34%)|原Mac冻结baseline|
|Mac-generation4|128-repeated|0.648697 (-4.45%)|0.564985 (-7.67%)|原Mac冻结baseline|
|Mac-generation4|128-mixed|0.683960 (+1.63%)|0.611453 (+1.40%)|原Mac冻结baseline|
|Mac-generation5-paired|128-repeated|0.632616 (-6.38%)|0.540925 (-9.83%)|fresh paired|
|Mac-generation5-paired|128-mixed|0.639480 (-6.63%)|0.548766 (-9.83%)|fresh paired|
|Mac-generation6-selected-tree|128-repeated|0.651933 (-8.12%)|0.565083 (-12.09%)|fresh paired|
|Mac-generation6-selected-tree|128-mixed|0.678548 (-4.92%)|0.597219 (-6.68%)|fresh paired|
|Mac-final-controlled-policy|128-repeated|0.716654 (+1.92%)|0.630829 (-3.08%)|fresh paired|
|Mac-final-controlled-policy|128-mixed|0.731360 (-0.79%)|0.634786 (-5.02%)|fresh paired|
|Ubuntu-cohort1|128-repeated|0.800219 (-6.24%)|0.708679 (-8.51%)|fresh paired|
|Ubuntu-cohort1|128-mixed|0.815337 (-3.52%)|0.740235 (-4.40%)|fresh paired|

`revised-acceptance-review.json`逐行保存所有保留组的3/30/128/10001、manual/query2中位数、首次观察和比较来源。generation3partial只按其README列出的五个已执行case纳入比较；不将目录中其他文件当作该组的新观测。未完成case不补造。历史原资源、计数、失败及原始进程文件仍在各原目录；本报告不覆盖它们。

## 是否存在已证实的退化缺陷

当前没有确认且未修复的摘要正确性、独立验证、资源或可归因实现的性能退化缺陷。曾确认的全树元数据扫描浪费和目录混合选择缺陷已修复；当前只查询精确路径，并保留目录类型拒绝。

Mac某小规模观察变慢是真实数据，必须披露。现有样本没有把该变化定位为某个新实现中的可避免成本。新owner减少Git启动、物化读取和重复hash；语义与资源检查无退化。不能将未定位变化说成“必然环境噪声”，也不能据此发明一个未经证实的代码缺陷。当前不支持为追逐旧估定门槛继续扩大API或修改下游正式代码。

nested诊断只说明那次Mac方法区间及补集均可解释；它既不证明数值不可能，也不替代原接受观察。该诊断不是本次合并判断的通过样本。

## 合并就绪与交付边界

合并建议为READY：提交当前修订依据和本报告，等待该目标提交的标准CI通过后，可合并PR50。不要把ready解释为旧188/24通过。

Task目前仍未完成。合并后还必须交付精确来源、配对版本锁定的不可变安装包及校验和，并验证下载资产和隔离重装。之后才可更新/关闭Issue和通过原生owner归档本Task。临时benchmarkworkflow按既定计划移除。下游#589的匹配采用、正式集成和原Task Completion仍由下游承担。本报告不替代这些事实。
