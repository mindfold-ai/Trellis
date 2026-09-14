import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const templates = path.resolve(import.meta.dirname, "../../src/templates");
const hook = path.join(templates, "shared-hooks/inject-shell-session-context.py");
let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-shell-history-")); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

function probe(code: string): void {
  const result = spawnSync("python3", ["-B", "-c", `
import importlib.util, io, json, os, sys, time
from pathlib import Path
from contextlib import redirect_stdout, redirect_stderr
from unittest.mock import patch
container = Path(${JSON.stringify(root)}).resolve()
scripts = Path(${JSON.stringify(path.join(templates, "trellis/scripts"))})
spec = importlib.util.spec_from_file_location("hook", ${JSON.stringify(hook)})
hook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook)
def invoke(root, shell_event=False):
    command = "python3 .trellis/scripts/task.py current"
    data = {"cwd":str(root), "session_id":"review"}
    if shell_event:
        data["command"] = command
    else:
        data.update({"tool_name":"Bash", "tool_input":{"command":command}})
    out, err = io.StringIO(), io.StringIO()
    with patch.object(sys, "stdin", io.StringIO(json.dumps(data))), redirect_stdout(out), redirect_stderr(err):
        status = hook.main()
    return status, out.getvalue(), err.getvalue()
${code}
`], { cwd: root, encoding: "utf8" });
  expect(result.status, result.stdout + result.stderr).toBe(0);
}

describe("pre-shell ticket producer history boundary", () => {
  for (const external of [false, true]) {
    it.each(["directory", "runtime", "file"])(`rejects %s aliases before history reads, deletion or creation (external=${external})`, (mode) => {
      probe(`
root = container / "project"
root.mkdir()
workflow = container / "backing" if ${external ? "True" : "False"} else root / ".trellis"
workflow.mkdir()
if workflow.name == "backing":
    (root / ".trellis").symlink_to(workflow, target_is_directory=True)
(workflow / "scripts").symlink_to(scripts, target_is_directory=True)
history = workflow / "workspace"
history.mkdir()
(history / "journal.md").write_text("historical bytes")
runtime = workflow / ".runtime"
mode = ${JSON.stringify(mode)}
if mode == "runtime":
    runtime.symlink_to(history, target_is_directory=True)
    (history / "shell-tickets").mkdir()
    historical_file = history / "shell-tickets/expired.json"
elif mode == "directory":
    runtime.mkdir()
    (runtime / "shell-tickets").symlink_to(history, target_is_directory=True)
    historical_file = history / "expired.json"
else:
    (runtime / "shell-tickets").mkdir(parents=True)
    historical_file = history / "expired.json"
    (runtime / "shell-tickets/history.json").symlink_to(historical_file)
    (runtime / "shell-tickets/active-expired.json").write_text('{"expires_at_epoch":0}')
accesses = []
enabled = False
def audit(event, args):
    if enabled and event in ("open", "os.listdir", "os.scandir", "os.mkdir", "os.remove", "os.rename"):
        for value in args[:2]:
            if isinstance(value, (str, bytes)):
                actual = os.path.realpath(os.fsdecode(value))
                if actual == str(history) or actual.startswith(str(history) + os.sep):
                    accesses.append((event, actual))
sys.addaudithook(audit)
for expires in (None, 0, time.time() + 1000):
    enabled = False
    if expires is not None:
        historical_file.write_text(json.dumps({"expires_at_epoch":expires}))
    before = {str(p.relative_to(history)):p.read_bytes() for p in history.rglob("*") if p.is_file()}
    for shell_event in (False, True):
        enabled = True
        status, output, error = invoke(root, shell_event)
        assert status == 1 and "historical" in error, (status, output, error)
        assert output == "", output
        assert accesses == [], accesses
    enabled = False
    assert {str(p.relative_to(history)):p.read_bytes() for p in history.rglob("*") if p.is_file()} == before
    if mode == "file":
        assert (runtime / "shell-tickets/active-expired.json").read_text() == '{"expires_at_epoch":0}'
        assert sorted(p.name for p in (runtime / "shell-tickets").iterdir()) == ["active-expired.json", "history.json"]
`);
    });
  }

  it.each([false, true])("preserves normal expiry cleanup, ticket TTL and response shape (shell event=%s)", (shellEvent) => {
    probe(`
root = container
workflow = root / ".trellis"
workflow.mkdir()
(workflow / "scripts").symlink_to(scripts, target_is_directory=True)
tickets = workflow / ".runtime/shell-tickets"
tickets.mkdir(parents=True)
(tickets / "expired.json").write_text('{"expires_at_epoch":0}')
fresh = json.dumps({"expires_at_epoch":time.time() + 1000})
(tickets / "fresh.json").write_text(fresh)
status, output, error = invoke(root, ${shellEvent ? "True" : "False"})
assert status == 0, error
assert not (tickets / "expired.json").exists()
assert (tickets / "fresh.json").read_text() == fresh
created = [p for p in tickets.glob("*.json") if p.name != "fresh.json"]
assert len(created) == 1
ticket = json.loads(created[0].read_text())
assert ticket["session_id"] == "review"
assert ticket["command"] == "python3 .trellis/scripts/task.py current"
assert ticket["subcommands"] == [{"name":"current"}]
assert ticket["expires_at_epoch"] - ticket["created_at_epoch"] == 30
assert json.loads(output) == {"permission":"allow"} if ${shellEvent ? "True" : "False"} else output == ""
assert not (workflow / "workspace").exists()
`);
  });
});
