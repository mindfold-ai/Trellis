import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MaintenanceError } from "@mindfoldhq/trellis-core/task/maintenance";
import { emptyTaskRecord } from "@mindfoldhq/trellis-core/task/legacy-migration";
import { emptyTaskRecordV2, type TaskRecordV2 } from "@mindfoldhq/trellis-core/task/v2";
import { inspectTaskTarget, prepareTaskConversion, prepareLegacyCloseout, parseTaskConversionInput, parseLegacyCloseoutInput, type TaskConversionInput, type LegacyCloseoutInput } from "../../src/commands/maintenance/tasks.js";
import { prepareToolsInstallation } from "../../src/commands/maintenance/tools.js";
import { computeHash } from "../../src/utils/template-hash.js";
import { applyPlan, recoverOperation, rollbackOperation, snapshot } from "../../src/commands/maintenance/shared.js";

const scripts = path.resolve(__dirname, "../../src/templates/trellis/scripts");
const workflow = fs.readFileSync(path.resolve(__dirname, "../../src/templates/trellis/workflow-delivery-v1.md"), "utf8");
const python = process.platform === "darwin" ? "/usr/bin/python3" : "python3";
const key = { task_id: "selected", lifecycle_generation: 0 };
const ref = ".trellis/tasks/selected";
let base: string, root: string, sibling: string, common: string;
function write(rootDir: string, name: string, value: string | object, mode=0o640): void {
  const file = path.join(rootDir,name); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value,null,2)+"\n"); fs.chmodSync(file,mode);
}
function git(rootDir: string,...args:string[]):string { return execFileSync("git",["-C",rootDir,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim(); }
function run(script: string,...args:string[]) { return spawnSync(python,["-B",`.trellis/scripts/${script}`,...args],{cwd:root,encoding:"utf8",env:{...process.env,TRELLIS_CONTEXT_ID:"codex_old",PYTHONDONTWRITEBYTECODE:"1"}}); }
function selected() { return inspectTaskTarget({root,key,task_ref:ref}); }
function projection():TaskRecordV2 {
  const old=JSON.parse(fs.readFileSync(path.join(root,ref,"task.json"),"utf8")) as Record<string,unknown>;
  const metadata=Object.fromEntries(Object.entries(old).filter(([field])=>!["status","commit","pr_url","completedAt"].includes(field)));
  return emptyTaskRecordV2({...metadata,id:key.task_id});
}
function conversion():TaskConversionInput {
  const inspected=selected();
  return {root,key,task_ref:ref,source_kind:"schema1",projection:projection(),artifacts:inspected.artifacts.flatMap((entry)=>entry.kind==="file" && entry.path!==`${ref}/task.json` ? [{path:entry.path,action:"preserve" as const,source:entry.source as ReturnType<typeof snapshot>}] : []),legacy_facts:[],sessions:inspected.carriers.map(carrier=>({carrier,action:"replace",delivery_id:null})),branch_binding:{action:"preserve",source:inspected.branch_binding?.source??null}};
}
function bytes(rootDir:string,refPath:string):unknown {
  const full=path.join(rootDir,refPath); if(!fs.existsSync(full))return null;
  const stat=fs.statSync(full);return [stat.mode&0o777,stat.isDirectory()?fs.readdirSync(full).sort().map(name=>[name,bytes(rootDir,`${refPath}/${name}`)]):fs.readFileSync(full).toString("hex")];
}
beforeEach(()=>{
  base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"trellis-maint-task-")));root=path.join(base,"root");sibling=path.join(base,"peer");fs.mkdirSync(root);
  git(root,"init","-b","main");git(root,"config","user.name","Fixture");git(root,"config","user.email","fixture@example.invalid");write(root,"README.md","fixture");git(root,"add","README.md");git(root,"commit","-m","fixture");git(root,"worktree","add","-b","peer",sibling);
  common=git(root,"rev-parse","--path-format=absolute","--git-common-dir");
  fs.cpSync(scripts,path.join(root,".trellis/scripts"),{recursive:true});
  write(root,".trellis/workflow.md",workflow);
  write(root,`${ref}/task.json`,emptyTaskRecord({id:key.task_id,name:"Selected",title:"Selected",branch:"main"}));
  write(root,`${ref}/prd.md`,"accepted scope\n",0o600);fs.mkdirSync(path.join(root,ref,"empty"),{mode:0o700});
  write(common,"trellis/sessions/codex_old.json",{schema_version:2,...key});
  write(common,"trellis/task-branches/selected/0.json",{schema_version:"1.0",...key,binding_revision:1,branch_name:"main"});
  write(common,"trellis/sessions/unrelated.json",{schema_version:2,task_id:"another",lifecycle_generation:0});
  write(common,"trellis/sessions/other-generation.json",{schema_version:2,task_id:"selected",lifecycle_generation:1});
});
afterEach(()=>{vi.restoreAllMocks();fs.rmSync(base,{recursive:true,force:true});});

