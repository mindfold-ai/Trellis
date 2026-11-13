"""Opt-in measurement only. Loaded by Python startup in isolated source export."""
import os
if os.environ.get('BENCH_METRICS_DIR'):
 import atexit,json,resource,sys,hashlib,io
 from pathlib import Path
 directory=Path(os.environ['BENCH_METRICS_DIR']);directory.mkdir(parents=True,exist_ok=True)
 metrics={'pid':os.getpid(),'argv':sys.argv,'snapshot_read_bytes':0,'content_sha256':0,'aggregate_sha256':0}
 original=hashlib.sha256
 def sha(*args,**kwargs):
  frame=sys._getframe(1)
  if frame.f_code.co_filename.endswith(('delivery_store.py','git_objects.py')):
   metrics['aggregate_sha256' if args else 'content_sha256']+=1
  return original(*args,**kwargs)
 hashlib.sha256=sha
 op=io.open
 class Reader:
  def __init__(self,stream):self.stream=stream
  def __getattr__(self,name):return getattr(self.stream,name)
  def __enter__(self):self.stream.__enter__();return self
  def __exit__(self,*args):return self.stream.__exit__(*args)
  def read(self,*args):
   data=self.stream.read(*args);metrics['snapshot_read_bytes']+=len(data);return data
 def opened(file,*args,**kwargs):
  stream=op(file,*args,**kwargs)
  if 'guru-manual-delivery-snapshot-' in str(file) and (args and args[0]=='rb' or kwargs.get('mode')=='rb'):return Reader(stream)
  return stream
 io.open=opened
 def finish():
  metrics['python_process_peak_rss_bytes']=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
  (directory/f'python-{os.getpid()}.json').write_text(json.dumps(metrics))
 atexit.register(finish)
 import subprocess
 run_original=subprocess.run
 metrics['git_batches']=[]
 def measured_run(args,*positional,**kwargs):
  batch=isinstance(args,(list,tuple)) and 'cat-file' in args and '--batch' in args
  requests=[];start=0
  if batch:
   if kwargs.get('stdin') is not None:
    source=kwargs['stdin'];cursor=source.tell();requests=source.read().decode('ascii').splitlines();source.seek(cursor)
   elif kwargs.get('input') is not None:
    data=kwargs['input'];requests=(data.decode('ascii') if isinstance(data,bytes) else data).splitlines()
   stream=kwargs.get('stdout');start=stream.tell() if hasattr(stream,'tell') else 0
  result=run_original(args,*positional,**kwargs)
  if batch:
   stream=kwargs.get('stdout');bodies=[]
   if hasattr(stream,'seek'):
    cursor=stream.tell();stream.seek(start)
    for request in requests:
     header=stream.readline().split()
     if len(header)==3 and header[2].isdigit():
      size=int(header[2]);bodies.append({'oid':header[0].decode(),'kind':header[1].decode(),'bytes':size});stream.seek(size+1,1)
    stream.seek(cursor)
   metrics['git_batches'].append({'requests':requests,'bodies':bodies,'returncode':result.returncode})
  return result
 subprocess.run=measured_run
