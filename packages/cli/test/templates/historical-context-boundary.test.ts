import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const templates = path.resolve(import.meta.dirname, "../../src/templates");
const checkout = path.resolve(templates, "../../../..");
const temporary: string[] = [];
afterEach(() => {
  for (const root of temporary.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("hook task metadata boundary", () => {
  it.each([
    "shared-hooks/session-start.py",
    "codex/hooks/session-start.py",
    "copilot/hooks/session-start.py",
    "shared-hooks/inject-workflow-state.py",
  ])("never reads historical task metadata in %s", (hook) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-hook-task-"));
    temporary.push(root);
    const output = execFileSync("python3", ["-B", "-c", `
import importlib.util, json, os, sys
from pathlib import Path
hook, scripts, container = sys.argv[1:]
root = Path(container).resolve() / "project"
root.mkdir()
backing = Path(container).resolve() / "backing"
backing.mkdir()
(root / ".trellis").symlink_to(backing, target_is_directory=True)
sys.path.insert(0, scripts)
(backing / "scripts").symlink_to(scripts, target_is_directory=True)
from common.active_task import set_active_task
spec = importlib.util.spec_from_file_location("hook", hook)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
task = root / ".trellis/tasks/current"
task.mkdir(parents=True)
history = backing / "workspace/old.json"
history.parent.mkdir()
historical = json.dumps({"id":"HISTORICAL-ID", "title":"HISTORICAL-TITLE", "status":"completed", "package":"HISTORICAL-PACKAGE"})
history.write_text(historical)
metadata = task / "task.json"
metadata.write_text(json.dumps({"id":"ACTIVE-ID", "title":"ACTIVE TASK", "status":"in_progress"}))
data = {"session_id":"review", "cwd":str(root)}
os.environ["TRELLIS_CONTEXT_ID"] = "review"
assert set_active_task(".trellis/tasks/current", root, data)
metadata.unlink()
metadata.symlink_to(history)
accesses = []
enabled = True
def audit(event, args):
    if enabled and event in ("open", "os.listdir", "os.scandir") and isinstance(args[0], (str, bytes)):
        candidate = os.path.realpath(os.fsdecode(args[0]))
        if candidate == str(history) or candidate.startswith(str(history.parent) + os.sep):
            accesses.append((event, candidate))
sys.addaudithook(audit)
def invoke():
    if hasattr(module, "_get_task_status"):
        text = module._get_task_status(root / ".trellis", data)
        text += module._build_compact_current_state(root / ".trellis", data, [])
        if hasattr(module, "_load_trellis_config"):
            text += str(module._load_trellis_config(root / ".trellis", data))
        return text
    return str(module.get_active_task(root, data))
result = invoke()
assert "HISTORICAL" not in result, result
assert accesses == [], accesses
metadata.unlink()
metadata.write_text(json.dumps({"id":"ACTIVE-ID", "title":"ACTIVE TASK", "status":"in_progress"}))
assert "ACTIVE" in invoke()
assert accesses == [], accesses
enabled = False
assert history.read_text() == historical
print("active context preserved; historical reads: 0")
`, path.join(templates, hook), path.join(templates, "trellis/scripts"), root], { encoding: "utf8" });
    expect(output).toContain("historical reads: 0");
  });

  it("OpenCode session context rejects historical metadata and keeps active task output", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-opencode-task-"));
    temporary.push(root);
    const output = execFileSync(process.execPath, ["--input-type=module", "-e", `
import fs from "node:fs";
import path from "node:path";
import {syncBuiltinESMExports} from "node:module";
import {pathToFileURL} from "node:url";
const [root, template] = process.argv.slice(1);
const task = path.join(root, ".trellis/tasks/current");
const sessions = path.join(root, ".trellis/.runtime/sessions");
const history = path.join(root, ".trellis/workspace/old.json");
fs.mkdirSync(task, {recursive:true});fs.mkdirSync(sessions, {recursive:true});fs.mkdirSync(path.dirname(history), {recursive:true});
const original = JSON.stringify({title:"HISTORICAL-TITLE",status:"completed"});
fs.writeFileSync(history, original);
const metadata = path.join(task, "task.json");fs.symlinkSync(history, metadata);
fs.symlinkSync(history, path.join(task, "implement.jsonl"));
fs.writeFileSync(path.join(sessions, "review.json"), JSON.stringify({current_task:".trellis/tasks/current"}));
process.env.TRELLIS_CONTEXT_ID="review";
const accesses=[];
const realRead=fs.readFileSync;
const target=fs.realpathSync(history);
fs.readFileSync=function(file,...args){let resolved;try{resolved=fs.realpathSync(file);}catch{}if(resolved===target)accesses.push(String(file));return realRead.call(this,file,...args);};
syncBuiltinESMExports();
const {TrellisContext}=await import(pathToFileURL(path.join(template,"trellis-context.js")));
const {buildSessionContext}=await import(pathToFileURL(path.join(template,"session-utils.js")));
const context=new TrellisContext(root);
const invoke=()=>buildSessionContext(context,{session_id:"review"});
if(invoke().includes("HISTORICAL"))throw Error("history injected");
if(accesses.length)throw Error(JSON.stringify(accesses));
fs.unlinkSync(metadata);fs.writeFileSync(metadata,JSON.stringify({title:"ACTIVE TASK",status:"in_progress"}));
if(!invoke().includes("ACTIVE TASK"))throw Error("active context missing");
if(accesses.length)throw Error(JSON.stringify(accesses));
if(realRead(history,"utf8")!==original)throw Error("history changed");
console.log("active context preserved; historical reads: 0");
`, root, path.join(templates, "opencode/lib")], { encoding: "utf8" });
    expect(output).toContain("historical reads: 0");
  });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-historical-context-"));
  temporary.push(root);
  const files = [
    ".trellis/.developer",
    ".trellis/workspace/person/history.md",
    ".trellis/agent-traces/person/history.md",
    ".trellis/.backup-old/nested/history.md",
    ".trellis/.backup-file.md",
  ];
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), "PRIVATE HISTORY");
  }
  fs.mkdirSync(path.join(root, ".trellis/spec"));
  fs.writeFileSync(path.join(root, ".trellis/spec/current.md"), "CURRENT CONTEXT");
  const manifest = ".trellis/tasks/old/implement.jsonl";
  fs.mkdirSync(path.dirname(path.join(root, manifest)), { recursive: true });
  fs.writeFileSync(path.join(root, manifest), [
    ...files.map((file) => ({ file })),
    ...files.slice(1).map((file) => ({ file: `${path.dirname(file)}/`, type: "directory" })),
    { file: ".trellis/spec/current.md" },
  ].map((entry) => JSON.stringify(entry)).join("\n"));
  return { root, files, manifest };
}

