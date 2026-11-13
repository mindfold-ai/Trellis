"""Recoverably compress only LARGE JSON in archived failed/interrupted cohorts.

Never touches frozen baseline, protocols, current final samples or evaluations.
Run only after all timed work is complete.
"""
from pathlib import Path
import gzip,io,hashlib,json
root=Path(__file__).resolve().parent
previous=root/'archive-compression-manifest.json'
manifest=json.loads(previous.read_text())['files'] if previous.exists() else []
touched=set()
for directory in sorted(root.iterdir()):
 if not directory.is_dir() or not directory.name.startswith(('failed-generation-','interrupted-generation-')):continue
 for file in sorted(directory.glob('*.json')):
  if file.stat().st_size<=100*1024:continue
  if any(word in file.name for word in ['evaluation','protocol','summary','manifest']):continue
  data=file.read_bytes();original_hash=hashlib.sha256(data).hexdigest()
  buffer=io.BytesIO()
  with gzip.GzipFile(filename='',mode='wb',fileobj=buffer,mtime=0,compresslevel=6) as output:output.write(data)
  compressed=buffer.getvalue();assert hashlib.sha256(gzip.decompress(compressed)).hexdigest()==original_hash
  target=file.with_suffix(file.suffix+'.gz');assert not target.exists(),target
  target.write_bytes(compressed)
  assert hashlib.sha256(gzip.decompress(target.read_bytes())).hexdigest()==original_hash
  assert hashlib.sha256(file.read_bytes()).hexdigest()==original_hash
  manifest.append({'original_path':str(file.relative_to(root)),'compressed_path':str(target.relative_to(root)),'original_sha256':original_hash,'compressed_sha256':hashlib.sha256(compressed).hexdigest(),'original_bytes':len(data),'compressed_bytes':len(compressed),'gzip_mtime':0,'verified_decompressed_sha256':original_hash})
  touched.add(directory.name)
  file.unlink()  # Original bytes are verified recoverable in target.
 if directory.name in touched:
  readme=directory/'README.md';text=readme.read_text() if readme.exists() else ''
  text+='\n大于 100 KiB 的归档 JSON 已用 mtime=0 的确定性 gzip 保存。解压后的 SHA-256 已与原字节核对。original path、原 SHA、压缩 SHA 和大小见上级 archive-compression-manifest.json。README、evaluation、summary 和 protocol 均保留可读文本。\n';readme.write_text(text)
(root/'archive-compression-manifest.json').write_text(json.dumps({'policy':'Only archived failed/interrupted JSON >100KiB; deterministicmtime0; byte-exact verified recovery; frozen/current/evaluation/protocol untouched.','files':manifest},indent=2)+'\n')
print(json.dumps({'files':len(manifest),'original_bytes':sum(r['original_bytes'] for r in manifest),'compressed_bytes':sum(r['compressed_bytes'] for r in manifest)}))
