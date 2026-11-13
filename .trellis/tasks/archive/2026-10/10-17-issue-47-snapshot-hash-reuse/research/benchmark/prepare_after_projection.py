"""Apply only an isolated consumer projection. Never changes canonical Guru."""
from pathlib import Path
import argparse,subprocess,tarfile,io,difflib,hashlib,json
p=argparse.ArgumentParser();p.add_argument('--guru',required=True);p.add_argument('--destination',default='/tmp/trellis-47-residual-after/guru');a=p.parse_args()
root=Path(a.destination);root.mkdir(parents=True,exist_ok=False)
ref='f70b64b026725b27d59fed17ed710cc2f831439f'
raw=subprocess.check_output(['git','-C',a.guru,'archive',ref]);tarfile.open(fileobj=io.BytesIO(raw)).extractall(root,filter='data')
package=root/'trellis/skills/guru-team/packages/guru-merge-task-delivery/runtime'
diff=[];checksums={}
file=package/'manual_recovery.py';before=file.read_text()
start=before.index('    if objects is None:',before.index('def commit_candidate'))
end=before.index('    return {**candidate',start)
replacement='''    if objects is None:
        with projection._call(projection.api.delivery_store.GitCandidateContent, source) as local:
            return commit_candidate(projection, publication, actual_head,
                                    git_root=source, objects=local)
    content = projection._call(objects.content_ref, actual_head, paths)
'''
after=before[:start]+replacement+before[end:]
after=after.replace('from candidate_objects import CandidateObjects\n','').replace('import tempfile\n','')
file.write_text(after)
diff.extend(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/runtime/manual_recovery.py',tofile='b/runtime/manual_recovery.py'))
checksums['manual_recovery.py']=hashlib.sha256(file.read_bytes()).hexdigest()
file=package/'history.py';before=file.read_text()
start=before.index('    def candidate(self, head: str, paths: list[str]) -> None:')
end=before.index('\n\ndef _github_error',start)
replacement='''    def candidate(self, projection, fact):
        from manual_recovery import commit_candidate
        head = fact["reviewed_head"]
        def readable(root):
            try:
                if self.objects is None:
                    self.objects = projection._call(projection.api.delivery_store.GitCandidateContent,
                                                    root, no_lazy_fetch=True)
                return commit_candidate(projection, fact, head, git_root=root, objects=self.objects)
            except LifecycleContractError as exc:
                raise CommandError("stale_identity", exc.field_path, exc.remediation, 3) from exc
        return self.prepare(head, readable)
'''
after=before[:start]+replacement+before[end:]
after=after.replace('            context.candidate(fact["reviewed_head"], fact["candidate"]["paths"])\n','')
after=after.replace('actual_candidate = commit_candidate(projection, fact, fact["reviewed_head"], git_root=context.root, objects=context.objects)','actual_candidate = context.candidate(projection, fact)')
file.write_text(after)
diff.extend(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/runtime/history.py',tofile='b/runtime/history.py'))
checksums['history.py']=hashlib.sha256(file.read_bytes()).hexdigest()
output=Path(__file__).resolve().parent
(output/'isolated-consumer-projection.patch').write_text(''.join(diff))
(output/'isolated-consumer-projection-checksums.json').write_text(json.dumps(checksums,indent=2)+'\n')
print(root)
