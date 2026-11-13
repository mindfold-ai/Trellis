#!/usr/bin/env python3
"""Functional-only >10k normal metadata and historical probes; no speed claim.

Run after production implementation. Uses frozen benchmark observer unchanged.
"""
from __future__ import annotations
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
import benchmark as bench


OBSERVER = r"""
import json,os,subprocess
_original_run=subprocess.run
def _observed_run(*args,**kwargs):
    command=args[0] if args else kwargs.get('args')
    event=None
    if isinstance(command,(list,tuple)) and command and os.path.basename(str(command[0]))=='git' and 'cat-file' in command:
        tail=list(command[command.index('cat-file')+1:])
        kind='batch-check' if any(arg.startswith('--batch-check') for arg in tail) else 'batch' if '--batch' in tail else 'type' if '-t' in tail else None
        if kind in ('batch-check','batch') and hasattr(kwargs.get('stdin'),'seek'):
            stream=kwargs['stdin'];position=stream.tell();payload=stream.read();stream.seek(position)
            if isinstance(payload,bytes):payload=payload.decode('ascii')
            objects=payload.splitlines();event={'kind':kind,'requests':len(objects),'objects':objects}
        elif kind=='type':event={'kind':kind,'requests':1,'objects':[tail[-1]]}
    result=_original_run(*args,**kwargs)
    if event is not None:
        event['exit_code']=result.returncode
        with open(os.environ['ISSUE47_REQUEST_OBSERVER'],'a',encoding='utf-8') as output:output.write(json.dumps(event)+'\n')
    return result
subprocess.run=_observed_run
"""


