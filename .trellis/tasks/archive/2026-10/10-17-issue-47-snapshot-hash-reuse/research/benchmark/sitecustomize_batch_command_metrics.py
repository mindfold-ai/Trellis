"""Add metadata-only batch-command observation; never changes Git I/O/results.

The frozen observer handles --batch content responses. This extension only
observes the new protocol, preserving body versus metadata accounting.
"""
if os.environ.get('BENCH_METRICS_DIR'):
 _protocol_previous_run=subprocess.run
 metrics['git_metadata_batches']=[]
 def protocol_observed_run(args,*positional,**kwargs):
  protocol=isinstance(args,(list,tuple)) and 'cat-file' in args and '--batch-command' in args
  metadata=isinstance(args,(list,tuple)) and 'cat-file' in args and '--batch-check' in args
  if not (protocol or metadata):return _protocol_previous_run(args,*positional,**kwargs)
  request=kwargs.get('stdin');response=kwargs.get('stdout')
  if not hasattr(request,'seek') or not hasattr(response,'seek'):
   return _protocol_previous_run(args,*positional,**kwargs)
  cursor=request.tell();lines=request.read().decode('ascii').splitlines();request.seek(cursor)
  start=response.tell()
  result=_protocol_previous_run(args,*positional,**kwargs)
  end=response.tell();response.seek(start)
  bodies=[];contents=[];info=[];headers=[];header_bytes=0;info_header_bytes=0
  for line in lines:
   if protocol:
    if line=='flush':continue
    operation,oid=line.split(' ',1)
   else:operation,oid='info',line
   raw_header=response.readline();header=raw_header.split();header_bytes+=len(raw_header)
   if operation=='contents':contents.append(oid)
   else:info.append(oid);info_header_bytes+=len(raw_header)
   if len(header)!=3 or not header[2].isdigit():
    headers.append({'oid':oid,'raw_header':raw_header.decode('ascii','replace')})
    continue
   value={'oid':header[0].decode(),'kind':header[1].decode(),'bytes':int(header[2])}
   if operation=='contents':
    bodies.append(value);response.seek(value['bytes']+1,1)
   else:headers.append({'oid':value['oid'],'kind':value['kind'],'advertised_object_bytes':value['bytes']})
  response.seek(end)
  if protocol:
   metrics['git_batches'].append({'protocol':'--batch-command','requests':contents,'bodies':bodies,'metadata_requests':info,'metadata_responses':headers,'metadata_header_wire_bytes':info_header_bytes,'all_response_header_wire_bytes':header_bytes,'returncode':result.returncode})
  else:
   metrics['git_metadata_batches'].append({'protocol':'--batch-check','requested_objects':len(info),'responses':headers,'metadata_header_wire_bytes':info_header_bytes,'all_response_header_wire_bytes':header_bytes,'returncode':result.returncode})
  return result
 subprocess.run=protocol_observed_run

if os.environ.get('BENCH_METRICS_DIR'):
 def _record_process_cpu():
  usage=resource.getrusage(resource.RUSAGE_SELF)
  metrics['python_process_user_seconds']=usage.ru_utime
  metrics['python_process_system_seconds']=usage.ru_stime
 atexit.register(_record_process_cpu)
