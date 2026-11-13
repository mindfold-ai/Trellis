import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const scripts = path.resolve(__dirname, "../../src/templates/trellis/scripts");
const python = process.platform === "darwin" ? "/usr/bin/python3" : "python3";
const available = spawnSync(python, ["--version"]).status === 0;

describe.skipIf(!available)("operation-local Git object reader", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-git-objects-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
    git("init", "-q");
    fs.writeFileSync(path.join(root, "with\nnewline"), Buffer.alloc(2 * 1024 * 1024, 0x61));
    fs.writeFileSync(path.join(root, "empty"), "");
    git("add", ".");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "batch fixture");
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("reads exact NUL paths and unique blobs with bounded reads, closing temporary files on success and ordinary parse failure", () => {
    const result = spawnSync(python, ["-c", `
import hashlib,json,sys
from pathlib import Path
from common import git_objects
root=Path.cwd()
tree=git_objects.read_tree(root,'HEAD')
assert 'with\\nnewline' in tree and 'empty' in tree
files=[];original=git_objects.tempfile.TemporaryFile
def temporary(*args,**kwargs):
    file=original(*args,**kwargs);files.append(file);return file
git_objects.tempfile.TemporaryFile=temporary
calls=[]
def consume(stream,size):
    calls.append(size);value=hashlib.sha256()
    while size:
        chunk=stream.read(min(size,65536));assert chunk;size-=len(chunk);value.update(chunk)
    return value.hexdigest()
oids=[tree['with\\nnewline'].oid,tree['empty'].oid]
facts=git_objects.read_blob_facts(root,oids+oids,consume)
assert len(facts)==2 and sorted(calls)==[0,2*1024*1024]
assert all(file.closed for file in files)
git_objects.verify_blob_objects(root,oids+oids)
assert all(file.closed for file in files)
def invalid_json(stream,size): return json.loads(stream.read(size).decode('utf-8'))
try: git_objects.read_blob_facts(root,oids[:1],invalid_json)
except json.JSONDecodeError: pass
else: raise AssertionError('invalid JSON accepted')
assert all(file.closed for file in files)
try: git_objects.read_blob_facts(root,['0'*40],consume)
except ValueError: pass
else: raise AssertionError('missing object accepted')
assert all(file.closed for file in files)
try: git_objects.verify_blob_objects(root,['0'*40])
except ValueError: pass
else: raise AssertionError('missing metadata object accepted')
assert all(file.closed for file in files)
print('ok')
`], { cwd: root, encoding: "utf8", env: { ...process.env, PYTHONPATH: scripts } });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("ok");
  });
});
