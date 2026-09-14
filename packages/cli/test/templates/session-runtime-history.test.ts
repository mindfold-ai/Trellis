import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const modules = path.resolve(import.meta.dirname, "../../src/templates/opencode/lib");
let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-opencode-sessions-")); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

function probe(code: string): void {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {syncBuiltinESMExports} from "node:module";
import {pathToFileURL} from "node:url";
const root = fs.realpathSync(${JSON.stringify(root)});
const history = path.join(root, ".trellis/workspace");
fs.mkdirSync(history, {recursive:true});
let audit = false;
const accesses = [];
for(const method of ["readFileSync", "readdirSync"]){
  const original = fs[method];
  fs[method] = function(file,...args){
    let actual;try{actual=fs.realpathSync(file);}catch{actual=String(file);}
    if(audit && (actual===history || actual.startsWith(history+path.sep))) accesses.push([method,actual]);
    return original.call(this,file,...args);
  };
}
syncBuiltinESMExports();
const {TrellisContext}=await import(pathToFileURL(${JSON.stringify(path.join(modules, "trellis-context.js"))}));
const {buildSessionContext}=await import(pathToFileURL(${JSON.stringify(path.join(modules, "session-utils.js"))}));
const ctx = new TrellisContext(root);
process.env.TRELLIS_CONTEXT_ID="review";
${code}
`], { encoding: "utf8" });
  expect(result.status, result.stdout + result.stderr).toBe(0);
}

describe("OpenCode runtime history isolation", () => {
  it.each(["file", "sessions", "runtime"])("does not select tasks from a historical %s alias", (mode) => {
    probe(`
for(const name of ["one","two"]){
 const task=path.join(root,".trellis/tasks",name);fs.mkdirSync(task,{recursive:true});
 fs.writeFileSync(path.join(task,"task.json"),JSON.stringify({title:name,status:"in_progress"}));
}
const runtime=path.join(root,".trellis/.runtime"), sessions=path.join(runtime,"sessions");
const mode=${JSON.stringify(mode)};
let file, alias;
if(mode==="runtime"){
 fs.symlinkSync(history,runtime,"dir");fs.mkdirSync(path.join(history,"sessions"));
 file=path.join(history,"sessions/review.json");alias=runtime;
}else if(mode==="sessions"){
 fs.mkdirSync(runtime);fs.symlinkSync(history,sessions,"dir");file=path.join(history,"review.json");alias=sessions;
}else{
 fs.mkdirSync(sessions,{recursive:true});file=path.join(history,"old.json");alias=path.join(sessions,"review.json");fs.symlinkSync(file,alias);
}
for(const name of [null,"one","two"]){
 audit=false;if(name)fs.writeFileSync(file,JSON.stringify({current_task:".trellis/tasks/"+name}));
 audit=true;
 assert.equal(ctx.getActiveTask().taskPath,null);
 assert.equal(ctx._resolveSingleSessionFallback(),null);
 assert.deepEqual(accesses,[]);
}
audit=false;const original=fs.readFileSync(file,"utf8");
fs.unlinkSync(alias);fs.mkdirSync(sessions,{recursive:true});
fs.writeFileSync(path.join(sessions,"review.json"),JSON.stringify({current_task:".trellis/tasks/one"}));
audit=true;assert.equal(ctx.getActiveTask().taskPath,".trellis/tasks/one");
delete process.env.TRELLIS_CONTEXT_ID;
assert.equal(ctx.getActiveTask().taskPath,null);
process.env.TRELLIS_CONTEXT_ID="missing";
assert.equal(ctx.getActiveTask().taskPath,null);
process.env.TRELLIS_CONTEXT_ID="review";
assert.equal(ctx.getActiveTask().source,"session:review");
audit=false;fs.writeFileSync(path.join(sessions,"second.json"),JSON.stringify({current_task:".trellis/tasks/two"}));
audit=true;assert.equal(ctx.getActiveTask().taskPath,".trellis/tasks/one");assert.deepEqual(accesses,[]);
audit=false;assert.equal(fs.readFileSync(file,"utf8"),original);
`);
  });

  it("keeps legacy historical task refs stale regardless of directory presence", () => {
    probe(`
const sessions=path.join(root,".trellis/.runtime/sessions");fs.mkdirSync(sessions,{recursive:true});
fs.writeFileSync(path.join(sessions,"review.json"),JSON.stringify({current_task:".trellis/workspace/old"}));
audit=true;const before=ctx.getActiveTask();assert.equal(before.stale,true);
audit=false;fs.mkdirSync(path.join(history,"old"));
audit=true;assert.deepEqual(ctx.getActiveTask(),before);assert.deepEqual(accesses,[]);
`);
  });

  it("counts only active task metadata independent of historical file presence", () => {
    probe(`
const active=path.join(root,".trellis/tasks/active"), old=path.join(root,".trellis/tasks/old");
fs.mkdirSync(active,{recursive:true});fs.mkdirSync(old);
fs.writeFileSync(path.join(active,"task.json"),JSON.stringify({title:"active"}));
const file=path.join(history,"old.json");fs.symlinkSync(file,path.join(old,"task.json"));
for(const content of [null,'{"title":"old"}','{"title":"changed"}']){
 audit=false;if(content)fs.writeFileSync(file,content);
 audit=true;const output=buildSessionContext(ctx);
 assert.ok(output.includes("Project tasks: 1 total"),output);assert.deepEqual(accesses,[]);
}
`);
  });

  it("does not enumerate a historical tasks-root alias for compact counts", () => {
    probe(`
fs.symlinkSync(history,path.join(root,".trellis/tasks"),"dir");
fs.mkdirSync(path.join(history,"person"));fs.writeFileSync(path.join(history,"person/task.json"),'{}');
audit=true;const output=buildSessionContext(ctx);
assert.ok(output.includes("Current task: none"));assert.deepEqual(accesses,[]);
`);
  });
});
