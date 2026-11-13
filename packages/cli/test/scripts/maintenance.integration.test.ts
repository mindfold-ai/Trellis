import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classifyMaintenanceTask } from "@mindfoldhq/trellis-core/task/maintenance";
import { emptyTaskRecord } from "@mindfoldhq/trellis-core/task/legacy-migration";

const scripts=path.resolve(__dirname,"../../src/templates/trellis/scripts");
const python=process.platform==="darwin"?"/usr/bin/python3":"python3";
let root:string;
beforeEach(()=>{root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"trellis-maint-native-")));fs.cpSync(scripts,path.join(root,".trellis/scripts"),{recursive:true});fs.mkdirSync(path.join(root,".trellis/tasks/old"),{recursive:true});});
afterEach(()=>fs.rmSync(root,{recursive:true,force:true}));
function check(value:unknown): {known:boolean;diagnostic:string|null} {
  fs.writeFileSync(path.join(root,".trellis/tasks/old/task.json"),JSON.stringify(value));
  const result=spawnSync(python,["-B","-c",`import sys,json\nfrom pathlib import Path\nsys.path.insert(0,str(Path('.trellis/scripts').resolve()))\nfrom common.maintenance import is_known_legacy_task,task_maintenance_diagnostic\nvalue=json.loads(Path('.trellis/tasks/old/task.json').read_text())\nprint(json.dumps(dict(known=is_known_legacy_task(value),diagnostic=task_maintenance_diagnostic(Path('.trellis/tasks/old').resolve()))))`],{cwd:root,encoding:"utf8",env:{...process.env,PYTHONDONTWRITEBYTECODE:"1"}});
  expect(result.status,result.stderr).toBe(0);return JSON.parse(result.stdout) as {known:boolean;diagnostic:string|null};
}
describe("native maintenance diagnostic parity",()=>{
  it("positively classifies known preidentity without granting normal current-reader authority",()=>{
    const legacy={id:"old",name:"Old",title:"Old",status:"completed",creator:"original",assignee:"original",completedAt:"2024-01-01",subtasks:["child"],meta:{preserved:true}};
    expect(classifyMaintenanceTask(legacy).kind).toBe("legacy");const actual=check(legacy);expect(actual.known).toBe(true);expect(actual.diagnostic).toContain("maintenance_required");expect(actual.diagnostic).toContain(`--target ${root}`);expect(actual.diagnostic).toContain("--task-id old --generation 0 --task-ref .trellis/tasks/old");
    const strict=spawnSync(python,["-B","-c",`import sys\nfrom pathlib import Path\nsys.path.insert(0,str(Path('.trellis/scripts').resolve()))\nfrom common.io import read_json_checked\nvalue,reason=read_json_checked(Path('.trellis/tasks/old/task.json'))\nassert value is None and reason=='unsupported-fields',(value,reason)`],{cwd:root,encoding:"utf8"});expect(strict.status,strict.stderr).toBe(0);
  });
  it("keeps canonical schema1 diagnostic separate from malformed/unknown state",()=>{
    const current=emptyTaskRecord({id:"old"});expect(classifyMaintenanceTask(current).kind).toBe("schema1");expect(check(current).diagnostic).toContain("maintenance_required");
    for(const value of [{id:"old"},{id:"old",name:"Old",title:"Old",status:"planning",creator:"owner",assignee:"owner",meta:[]}, {...current,unknown_field:true}]){
      expect(()=>classifyMaintenanceTask(value)).toThrow("unsupported_source");expect(check(value).diagnostic).toBeNull();
    }
  });
  it("keeps canonical/dogfood native diagnostic implementations byte-identical",()=>{
    for(const name of ["maintenance.py","session_storage.py","active_task.py","runtime_contract.py","delivery_session.py"])
      expect(fs.readFileSync(path.join(scripts,"common",name))).toEqual(fs.readFileSync(path.resolve(__dirname,"../../../../.trellis/scripts/common",name)));
  });
});
