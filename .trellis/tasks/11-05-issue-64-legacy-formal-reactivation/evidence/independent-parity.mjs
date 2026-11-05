import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
// Run from the repository root after building Core.
const repo=process.cwd();
const { classifyFormalArchivePredecessor, validateFormalArchiveSuccessorSource } = await import(pathToFileURL(path.join(repo, 'packages/core/dist/task/maintenance.js')).href);
const { emptyTaskRecordV2 } = await import(pathToFileURL(path.join(repo, 'packages/core/dist/task/v2/operations.js')).href);
const python=process.env.TRELLIS_PARITY_PYTHON ?? '/usr/bin/python3';
const old=JSON.parse(fs.readFileSync(repo+'/packages/cli/test/fixtures/legacy-formal/task.json','utf8'));
const issue={kind:'issue',repo_ref:'example/project',number:130,disposition:'reference_only'};
const cases=[
 ['canonical',{},issue,true],
 ...['exact_source','reference_only','follow_up','parent'].map(disposition=>[disposition,{}, {...issue,disposition},true]),
 ['newline',{scope:old.scope+'\n'},issue,false],
 ['noncanonical-number',{scope:old.scope.replace('/130','/0130')},issue,false],
 ['unsafe-number',{scope:old.scope.replace('/130','/9007199254740992')},issue,false],
 ['missing-scope',{scope:null},issue,false],
 ['missing-person',{creator:null},issue,false],
 ['unknown-field',{unknown:'x'},issue,false],
 ['incomplete',{status:'planning'},issue,false],
 ['explicit-generation',{lifecycle_generation:0},issue,false],
 ['different-repo',{}, {...issue,repo_ref:'other/project'},false],
 ['different-issue',{}, {...issue,number:131},false],
 ['no-issue',{}, {kind:'no_issue'},false],
];
const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'trellis64-independent-parity-')));
try {
 for(const [name,change,source,want] of cases){
  const root=path.join(base,name), archive='.trellis/tasks/archive/2026-10/source', active='.trellis/tasks/selected';
  const predecessor={...old,...change};
  const current=emptyTaskRecordV2({id:old.id,lifecycle_generation:1,source});
  const write=(ref,value)=>{fs.mkdirSync(path.dirname(path.join(root,ref)),{recursive:true});fs.writeFileSync(path.join(root,ref),JSON.stringify(value));};
  write(archive+'/task.json',predecessor);write(active+'/task.json',current);write(active+'/migration/source-task.json',predecessor);
  write(active+'/migration/formal-archive-reactivation.json',{key:{task_id:old.id,lifecycle_generation:0},archive_ref:archive,original_task_ref:'.trellis/tasks/original',archive_commit:'a'.repeat(40)});
  let ts=true;try{classifyFormalArchivePredecessor(predecessor);validateFormalArchiveSuccessorSource(predecessor,source)}catch{ts=false}
  const result=spawnSync(python,['-B','-c',`import sys\nfrom pathlib import Path\nsys.path.insert(0,${JSON.stringify(repo+'/packages/cli/src/templates/trellis/scripts')})\nfrom common.task_utils import _formal_predecessor_for_relocation, TaskIdentityError\ntry:\n p=_formal_predecessor_for_relocation(Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3]))\n print('accepted' if p else 'rejected')\nexcept TaskIdentityError:\n print('rejected')`,path.join(root,active),old.id,root],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr); const py=result.stdout.trim()==='accepted';
  assert.equal(ts,want,`${name}: TS`);assert.equal(py,want,`${name}: Python`);
 }
 console.log(JSON.stringify({status:'passed',cases:cases.length,python}));
} finally{fs.rmSync(base,{recursive:true,force:true})}
