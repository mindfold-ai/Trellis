import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const scripts = path.resolve(__dirname, "../../src/templates/trellis/scripts");
const python = process.platform === "darwin" ? "/usr/bin/python3" : process.platform === "win32" ? "python" : "python3";
const available = spawnSync(python, ["--version"]).status === 0;

const fixture = `
import hashlib,json,os,subprocess,sys
from pathlib import Path
from common import delivery_store as store
from common.delivery_schema import DeliveryError
root=Path.cwd()
def git(*args):
    return subprocess.check_output(['git','-C',str(root),*args]).decode().strip()
def rejected(code,call):
    try: call()
    except DeliveryError as error: assert error.code==code,(code,str(error))
    else: raise AssertionError('invalid input accepted')
git('init','-q')
git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid')
git('config','commit.gpgsign','false');git('config','gc.auto','0')
os.environ['GIT_AUTHOR_DATE']='2026-01-01T00:00:00+00:00'
os.environ['GIT_COMMITTER_DATE']='2026-01-01T00:00:00+00:00'
names=['plain','executable','中文\\tfile','with\\nnewline','empty','magic[*]?',':(glob)plain*']
for name in names: (root/name).write_bytes(b'' if name=='empty' else b'shared\\r\\nraw bytes\\x00')
git('add','.')
git('update-index','--chmod=+x','executable')
git('commit','-qm','fixture')
commit=git('rev-parse','HEAD')
`;

