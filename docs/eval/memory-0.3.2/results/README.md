# 2026-10-20 召回结果

2026-10-22 审计后：宿主重跑使用 [协议 v2](../protocol-v2.md)。历史对照中的关键词评分、混合版本安装、历史隔离和失败分类不足以支持正式推广结论；[审计补充](protocol-2026-10-22-audit.md) 保留具体问题。旧数据继续作为历史探索记录。

这次只跑了 mini-trellis 0.3.1 的 `mem recall`。四题各 3 次，都判对。明细在 [recall.json](./recall.json)。

| 题 | 对 | 现行笔记在前三条 | 被替代笔记靠后 | 无依据时零命中 | 召回 JSON 字符 |
| --- | --- | --- | --- | --- | --- |
| 无历史依赖 | 是 |  |  | 是 | 76 |
| 现行限制优先 | 是 | 是 | 是 |  | 1391 |
| 找回否决条件 | 是 | 是 |  |  | 1780 |
| 摘要前的具体限制 | 是 | 是 |  |  | 583 |

轮次、宿主输入 token、输出 token、缓存 token 都空着。注入字符数是一次 `mem recall` 结果的 JSON 长度，没有用分词器换算。没有失败、超时或旧 CLI。

缺的真机表：

| 对象 | 缺什么 |
| --- | --- |
| mini-trellis 0.3.1 | 完整代理回路。上表只是召回命中。 |
| Trellis 0.7.0-beta.4，阶段流程开着 | 完整代理回路。 |
| Comet | 能在这份笔记上跑的环境。没有百分比。 |

2026-10-21 的 dsh 真机在 [dsh-flash-1017.md](./dsh-flash-1017.md)。Claude Code 那一臂没有跑成。

2026-10-22 的 dsh 开发任务在 [dsh-pipeline-task.md](./dsh-pipeline-task.md)。不点文件名的入口对比在 [context-cost.md](./context-cost.md)。历史仓库的三次重复在 [protocol-2026-10-22.md](./protocol-2026-10-22.md)。

Claude Code 上 mini-trellis 和 Trellis 的对比在 [v2-claude.md](./v2-claude.md)。
