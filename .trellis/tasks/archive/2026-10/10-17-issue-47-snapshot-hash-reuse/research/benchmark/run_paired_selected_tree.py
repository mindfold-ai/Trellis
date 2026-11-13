"""ONE preregistered complete paired validation; never selects individual samples."""
from pathlib import Path
import os,subprocess,time,json,hashlib,datetime,statistics
HERE=Path(__file__).resolve().parent
CASES=[(3,'repeated'),(30,'repeated'),(128,'repeated'),(128,'mixed'),(10001,'repeated'),(10001,'mixed')]
PYTHON='/opt/homebrew/bin/python3.14'
def hashes(directory):return {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(directory.glob('*.py'))}
def host_snapshot():
 process=subprocess.run(['ps','-axo','pid,ppid,pcpu,pmem,comm'],capture_output=True,text=True)
 rows=[]
 for line in process.stdout.splitlines()[1:]:
  fields=line.split(None,4)
  if len(fields)!=5:continue
  try:rows.append({'pid':int(fields[0]),'ppid':int(fields[1]),'cpu_percent':float(fields[2]),'memory_percent':float(fields[3]),'executable':Path(fields[4]).name})
  except ValueError:pass
 return {'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'load_average_1_5_15':list(os.getloadavg()),'logical_cpu_count':os.cpu_count(),'process_count':len(rows),'top_cpu_processes':sorted(rows,key=lambda r:r['cpu_percent'],reverse=True)[:12]}
manifest=HERE/'paired-protocol-selected-tree.json'
assert manifest.exists(),'Preregistration is required'
protocol=json.loads(manifest.read_text())
assert protocol['cases']==[[n,v] for n,v in CASES]
source=Path('/Users/wumengye/Documents/GoProjects/Trellis/.trellis/scripts/common')
source_before=hashes(source)
assert source_before==protocol['after_runtime_source_checksums'],'Source differs from preregistration'
assert not (HERE/'paired-selected-tree-run.json').exists(),'This one cohort has already been started; no rerun'
record={'protocol_sha256':hashlib.sha256(manifest.read_bytes()).hexdigest(),'source_checksums':source_before,'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'phases':[]}
(HERE/'paired-selected-tree-run.json').write_text(json.dumps(record,indent=2)+'\n')
for count,variant in CASES:
 for phase in ['control-before','after']:
  runtime_root=Path('/tmp/trellis-47-residual-benchmark' if phase=='control-before' else '/tmp/trellis-47-residual-after')
  metrics=runtime_root/f'metrics-{count}-{variant}'
  if metrics.exists():
   preserved=runtime_root/f'pre-selected-tree-{phase}-metrics-{count}-{variant}'
   assert not preserved.exists(),'Do not overwrite prior evidence'
   metrics.rename(preserved)
  env=dict(os.environ,BENCH_COUNT=str(count),BENCH_VARIANT=variant,BENCH_CONTROL_BEFORE='1' if phase=='control-before' else '0',PINNED_GURU=str(runtime_root/'guru'))
  env.pop('BENCH_DIAG_ONLY',None)
  entry={'case':f'{count}-{variant}','phase':phase,'host_before':host_snapshot()}
  target=HERE/f'{phase}-{count}-{variant}.json'
  with target.open('w') as output:
   run=subprocess.run([PYTHON,str(HERE/'run_after.py')],env=env,stdout=output,stderr=subprocess.PIPE,text=True)
  entry.update(returncode=run.returncode,stderr=run.stderr,host_after=host_snapshot())
  record['phases'].append(entry)
  (HERE/'paired-selected-tree-run.json').write_text(json.dumps(record,indent=2)+'\n')
  print(phase,count,variant,run.returncode,flush=True)
  assert run.returncode==0,'Whole cohort fails; no individual case retry'
  assert source_before==hashes(source),'Source changed during paired cohort'
record['completed_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
(HERE/'paired-selected-tree-run.json').write_text(json.dumps(record,indent=2)+'\n')
# Original absolute evaluator and frozen limits remain unchanged.
subprocess.run([PYTHON,str(HERE/'evaluate_results.py')],check=True)
checks=[]
for count,variant in CASES:
 case=f'{count}-{variant}';before=json.loads((HERE/f'control-before-{case}.json').read_text());after=json.loads((HERE/f'after-{case}.json').read_text())
 checks.append({'check':case+'/exact_head','passed':before['git_commit']==after['git_commit']})
 checks.append({'check':case+'/same_candidate_count','passed':before['paths_including_deleted']==after['paths_including_deleted']})
 if count<=30:continue
 factor=.95 if count==128 else .70
 for kind in ['manual','query2']:
  b=statistics.median(r[kind+'_seconds'] for r in before['rows'] if not r['warmup']);a=statistics.median(r[kind+'_seconds'] for r in after['rows'] if not r['warmup'])
  checks.append({'check':case+'/'+kind+'_paired_gain','passed':a<=b*factor,'before_seconds':b,'after_seconds':a,'after_max_seconds':b*factor})
 b=before['rows'][0]['manual_seconds'];a=after['rows'][0]['manual_seconds']
 checks.append({'check':case+'/fresh_manual_no_regression','passed':a<=b*1.05,'before_seconds':b,'after_seconds':a,'after_max_seconds':b*1.05})
absolute=json.loads((HERE/'evaluation.json').read_text())
(HERE/'paired-selected-tree-evaluation.json').write_text(json.dumps({'absolute_frozen_checks_passed':absolute['passed'],'paired_checks':checks,'paired_checks_passed':all(c['passed'] for c in checks),'passed':absolute['passed'] and all(c['passed'] for c in checks)},indent=2)+'\n')
