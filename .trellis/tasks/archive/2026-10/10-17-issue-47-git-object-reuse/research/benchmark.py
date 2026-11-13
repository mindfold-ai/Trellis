#!/usr/bin/env python3
"""Issue 47 reproducible public-entry benchmark; stdlib only, POSIX measurement.

Baseline: python3 benchmark.py --source b0d87f952043058e21001a002b661bf2db56b1fa --output before.json
After: python3 benchmark.py --source working-tree --output after.json
Runs one unrecorded warmup and two recorded repetitions. No network commands.
"""
from __future__ import annotations
import argparse
import collections
import concurrent.futures
import hashlib
import io
import json
import os
import platform
import resource
import runpy
import shutil
import statistics
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path

BASE = 'b0d87f952043058e21001a002b661bf2db56b1fa'
HERE = Path(__file__).resolve().parent
REPO = Path.cwd() if '--worker' in sys.argv else Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip())


def worker(root: Path, entry: str, args: list[str], measurement: Path) -> None:
    """Run the exact shipped CLI under measurement, without changing its logic."""
    metrics = {'git_commands': {}, 'git_seconds': 0.0, 'git_blob_read_bytes': 0,
               'git_max_object_bytes': 0, 'requested_object_reads': 0,
               'git_peak_rss_bytes': 0, 'network_seconds': 0.0, 'components_seconds': {},
               'sha256_calls': 0, 'sha256_input_bytes': 0, 'observation_seconds': 0.0}
    observed_blobs=set()
    original_sha256=hashlib.sha256
    class MeasuredHash:
        def __init__(self, wrapped): self.wrapped=wrapped
        def update(self,data):
            metrics['sha256_input_bytes']+=len(data)
            return self.wrapped.update(data)
        def __getattr__(self,name): return getattr(self.wrapped,name)
    def measured_sha256(data=b'',*args,**kwargs):
        metrics['sha256_calls']+=1
        metrics['sha256_input_bytes']+=len(data)
        return MeasuredHash(original_sha256(data,*args,**kwargs))
    hashlib.sha256=measured_sha256
    original_run = subprocess.run
    original_wait = subprocess.Popen._try_wait
    # Popen's POSIX _try_wait is waitpid with EINTR/ChildProcessError handling.
    # wait4 gives EACH reaped Git process's RSS, not a process-group peak.
    def measured_wait(self, flags):
        try:
            pid, status, usage = os.wait4(self.pid, flags)
            if pid and self.args and Path(str(self.args[0])).name == 'git':
                factor = 1 if sys.platform == 'darwin' else 1024
                metrics['git_peak_rss_bytes'] = max(metrics['git_peak_rss_bytes'], usage.ru_maxrss * factor)
            return pid, status
        except ChildProcessError:
            return self.pid, 0
    subprocess.Popen._try_wait = measured_wait
    def measured_run(*a, **kw):
        command = a[0] if a else kw['args']
        git = isinstance(command, (list,tuple)) and Path(str(command[0])).name == 'git'
        start = time.perf_counter()
        result = original_run(*a, **kw)
        if git:
            argv = list(command[1:])
            if argv[:1] == ['-C']: argv = argv[2:]
            while argv and argv[0] in ('-c','--git-dir','--work-tree'): argv=argv[2:]
            name = argv[0] if argv else '(none)'
            metrics['git_commands'][name] = metrics['git_commands'].get(name,0)+1
            metrics['git_seconds'] += time.perf_counter()-start
            if name == 'show' and result.returncode == 0:
                data = result.stdout.encode('utf-8') if isinstance(result.stdout,str) else result.stdout
                metrics['requested_object_reads'] += 1
                metrics['git_blob_read_bytes'] += len(data or b'')
                metrics['git_max_object_bytes'] = max(metrics['git_max_object_bytes'],len(data or b''))
                observed_blobs.add(original_sha256(data or b'').hexdigest())
            if name=='cat-file' and '--batch' in argv and hasattr(kw.get('stdin'),'seek'):
                observed=time.perf_counter()
                output=kw['stdout']; offset=output.tell(); output.seek(0)
                while True:
                    header=output.readline()
                    if not header: break
                    fields=header.split()
                    if len(fields)!=3: continue
                    length=int(fields[2]); remaining=length; digest=original_sha256()
                    while remaining:
                        block=output.read(min(65536,remaining)); digest.update(block);remaining-=len(block)
                    output.read(1)
                    metrics['requested_object_reads']+=1
                    metrics['git_blob_read_bytes']+=length
                    metrics['git_max_object_bytes']=max(metrics['git_max_object_bytes'],length)
                    observed_blobs.add(digest.hexdigest())
                output.seek(offset)
                metrics['observation_seconds']+=time.perf_counter()-observed
        return result
    subprocess.run = measured_run
    # Inclusive outermost timing in these disjoint owner categories. Git wall
    # time is reported separately; remainder includes parsing, identity, writes.
    stack = []
    totals = collections.defaultdict(float)
    names = {'candidate_content_ref':'filesystem_digest', '_verify_commit':'commit_read_digest',
             'cmd_create':'task_create_owner', 'verify_authority':'authority'}
    def profile(frame,event,arg):
        if event == 'call' and frame.f_code.co_name in names:
            category = names[frame.f_code.co_name]
            if not any(c == category for c,_ in stack): stack.append((category,time.perf_counter()))
            else: stack.append((category,None))
        elif event == 'return' and frame.f_code.co_name in names and stack:
            category,start = stack.pop()
            if start is not None: totals[category] += time.perf_counter()-start
    os.chdir(root)
    sys.path.insert(0,str(root/'.trellis/scripts'))
    sys.argv = [str(root/f'.trellis/scripts/{entry}.py'),*args]
    started = time.perf_counter()
    sys.setprofile(profile)
    code = 0
    try: runpy.run_path(sys.argv[0],run_name='__main__')
    except SystemExit as exc: code = int(exc.code or 0)
    finally:
        sys.setprofile(None)
        metrics['elapsed_seconds'] = time.perf_counter()-started
        metrics['unique_git_blob_contents_read']=len(observed_blobs)
        metrics['components_seconds'] = dict(totals)
        metrics['components_seconds']['other_objective_and_wrapper'] = max(0,metrics['elapsed_seconds']-sum(totals.values()))
        metrics['python_peak_rss_bytes'] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * (1 if sys.platform == 'darwin' else 1024)
        metrics['exit_code'] = code
        measurement.write_text(json.dumps(metrics))
    raise SystemExit(code)


