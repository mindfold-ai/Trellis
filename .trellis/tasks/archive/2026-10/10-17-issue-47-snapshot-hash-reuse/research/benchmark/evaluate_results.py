"""Evaluate immutable numeric gates without changing or dropping samples."""
from pathlib import Path
import json,statistics,argparse
p=argparse.ArgumentParser();p.add_argument('--directory',default=str(Path(__file__).resolve().parent));a=p.parse_args();root=Path(a.directory);gates=json.loads((root/'frozen-standards.json').read_text());checks=[]
def check(name,passed,actual,limit):checks.append({'check':name,'passed':bool(passed),'actual':actual,'limit':limit})
for case,g in gates['cases'].items():
 after=json.loads((root/f'after-{case}.json').read_text());before=json.loads((root/f'before-{case}.json').read_text())
 check(case+'/same_exact_commit',after['git_commit']==before['git_commit'],after['git_commit'],before['git_commit'])
 for kind in ('manual','query2'):
  median=statistics.median(r[kind+'_seconds'] for r in after['rows'] if not r['warmup']);limit=g['after_median_max_seconds'][kind]
  check(case+'/'+kind+'_median_seconds',median<=limit,median,limit)
 check(case+'/first_record_seconds',after['rows'][0]['manual_seconds']<=g['after_fresh_first_manual_max_seconds'],after['rows'][0]['manual_seconds'],g['after_fresh_first_manual_max_seconds'])
 check(case+'/oracle',after['oracle_equal'],after['oracle_equal'],True)
 for operation,res in after['resources'].items():
  if operation=='component':continue
  py=res['python_processes'];git=res['git_processes'];peak_py=max([v['python_process_peak_rss_bytes'] for v in py]or[0]);peak_git=max([v['peak_rss_bytes'] or 0 for v in git]or[0])
  check(case+'/'+operation+'/python_peak_bytes',peak_py<=134217728,peak_py,134217728)
  check(case+'/'+operation+'/git_peak_bytes',peak_git<=33554432,peak_git,33554432)
  commands=[v for v in py if v['argv'] and v['argv'][0].endswith('runtime/command.py')];assert len(commands)==1,(case,operation,commands)
  command=commands[0]
  check(case+'/'+operation+'/snapshot_read_bytes',command['snapshot_read_bytes']==0,command['snapshot_read_bytes'],0)
  check(case+'/'+operation+'/content_sha256',command['content_sha256']<=after['unique_blobs'],command['content_sha256'],after['unique_blobs'])
  check(case+'/'+operation+'/aggregate_sha256',command['aggregate_sha256']<=1,command['aggregate_sha256'],1)
  batches=command.get('git_batches',[]);requested=sum(b['requested_objects'] for b in batches);body_bytes=sum(b['successful_body_bytes'] for b in batches)
  check(case+'/'+operation+'/body_requests',requested<=after['unique_blobs'],requested,after['unique_blobs'])
  check(case+'/'+operation+'/body_bytes',body_bytes<=after['unique_body_bytes'],body_bytes,after['unique_body_bytes'])
result={'passed':all(c['passed'] for c in checks),'checks':checks,'passed_count':sum(c['passed'] for c in checks),'failed_count':sum(not c['passed'] for c in checks)}
(root/'evaluation.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'passed':result['passed'],'passed_count':result['passed_count'],'failed_count':result['failed_count'],'failures':[c for c in checks if not c['passed']]},indent=2))