def probe(pattern: str) -> dict:
    with tempfile.TemporaryDirectory(prefix='issue47-historical-') as tmp:
        root=Path(tmp);workflow=json.loads((bench.REPO/'packages/core/test/fixtures/task-v2/native-multi.json').read_text())['workflow']
        bench.install(root,bench.REPO,workflow)
        for name in ('requirements.md','plan.md'):(root/name).write_text('Retained historical authority\n')
        paths=[]
        for index in range(10001):
            locator=f'candidate/p{index:05}.txt';path=root/locator;path.parent.mkdir(exist_ok=True)
            body=b'repeated\n'*128 if pattern=='repeated' else f'unique historical body {index:08}\n'.encode()*32
            if index==0:body=b'L'*(4*1024*1024)
            path.write_bytes(body);path.chmod(0o644);paths.append(locator)
        bench.git(root,'add','.');bench.git(root,'commit','-qm','historical actual candidate');commit=bench.git(root,'rev-parse','HEAD')
        bench.invoke(root,'task',['create','Historical candidate','--description','Functional historical-success batching probe','--slug','historical','--task-id','historical','--no-start','--base-branch','main'])
        task=next((root/'.trellis/tasks').glob('*-historical')).relative_to(root).as_posix()
        key={'task_id':'historical','lifecycle_generation':0,'delivery_id':'11111111-1111-4111-8111-111111111111'}
        scope={'authority':bench.ref(root,'requirements.md'),'anchors':['R1']}
        def apply(operation,role,fields,alias='apply'):
            op={'api_version':'1.0','operation':operation,'owner_role':role,'owner_id':workflow['owners'][role],
                'key':{k:v for k,v in key.items() if operation!='accept_scope' or k!='delivery_id'},**fields}
            (root/'operation.json').write_text(json.dumps(op))
            out,metrics=bench.invoke(root,'delivery',[alias,'--task',task,'--input','operation.json'])
            return json.loads(out),metrics
        apply('accept_scope','task_scope',{'authority':scope['authority']})
        apply('create_delivery','creation',{'scope_ref':scope,'profile':'local_commit'})
        plan=bench.ref(root,'plan.md')
        apply('record_gate','planning',{'expected_phase':'planning','result':{'result_id':'historical-planning','owner_role':'planning','owner_id':workflow['owners']['planning'],'outcome':'accepted','scope_ref':scope,'plan_ref':plan,'candidate':None,'predecessor_result_id':None,'obligations':[],'evidence':[plan]}})
        out,_=bench.invoke(root,'delivery',['candidate','--kind','git','--paths',*paths])
        candidate={'kind':'git','content_ref':json.loads(out)['content_ref'],'paths':paths,'head_ref':commit,'base_ref':None}
        # Complete a real normal Delivery first, observing actual Git metadata
        # request stdin separately from the frozen comparative body observer.
        apply('begin_check','implementation',{'expected_phase':'implementing','candidate':candidate})
        previous='historical-planning'
        for role,phase,outcome in [('check','checking','passed'),('full_review','reviewing','passed'),('readiness','reviewing','ready')]:
            result={'result_id':'normal-'+role,'owner_role':role,'owner_id':workflow['owners'][role],'outcome':outcome,'scope_ref':scope,'plan_ref':plan,'candidate':candidate,'predecessor_result_id':previous,'obligations':[],'evidence':[plan]}
            apply('record_gate',role,{'expected_phase':phase,'result':result});previous=result['result_id']
        observer=root/'.request-observer';observer.mkdir()
        observer_log=root/'.request-observations.jsonl'
        (observer/'sitecustomize.py').write_text(OBSERVER)
        prior_path=os.environ.get('PYTHONPATH');prior_log=os.environ.get('ISSUE47_REQUEST_OBSERVER')
        os.environ['PYTHONPATH']=str(observer)+(os.pathsep+prior_path if prior_path else '')
        os.environ['ISSUE47_REQUEST_OBSERVER']=str(observer_log)
        try:
            normal,normal_metrics=apply('record_delivery','delivery',{'expected_phase':'publishing','result':{'result_id':'normal-delivered','owner_id':workflow['owners']['delivery'],'evidence':[plan],'candidate':candidate,'profile':'local_commit','commit':commit}},'record-delivery')
        finally:
            if prior_path is None:os.environ.pop('PYTHONPATH',None)
            else:os.environ['PYTHONPATH']=prior_path
            if prior_log is None:os.environ.pop('ISSUE47_REQUEST_OBSERVER',None)
            else:os.environ['ISSUE47_REQUEST_OBSERVER']=prior_log
        assert normal['changed'] is True and normal['phase']=='delivered'
        observed=[json.loads(line) for line in observer_log.read_text().splitlines()]
        metadata_requests=sum(item['requests'] for item in observed if item['kind']=='batch-check')
        metadata_unique=len({oid for item in observed if item['kind']=='batch-check' for oid in item['objects']})
        expected_unique=2 if pattern=='repeated' else 10001
        assert metadata_requests==metadata_unique==expected_unique,(metadata_requests,metadata_unique,observed)
        assert normal_metrics['requested_object_reads']==0,normal_metrics
        # A fresh second Delivery records the retained original commit through
        # historical_success after mutable facts have changed.
        key['delivery_id']='22222222-2222-4222-8222-222222222222'
        apply('create_delivery','creation',{'scope_ref':scope,'profile':'local_commit'})
        apply('record_gate','planning',{'expected_phase':'planning','result':{'result_id':'second-planning','owner_role':'planning','owner_id':workflow['owners']['planning'],'outcome':'accepted','scope_ref':scope,'plan_ref':plan,'candidate':None,'predecessor_result_id':None,'obligations':[],'evidence':[plan]}})
        # A real later HEAD, separately changed index, and changed worktree must
        # not replace the expressly retained historical commit facts.
        (root/'later-marker').write_text('later HEAD\n');bench.git(root,'add','later-marker');bench.git(root,'commit','-qm','later HEAD')
        (root/paths[1]).write_text('different staged content\n');bench.git(root,'add',paths[1])
        (root/paths[2]).write_text('different unstaged content\n')
        fields={'expected_phase':'implementing','historical_success':True,'result':{'result_id':'historical-delivered','owner_id':workflow['owners']['delivery'],'evidence':[plan],'candidate':candidate,'profile':'local_commit','commit':commit}}
        result,metrics=apply('record_delivery','delivery',fields,'record-delivery')
        assert result['changed'] is True and result['phase']=='delivered'
        before=(root/task/'task.json').read_bytes()
        retry,retry_metrics=apply('record_delivery','delivery',fields,'record-delivery')
        assert retry['changed'] is False and (root/task/'task.json').read_bytes()==before
        expected_unique=2 if pattern=='repeated' else 10001
        assert metrics['requested_object_reads']==expected_unique,metrics
        assert metrics['unique_git_blob_contents_read']==expected_unique,metrics
        assert metrics['git_commands'].get('show',0)==0 and metrics['git_commands'].get('ls-tree',0)==1,metrics
        assert 1<=metrics['git_commands'].get('cat-file',0)<=1+(expected_unique+127)//128,metrics
        assert metrics['git_max_object_bytes']==4*1024*1024,metrics
        assert metrics['python_peak_rss_bytes']<=256*1024*1024 and metrics['git_peak_rss_bytes']<=64*1024*1024,metrics
        return {'normal_delivery':normal_metrics,'normal_metadata_request_observations':observed,'normal_metadata_blob_requests':metadata_requests,'normal_unique_metadata_blobs':metadata_unique,'pattern':pattern,'paths':len(paths),'expected_unique_blobs':expected_unique,'historical_head_differs':True,'index_and_worktree_differ':True,'record_delivery':metrics,'retry':retry_metrics,'retry_changed':False,'task_bytes_unchanged_on_retry':True,'claim':'functional process-count/resource evidence only; not a before/after performance claim'}

if __name__=='__main__':
    output=Path(sys.argv[1]);results=[]
    for pattern in ('repeated','unique'):
        results.append(probe(pattern));output.write_text(json.dumps({'probes':results},indent=2)+'\n');print(pattern,'passed',flush=True)