def command(root: Path, *args: str) -> str:
    return subprocess.check_output(list(args),cwd=root,text=True,stderr=subprocess.PIPE).strip()


def git(root: Path,*args: str) -> str:
    return command(root,'git',*args)


def install(root: Path, source: Path, workflow: dict) -> None:
    shutil.copytree(source/'packages/cli/src/templates/trellis/scripts',root/'.trellis/scripts')
    (root/'.trellis/workflow.md').write_text('[trellis-runtime-contract]\n'+json.dumps(workflow)+'\n[/trellis-runtime-contract]\n')
    (root/'.trellis/developer').write_text('benchmark\n')
    git(root,'init','-q'); git(root,'config','user.name','Benchmark'); git(root,'config','user.email','benchmark@example.invalid')
    (root/'.gitignore').write_text('.trellis/scripts/\n.trellis/sessions/\n.measure*\noperation.json\n')


def invoke(root: Path, entry: str, args: list[str]) -> tuple[str,dict]:
    path = root/'.measure.json'
    started=time.perf_counter()
    env={**os.environ,'TRELLIS_CONTEXT_ID':'issue47-benchmark','PYTHONDONTWRITEBYTECODE':'1'}
    result=subprocess.run([sys.executable,str(Path(__file__).resolve()),'--worker',str(root),entry,str(path),*args],cwd=root,capture_output=True,text=True,env=env)
    metrics=json.loads(path.read_text()); metrics['complete_elapsed_seconds']=time.perf_counter()-started
    if result.returncode: raise RuntimeError(f'{entry} {args[:2]}: {result.stderr}\n{result.stdout}')
    return result.stdout,metrics


def ref(root: Path, name: str) -> dict:
    return {'locator':name,'revision':'sha256:'+hashlib.sha256((root/name).read_bytes()).hexdigest()}


