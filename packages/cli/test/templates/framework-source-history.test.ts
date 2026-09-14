import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const templates = path.resolve(import.meta.dirname, "../../src/templates");
let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-framework-source-")); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe("framework source history boundary", () => {
  for (const external of [false, true]) {
    it.each(["phase", "shared-hooks/session-start.py", "codex/hooks/session-start.py", "copilot/hooks/session-start.py", "shared-hooks/inject-workflow-state.py"])(`rejects historical workflow input for %s (external=${external})`, (entry) => {
      const result = spawnSync("python3", ["-B", "-c", `
import importlib.util, os, sys
from pathlib import Path
container = Path(${JSON.stringify(root)}).resolve()
root = container / "project"
root.mkdir()
os.chdir(root)
workflow = container / "backing" if ${external ? "True" : "False"} else root / ".trellis"
workflow.mkdir()
if workflow.name == "backing":
    (root / ".trellis").symlink_to(workflow, target_is_directory=True)
scripts = ${JSON.stringify(path.join(templates, "trellis/scripts"))}
(workflow / "scripts").symlink_to(scripts, target_is_directory=True)
sys.path.insert(0, scripts)
from common.history_paths import RetiredDataPathError
history = workflow / "workspace/workflow.md"
history.parent.mkdir()
original = "## Phase Index\\nHISTORICAL INDEX\\n\\n## Phase 1: Plan\\n#### 1.0 Example\\nHISTORICAL STEP\\n\\n[workflow-state:no_task]\\nHISTORICAL BREADCRUMB\\n[/workflow-state:no_task]\\n"
history.write_text(original)
active = root / ".trellis/workflow.md"
active.symlink_to(history)
entry = ${JSON.stringify(entry)}
if entry == "phase":
    from common.workflow_phase import get_phase_index, get_step
    def invoke():
        return get_phase_index() + get_step("1.0")
else:
    spec = importlib.util.spec_from_file_location("hook", ${JSON.stringify(templates)} + "/" + entry)
    hook = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(hook)
    if hasattr(hook, "load_breadcrumbs"):
        invoke = lambda: str(hook.load_breadcrumbs(root))
    elif hasattr(hook, "_build_workflow_overview"):
        invoke = lambda: hook._build_workflow_overview(active)
    else:
        invoke = lambda: hook._build_workflow_toc(active)
accesses = []
enabled = True
def audit(event, args):
    if enabled and event in ("open", "os.listdir", "os.scandir") and isinstance(args[0], (str, bytes)):
        actual = os.path.realpath(os.fsdecode(args[0]))
        if actual == str(history) or actual.startswith(str(history.parent) + os.sep):
            accesses.append((event, actual))
sys.addaudithook(audit)
try:
    output = invoke()
except RetiredDataPathError:
    assert entry == "phase"
else:
    assert entry != "phase" and "HISTORICAL" not in output, output
assert accesses == [], accesses
active.unlink()
active.write_text(original.replace("HISTORICAL", "ACTIVE"))
assert "ACTIVE" in invoke()
assert accesses == [], accesses
enabled = False
assert history.read_text() == original
`], { encoding: "utf8" });
      expect(result.status, result.stdout + result.stderr).toBe(0);
    });

    it(`OpenCode ignores historical limits but honors active configuration (external=${external})`, () => {
      const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {syncBuiltinESMExports} from "node:module";
import {pathToFileURL} from "node:url";
const container=fs.realpathSync(${JSON.stringify(root)}), root=path.join(container,"project");
fs.mkdirSync(root);
const external=${external};
const workflow=external ? path.join(container,"backing") : path.join(root,".trellis");
fs.mkdirSync(workflow);if(external)fs.symlinkSync(workflow,path.join(root,".trellis"),"dir");
const history=path.join(workflow,"workspace/config.yaml");fs.mkdirSync(path.dirname(history));
const config=path.join(root,".trellis/config.yaml");fs.symlinkSync(history,config);
let enabled=false;const accesses=[];const originalRead=fs.readFileSync;
fs.readFileSync=function(file,...args){let actual;try{actual=fs.realpathSync(file);}catch{}if(enabled&&actual===history)accesses.push(String(file));return originalRead.call(this,file,...args);};
syncBuiltinESMExports();
const {readContextInjectionLimits,DEFAULT_CONTEXT_INJECTION_LIMITS}=await import(pathToFileURL(${JSON.stringify(path.join(templates, "opencode/lib/trellis-context.js"))}));
for(const limit of [17,8192]){
 enabled=false;fs.writeFileSync(history,"context_injection:\\n  max_file_bytes: "+limit+"\\n");
 enabled=true;assert.deepEqual(readContextInjectionLimits(root),DEFAULT_CONTEXT_INJECTION_LIMITS);assert.deepEqual(accesses,[]);
}
enabled=false;fs.unlinkSync(config);fs.writeFileSync(config,"context_injection:\\n  max_file_bytes: 17\\n");
enabled=true;assert.equal(readContextInjectionLimits(root).max_file_bytes,17);assert.deepEqual(accesses,[]);
`], { encoding: "utf8" });
      expect(result.status, result.stdout + result.stderr).toBe(0);
    });
  }
});
