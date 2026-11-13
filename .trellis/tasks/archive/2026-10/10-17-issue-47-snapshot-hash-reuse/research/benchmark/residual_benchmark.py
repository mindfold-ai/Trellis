"""Isolated public-wrapper benchmark. Exports never modify canonical Guru.
Run with PINNED_GURU, PINNED_FORK and BENCH_CASE environment variables.
"""
from pathlib import Path
import os,sys,json,time,importlib.util,hashlib,subprocess,resource,shutil
HERE=Path(__file__).resolve().parent
GURU=Path(os.environ.get('PINNED_GURU','/tmp/trellis-47-residual-benchmark/guru'))
FORK=Path(os.environ.get('PINNED_FORK','/tmp/trellis-47-residual-benchmark/fork'))
SKILLS=GURU/'trellis/skills/guru-team'
shutil.copyfile(HERE/'sitecustomize_metrics.py',SKILLS/'sitecustomize.py')
os.environ['TRELLIS_DELIVERY_API_COMMON']=str(FORK/'.trellis/scripts/common')
os.environ.update(GIT_AUTHOR_NAME='Local Test',GIT_COMMITTER_NAME='Local Test',GIT_AUTHOR_EMAIL='test@example.invalid',GIT_COMMITTER_EMAIL='test@example.invalid')
os.environ['GIT_AUTHOR_DATE']='2026-10-17T00:00:00Z'
os.environ['GIT_COMMITTER_DATE']='2026-10-17T00:00:00Z'
sys.path.insert(0,str(SKILLS))
# Minimal fixture-only diff: create candidate files before original feature commit,
# then supply those paths to original candidate()/begin_check().
f=SKILLS/'packages/guru-check-task/tests/test_delivery_flow.py'
original=f.read_text()
addition='''(self.repo / "app.txt").write_text("feature\\n")
        count = int(os.environ.get("BENCH_COUNT", "128"))
        variant = os.environ.get("BENCH_VARIANT", "repeated")
        self.benchmark_paths = []
        for i in range(count - 16 if count > 30 else count):
            locator = f"payload/f{i:05d}.bin"
            path = self.repo / locator
            path.parent.mkdir(exist_ok=True)
            if i < 3 and count > 30:
                data = bytes([65 + i]) * (4 * 1024 * 1024)
            elif variant == "mixed":
                data = (f"unique {i:05d}\\n".encode() * 160)
            else:
                data = b"repeated immutable content\\n" * 160
            path.write_bytes(data)
            path.chmod(0o755 if i % 17 == 0 else 0o644)
            self.benchmark_paths.append(locator)
        self.benchmark_paths.append("payload/deleted.bin")'''