def task_case(source: Path, workflow: dict, heads: int, paths: int) -> list[dict]:
    with tempfile.TemporaryDirectory(prefix='issue47-task-') as tmp:
        root=Path(tmp); install(root,source,workflow)
        # Each head has shared metadata blobs and some distinct archive records.
        # Paths grow independently from refs; no local worktree duplicate scan.
        for index in range(paths):
            p=root/f'.trellis/tasks/archive/2025-01/history-{index:04}/task.json';p.parent.mkdir(parents=True,exist_ok=True)
            record=json.loads((source/'packages/core/test/fixtures/task-v2/native-multi.json').read_text())['initial']
            record.update(id=f'historical-{index}',name=f'history-{index}',description='Retained historical Task')
            p.write_text(json.dumps(record))
        git(root,'add','.');git(root,'commit','-qm','archive input')
        for index in range(heads):
            (root/'head-marker').write_text(str(index));git(root,'add','head-marker');git(root,'commit','-qm',f'head {index}')
            git(root,'branch',f'history-{index}')
        metrics=[]
        for repetition in range(3):
            out,m=invoke(root,'task',['create','Benchmark Task','--description','Issue 47 baseline','--slug',f'bench-{repetition}','--task-id',f'bench-{repetition}','--no-start','--base-branch','main'])
            m.update(repetition=repetition,warmup=repetition==0,scenario=f'task-h{heads}-p{paths}',heads=heads,paths=paths,
                     unique_blobs=paths,expected_requested_objects=heads*paths)
            metrics.append(m)
            # Newly created records are untracked, remove after measuring so
            # every repetition starts with identical retained history.
            for task in (root/'.trellis/tasks').glob('*-bench-*'): shutil.rmtree(task)
        return metrics