describe.skipIf(!available)("public immutable Git candidate content", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-git-content-"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }));

  function run(body: string): void {
    const result = spawnSync(python, ["-c", fixture + body], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PYTHONPATH: scripts },
    });
    expect(result.status, result.stderr).toBe(0);
  }

  it("#1 preserves original bytes, literal paths, executable modes, ordering and deletion serialization", () => {
    run(`
paths=names+['deleted']
# This oracle is the original public filesystem owner over an exact snapshot.
snapshot=root/'snapshot';snapshot.mkdir()
for name in names:
    (snapshot/name).write_bytes((root/name).read_bytes())
    (snapshot/name).chmod(0o755 if name=='executable' else 0o644)
expected=store.candidate_content_ref(snapshot,paths,'git')
with store.GitCandidateContent(root) as reader:
    assert reader.content_ref(commit,list(reversed(paths)))==expected
    assert reader.content_ref(commit,paths)==expected
`);
  });

  it("#2 hashes each unique blob once per operation while validating every candidate input", () => {
    run(`
calls=[];original=store.hash_blob
# Count actual streamed content observations without replacing their behavior.
def counted(stream,size):
    calls.append(size);return original(stream,size)
store.hash_blob=counted
with store.GitCandidateContent(root) as reader:
    first=reader.content_ref(commit,['plain'])
    assert reader.content_ref(commit,['plain'])==first
    executable=reader.content_ref(commit,['executable'])
    assert executable!=first
    reader.content_ref(commit,names)
    assert sorted(calls)==[0,len((root/'plain').read_bytes())],calls
    for invalid in ([],['plain','plain'],['.git/config'],['.trellis/.runtime/state']):
        rejected('invalid_candidate',lambda:reader.content_ref(commit,invalid))
    rejected('invalid_locator',lambda:reader.content_ref(commit,['../plain']))
    rejected('invalid_locator',lambda:reader.content_ref(commit,['bad\\\\path']))
with store.GitCandidateContent(root) as fresh:
    assert fresh.content_ref(commit,['plain'])==first
assert len(calls)==3,calls
`);
  });

  it("#3 rejects refs, non-commit objects and non-regular tree entries independently after reuse", () => {
    run(`
git('tag','-a','label','-m','annotated')
blob=git('rev-parse','HEAD:plain');tag=git('rev-parse','label')
git('update-index','--add','--cacheinfo','120000,'+blob+',link')
git('update-index','--add','--cacheinfo','160000,'+commit+',submodule')
(root/'directory').mkdir();(root/'directory/file').write_text('body')
git('add','directory');git('commit','-qm','types')
typed=git('rev-parse','HEAD')
with store.GitCandidateContent(root) as reader:
    reader.content_ref(commit,['plain'])
    for invalid in ('HEAD','label',commit[:12],commit.upper(),blob,tag,'0'*40):
        rejected('invalid_git_fact',lambda:reader.content_ref(invalid,['plain']))
        rejected('invalid_git_fact',lambda:reader.content_ref(invalid,['deleted']))
    for invalid in ('directory','link'):
        rejected('invalid_git_fact',lambda:reader.content_ref(typed,[invalid]))
    rejected('invalid_git_fact',lambda:reader.content_ref(typed,['directory','directory/file']))
    assert reader.content_ref(typed,['submodule'])==store.candidate_content_ref(root,['submodule'],'git')
`);
  });

  it("#4 ignores mutable HEAD/index/worktree for exact commits but preserves mutable candidate comparisons", () => {
    run(`
with store.GitCandidateContent(root) as reader:
    original=reader.content_ref(commit,['plain'])
    candidate={'kind':'git','content_ref':original,'paths':['plain'],'head_ref':commit,'base_ref':commit}
    store.verify_candidate(root,candidate)
    (root/'plain').write_text('changed')
    rejected('candidate_mismatch',lambda:store.verify_candidate(root,candidate))
    git('add','plain');git('commit','-qm','changed')
    assert reader.content_ref(commit,['plain'])==original
    assert reader.content_ref(git('rev-parse','HEAD'),['plain'])!=original
    assert reader.content_ref(commit,['plain'])==original
`);
  });

  it("#5 rechecks cached object availability and closes context facts after failures", () => {
    run(`
reader=store.GitCandidateContent(root,no_lazy_fetch=True)
reader.content_ref(commit,['plain'])
blob=git('rev-parse',commit+':plain')
object_path=root/'.git/objects'/blob[:2]/blob[2:]
assert object_path.is_file()
object_path.unlink()
rejected('invalid_git_fact',lambda:reader.content_ref(commit,['plain']))
reader.close();reader.close()
rejected('invalid_git_fact',lambda:reader.content_ref(commit,['plain']))
rejected('invalid_git_fact',reader.__enter__)
with store.GitCandidateContent(root) as fresh:
    rejected('invalid_git_fact',lambda:fresh.content_ref(commit,['plain']))
try:
    with store.GitCandidateContent(root) as failed:
        raise RuntimeError('consumer failure')
except RuntimeError: pass
rejected('invalid_git_fact',lambda:failed.content_ref(commit,['empty']))
`);
  });

  it("#6 binds bare repositories and explicit no-lazy-fetch policy despite inherited Git redirects", () => {
    run(`
expected=store.GitCandidateContent(root).content_ref(commit,names)
bare=root/'history.git';git('clone','-q','--bare',str(root),str(bare))
os.environ['GIT_DIR']=str(root/'wrong.git')
os.environ['GIT_WORK_TREE']=str(root/'wrong-worktree')
os.environ['GIT_OBJECT_DIRECTORY']=str(root/'wrong-objects')
os.environ['GIT_NO_LAZY_FETCH']='0'
os.environ['LC_ALL']='fr_FR.UTF-8'
observed=[];original=store.subprocess.run
def observe(*args,**kwargs):
    env=kwargs.get('env',{})
    assert env.get('GIT_NO_LAZY_FETCH')=='1'
    assert env.get('LC_ALL')=='C'
    assert 'GIT_DIR' not in env and 'GIT_WORK_TREE' not in env and 'GIT_OBJECT_DIRECTORY' not in env
    observed.append(args[0]);return original(*args,**kwargs)
store.subprocess.run=observe
with store.GitCandidateContent(bare,no_lazy_fetch=True) as reader:
    assert reader.content_ref(commit,names)==expected
    assert reader.content_ref(commit,names)==expected
assert observed
`);
  });

  it("#11 selects only literal requested metadata while retaining default and empty selection behavior", () => {
    run(`
from common import git_objects
selected=git_objects.read_tree(root,commit,paths=['plain','magic[*]?',':(glob)plain*','deleted'])
assert set(selected)=={'plain','magic[*]?',':(glob)plain*'},selected
assert git_objects.read_tree(root,commit,paths=[])=={}
assert set(git_objects.read_tree(root,commit))==set(names)
assert set(git_objects.read_tree(root,commit,scope='plain'))=={'plain'}
(root/'directory').mkdir();(root/'directory/file').write_text('nested')
git('add','directory');git('commit','-qm','nested selection')
nested=git('rev-parse','HEAD')
assert set(git_objects.read_tree(root,nested,paths=['directory/file']))=={'directory/file'}
directory=git_objects.read_tree(root,nested,paths=['directory'])
assert set(directory)=={'directory'} and directory['directory'].kind=='tree'
mixed=git_objects.read_tree(root,nested,paths=['directory','directory/file'])
assert set(mixed)=={'directory','directory/file'} and mixed['directory'].kind=='tree'
# Force multiple finite argument batches without creating unrelated fixture files.
long_names=['absent-'+str(index)+'x'*100 for index in range(1300)]
commands=[];original=git_objects.subprocess.run
def observe(*args,**kwargs):
    command=args[0];commands.append(command)
    assert sum(len(arg.encode('utf-8'))+1 for arg in command)<=64*1024
    return original(*args,**kwargs)
git_objects.subprocess.run=observe
assert git_objects.read_tree(root,commit,paths=long_names)=={}
assert len(commands)>1,commands
assert [item for command in commands for item in command[command.index('--')+1:]]==long_names
`);
  });

  it("#10 falls back only for Git that explicitly rejects batch-command", () => {
    run(`
with store.GitCandidateContent(root) as reader: expected=reader.content_ref(commit,names)
calls=[];original=store.subprocess.run
def old_git(*args,**kwargs):
    command=args[0];calls.append(command)
    if '--batch-command' in command:
        raise subprocess.CalledProcessError(129,command,stderr=b"error: unknown option 'batch-command'")
    return original(*args,**kwargs)
store.subprocess.run=old_git
with store.GitCandidateContent(root) as reader:
    assert reader.content_ref(commit,names)==expected
assert sum('--batch-command' in call for call in calls)==1
assert sum('--batch-check' in call for call in calls)==1
assert sum('--batch' in call for call in calls)==1
calls.clear()
def broken_git(*args,**kwargs):
    command=args[0];calls.append(command)
    if '--batch-command' in command:
        raise subprocess.CalledProcessError(1,command,stderr=b'object read failed')
    return original(*args,**kwargs)
store.subprocess.run=broken_git
with store.GitCandidateContent(root) as reader:
    rejected('invalid_git_fact',lambda:reader.content_ref(commit,names))
assert not any('--batch-check' in call or '--batch' in call for call in calls)
`);
  });

  it("#9 validates exact commit availability even when every selected path is deleted", () => {
    run(`
with store.GitCandidateContent(root,no_lazy_fetch=True) as reader:
    expected=store.candidate_content_ref(root,['deleted'],'git')
    assert reader.content_ref(commit,['deleted'])==expected
    assert reader.content_ref(commit,['deleted'])==expected
    object_path=root/'.git/objects'/commit[:2]/commit[2:]
    assert object_path.is_file();object_path.unlink()
    rejected('invalid_git_fact',lambda:reader.content_ref(commit,['deleted']))
`);
  });

  it("#8 bounds new and cached object requests for broad candidates without retaining blob bodies", () => {
    run(`
paths=['unique-'+str(index) for index in range(4097)]
for name in paths: (root/name).write_bytes(name.encode())
git('add','.');git('commit','-qm','broad candidate')
actual=git('rev-parse','HEAD')
batches=[];trees=[];original=store.subprocess.run
def observe(*args,**kwargs):
    command=args[0]
    if 'ls-tree' in command:
        assert '--literal-pathspecs' in command
        assert sum(len(arg.encode('utf-8'))+1 for arg in command)<=64*1024
        trees.append(command)
    if 'cat-file' in command:
        requests=kwargs['stdin'];position=requests.tell()
        lines=requests.read().splitlines();requests.seek(position)
        batches.append((command[-1],len(lines)))
        if command[-1]=='--batch-command':
            assert lines[0]==('info '+actual).encode()
            assert all(line.startswith(b'contents ') for line in lines[1:])
    result=original(*args,**kwargs)
    if command[-1]=='--batch-command':
        output=kwargs['stdout'];output.seek(0)
        assert output.readline().split()[1]==b'commit'
        # The next bytes are the first blob header, never the commit body.
        assert output.readline().split()[1]==b'blob'
        output.seek(0,2)
    return result
store.subprocess.run=observe
with store.GitCandidateContent(root) as reader:
    expected=reader.content_ref(actual,paths)
    assert reader.content_ref(actual,paths)==expected
assert batches==[('--batch-command',4096),('--batch',2),('--batch-check',4096),('--batch-check',2)],batches
assert len(trees)==2,trees
`);
  }, 20000);

  it("#7 rejects a 40-hex prefix in a SHA256 repository and accepts its exact actual commit", () => {
    run(`
sha=root/'sha256';sha.mkdir()
process=subprocess.run(['git','-C',str(sha),'init','-q','--object-format=sha256'],capture_output=True)
if process.returncode: raise AssertionError('SHA256 Git repository support required')
subprocess.check_call(['git','-C',str(sha),'config','user.name','Fixture'])
subprocess.check_call(['git','-C',str(sha),'config','user.email','fixture@example.invalid'])
(sha/'file').write_bytes(b'body')
subprocess.check_call(['git','-C',str(sha),'add','.'])
subprocess.check_call(['git','-C',str(sha),'-c','commit.gpgsign=false','commit','-qm','sha256'])
actual=subprocess.check_output(['git','-C',str(sha),'rev-parse','HEAD']).decode().strip()
assert len(actual)==64
with store.GitCandidateContent(sha) as reader:
    expected=store.candidate_content_ref(sha,['file'],'git')
    assert reader.content_ref(actual,['file'])==expected
    rejected('invalid_git_fact',lambda:reader.content_ref(actual[:40],['file']))
`);
  });
});