describe("historical JSONL context boundary", () => {
  it.each(["python", "opencode"])("rejects aliases inside a supported external workflow root (%s)", (runtime) => {
    const container = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-external-history-"));
    temporary.push(container);
    const root = path.join(container, "project");
    const backing = path.join(container, "backing-store");
    fs.mkdirSync(root);
    fs.mkdirSync(path.join(backing, "spec"), { recursive: true });
    fs.mkdirSync(path.join(backing, "workspace/person"), { recursive: true });
    fs.mkdirSync(path.join(backing, "tasks/current"), { recursive: true });
    fs.symlinkSync(backing, path.join(root, ".trellis"), "dir");
    fs.writeFileSync(path.join(backing, "workspace/person/history.md"), "PRIVATE HISTORY");
    fs.writeFileSync(path.join(backing, "workspace/history.jsonl"), '{"file":".trellis/workspace/person/history.md"}\n');
    fs.writeFileSync(path.join(backing, "spec/current.md"), "CURRENT CONTEXT");
    fs.symlinkSync("../workspace/person/history.md", path.join(backing, "spec/history-alias.md"));
    fs.symlinkSync("../workspace/person", path.join(backing, "spec/history-dir"), "dir");
    fs.symlinkSync("../workspace/history.jsonl", path.join(backing, "spec/history-manifest.jsonl"));
    const manifest = ".trellis/tasks/current/implement.jsonl";
    fs.writeFileSync(path.join(root, manifest), [
      { file: ".trellis/spec/history-alias.md" },
      { file: ".trellis/spec/history-dir", type: "directory" },
      { file: ".trellis/spec/current.md" },
    ].map((entry) => JSON.stringify(entry)).join("\n"));
    const output = runtime === "python"
      ? execFileSync("python3", ["-B", "-c", `
import importlib.util, sys, os
hook, root, manifest, backing = sys.argv[1:]
spec = importlib.util.spec_from_file_location("hook", hook)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
accesses = []
historical = os.path.join(backing, "workspace")
def audit(event, args):
    if event in ("open", "os.listdir", "os.scandir") and isinstance(args[0], (str, bytes)):
        candidate = os.path.realpath(os.fsdecode(args[0]))
        if candidate == historical or candidate.startswith(historical + os.sep):
            accesses.append((event, candidate))
sys.addaudithook(audit)
limits = {"max_file_bytes": 10000, "max_total_bytes": 100000}
print("\\n".join(module._materialize_jsonl_entries(root, manifest, limits, module._Budget(100000))))
assert module.read_jsonl_entries(root, ".trellis/spec/history-manifest.jsonl") == []
assert not accesses, accesses
`, path.join(templates, "shared-hooks/inject-subagent-context.py"), root, manifest, backing], { encoding: "utf8" })
      : execFileSync(process.execPath, ["--input-type=module", "-e", `
import fs from "node:fs";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
import { pathToFileURL } from "node:url";
const [modulePath, root, manifest, backing] = process.argv.slice(1);
const realpath = fs.realpathSync.bind(fs);
const historical = path.join(backing, "workspace");
const accesses = [];
for (const method of ["readFileSync", "readdirSync", "statSync"]) {
  const original = fs[method];
  fs[method] = function(file, ...args) {
    let real;
    try { real = realpath(file); } catch { real = String(file); }
    if (real === historical || real.startsWith(historical + path.sep)) accesses.push([method, real]);
    return original.call(this, file, ...args);
  };
}
syncBuiltinESMExports();
const { TrellisContext, ContextBudget, DEFAULT_CONTEXT_INJECTION_LIMITS: limits } = await import(pathToFileURL(modulePath));
const context = new TrellisContext(root);
console.log(context.readJsonlWithFiles(path.join(root, manifest), limits, new ContextBudget(100000)).join("\\n"));
if (context.readFile(path.join(root, ".trellis/spec/history-manifest.jsonl")) !== null) throw new Error("Historical manifest returned");
if (accesses.length) throw new Error(JSON.stringify(accesses));
`, path.join(templates, "opencode/lib/trellis-context.js"), root, manifest, backing], { encoding: "utf8" });
    expect(output).toContain("CURRENT CONTEXT");
    expect(output).not.toContain("PRIVATE HISTORY");
    expect(fs.readFileSync(path.join(backing, "workspace/person/history.md"), "utf8")).toBe("PRIVATE HISTORY");
  });

  it.each([
    path.join(templates, "trellis/scripts"),
    path.join(checkout, ".trellis/scripts"),
  ])("full session Git probes exclude tracked and untracked history: %s", (scripts) => {
    const { root, files, manifest } = fixture();
    fs.rmSync(path.join(root, manifest));
    fs.rmSync(path.join(root, ".trellis/spec/current.md"));
    execFileSync("git", ["init", "-q", root]);
    const run = () => JSON.parse(execFileSync("python3", ["-c", `
import sys, json
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from common.session_context import _collect_root_git_info, _collect_git_repo_info
root = Path(sys.argv[2])
print(json.dumps([_collect_root_git_info(root), _collect_git_repo_info("root", ".", root)]))
`, scripts, root], { encoding: "utf8" })) as { isClean: boolean; uncommittedChanges: number }[];
    const baseline = run();
    for (const info of baseline) expect(info.isClean).toBe(true);
    execFileSync("git", ["-C", root, "add", ".trellis"]);
    expect(run()).toEqual(baseline);
    for (const file of files) fs.writeFileSync(path.join(root, file), "CHANGED PRIVATE HISTORY");
    expect(run()).toEqual(baseline);
    fs.writeFileSync(path.join(root, "current.md"), "CURRENT CONTEXT");
    for (const info of run()) expect(info.uncommittedChanges).toBe(1);
    for (const file of files) expect(fs.readFileSync(path.join(root, file), "utf8")).toBe("CHANGED PRIVATE HISTORY");
  });

  it.each([
    path.join(templates, "shared-hooks/inject-subagent-context.py"),
    ...[".claude", ".cursor", ".codex"].map((platform) => path.join(checkout, platform, "hooks/inject-subagent-context.py")),
  ])("Python manifest reader rejects history before access: %s", (hook) => {
    const { root, files, manifest } = fixture();
    const output = execFileSync("python3", ["-c", `
import importlib.util, sys, os, re
hook, root, manifest = sys.argv[1:]
spec = importlib.util.spec_from_file_location("hook", hook)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
accesses = []
def audit(event, args):
    if event in ("open", "os.listdir", "os.scandir") and isinstance(args[0], (str, bytes)):
        candidate = os.fsdecode(args[0])
        if re.search(r"(?:^|/)\\.trellis/(?:\\.developer|workspace|agent-traces|\\.backup-[^/]*)(?:/|$)", candidate.replace(chr(92), "/")):
            accesses.append((event, candidate))
sys.addaudithook(audit)
limits = {"max_file_bytes": 10000, "max_total_bytes": 100000}
print("\\n".join(module._materialize_jsonl_entries(root, manifest, limits, module._Budget(100000))))
assert not accesses, accesses
`, hook, root, manifest], { encoding: "utf8" });
    expect(output).toContain("CURRENT CONTEXT");
    expect(output).not.toContain("PRIVATE HISTORY");
    for (const file of files) expect(fs.readFileSync(path.join(root, file), "utf8")).toBe("PRIVATE HISTORY");
  });

  it.each([
    path.join(templates, "opencode/lib/trellis-context.js"),
    path.join(checkout, ".opencode/lib/trellis-context.js"),
  ])("OpenCode manifest reader rejects history before access: %s", (modulePath) => {
    const { root, files, manifest } = fixture();
    const output = execFileSync(process.execPath, ["--input-type=module", "-e", `
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
const accesses = [];
for (const method of ["readFileSync", "readdirSync", "statSync", "realpathSync"]) {
  const original = fs[method];
  fs[method] = function(file, ...args) {
    if (/(?:^|\\/)\\.trellis\\/(?:workspace|agent-traces|\\.developer|\\.backup-[^/]*)(?:\\/|$)/.test(String(file))) accesses.push([method, file]);
    return original.call(this, file, ...args);
  };
}
syncBuiltinESMExports();
const { TrellisContext, ContextBudget, DEFAULT_CONTEXT_INJECTION_LIMITS } = await import(pathToFileURL(process.argv[1]));
const ctx = new TrellisContext(process.argv[2]);
console.log(ctx.readJsonlWithFiles(path.join(process.argv[2], process.argv[3]), DEFAULT_CONTEXT_INJECTION_LIMITS, new ContextBudget(100000)).join("\\n"));
if (accesses.length) throw new Error(JSON.stringify(accesses));
`, modulePath, root, manifest], { encoding: "utf8" });
    expect(output).toContain("CURRENT CONTEXT");
    expect(output).not.toContain("PRIVATE HISTORY");
    for (const file of files) expect(fs.readFileSync(path.join(root, file), "utf8")).toBe("PRIVATE HISTORY");
  });
});