def delivery_case(source: Path,workflow: dict,size: int,pattern: str) -> list[dict]:
    with tempfile.TemporaryDirectory(prefix='issue47-delivery-') as tmp:
        root=Path(tmp);install(root,source,workflow)
        for name in ('requirements.md','plan.md'): (root/name).write_text('Reviewed deterministic benchmark authority\n')
        paths=[]; blobs=set(); logical_bytes=0; maximum=0
        for index in range(size):
            name=f'candidate/p{index:05}.txt'; p=root/name;p.parent.mkdir(exist_ok=True)
            data = b'repeated-content\n'*64 if pattern=='repeated' else (f'unique-{index:08}\n'.encode()*64)
            if pattern=='larger' and index%1000==0: data=(f'large-{index:08}\n'.encode()*300000)[:4*1024*1024]
            p.write_bytes(data);p.chmod(0o644);paths.append(name);blobs.add(hashlib.sha256(data).digest());logical_bytes+=len(data);maximum=max(maximum,len(data))
        git(root,'add','.');git(root,'commit','-qm','fixed candidate');head=git(root,'rev-parse','HEAD')
        metrics=[]
        for repetition in range(3):
            invoke(root,'task',['create','Delivery benchmark','--description','Public local commit benchmark','--slug',f'bench-{repetition}','--task-id',f'bench-{repetition}','--no-start','--base-branch','main'])
            task=next((root/'.trellis/tasks').glob(f'*-bench-{repetition}')).relative_to(root).as_posix()
            delivery='11111111-1111-4111-8111-111111111111'
            key={'task_id':f'bench-{repetition}','lifecycle_generation':0,'delivery_id':delivery}
            scope={'authority':ref(root,'requirements.md'),'anchors':['R1']}
            def apply(name,role,fields,measure=False):
                operation={'api_version':'1.0','operation':name,'key':{k:v for k,v in key.items() if name!='accept_scope' or k!='delivery_id'},'owner_role':role,'owner_id':workflow['owners'][role],**fields}
                (root/'operation.json').write_text(json.dumps(operation))
                out,m=invoke(root,'delivery',['apply','--task',task,'--input','operation.json'])
                if measure:
                    m.update(repetition=repetition,warmup=repetition==0,scenario=f'delivery-{pattern}-p{size}',operation=name,
                             paths=size,unique_blobs=len(blobs),logical_candidate_bytes=logical_bytes,max_input_object_bytes=maximum)
                    metrics.append(m)
                return json.loads(out)
            apply('accept_scope','task_scope',{'authority':scope['authority']})
            apply('create_delivery','creation',{'scope_ref':scope,'profile':'local_commit'})
            def gate(role,phase,candidate,previous):
                result={'result_id':f'r-{role}','owner_role':role,'owner_id':workflow['owners'][role],
                        'outcome':'accepted' if role=='planning' else 'ready' if role=='readiness' else 'passed',
                        'scope_ref':scope,'plan_ref':ref(root,'plan.md'),'candidate':candidate,
                        'predecessor_result_id':previous,'obligations':[],'evidence':[ref(root,'plan.md')]}
                apply('record_gate',role,{'expected_phase':phase,'result':result},measure=role!='planning')
                return result['result_id']
            planning=gate('planning','planning',None,None)
            out,m=invoke(root,'delivery',['candidate','--kind','git','--paths',*paths]);m.update(repetition=repetition,warmup=repetition==0,scenario=f'delivery-{pattern}-p{size}',operation='candidate',paths=size,unique_blobs=len(blobs),logical_candidate_bytes=logical_bytes,max_input_object_bytes=maximum);metrics.append(m)
            candidate={'kind':'git','content_ref':json.loads(out)['content_ref'],'paths':paths,'head_ref':head,'base_ref':None}
            apply('begin_check','implementation',{'expected_phase':'implementing','candidate':candidate},True)
            check=gate('check','checking',candidate,planning);review=gate('full_review','reviewing',candidate,check);gate('readiness','reviewing',candidate,review)
            result={'result_id':'delivered','owner_id':workflow['owners']['delivery'],'evidence':[ref(root,'plan.md')],
                    'candidate':candidate,'profile':'local_commit','commit':head}
            apply('record_delivery','delivery',{'expected_phase':'publishing','result':result},True)
            # The first output is deliberately not consumed for state. Retry
            # exact operation and assert no second fact or Task write.
            before=(root/task/'task.json').read_bytes()
            retry=apply('record_delivery','delivery',{'expected_phase':'publishing','result':result},True)
            assert retry['changed'] is False and (root/task/'task.json').read_bytes()==before
            metrics[-1]['operation']='record_delivery_retry'
            shutil.rmtree(root/task)
        return metrics


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--source',default=BASE);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--only',choices=['task','delivery','large']);parser.add_argument('--resume',action='store_true');args=parser.parse_args()
    output=args.output.resolve()
    with tempfile.TemporaryDirectory(prefix='issue47-source-') as tmp:
        source=Path(tmp)
        if args.source=='working-tree':
            shutil.copytree(REPO/'packages/cli/src/templates/trellis/scripts',source/'packages/cli/src/templates/trellis/scripts')
            shutil.copytree(REPO/'packages/core/test/fixtures/task-v2',source/'packages/core/test/fixtures/task-v2')
        else:
            archive=subprocess.check_output(['git','archive',args.source,'packages/cli/src/templates/trellis/scripts','packages/core/test/fixtures/task-v2'],cwd=REPO)
            with tarfile.open(fileobj=io.BytesIO(archive)) as tar: tar.extractall(source)
        workflow=json.loads((source/'packages/core/test/fixtures/task-v2/native-multi.json').read_text())['workflow']
        report={'source':args.source,'baseline':BASE,'python':sys.version,'git':command(REPO,'git','--version'),
                'platform':platform.platform(),'warmup':1,'repetitions':2,'seed':'deterministic integer path/content generation v1',
                'rss_definition':'per-process maximum bytes, Python self and maximum individual Git child; NOT simultaneous group RSS',
                'cache':'OS filesystem/object cache left warm; fresh process and fresh repo per scenario; one unrecorded warmup lifecycle',
                'dependencies':'Python standard library and local Git only; no remotes/network','samples':[]}
        report['large_cohort']='three concurrent scenarios repeated/unique/larger; each worker runs one warmup and two timed lifecycles; no unrelated test/build load'
        if args.resume: report['samples']=json.loads(output.read_text())['samples']
        def save(): output.write_text(json.dumps(report,indent=2)+'\n')
        save()
        if args.only not in ('delivery','large'):
            for heads,paths in ((2,24),(6,96)):
                report['samples']+=task_case(source,workflow,heads,paths);save();print(f'completed Task {heads}/{paths}',flush=True)
        if args.only!='task':
            if args.only!='large':
                for pattern in ('repeated','unique','larger'):
                    report['samples']+=delivery_case(source,workflow,128,pattern);save();print(f'completed Delivery 128/{pattern}',flush=True)
            with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
                futures={pool.submit(delivery_case,source,workflow,10001,pattern):pattern for pattern in ('repeated','unique','larger')}
                for future in concurrent.futures.as_completed(futures):
                    report['samples']+=future.result();save();print(f'completed Delivery 10001/{futures[future]}',flush=True)

if __name__=='__main__':
    if len(sys.argv)>1 and sys.argv[1]=='--worker': worker(Path(sys.argv[2]),sys.argv[3],sys.argv[5:],Path(sys.argv[4]))
    else: main()