modified=original.replace('(self.repo / "app.txt").write_text("feature\\n")',addition).replace('self.projection.candidate(["app.txt"],','self.projection.candidate(self.benchmark_paths,')
modified=modified.replace('self.git("init", "-q", "-b", "main")', 'self.git("init", "-q", "-b", "main")\n        subprocess.run([sys.executable, str(SKILLS / "runtime/bootstrap.py"), "--repo", str(self.repo), "--runtime-assets", str(SKILLS / "runtime"), "--python", sys.executable, "--json"], check=True, stdout=subprocess.PIPE)')
assert modified!=original
f.write_text(modified)
shim=GURU/'benchmark-bin';shim.mkdir(exist_ok=True)
real_git=shutil.which('git')
(shim/'git').write_text('#!/bin/bash\nif [[ -n "$BENCH_METRICS_DIR" ]]; then\n mkdir -p "$BENCH_METRICS_DIR"\n printf "%s\\n" "$*" > "$BENCH_METRICS_DIR/git-$$.args"\n /usr/bin/time -l -o "$BENCH_METRICS_DIR/git-$$.rss" '+real_git+' "$@"\nelse\n exec '+real_git+' "$@"\nfi\n')
(shim/'git').chmod(0o755)
os.environ['PATH']=str(shim)+os.pathsep+os.environ['PATH']
try:
 p=SKILLS/'packages/guru-merge-task-delivery/tests/test_manual_recovery.py'
 spec=importlib.util.spec_from_file_location('bench_manual_fixture',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 fixture=m.ManualRecoveryTests();fixture.setUp()
 try:
  rows=[]
  metrics_dir=GURU.parent/("metrics-"+os.environ.get("BENCH_COUNT","128")+"-"+os.environ.get("BENCH_VARIANT","repeated"))
  os.environ["BENCH_METRICS_DIR"]=str(metrics_dir)
  for n in range(3):
   os.environ["BENCH_METRICS_DIR"]=str(metrics_dir/f"{n}-manual")
   started=time.perf_counter();out=fixture.invoke();manual=time.perf_counter()-started
   query={'schema_version':'2.0','task_identity':'flow-task','repo_ref':'example/repo','base_ref':'main','task_ref':fixture.flow.task_ref}
   os.environ['BENCH_METRICS_DIR']=str(metrics_dir/f'{n}-query2')
   started=time.perf_counter();history=fixture.flow.wrapper(p.parents[1].name,'discover-task-deliveries.sh','--input',fixture.flow.write('history-bench.json',query));query_seconds=time.perf_counter()-started
   assert out['exit_id']=='delivered',out
   assert [x['merge_commit_sha'] for x in history['deliveries']]==[fixture.merge],history
   rows.append({'iteration':n,'warmup':n==0,'manual_seconds':manual,'query2_seconds':query_seconds,'manual_exit':out['exit_id'],'query2_deliveries':len(history['deliveries']),'retries':0})
  # Independent original public oracle; inspect normal original immutable caller
  fixture.flow.load_owner(p.parents[1].name)
  spec=importlib.util.spec_from_file_location('bench_manual_original',p.parents[1]/'runtime/manual_recovery.py');manual_mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(manual_mod)
  os.environ['BENCH_METRICS_DIR']=str(metrics_dir/'component')
  calls=[];old=hashlib.sha256
  def counted(*args,**kwargs):
   calls.append(len(args[0]) if args else 0);return old(*args,**kwargs)
  hashlib.sha256=counted
  started=time.perf_counter();candidate=manual_mod.commit_candidate(fixture.projection,fixture.publication,fixture.actual);component=time.perf_counter()-started
  hashlib.sha256=old
  assert candidate['content_ref']==fixture.publication['candidate']['content_ref']
  tree=fixture.flow.git('ls-tree','-r',fixture.actual,'--',*candidate['paths']).splitlines()
  oids=sorted({line.split()[2] for line in tree})
  sizes=subprocess.run(['git','cat-file','--batch-check=%(objectname) %(objectsize)'],input=''.join(oid+'\n' for oid in oids),cwd=fixture.repo,text=True,capture_output=True,check=True).stdout
  objects={line.split()[0]:int(line.split()[1]) for line in sizes.splitlines()}
  component_calls=list(calls)
  probe={}
  if int(os.environ.get('BENCH_COUNT','128')) <= 30:
   paths=[p for p in candidate['paths'] if p.startswith('payload/') and p!='payload/deleted.bin']
   publication={**fixture.publication,'candidate':{**fixture.publication['candidate'],'paths':paths}}
   calls.clear();hashlib.sha256=counted
   exact=manual_mod.commit_candidate(fixture.projection,publication,fixture.actual)
   hashlib.sha256=old
   probe={'paths':len(paths),'unique_blobs':1,'sha256_constructions':len(calls)}
  result={'exact_probe':probe,'count':int(os.environ.get('BENCH_COUNT','128')),'variant':os.environ.get('BENCH_VARIANT','repeated'),'paths_including_deleted':len(candidate['paths']),'unique_blobs':len(objects),'unique_body_bytes':sum(objects.values()),'max_blob_bytes':max(objects.values()),'git_commit':fixture.actual,'network_calls':0,'provider':'synthetic gh protocol fixture; no live AI','rows':rows,'component_seconds':component,'sha256_constructions':len(component_calls),'aggregate_constructions':sum(x>0 for x in component_calls),'content_sha256_constructions':sum(x==0 for x in component_calls),'oracle_equal':True,'python_self_peak_rss_bytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}
  result['timing_population']='iteration0 first public manual recording; iterations1/2 idempotent public output-loss recovery; all query2 calls original history validation'
  resources={}
  for operation in sorted(metrics_dir.iterdir()):
   if not operation.is_dir():continue
   python=[];git=[]
   for log in sorted(operation.glob('python-*.json')):
    value=json.loads(log.read_text())
    for batch in value.get('git_batches',[]):
     bodies=batch.pop('bodies');requests=batch.pop('requests')
     batch.update(requested_objects=len(requests),unique_requested_objects=len(set(requests)),successful_body_bytes=sum(b['bytes'] for b in bodies),max_object_bytes=max([b['bytes'] for b in bodies] or [0]),successful_blob_objects=sum(b['kind']=='blob' for b in bodies),unique_successful_blobs=len({b['oid'] for b in bodies if b['kind']=='blob'}))
    python.append(value)
   for log in sorted(operation.glob('git-*.args')):
    rss=log.with_suffix('.rss').read_text()
    peak=next((int(line.split()[0]) for line in rss.splitlines() if 'maximum resident set size' in line),None)
    git.append({'argv':log.read_text().strip(),'peak_rss_bytes':peak})
   resources[operation.name]={'python_processes':python,'git_processes':git}
  result['resources']=resources
  print(json.dumps(result,sort_keys=True))
 finally:fixture.doCleanups()
finally:f.write_text(original)
