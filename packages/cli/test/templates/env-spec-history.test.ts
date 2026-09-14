import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const templates = path.resolve(import.meta.dirname, "../../src/templates");
let container: string;
beforeEach(() => { container = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "trellis-env-spec-"))); });
afterEach(() => { fs.rmSync(container, { recursive: true, force: true }); });

function python(code: string): void {
  const result = spawnSync("python3", ["-B", "-c", code], { encoding: "utf8" });
  expect(result.status, result.stdout + result.stderr).toBe(0);
}

describe("environment bridge history boundary", () => {
  for (const external of [false, true]) {
    it.each(["direct", "alias", "relative"])(`refuses %s historical env files before dedupe/read/append (external=${external})`, (mode) => {
      python(`
import importlib.util, os, sys
from pathlib import Path
from unittest.mock import patch
container = Path(${JSON.stringify(container)})
root = container / "project"
root.mkdir()
workflow = container / "backing" if ${external ? "True" : "False"} else root / ".trellis"
workflow.mkdir()
if workflow.name == "backing":
    (root / ".trellis").symlink_to(workflow, target_is_directory=True)
(workflow / "scripts").symlink_to(${JSON.stringify(path.join(templates, "trellis/scripts"))}, target_is_directory=True)
spec = importlib.util.spec_from_file_location("hook", ${JSON.stringify(path.join(templates, "shared-hooks/session-start.py"))})
hook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook)
history = workflow / "workspace/env.sh"
history.parent.mkdir()
mode = ${JSON.stringify(mode)}
env_file = str(history)
if mode == "alias":
    alias = root / "env.sh"
    alias.symlink_to(history)
    env_file = str(alias)
elif mode == "relative":
    os.chdir(history.parent)
    env_file = "env.sh"
attempts = []
enabled = False
def audit(event, args):
    if enabled and event == "open" and isinstance(args[0], (str, bytes)):
        if os.path.realpath(os.fsdecode(args[0])) == str(history):
            attempts.append((event, str(args[0])))
sys.addaudithook(audit)
with patch.dict(os.environ, {"CLAUDE_ENV_FILE":env_file}):
    for text in (None, "# historical bytes\\n", "export TRELLIS_CONTEXT_ID=review\\n"):
        enabled = False
        if text is not None:
            history.write_text(text)
        enabled = True
        hook._persist_context_key_for_bash("review", root)
        hook._persist_context_key_for_bash("other", root)
        assert attempts == [], attempts
        enabled = False
        assert history.read_text() == text if text is not None else not history.exists()
active = root / "active.env"
active.write_text("export USER_SETTING=keep\\n")
with patch.dict(os.environ, {"CLAUDE_ENV_FILE":str(active)}):
    for key in ("one", "one", "two", "one"):
        hook._persist_context_key_for_bash(key, root)
assert active.read_text().splitlines() == ["export USER_SETTING=keep", "export TRELLIS_CONTEXT_ID=one", "export TRELLIS_CONTEXT_ID=two", "export TRELLIS_CONTEXT_ID=one"]
`);
    });
  }
});

describe("spec discovery history boundary", () => {
  for (const external of [false, true]) {
    it.each(["root", "child", "index", "nested", "guides"])(`does not discover historical %s aliases (external=${external})`, (mode) => {
      const root = path.join(container, "project");
      const workflow = external ? path.join(container, "backing") : path.join(root, ".trellis");
      fs.mkdirSync(root);
      fs.mkdirSync(workflow);
      if (external) fs.symlinkSync(workflow, path.join(root, ".trellis"), "dir");
      fs.symlinkSync(path.join(templates, "trellis/scripts"), path.join(workflow, "scripts"), "dir");
      const history = path.join(workflow, "workspace");
      const oldLayer = path.join(history, "retired-layer");
      fs.mkdirSync(oldLayer, { recursive: true });
      fs.writeFileSync(path.join(oldLayer, "index.md"), "HISTORICAL INDEX");
      const specDir = path.join(workflow, "spec");
      if (mode === "root") fs.symlinkSync(history, specDir, "dir");
      else {
        const active = path.join(specDir, ...(mode === "nested" ? ["pkg"] : []), "active-layer");
        fs.mkdirSync(active, { recursive: true });
        fs.writeFileSync(path.join(active, "index.md"), "ACTIVE INDEX");
        if (mode === "child" || mode === "nested") fs.symlinkSync(oldLayer, path.join(path.dirname(active), "retired-layer"), "dir");
        else {
          const directory = path.join(specDir, mode === "guides" ? "guides" : "retired-layer");
          fs.mkdirSync(directory);
          fs.symlinkSync(path.join(oldLayer, "index.md"), path.join(directory, "index.md"));
        }
      }
      python(`
import importlib.util, json, os, sys
from pathlib import Path
root = Path(${JSON.stringify(root)})
history = Path(${JSON.stringify(history)})
sys.path.insert(0, ${JSON.stringify(path.join(templates, "trellis/scripts"))})
from common.packages_context import get_context_packages_json
hooks = []
for platform in ("shared-hooks", "codex/hooks", "copilot/hooks"):
    spec = importlib.util.spec_from_file_location("hook", ${JSON.stringify(templates)} + "/" + platform + "/session-start.py")
    hook = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(hook)
    hooks.append((platform, hook))
attempts = []
def audit(event, args):
    if event in ("open", "os.listdir", "os.scandir") and isinstance(args[0], (str, bytes)):
        actual = os.path.realpath(os.fsdecode(args[0]))
        if actual == str(history) or actual.startswith(str(history) + os.sep):
            attempts.append((event, actual))
sys.addaudithook(audit)
result = json.dumps(get_context_packages_json(root))
for platform, hook in hooks:
    args = (root / ".trellis", None) if platform == "shared-hooks" else (root / ".trellis",)
    indexes = hook._collect_spec_index_paths(*args)
    assert not any("retired-layer" in item for item in indexes), indexes
    if ${mode === "guides" ? "True" : "False"}:
        assert ".trellis/spec/guides/index.md" not in indexes
    if ${mode !== "root" ? "True" : "False"}:
        assert any("active-layer" in item for item in indexes), indexes
assert "retired-layer" not in result, result
assert attempts == [], attempts
`);
      const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {syncBuiltinESMExports} from "node:module";
import {pathToFileURL} from "node:url";
const root=${JSON.stringify(root)}, history=${JSON.stringify(history)}, accesses=[];
for(const method of ["readFileSync","readdirSync","statSync"]){
 const original=fs[method];fs[method]=function(file,...args){let real;try{real=fs.realpathSync(file);}catch{real=String(file);}if(real===history||real.startsWith(history+path.sep))accesses.push([method,real]);return original.call(this,file,...args);};
}
syncBuiltinESMExports();
const {TrellisContext}=await import(pathToFileURL(${JSON.stringify(path.join(templates, "opencode/lib/trellis-context.js"))}));
const {buildSessionContext}=await import(pathToFileURL(${JSON.stringify(path.join(templates, "opencode/lib/session-utils.js"))}));
const output=buildSessionContext(new TrellisContext(root));
assert.ok(!output.includes("retired-layer"),output);
if(${mode === "guides"})assert.ok(!output.includes(".trellis/spec/guides/index.md"),output);
if(${mode !== "root"})assert.ok(output.includes("active-layer"),output);
assert.deepEqual(accesses,[]);
`], { encoding: "utf8" });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(fs.readFileSync(path.join(oldLayer, "index.md"), "utf8")).toBe("HISTORICAL INDEX");
    });
  }
});
