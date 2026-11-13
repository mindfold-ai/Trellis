"""Export exact sources outside the repository; never changes the source checkouts."""
import argparse,io,subprocess,tarfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--guru',required=True);p.add_argument('--fork',required=True);p.add_argument('--destination',default='/tmp/trellis-47-residual-benchmark');a=p.parse_args()
for name,repo,ref in [('guru',a.guru,'f70b64b026725b27d59fed17ed710cc2f831439f'),('fork',a.fork,'0e3b23a3045357b76e69ca91e84b97b294dfb147')]:
 destination=Path(a.destination)/name;destination.mkdir(parents=True,exist_ok=False)
 raw=subprocess.check_output(['git','-C',repo,'archive',ref])
 tarfile.open(fileobj=io.BytesIO(raw)).extractall(destination,filter='data')
 print(name,ref,destination)
