"""Run pinned normal public recovery/history fixtures against isolated adoption."""
from pathlib import Path
import os,subprocess,json,hashlib
HERE=Path(__file__).resolve().parent
GURU=Path(os.environ.get('PINNED_GURU','/tmp/trellis-47-residual-after/guru'))
COMMON=Path(os.environ.get('AFTER_COMMON','/Users/wumengye/Documents/GoProjects/Trellis/.trellis/scripts/common'))
PYTHON='/Users/wumengye/Library/Caches/guru-team/python/f0b89dabd24ef812b1244b8b/venv/bin/python'
SKILLS=GURU/'trellis/skills/guru-team';tests=SKILLS/'packages/guru-merge-task-delivery/tests'
env=dict(os.environ,TRELLIS_DELIVERY_API_COMMON=str(COMMON),PYTHONPATH=str(SKILLS),PYTHONDONTWRITEBYTECODE='1')
source={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in COMMON.glob('*.py')}
results=[]
for name in ['test_manual_recovery.py','test_history_public.py','test_history_cutoff.py','test_history.py']:
 command=[PYTHON,'-m','unittest','discover','-s',str(tests),'-p',name,'-v']
 process=subprocess.run(command,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
 (HERE/(name+'.log')).write_text(process.stdout)
 results.append({'test_file':name,'returncode':process.returncode,'command':command,'output':process.stdout})
 print(name,process.returncode,flush=True)
assert source=={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in COMMON.glob('*.py')},'Source changed during tests'
(HERE/'public-fixture-results.json').write_text(json.dumps({'runtime_source_hashes':source,'isolated_guru':'f70b64b026725b27d59fed17ed710cc2f831439f plus isolated-consumer-projection.patch','results':results,'passed':all(r['returncode']==0 for r in results)},indent=2)+'\n')
raise SystemExit(0 if all(r['returncode']==0 for r in results) else 1)
