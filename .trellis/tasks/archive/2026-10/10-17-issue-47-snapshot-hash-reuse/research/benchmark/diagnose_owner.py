"""Untimed-gate owner breakdown: normal invoke with synthetic provider.

Diagnostic only. This does not add, replace or select performance samples.
"""
from pathlib import Path
import os,sys,json,time,subprocess,importlib.util,shutil,statistics
HERE=Path(__file__).resolve().parent
kind=os.environ.get('OWNER_DIAG_KIND','before')
if kind=='after':os.environ['PINNED_GURU']='/tmp/trellis-47-residual-after/guru'
def profile_owner(fixture):
 if kind=='after':
  common=fixture.repo/'.trellis/scripts/common';shutil.copytree('/Users/wumengye/Documents/GoProjects/Trellis/.trellis/scripts/common',common,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__'))
  from runtime.delivery_projection.adapter import upstream_modules
  import hashlib
  namespace='guru_delivery_target_'+hashlib.sha256(str(common.resolve()).encode()).hexdigest()[:16]
  for loaded in list(sys.modules):
   if loaded==namespace or loaded.startswith(namespace+'.'):del sys.modules[loaded]
  fixture.projection.api=upstream_modules(fixture.repo)
 package=Path(os.environ.get('PINNED_GURU','/tmp/trellis-47-residual-benchmark/guru'))/'trellis/skills/guru-team/packages/guru-merge-task-delivery'
 fixture.flow.load_owner(package.name)
 spec=importlib.util.spec_from_file_location('diagnostic_original_manual',package/'runtime/manual_recovery.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 rows=[];original=subprocess.run
 def observed(args,*a,**kw):
  start=time.perf_counter()
  try:return original(args,*a,**kw)
  finally:rows.append({'argv':list(map(str,args)),'seconds':time.perf_counter()-start})
 subprocess.run=observed
 start=time.perf_counter()
 try:
  value=module.invoke(fixture.repo,package,fixture.public,fixture.review());elapsed=time.perf_counter()-start
 finally:subprocess.run=original
 out={'kind':kind,'elapsed_seconds':elapsed,'typed_exit':value['exit_id'],'subprocesses':rows,'subprocess_total_seconds':sum(row['seconds'] for row in rows),'non_subprocess_seconds':elapsed-sum(row['seconds'] for row in rows)}
 (HERE/f'owner-diagnostic-{kind}.json').write_text(json.dumps(out,indent=2)+'\n')
 fixture.doCleanups();raise SystemExit(0)
h=HERE/'residual_benchmark.py';source=h.read_text();needle='fixture=m.ManualRecoveryTests();fixture.setUp()';source=source.replace(needle,needle+';profile_owner(fixture)')
exec(compile(source,str(h),'exec'),{'__file__':str(h),'__name__':'__main__','profile_owner':profile_owner})
