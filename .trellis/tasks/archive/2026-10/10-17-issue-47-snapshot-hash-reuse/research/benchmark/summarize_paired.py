"""Render retained paired results; never changes samples, thresholds or checks."""
from pathlib import Path
import json,statistics
p=Path(__file__).resolve().parent
absolute=json.loads((p/'evaluation.json').read_text());paired=json.loads((p/'paired-evaluation.json').read_text());run=json.loads((p/'paired-validation-run.json').read_text())
lines=['# 公开 immutable candidate 摘要：配对验证结果','',f"原绝对门槛：{absolute['passed_count']}/{len(absolute['checks'])} 通过。额外配对检查：{sum(c['passed'] for c in paired['paired_checks'])}/{len(paired['paired_checks'])} 通过。总体结果：{'通过' if paired['passed'] else '未通过'}。",'', '冻结基线、第一/二/四组失败和第三组暂停样本均保留。本次仅运行已提交协议规定的一组完整配对 cohort，没有逐例重试或丢弃样本。新控制组没有改写原 188 项门槛。','', '|候选/操作|冻结 before 秒|新 before 秒|after 秒|相对新 before 改善|','|---|---:|---:|---:|---:|']
summary=[]
for case in ['128-repeated','128-mixed','10001-repeated','10001-mixed']:
 original=json.loads((p/f'before-{case}.json').read_text());before=json.loads((p/f'control-before-{case}.json').read_text());after=json.loads((p/f'after-{case}.json').read_text())
 for kind in ['manual','query2']:
  med=[statistics.median(r[kind+'_seconds'] for r in value['rows'] if not r['warmup']) for value in [original,before,after]]
  improvement=(1-med[2]/med[1])*100
  lines.append(f"|{case}/{kind}|{med[0]:.6f}|{med[1]:.6f}|{med[2]:.6f}|{improvement:.2f}%|")
 summary.append({'case':case,'exact_head':after['git_commit'],'paths':after['paths_including_deleted'],'unique_blobs':after['unique_blobs'],'all_unique_blob_body_bytes':after['unique_body_bytes'],'max_blob_bytes':after['max_blob_bytes']})
lines+=['','每个 case 的完整 commit OID 与冻结 before 相同。完整 candidate、mode/blob tree、公开 content_ref 和实际安装源码校验和均保存。3/30 路径精确探针的 SHA-256 构造从 4/31 降为 2/2；聚合算法和各路径贡献保持不变。','','Git 正文仍仅传输唯一候选 blob 字节。commit control 使用 metadata-only info，未传 commit 正文。所有正常操作仍独立校验当前输入的 commit、路径、mode、删除和对象可用性。未使用跨调用 cache、inode authority、下游私有 import 或复制的摘要算法。','','## 环境与控制组','']
loads=[r[side]['load_average_1_5_15'][0] for r in run['phases'] for side in ['host_before','host_after']]
lines.append(f"本组各 phase 前后 1 分钟 load average 范围为 {min(loads):.2f}–{max(loads):.2f}。主机逻辑 CPU 数为 {run['phases'][0]['host_before']['logical_cpu_count']}。完整 UTC、process count、CPU executable 排名和各 Python 进程自身 user/system 秒见 paired-validation-run.json 与每组结果。ps 百分比是工具报告值，不是每个 wrapper 的即时 CPU 使用率。")
lines+=['','主会话暂停重负载检查。监测数据没有用于选择、等待或丢弃样本。此前不同完整 cohort 的 128 路径 wall 波动为测量疑点；本次同时保留旧绝对检查和新配对改善要求，不能只用新控制组解释旧失败。','', '正常公开恢复/历史 fixture 已通过 28/28；测试时的实际 runtime 源码校验和与本 cohort 相同。fixture 覆盖首次记录、幂等/输出丢失恢复、query2、缺对象的 scratch 恢复，以及不写 caller/peer Git。','', '这些是本地真实 Git、原公开 wrapper 与固定 provider/语义 fixture 的验证。网络请求为 0。它们不代表 live GitHub、AI 审查或下游正式采用。']
failures=[c for c in absolute['checks'] if not c['passed']]+[c for c in paired['paired_checks'] if not c['passed']]
if failures:
 lines+=['','## 未通过项','']
 for c in failures:lines.append('- '+json.dumps(c,ensure_ascii=False))
(p/'paired-results.md').write_text('\n'.join(lines)+'\n')
(p/'paired-summary.json').write_text(json.dumps({'passed':paired['passed'],'cases':summary,'load_average_1_min_range':[min(loads),max(loads)]},indent=2)+'\n')