describe("selected task maintenance",()=>{
  it.each(["conversion", "history"] as const)("maintains native schema-1 metadata sessions through %s, recovery and exact rollback",async(kind)=>{
    // Historical 43fffc17 set_active_task output, including optional context metadata.
    const writer={platform:"codex",last_seen_at:"2026-10-15T09:58:29Z",schema_version:1,repository_common_dir:common,task_workspace_root:root,current_task:ref,current_run:null,sessionId:"original-session",transcript_path:"/platform/transcript"};
    write(common,"trellis/sessions/codex_old.json",writer,0o600);
    // Enumerated before the selected session; supported unselected records must classify.
    write(common,"trellis/sessions/aaa_other.json",JSON.stringify({...writer,current_task:".trellis/tasks/another"})+"\n",0o604);
    write(common,"trellis/sessions/aaa_peer.json",{...writer,task_workspace_root:sibling},0o600);
    write(sibling,".trellis/tasks/another/task.json",emptyTaskRecord({id:"another",name:"Another",title:"Another"}));
    const sessionsBefore=bytes(common,"trellis"),taskBefore=bytes(root,ref),peerBefore=bytes(sibling,".");
    const unselected=()=>[bytes(common,"trellis/sessions/aaa_other.json"),bytes(common,"trellis/sessions/aaa_peer.json")];
    const otherBefore=unselected(),inspected=selected();
    expect(inspected.carriers.map(carrier=>carrier.path)).toEqual(["trellis/sessions/codex_old.json"]);
    // Exercise the built public pair, beyond Vitest's source aliases.
    const smoke=spawnSync(process.execPath,["--input-type=module","-e",`
      import { maintenance } from './dist/index.js';
      import { classifySessionCarrier } from '@mindfoldhq/trellis-core/task/maintenance';
      const { root, key, ref, writer, common } = JSON.parse(process.argv[1]);
      const classified = classifySessionCarrier(writer, { task_id: key.task_id, generation: key.lifecycle_generation, task_path: root + '/' + ref, common_dir: common });
      const inspected = maintenance.inspectTaskTarget({ root, key, task_ref: ref });
      const plan = maintenance.prepareLegacyCloseout({ root, key, task_ref: ref, source_kind: 'schema1', archive_ref: '.trellis/tasks/archive/2026-10/selected', history_note: 'Original owner history retained.', retirements: [...inspected.carriers, inspected.branch_binding] });
      process.stdout.write(JSON.stringify({ classified, carriers: inspected.carriers.map(c => c.path), kind: plan.kind }));
    `,JSON.stringify({root,key,ref,writer,common})],{cwd:path.resolve(__dirname,"../.."),encoding:"utf8"});
    expect(smoke.status,smoke.stdout+smoke.stderr).toBe(0);
    expect(JSON.parse(smoke.stdout)).toEqual({classified:{kind:"path1",matches:true},carriers:["trellis/sessions/codex_old.json"],kind:"legacy_closeout"});
    const plan=kind==="conversion"?prepareTaskConversion(conversion()):prepareLegacyCloseout({root,key,task_ref:ref,source_kind:"schema1",archive_ref:".trellis/tasks/archive/2026-10/selected",history_note:"Original owner history retained.",retirements:[...inspected.carriers,...(inspected.branch_binding?[inspected.branch_binding]:[])]});
    expect(bytes(common,"trellis")).toEqual(sessionsBefore);expect(bytes(root,ref)).toEqual(taskBefore);
    const result=await applyPlan(plan,path.join(base,"state"));
    expect(result.status).toBe("applied");
    if(kind==="conversion"){
      expect(JSON.parse(fs.readFileSync(path.join(common,"trellis/sessions/codex_old.json"),"utf8"))).toEqual({schema_version:3,...key,delivery_id:null});
      expect(fs.readFileSync(path.join(root,ref,"migration/source-task.json"))).toEqual(Buffer.from(selectedSource(plan),"base64"));
    }else{
      expect(fs.existsSync(path.join(common,"trellis/sessions/codex_old.json"))).toBe(false);
      expect(fs.readFileSync(path.join(root,".trellis/tasks/archive/2026-10/selected/task.json"))).toEqual(Buffer.from(selectedSource(plan),"base64"));
    }
    expect(unselected()).toEqual(otherBefore);expect(bytes(sibling,".")).toEqual(peerBefore);
    expect((await recoverOperation(result.recovery_ref as string)).status).toBe("applied");
    expect((await applyPlan(plan,path.join(base,"state"))).operation_id).toBe(plan.operation_id);
    expect(unselected()).toEqual(otherBefore);expect(bytes(sibling,".")).toEqual(peerBefore);
    expect((await rollbackOperation(result.recovery_ref as string)).status).toBe("rolled_back");
    expect(bytes(common,"trellis")).toEqual(sessionsBefore);expect(bytes(root,ref)).toEqual(taskBefore);expect(bytes(sibling,".")).toEqual(peerBefore);
  });
  it("returns typed public SDK input errors before inspecting or writing a target",()=>{
    const invalidCalls = [
      () => parseTaskConversionInput({root}),
      () => parseLegacyCloseoutInput({root}),
      () => prepareTaskConversion({root} as TaskConversionInput),
      () => prepareLegacyCloseout({root} as LegacyCloseoutInput),
      () => inspectTaskTarget({root,key:{task_id:"selected",lifecycle_generation:-1},task_ref:ref}),
    ];
    for (const invoke of invalidCalls) {
      let error:unknown;
      try { invoke(); } catch (caught) { error=caught; }
      expect(error).toBeInstanceOf(MaintenanceError);
      expect(error).toMatchObject({code:"invalid_input"});
    }
    const missingProjection=conversion();delete (missingProjection as Partial<TaskConversionInput>).projection;
    expect(()=>parseTaskConversionInput(missingProjection)).toThrow(MaintenanceError);
  });
  it("prepares without old dispatcher and preserves peer, history and unrelated sessions through same-operation recovery",async()=>{
    // A common identity binding shadows the same old local carrier until retirement.
    write(root,".trellis/.runtime/sessions/codex_old.json",{platform:"codex",last_seen_at:"2026-10-15T09:58:29Z",current_task:ref,current_run:null},0o600);
    const peer=bytes(sibling,"."),other=bytes(common,"trellis/sessions/other-generation.json"),before=bytes(root,ref);
    const nativeBefore=run("get_context.py","--mode","continuation");expect(nativeBefore.status).toBe(1);expect(nativeBefore.stdout+nativeBefore.stderr).toContain("maintenance_required");
    expect(JSON.parse(run("delivery.py","current","--json").stdout).code).toBe("maintenance_required");
    const input=conversion(),plan=prepareTaskConversion(input);expect(bytes(root,ref)).toEqual(before);
    const result=await applyPlan(plan,path.join(base,"state"));expect(result.status).toBe("applied");
    expect((await applyPlan(plan,path.join(base,"state"))).operation_id).toBe(plan.operation_id);
    expect((await recoverOperation(result.recovery_ref as string)).status).toBe("applied");
    expect(fs.existsSync(path.join(root,".trellis/.runtime/sessions/codex_old.json"))).toBe(false);
    expect(bytes(sibling,".")).toEqual(peer);expect(bytes(common,"trellis/sessions/other-generation.json")).toEqual(other);
    expect(fs.readFileSync(path.join(root,ref,"migration/source-task.json"))).toEqual(Buffer.from(selectedSource(plan),"base64"));
    // Execute the actual native next owner; conversion itself supplied no gate.
    const authority={locator:`${ref}/prd.md`,revision:`sha256:${snapshot("accepted scope\n").sha256}`};
    const next=run("delivery.py","apply","--input",JSON.stringify({api_version:"1.0",operation:"accept_scope",key,owner_role:"task_scope",owner_id:"trellis-start",authority}));
    expect(next.status,next.stderr+next.stdout).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(root,ref,"task.json"),"utf8")).accepted_scope).toEqual(authority);
    expect((run("delivery.py","current","--json")).status).toBe(0);
  });
  it("history closeout freezes raw bytes/modes, retires obsolete resurfacing carriers only after archive, and leaves normal old-native selection empty",async()=>{
    write(root,".trellis/workflow.md","Old retained native workflow\n");
    write(root,".trellis/.runtime/sessions/codex_old.json",{platform:"codex",last_seen_at:"2026-10-15T09:58:29Z",current_task:ref,current_run:null});
    write(common,"trellis/sessions/path1.json",{schema_version:1,repository_common_dir:common,task_workspace_root:root,current_task:ref});
    const before=bytes(root,ref),scriptsBefore=bytes(root,".trellis/scripts"),peer=bytes(sibling,"."),other=bytes(common,"trellis/sessions/other-generation.json"),inspected=selected();
    const plan=prepareLegacyCloseout({root,key,task_ref:ref,source_kind:"schema1",archive_ref:".trellis/tasks/archive/2026-10/selected",history_note:"Original owner: delivered externally; customer acceptance remains pending.",retirements:[...inspected.carriers,...(inspected.branch_binding?[inspected.branch_binding]:[])]});
    expect(bytes(root,ref)).toEqual(before);const result=await applyPlan(plan,path.join(base,"state"));expect(result.status).toBe("applied");
    expect(fs.existsSync(path.join(root,ref))).toBe(false);
    const archived=".trellis/tasks/archive/2026-10/selected";
    expect(fs.readFileSync(path.join(root,archived,"task.json"))).toEqual(Buffer.from(selectedSource(plan),"base64"));
    expect(fs.statSync(path.join(root,archived,"empty")).mode&0o777).toBe(0o700);
    expect(fs.readFileSync(path.join(root,archived,"maintenance-history.md"),"utf8")).toContain("acceptance remains pending");
    const current=run("task.py","current","--json");expect(current.status,current.stderr+current.stdout).toBe(1);expect(JSON.parse(current.stdout).current_task).toBeNull();expect(JSON.parse(current.stdout).stale).toBe(false);expect(current.stdout).not.toContain("unsupported_binding_schema");
    expect(bytes(root,".trellis/scripts")).toEqual(scriptsBefore);expect(bytes(sibling,".")).toEqual(peer);expect(bytes(common,"trellis/sessions/other-generation.json")).toEqual(other);
    expect((await recoverOperation(result.recovery_ref as string)).status).toBe("applied");
    await rollbackOperation(result.recovery_ref as string);expect(bytes(root,ref)).toEqual(before);
  });
  it("rejects an intervening normal task selection before closeout writes and accepts a freshly reviewed carrier set",async()=>{
    write(root,".trellis/workflow.md","Old retained native workflow\n");
    const original=JSON.parse(fs.readFileSync(path.join(root,ref,"task.json"),"utf8"));
    original.status="in_progress";write(root,`${ref}/task.json`,original);
    const prepare = ():ReturnType<typeof prepareLegacyCloseout> => {
      const inspected=selected();
      return prepareLegacyCloseout({root,key,task_ref:ref,source_kind:"schema1",archive_ref:".trellis/tasks/archive/2026-10/selected",history_note:"Original owner retained history.",retirements:[...inspected.carriers,...(inspected.branch_binding?[inspected.branch_binding]:[])]});
    };
    const stale=prepare();
    // The native supported predecessor writer creates a second selection;
    // no artifact or prepared operation is edited to manufacture staleness.
    const second=spawnSync(python,["-B",".trellis/scripts/task.py","start",ref,"--allow-empty-context"],{cwd:root,encoding:"utf8",env:{...process.env,TRELLIS_CONTEXT_ID:"codex_second",PYTHONDONTWRITEBYTECODE:"1"}});
    expect(second.status,second.stdout+second.stderr).toBe(0);
    const taskBefore=bytes(root,".trellis/tasks"),sessionsBefore=bytes(common,"trellis");
    await expect(applyPlan(stale,path.join(base,"stale-state"))).rejects.toThrow("Selected Task carrier was not reviewed for retirement");
    expect(bytes(root,".trellis/tasks")).toEqual(taskBefore);expect(bytes(common,"trellis")).toEqual(sessionsBefore);
    expect(fs.existsSync(path.join(base,"stale-state"))).toBe(false);
    const fresh=prepare(),result=await applyPlan(fresh,path.join(base,"fresh-state"));
    expect(result.status).toBe("applied");expect(fs.existsSync(path.join(root,ref))).toBe(false);
    expect(fs.existsSync(path.join(common,"trellis/sessions/codex_second.json"))).toBe(false);
    expect((await recoverOperation(result.recovery_ref as string)).status).toBe("applied");
    const current=spawnSync(python,["-B",".trellis/scripts/task.py","current","--json"],{cwd:root,encoding:"utf8",env:{...process.env,TRELLIS_CONTEXT_ID:"codex_second",PYTHONDONTWRITEBYTECODE:"1"}});
    expect(current.status,current.stdout+current.stderr).toBe(1);expect(JSON.parse(current.stdout)).toMatchObject({current_task:null,stale:false});
  });
  it("resumes closeout after ordinary carrier retirement and rejects a new carrier during recovery",async()=>{
    write(root,".trellis/workflow.md","Old retained native workflow\n");
    const original=JSON.parse(fs.readFileSync(path.join(root,ref,"task.json"),"utf8"));
    original.status="in_progress";write(root,`${ref}/task.json`,original);
    const inspected=selected(),plan=prepareLegacyCloseout({root,key,task_ref:ref,source_kind:"schema1",archive_ref:".trellis/tasks/archive/2026-10/selected",history_note:"Original owner retained history.",retirements:[...inspected.carriers,...(inspected.branch_binding?[inspected.branch_binding]:[])]});
    const unlink=fs.unlinkSync;
    vi.spyOn(fs,"unlinkSync").mockImplementation((file)=>{
      if(String(file)===path.join(root,ref,"task.json"))throw new Error("ordinary removal failure");
      return unlink(file);
    });
    await expect(applyPlan(plan,path.join(base,"state"))).rejects.toThrow("ordinary removal failure");
    vi.restoreAllMocks();
    const recovery=path.join(base,"state",`${plan.operation_id}.json`);
    expect(fs.existsSync(path.join(common,"trellis/sessions/codex_old.json"))).toBe(false);
    expect((await recoverOperation(recovery)).status).toBe("pending");
    const secondEnv={...process.env,TRELLIS_CONTEXT_ID:"codex_second",PYTHONDONTWRITEBYTECODE:"1"};
    const start=spawnSync(python,["-B",".trellis/scripts/task.py","start",ref,"--allow-empty-context"],{cwd:root,encoding:"utf8",env:secondEnv});
    expect(start.status,start.stdout+start.stderr).toBe(0);
    const taskBefore=bytes(root,".trellis/tasks"),sessionsBefore=bytes(common,"trellis");
    await expect(recoverOperation(recovery)).rejects.toMatchObject({code:"stale_source"});
    await expect(applyPlan(plan,path.join(base,"state"))).rejects.toMatchObject({code:"stale_source"});
    expect(bytes(root,".trellis/tasks")).toEqual(taskBefore);expect(bytes(common,"trellis")).toEqual(sessionsBefore);
    const finish=spawnSync(python,["-B",".trellis/scripts/task.py","finish"],{cwd:root,encoding:"utf8",env:secondEnv});
    expect(finish.status,finish.stdout+finish.stderr).toBe(0);
    expect((await applyPlan(plan,path.join(base,"state"))).status).toBe("applied");
    expect((await recoverOperation(recovery)).status).toBe("applied");
  });
  it("retains owner-attributed delivered history while native whole-task acceptance remains distinct and no replacement Delivery appears",async()=>{
    const original=JSON.parse(fs.readFileSync(path.join(root,ref,"task.json"),"utf8"));
    original.status="completed";original.pr_url="https://github.com/example/project/pull/4";
    write(root,`${ref}/task.json`,original);
    const pendingEvidence="Original completion owner: PR #4 is delivered. Whole-task customer acceptance and external evidence are still pending; do not record Completion, Closure or create another Delivery.\n";
    write(root,`${ref}/pending-acceptance.md`,pendingEvidence,0o600);
    const input=conversion(),record=projection(),deliveryId="11111111-1111-4111-8111-111111111111";
    const authority={locator:`${ref}/prd.md`,revision:`sha256:${snapshot("accepted scope\n").sha256}`};
    const candidate={kind:"git" as const,content_ref:`sha256:${"a".repeat(64)}`,paths:["README.md"],head_ref:git(root,"rev-parse","HEAD"),base_ref:git(root,"rev-parse","HEAD")};
    record.deliveries=[{id:deliveryId,lifecycle_generation:0,scope_ref:{authority,anchors:["retained-slice"]},planning_root:`deliveries/${deliveryId}`,profile:"pull_request",phase:"delivered",plan_ref:null,candidate:null,results:{planning:null,check:null,full_review:null,readiness:null},publication_result:null,delivery_result:{result_id:"22222222-2222-4222-8222-222222222222",owner_id:"trellis-deliver",evidence:[{locator:"https://github.com/example/project/pull/4",revision:"original-owner-verified"}],profile:"pull_request",candidate,repo_ref:"example/project",pr_number:4,reviewed_head:candidate.head_ref,merge_commit:candidate.head_ref,target_ref:"main"},stop_result:null}];
    input.projection=record;input.legacy_facts=[{field:"pr_url",disposition:"delivery_result",owner_id:"trellis-deliver",result_id:"22222222-2222-4222-8222-222222222222",reason:{locator:"https://github.com/example/project/pull/4",revision:"original-owner-verified"}}];
    for(const artifact of ["prd.md","design.md","implement.md","implement.jsonl","check.jsonl"])
      input.artifacts.push({path:`${ref}/deliveries/${deliveryId}/${artifact}`,action:"write",source:null,target:snapshot(artifact.endsWith("jsonl")?"":"Retained owner plan\n")});
    const plan=prepareTaskConversion(input);await applyPlan(plan,path.join(base,"state"));
    const continuation=run("get_context.py","--mode","continuation");expect(continuation.status,continuation.stderr+continuation.stdout).toBe(0);expect(continuation.stdout).toContain("whole-scope acceptance");
    const current=JSON.parse(run("delivery.py","current","--json").stdout);expect(current.kind).toBe("no_current_delivery");
    // These are the real target-native queries consumed by the Completion
    // owner, alongside its retained pending-evidence note and continuation.
    const taskQuery=run("task.py","current","--json");expect(taskQuery.status,taskQuery.stderr+taskQuery.stdout).toBe(0);expect(taskQuery.stdout).toContain('"selected"');
    const historyQuery=run("delivery.py","list","--task",ref,"--json");expect(historyQuery.status,historyQuery.stderr+historyQuery.stdout).toBe(0);expect(JSON.parse(historyQuery.stdout)).toEqual(record.deliveries);
    expect(fs.readFileSync(path.join(root,ref,"pending-acceptance.md"),"utf8")).toBe(pendingEvidence);
    expect(continuation.stdout).toContain("trellis-complete-task decides whole-scope acceptance");
    const next=run("delivery.py","apply","--input",JSON.stringify({api_version:"1.0",operation:"accept_scope",key,owner_role:"task_scope",owner_id:"trellis-start",authority}));expect(next.status,next.stderr+next.stdout).toBe(0);
    const after=JSON.parse(fs.readFileSync(path.join(root,ref,"task.json"),"utf8"));
    expect(after.deliveries).toEqual(record.deliveries);expect(after.deliveries).toHaveLength(1);expect(after.completion_results).toEqual([]);expect(after.closure_results).toEqual([]);
  });
  it("keeps inherited peer bytes and requires explicit branch establishment when original binding is absent",()=>{
    write(sibling,`${ref}/task.json`,JSON.parse(fs.readFileSync(path.join(root,ref,"task.json"),"utf8")));
    fs.unlinkSync(path.join(common,"trellis/task-branches/selected/0.json"));
    const before=bytes(sibling,ref);const input=conversion();expect(()=>prepareTaskConversion(input)).toThrow("ambiguous_authority");
    input.branch_binding={action:"establish",source:null,record:{schema_version:"1.0",...key,binding_revision:1,branch_name:"main"}};
    expect(prepareTaskConversion(input).kind).toBe("task_conversion");expect(bytes(sibling,ref)).toEqual(before);
  });
  it("rejects selected and Selected identity reservations before conversion despite an exact branch binding",()=>{
    const input=conversion();
    write(root,".trellis/tasks/different-directory/task.json",emptyTaskRecord({id:"Selected",name:"Casefold peer",title:"Casefold peer"}));
    const tasksBefore=bytes(root,".trellis/tasks"),bindingsBefore=bytes(common,"trellis");
    expect(()=>selected()).toThrow("task_id_casefold_collision");
    expect(()=>prepareTaskConversion(input)).toThrow("task_id_casefold_collision");
    expect(bytes(root,".trellis/tasks")).toEqual(tasksBefore);expect(bytes(common,"trellis")).toEqual(bindingsBefore);
    expect(fs.existsSync(path.join(root,ref,"migration"))).toBe(false);
  });
  it("requires explicit artifact maps and exact selected retirements without manufacturing history from merged PR",()=>{
    const input=conversion();input.artifacts=[];expect(()=>prepareTaskConversion(input)).toThrow("missing artifact disposition");
    const inspected=selected();expect(()=>prepareLegacyCloseout({root,key,task_ref:ref,source_kind:"schema1",archive_ref:".trellis/tasks/archive/2026-10/selected",history_note:"retained",retirements:inspected.carriers})).toThrow("every selected carrier");
  });
  it("maps predecessor local selection into exact common session storage and retires the obsolete carrier",async()=>{
    fs.unlinkSync(path.join(common,"trellis/sessions/codex_old.json"));write(root,".trellis/.runtime/sessions/codex_old.json",{platform:"codex",last_seen_at:"2026-10-15T09:58:29Z",current_task:ref,current_run:null});
    const plan=prepareTaskConversion(conversion());await applyPlan(plan,path.join(base,"state"));
    expect(fs.existsSync(path.join(root,".trellis/.runtime/sessions/codex_old.json"))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(common,"trellis/sessions/codex_old.json"),"utf8"))).toEqual({schema_version:3,...key,delivery_id:null});
    expect(run("delivery.py","current","--json").status).toBe(0);
  });
  it("preserves a selected Task directory alias through real installation/conversion and blocks incompatible tools rollback",async()=>{
    const backing=path.join(base,"selected-storage");
    fs.renameSync(path.join(root,ref),backing);
    const rawLink=path.relative(path.dirname(path.join(root,ref)),backing);
    fs.symlinkSync(rawLink,path.join(root,ref),"dir");
    // Use the same supported predecessor fixture as tools installation tests.
    fs.rmSync(path.join(root,".trellis/scripts"),{recursive:true});
    const oldScript="# old runnable installation\n";
    write(root,".trellis/scripts/task.py",oldScript,0o755);
    write(root,".trellis/.version","0.6.15\n");
    write(root,".trellis/workflow.md","# Original retained native workflow\n");
    write(root,".trellis/.template-hashes.json",{__version:2,hashes:{".trellis/scripts/task.py":computeHash(oldScript)}});
    const install=await prepareToolsInstallation({root,workflow:{action:"install",template_id:"native-delivery-v1",provider:"bundled",content:workflow,ownership:"bundled"},file_decisions:[]});
    const installed=await applyPlan(install,path.join(base,"tool-state"));
    const plan=prepareTaskConversion(conversion());
    await applyPlan(plan,path.join(base,"task-state"));
    expect(fs.lstatSync(path.join(root,ref)).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(path.join(root,ref))).toBe(rawLink);
    expect(JSON.parse(fs.readFileSync(path.join(backing,"task.json"),"utf8")).schema_version).toBe("2.0");
    expect(run("delivery.py","current","--json").status).toBe(0);
    await expect(rollbackOperation(installed.recovery_ref as string)).rejects.toThrow("incompatible_restore");
    expect(JSON.parse(fs.readFileSync(path.join(backing,"task.json"),"utf8")).schema_version).toBe("2.0");
  });
  it("archives a linked logical Task as a plain tree and restores the exact raw link and backing bytes/modes",async()=>{
    const backing=path.join(base,"history-storage");
    fs.renameSync(path.join(root,ref),backing);
    const rawLink=path.relative(path.dirname(path.join(root,ref)),backing);
    fs.symlinkSync(rawLink,path.join(root,ref),"dir");
    write(root,".trellis/workflow.md","Old retained native workflow\n");
    write(root,".trellis/.runtime/sessions/codex_old.json",{platform:"codex",last_seen_at:"2026-10-15T09:58:29Z",current_task:ref,current_run:null});
    const before=bytes(root,ref),inspected=selected(),archive=".trellis/tasks/archive/2026-10/selected";
    const plan=prepareLegacyCloseout({root,key,task_ref:ref,source_kind:"schema1",archive_ref:archive,history_note:"Historical result retained; external acceptance pending.",retirements:[...inspected.carriers,...(inspected.branch_binding?[inspected.branch_binding]:[])]});
    const result=await applyPlan(plan,path.join(base,"state"));
    expect(fs.lstatSync(path.join(root,ref),{throwIfNoEntry:false})).toBeUndefined();
    expect(fs.statSync(backing).isDirectory()).toBe(true);
    expect(fs.readdirSync(backing)).toEqual([]);
    expect(fs.lstatSync(path.join(root,archive)).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(path.join(root,archive,"prd.md"),"utf8")).toBe("accepted scope\n");
    const current=run("task.py","current","--json");
    expect(current.status,current.stdout+current.stderr).toBe(1);
    expect(JSON.parse(current.stdout).current_task).toBeNull();
    expect(JSON.parse(current.stdout).stale).toBe(false);
    await rollbackOperation(result.recovery_ref as string);
    expect(fs.readlinkSync(path.join(root,ref))).toBe(rawLink);
    expect(bytes(root,ref)).toEqual(before);
    expect(fs.statSync(path.join(backing,"empty")).mode&0o777).toBe(0o700);
  });
  it("rejects a normally reconfigured selected alias after prepare without writing either backing tree",async()=>{
    const backing=path.join(base,"original-storage"),replacement=path.join(base,"new-storage");
    fs.renameSync(path.join(root,ref),backing);fs.symlinkSync(backing,path.join(root,ref),"dir");
    const before=bytes(root,ref),plan=prepareTaskConversion(conversion());
    fs.cpSync(backing,replacement,{recursive:true});fs.unlinkSync(path.join(root,ref));fs.symlinkSync(replacement,path.join(root,ref),"dir");
    await expect(applyPlan(plan,path.join(base,"state"))).rejects.toThrow("later_work_conflict");
    expect(fs.existsSync(path.join(base,"state"))).toBe(false);
    expect(bytes(base,"original-storage")).toEqual(before);
    expect(bytes(base,"new-storage")).toEqual(before);
  });

});
function selectedSource(plan:ReturnType<typeof prepareTaskConversion>):string {
  const action=plan.actions.find(item=>item.path===`${ref}/task.json` && item.root===root && item.source && item.kind!=="directory");
  if(!action || action.kind==="directory" || !action.source)throw new Error("missing original source");return action.source.content_base64;
}
