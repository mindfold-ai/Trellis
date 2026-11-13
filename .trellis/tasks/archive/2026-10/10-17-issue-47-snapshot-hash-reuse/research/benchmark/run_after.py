"""Run frozen measurements with an isolated public consumer projection.

Build the original valid fixture and immutable history on BEFORE installed
bytes. Overlay AFTER runtime only once that fixture's Publication exists.
Never mutate Task/gate/publication state or rewrite immutable Git objects.
"""
from pathlib import Path
import os,json,hashlib,subprocess,sys,shutil,tempfile,importlib.util,struct
HERE=Path(__file__).resolve().parent
CONTROL=os.environ.get('BENCH_CONTROL_BEFORE')=='1'
GURU=Path(os.environ.get('PINNED_GURU','/tmp/trellis-47-residual-benchmark/guru' if CONTROL else '/tmp/trellis-47-residual-after/guru'))
AFTER=Path(os.environ.get('AFTER_COMMON','/Users/wumengye/Documents/GoProjects/Trellis/.trellis/scripts/common'))
BEFORE=Path(os.environ.get('BEFORE_COMMON','/tmp/trellis-47-residual-benchmark/fork/.trellis/scripts/common'))
os.environ.update(PINNED_GURU=str(GURU),PINNED_FORK=str(BEFORE.parents[2]))
RUNTIME=BEFORE if CONTROL else AFTER
PHASE='control-before' if CONTROL else 'after'
source_hashes={file.name:hashlib.sha256(file.read_bytes()).hexdigest() for file in sorted(RUNTIME.glob('*.py'))}
def after_overlay(fixture):
 assert fixture.actual==baseline['git_commit'], 'Immutable before/after fixture commit differs'
 candidate=fixture.publication['candidate']
 entries=fixture.flow.git('ls-tree','-r',fixture.actual,'--',*candidate['paths'])
 (HERE/(PHASE+'-input-'+os.environ.get('BENCH_COUNT','128')+'-'+os.environ.get('BENCH_VARIANT','repeated')+'.json')).write_text(json.dumps({'exact_head':fixture.actual,'matches_frozen_before_head':True,'candidate':candidate,'git_tree':entries},indent=2)+'\n')
 if CONTROL:return
 common=fixture.repo/'.trellis/scripts/common'
 shutil.copytree(AFTER,common,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__'))
 from runtime.delivery_projection.adapter import upstream_modules
 namespace='guru_delivery_target_'+hashlib.sha256(str(common.resolve()).encode()).hexdigest()[:16]
 for loaded in list(sys.modules):
  if loaded==namespace or loaded.startswith(namespace+'.'):del sys.modules[loaded]
 fixture.projection.api=upstream_modules(fixture.repo)
 assert hasattr(fixture.projection.api.delivery_store,'GitCandidateContent')
 assert Path(fixture.projection.api.delivery_store.GitCandidateContent.content_ref.__code__.co_filename).resolve()==(common/'delivery_store.py').resolve()
 cache={}
 for name in ('delivery_store','git_objects'):
  source_file=common/(name+'.py');cache_file=Path(importlib.util.cache_from_source(str(source_file)))
  magic,flags,mtime,size=struct.unpack('<4sIII',cache_file.read_bytes()[:16])
  valid=mtime==int(source_file.stat().st_mtime) and size==source_file.stat().st_size
  cache[name]={'valid_timestamp_and_size':valid,'source_mtime':int(source_file.stat().st_mtime),'source_bytes':source_file.stat().st_size,'cache_mtime_header':mtime,'cache_size_header':size,'dont_write_bytecode':sys.dont_write_bytecode}
  assert valid, 'After runtime bytecode cache is not warmed equivalently'
 (HERE/'cache-parity-diagnostic.json').write_text(json.dumps(cache,indent=2)+'\n')
 if os.environ.get('BENCH_DIAG_ONLY')=='1':
  fixture.doCleanups()
  raise SystemExit(0)
subprocess.run([sys.executable,str(GURU/'trellis/skills/guru-team/runtime/bootstrap.py'),'--repo',str(GURU),'--runtime-assets',str(GURU/'trellis/skills/guru-team/runtime'),'--python',sys.executable,'--json'],check=True,stdout=subprocess.PIPE)
baseline=json.loads((HERE/('before-'+os.environ.get('BENCH_COUNT','128')+'-'+os.environ.get('BENCH_VARIANT','repeated')+'.json')).read_text())
commands=baseline['resources']['0-manual']['python_processes']
root_args=next(v['argv'] for v in commands if '--root' in v['argv'])
fixed_root=Path(root_args[root_args.index('--root')+1])
assert not fixed_root.exists(), 'Recorded baseline fixture root is unexpectedly occupied'
original_temporary=tempfile.TemporaryDirectory
class RecordedFixtureDirectory:
 def __init__(self):self.name=str(fixed_root);fixed_root.mkdir()
 def cleanup(self):shutil.rmtree(fixed_root,ignore_errors=True)
 def __enter__(self):return self.name
 def __exit__(self,*_):self.cleanup()
metrics_root=GURU.parent/('metrics-'+os.environ.get('BENCH_COUNT','128')+'-'+os.environ.get('BENCH_VARIANT','repeated'))
if metrics_root.exists():shutil.rmtree(metrics_root)
first_directory=True
def fixture_directory(*args,**kwargs):
 global first_directory
 if first_directory:
  first_directory=False
  return RecordedFixtureDirectory()
 return original_temporary(*args,**kwargs)
tempfile.TemporaryDirectory=fixture_directory
harness=HERE/'residual_benchmark.py';source=harness.read_text();needle='fixture=m.ManualRecoveryTests();fixture.setUp()'
assert source.count(needle)==1
# Inject only fixture runtime installation. The frozen timing, metrics and input
# generation code executes byte-for-byte unchanged around this one setup hook.
source=source.replace(needle,needle+';after_overlay(fixture)')
observer="shutil.copyfile(HERE/'sitecustomize_metrics.py',SKILLS/'sitecustomize.py')"
assert observer in source
source=source.replace(observer,observer+";(SKILLS/'sitecustomize.py').write_text((SKILLS/'sitecustomize.py').read_text()+'\\n'+(HERE/'sitecustomize_batch_command_metrics.py').read_text())")
timed='started=time.perf_counter();out=fixture.invoke();manual=time.perf_counter()-started'
assert timed in source
source=source.replace(timed,'prior_task_bytes=(fixture.repo/fixture.flow.task_ref/"task.json").read_bytes();'+timed+';after_task_bytes=(fixture.repo/fixture.flow.task_ref/"task.json").read_bytes();assert n==0 or prior_task_bytes==after_task_bytes')
exec(compile(source,str(harness),'exec'),{'__file__':str(harness),'__name__':'__main__','after_overlay':after_overlay})
assert source_hashes=={file.name:hashlib.sha256(file.read_bytes()).hexdigest() for file in sorted(RUNTIME.glob('*.py'))}
(HERE/(PHASE+'-runtime-source-checksums.json')).write_text(json.dumps(source_hashes,indent=2)+'\n')
